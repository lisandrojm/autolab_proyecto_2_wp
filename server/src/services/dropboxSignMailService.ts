import { ImapFlow } from "imapflow";
import { Tenant } from "../models/Tenant.js";
import { decryptSecret } from "../utils/secretCrypto.js";
import { leerAnclas, mismoDocumento, AnclasNombre } from "../utils/anclasNombre.js";
import { resolverCarpetaPorPatron } from "../utils/estadoCarpetas.js";
import { getTenantDropboxConfig, listFolder, moveEntry } from "./dropboxService.js";

/**
 * Detección de "documento enviado a firmar" leyendo la casilla de correo.
 *
 * Dropbox Sign (en el plan actual) no avisa por API qué contratos ya se mandaron a firmar, pero sí
 * copia por mail a quien se ponga en CC. Por eso el instructivo de "Para Firmar" pide agregar la
 * casilla configurada acá en CC: ese mail es la ÚNICA señal de que el envío ocurrió.
 *
 * La casilla la usan personas, así que el job es de solo lectura sobre el correo: no marca nada como
 * leído ni mueve mensajes. Busca por asunto dentro de una ventana de días y lo que evita reprocesar
 * es el JSON ya archivado en Pendbox.
 *
 * Qué hace por cada aviso encontrado:
 *  1. Lee del ASUNTO el nombre del documento ("Se inició el proceso de firma de <archivo>").
 *  2. De ese nombre saca quién es (CUIL o email) y de qué período habla (ver `leerAnclas`).
 *  3. Busca ese documento en "Outbox". Si no está, no hace nada: sin respaldo en Outbox el aviso no
 *     se puede atribuir a un documento propio (puede ser de otra cuenta o de un reenvío).
 *  4. Si el documento ya está en "Pendbox", lo saltea. Los avisos se repiten (reenvíos,
 *     recordatorios, resumen diario), así que el chequeo evita trabajo al pedo.
 *  5. Mueve el PDF de Outbox a Pendbox. Ese movimiento es el ÚNICO efecto: no se genera ningún
 *     archivo extra. Es lo que hace avanzar el contrato de "Para Firmar" a "Enviado a la firma" y
 *     deja "Para Firmar" solo con lo que todavía no se envió.
 */

/**
 * Términos con los que se le pide la búsqueda al servidor IMAP. Van sin acentos a propósito: el
 * SEARCH de IMAP es sensible al charset y "inició" puede fallar según el servidor. El filtro fino
 * lo hace igual `extraerArchivoDeAsunto` sobre cada asunto encontrado.
 */
const TERMINOS_BUSQUEDA = ["proceso de firma", "signature request"];

/** Ventana hacia atrás que se revisa en cada corrida. */
const DIAS_ATRAS = 30;

/** Tope de mensajes por corrida, para no barrer una bandeja enorme si la ventana trae de más. */
const MAX_MENSAJES = 300;

/** Asuntos que manda Dropbox Sign al iniciar el circuito de firma (ES/EN). */
const ASUNTO_ENVIO = [/se inici[oó] el proceso de firma de\s+(.+)$/i, /you (?:were|have been) added to a signature request[:\s]+(.+)$/i, /signature request(?:ed)? (?:from|for)[:\s]+(.+)$/i];

/** Nombre del documento tal como aparece en el asunto del aviso. "" si el asunto no es de envío. */
export function extraerArchivoDeAsunto(asunto: string): string {
  const limpio = String(asunto || "")
    .replace(/^(re|rv|fwd?)\s*:\s*/gi, "")
    .trim();
  for (const re of ASUNTO_ENVIO) {
    const m = re.exec(limpio);
    if (m?.[1]) return m[1].trim().replace(/\.pdf$/i, "");
  }
  return "";
}

/**
 * Los campos obligatorios de la nomenclatura que están dentro del nombre del archivo: CUIT, email,
 * documento y las fechas del período (ver `leerAnclas`). Dropbox Sign reemplaza algunos caracteres
 * del nombre original, así que se buscan esos datos sueltos en lugar de intentar reconstruir el
 * nombre completo. Por eso el "@" viaja escrito como `-ARROBA-`: es una palabra, y las letras
 * atraviesan esa transformación intactas.
 *
 * Se mantiene el nombre viejo de la función porque es como se la conoce en los comentarios de todo
 * el circuito; lo que cambió es que ahora lee también el email y las fechas, y que las expresiones
 * son las mismas que usa el escaneo de carpetas en vez de una copia.
 */
export const extraerIdentidadDeArchivo = leerAnclas;

/** Solo alfanumérico y en minúsculas: el asunto trae el nombre con caracteres ya transformados. */
const normalizarNombre = (v: string): string =>
  String(v || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]/g, "");

/**
 * Ubica en Outbox el PDF al que se refiere el aviso. El nombre del asunto NO se puede comparar
 * carácter a carácter: Dropbox Sign reemplaza símbolos del original. Por eso se matchea por los
 * campos obligatorios de la nomenclatura —quién (CUIT o email) y de qué período—, que atraviesan esa
 * transformación intactos, y recién después por el nombre normalizado a solo alfanumérico. Si queda
 * más de un candidato, devuelve null: nunca adivina.
 *
 * EL CUIT SOLO NO ALCANZA, y era lo que se comparaba antes. Una persona con dos documentos en Outbox
 * —un contrato y su renovación, dos períodos distintos— daba dos candidatos con el mismo CUIT, y el
 * aviso se descartaba entero: el contrato se quedaba para siempre en "Para Firmar" pese a haberse
 * enviado. Las fechas son obligatorias en la nomenclatura justamente para desempatar esto.
 */
export function buscarEnOutbox(entries: { tag: string; name: string; path: string }[], archivo: string, ident: AnclasNombre): { name: string; path: string } | null {
  // No se exige extensión: los documentos generados por el sistema quedan en Outbox SIN ".pdf"
  // (solo se descartan los JSON, que son los archivos de control del propio circuito).
  const pdfs = entries.filter((e) => e.tag === "file" && !/\.json$/i.test(e.name));
  const objetivo = normalizarNombre(archivo);

  // Alcanza con UNO de los dos identificadores. El email es el que siempre está: hay personas sin
  // CUIL, y sus archivos quedaban sin nada con que reconocerse.
  if (ident.cuit || ident.email) {
    const porAnclas = pdfs.filter((e) => mismoDocumento(ident, leerAnclas(e.name)));
    if (porAnclas.length === 1) return porAnclas[0];
    if (porAnclas.length > 1) {
      // Mismo CUIT y mismo período: es un contrato y su release, o dos copias del mismo documento.
      // Los campos obligatorios no los distinguen —el `{{tipo}}` no es obligatorio— así que decide
      // el nombre completo, que sí lo trae. Si tampoco alcanza, se prefiere no mover nada.
      const exacto = porAnclas.filter((e) => normalizarNombre(e.name) === objetivo);
      return exacto.length === 1 ? exacto[0] : null;
    }
    // Cero por anclas: puede ser un archivo viejo, de antes de que el período fuera obligatorio.
    // Se sigue al nombre en vez de rendirse acá.
  }

  const porNombre = pdfs.filter((e) => normalizarNombre(e.name) === objetivo);
  return porNombre.length === 1 ? porNombre[0] : null;
}

/**
 * ¿Ese documento ya está en Pendbox? Se compara por nombre normalizado y, si no, por los campos
 * obligatorios de la nomenclatura: el archivo real suele tener un nombre distinto al del asunto
 * (Dropbox Sign transforma símbolos y el título de la solicitud es editable), así que el nombre solo
 * no alcanza para reconocerlo.
 *
 * ACÁ EL CUIT SOLO ERA UN FALSO POSITIVO. La condición era "hay algún archivo en Pendbox cuyo nombre
 * contenga este CUIT", y con eso el SEGUNDO documento de una persona nunca se movía: el aviso de la
 * renovación se daba por duplicado porque el contrato anterior ya estaba ahí. Se descartaba en
 * silencio y quedaba registrado como "ya estaba" — la peor forma de perder un envío, porque el log
 * dice que todo salió bien.
 */
export function yaEstaEnPendbox(entries: { tag: string; name: string }[], archivo: string, ident: AnclasNombre): boolean {
  const objetivo = normalizarNombre(archivo);
  return entries.some((e) => {
    if (e.tag !== "file") return false;
    if (normalizarNombre(e.name) === objetivo) return true;
    return mismoDocumento(ident, leerAnclas(e.name));
  });
}

/** Una línea por aviso encontrado: qué se decidió y por qué. Lo consume el modal de Logs. */
export interface LineaLog {
  resultado: "archivado" | "duplicado" | "sin-archivo" | "ignorado" | "error";
  asunto?: string;
  archivo?: string;
  cuit?: string;
  documento?: string;
  detalle?: string;
}

export interface ResultadoLectura {
  ok: boolean;
  detalle: string;
  avisos: number;
  movidos: number;
  /** Avisos salteados porque ese documento ya tenía su JSON en Pendbox. */
  duplicados: number;
  /** Avisos salteados porque el PDF no aparece en Outbox (no se puede atribuir a un contrato). */
  sinArchivoEnOutbox: number;
  /** Qué pasó con cada aviso, para el modal de Logs. */
  logs: LineaLog[];
}

/**
 * Lee la casilla del tenant y archiva en Pendbox un JSON por cada aviso de envío a firmar.
 * `soloPrueba` conecta y cuenta los avisos sin escribir nada (para el botón "Probar" de la config).
 */
export async function leerCasillaDropboxSign(tenantId: string, soloPrueba = false): Promise<ResultadoLectura> {
  const tenant = await Tenant.findById(tenantId).lean();
  const cfg: any = (tenant as any)?.integrations?.dropboxSign || {};
  const vacio = { avisos: 0, movidos: 0, duplicados: 0, sinArchivoEnOutbox: 0, logs: [] };
  if (!cfg.email || !cfg.imapHost || !cfg.imapPasswordEnc) {
    return { ok: false, detalle: "La casilla no está configurada (faltan correo, servidor o contraseña).", ...vacio };
  }
  if (!soloPrueba && !cfg.enabled) {
    return { ok: false, detalle: "La lectura automática está desactivada.", ...vacio };
  }

  const dropboxCfg = getTenantDropboxConfig(tenant);
  const pendbox = await resolverCarpetaPorPatron([/pendbox/i]);
  const outbox = await resolverCarpetaPorPatron([/outbox/i]);

  const client = new ImapFlow({
    host: String(cfg.imapHost),
    port: Number(cfg.imapPort) || 993,
    secure: cfg.imapSecure !== false,
    auth: { user: String(cfg.imapUser || cfg.email), pass: decryptSecret(cfg.imapPasswordEnc) },
    logger: false,
  });

  let avisos = 0;
  let movidos = 0;
  let duplicados = 0;
  let sinArchivoEnOutbox = 0;
  const errores: string[] = [];
  const logs: LineaLog[] = [];

  // Ambas carpetas se listan una sola vez y se mantienen en memoria: un aviso archivado agrega su
  // JSON a `enPendbox` y saca el PDF de `enOutbox`, así los avisos repetidos de la misma corrida
  // (Dropbox Sign manda recordatorios y resúmenes) también caen en el chequeo de duplicado.
  let enOutbox: { tag: string; name: string; path: string }[] = [];
  let enPendbox: { tag: string; name: string; path: string }[] = [];
  if (!soloPrueba && dropboxCfg) {
    try {
      if (outbox) enOutbox = ((await listFolder(tenantId, dropboxCfg, outbox, true)).entries || []) as any[];
      if (pendbox) enPendbox = ((await listFolder(tenantId, dropboxCfg, pendbox, true)).entries || []) as any[];
    } catch (e: any) {
      return { ok: false, detalle: `No se pudieron leer las carpetas de Dropbox: ${e?.message || e}`, ...vacio };
    }
  }

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // La búsqueda es por ASUNTO dentro de una ventana de días, NO por "no leído": esta casilla la
      // usan personas, y si alguien abre el aviso antes que el job, el flag \Seen lo haría invisible
      // para siempre. Lo que evita reprocesar es el JSON ya archivado en Pendbox, y por eso tampoco
      // se tocan los flags del mensaje: la bandeja queda tal como la dejó su dueño.
      const desde = new Date(Date.now() - DIAS_ATRAS * 24 * 60 * 60 * 1000);
      const encontrados = new Set<number>();
      for (const termino of TERMINOS_BUSQUEDA) {
        const r = await client.search({ subject: termino, since: desde }, { uid: true });
        for (const u of r || []) encontrados.add(u);
      }
      // De más viejo a más nuevo: si un documento tiene varios avisos, gana el primero.
      const uids = [...encontrados].sort((a, b) => a - b).slice(0, MAX_MENSAJES);

      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { envelope: true }, { uid: true });
        const asunto = (msg as any)?.envelope?.subject || "";
        const archivo = extraerArchivoDeAsunto(asunto);
        if (!archivo) {
          // Vino del SEARCH pero no es un aviso de envío (p. ej. "Fulano firmó...", resumen diario).
          logs.push({ resultado: "ignorado", asunto, detalle: "El asunto no es un aviso de envío a firmar." });
          continue;
        }
        avisos++;
        if (soloPrueba) continue;

        if (!dropboxCfg || !pendbox) {
          errores.push("Dropbox no está conectado o falta la carpeta Pendbox");
          logs.push({ resultado: "error", asunto, archivo, detalle: "Dropbox no está conectado o falta la carpeta Pendbox." });
          continue;
        }

        // Fuera del try para que el log de error también pueda informar de qué persona se trataba.
        const ident = extraerIdentidadDeArchivo(archivo);
        try {
          // Ya movido en una corrida anterior: se sigue de largo.
          if (yaEstaEnPendbox(enPendbox, archivo, ident)) {
            duplicados++;
            logs.push({ resultado: "duplicado", asunto, archivo, cuit: ident.cuit, documento: ident.documento, detalle: "El documento ya estaba en Pendbox; no se vuelve a mover." });
            continue;
          }

          // Sin PDF en Outbox no hay documento propio al que atribuir el aviso (puede ser de otra
          // cuenta o un reenvío). No se archiva nada; si el PDF aparece después, la próxima corrida
          // lo toma, porque el aviso se sigue encontrando mientras esté dentro de la ventana.
          const pdf = buscarEnOutbox(enOutbox, archivo, ident);
          if (!pdf) {
            sinArchivoEnOutbox++;
            // El detalle nombra los datos que SE BUSCARON, no solo el CUIT: si el aviso trae un
            // período y ningún archivo de Outbox lo tiene, decir "no hay ninguno con este CUIL"
            // manda a buscar el problema al lado equivocado.
            const periodo = ident.fechas.length > 0 ? ` del período ${ident.fechas.join(" a ")}` : "";
            const quien = ident.cuit ? `del CUIL ${ident.cuit}` : ident.email ? `de ${ident.email}` : "";
            const pistas = quien ? `No hay ningún archivo en Outbox ${quien}${periodo}.` : "El título del aviso no trae CUIL, email ni documento, y ningún archivo de Outbox coincide por nombre.";
            logs.push({ resultado: "sin-archivo", asunto, archivo, cuit: ident.cuit, documento: ident.documento, detalle: `${pistas} Outbox tiene ${enOutbox.filter((e) => e.tag === "file").length} archivo(s).` });
            continue;
          }
          // Único efecto sobre Dropbox: el PDF pasa de Outbox a Pendbox. Eso es lo que hace avanzar
          // el contrato de "Para Firmar" a "Enviado a la firma"; no se genera ningún archivo extra.
          await moveEntry(tenantId, dropboxCfg, pdf.path, `${pendbox.replace(/\/$/, "")}/${pdf.name}`);
          movidos++;
          // Los listados en memoria se actualizan para que un aviso repetido de esta misma corrida
          // caiga en el chequeo de duplicado sin volver a pedirle las carpetas a Dropbox.
          enOutbox = enOutbox.filter((e) => e.path !== pdf.path);
          enPendbox.push({ tag: "file", name: pdf.name, path: `${pendbox.replace(/\/$/, "")}/${pdf.name}` });

          logs.push({
            resultado: "archivado",
            asunto,
            archivo: pdf.name,
            cuit: ident.cuit,
            documento: ident.documento,
            detalle: "El PDF se movió de Outbox a Pendbox.",
          });
        } catch (e: any) {
          errores.push(`${archivo}: ${e?.message || e}`);
          logs.push({ resultado: "error", asunto, archivo, cuit: ident?.cuit, documento: ident?.documento, detalle: String(e?.message || e) });
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e: any) {
    return { ok: false, detalle: `No se pudo leer la casilla: ${e?.message || e}`, avisos, movidos, duplicados, sinArchivoEnOutbox, logs };
  }

  const detalle = soloPrueba
    ? `Conexión OK. ${avisos} aviso(s) de envío en los últimos ${DIAS_ATRAS} días.`
    : [
        `${avisos} aviso(s) leídos`,
        `${movidos} PDF movido(s) de Outbox a Pendbox`,
        duplicados ? `${duplicados} ya estaban en Pendbox` : "",
        sinArchivoEnOutbox ? `${sinArchivoEnOutbox} sin PDF en Outbox` : "",
      ]
        .filter(Boolean)
        .join(" · ") + (errores.length ? ` · ${errores.length} con error: ${errores.slice(0, 3).join(" | ")}` : "");

  return { ok: errores.length === 0, detalle, avisos, movidos, duplicados, sinArchivoEnOutbox, logs };
}

/**
 * Update de Mongo que deja registrada una lectura. La corrida se suma al historial solo si encontró
 * algo o si falló: el job corre cada 5 minutos y guardar las corridas vacías llenaría el documento
 * del tenant sin aportar nada. Se conservan las últimas 50, de la más reciente a la más vieja.
 */
export function registrarLectura(r: ResultadoLectura): any {
  const update: any = {
    $set: {
      "integrations.dropboxSign.lastCheckAt": new Date(),
      "integrations.dropboxSign.lastCheckOk": r.ok,
      "integrations.dropboxSign.lastCheckDetalle": r.detalle,
    },
  };
  if (r.logs.length > 0 || !r.ok) {
    update.$push = {
      "integrations.dropboxSign.lastCheckHistorial": {
        $each: [{ at: new Date(), ok: r.ok, detalle: r.detalle, logs: r.logs }],
        $position: 0,
        $slice: 50,
      },
    };
  }
  return update;
}

/** Corre la lectura para todos los tenants que la tengan activada (lo usa el scheduler). */
export async function leerCasillasDeTodosLosTenants(): Promise<void> {
  const tenants = await Tenant.find({ "integrations.dropboxSign.enabled": true }).select("_id").lean();
  for (const t of tenants as any[]) {
    try {
      const r = await leerCasillaDropboxSign(String(t._id));
      await Tenant.updateOne({ _id: t._id }, registrarLectura(r));
    } catch (e: any) {
      console.error(`[DROPBOX-SIGN-MAIL] tenant ${t._id}:`, e?.message || e);
    }
  }
}

/** Cada cuánto se revisa la casilla (mismo orden de magnitud que el escaneo de carpetas). */
const TICK_MS = 5 * 60 * 1000;

/** Arranca el chequeo periódico de la casilla (lo llama server.ts al levantar). */
export const initDropboxSignMailScheduler = (): void => {
  console.log("[DROPBOX-SIGN-MAIL] Initializing scheduler...");
  setTimeout(() => {
    leerCasillasDeTodosLosTenants().catch((err) => console.error("[DROPBOX-SIGN-MAIL] Initial tick error:", err));
  }, 20 * 1000);
  setInterval(() => {
    leerCasillasDeTodosLosTenants().catch((err) => console.error("[DROPBOX-SIGN-MAIL] Interval tick error:", err));
  }, TICK_MS);
};
