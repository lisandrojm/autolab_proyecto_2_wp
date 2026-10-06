import { ImapFlow } from "imapflow";
import { Tenant } from "../models/Tenant.js";
import { decryptSecret } from "../utils/secretCrypto.js";
import { leerAnclas, mismoDocumento, AnclasNombre } from "../utils/anclasNombre.js";
import { resolverCarpetaPorProposito, resolverProposito } from "../utils/estadoCarpetas.js";
import { getTenantDropboxConfig, listFolder, moveEntry } from "./dropboxService.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { Info } from "../models/Info.js";
import { fechaISO } from "../utils/contratoVigencia.js";
import { aplicarTransicion } from "./estadoTransicionAutomaticaService.js";

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
 *  3. Busca en "Outbox" EL archivo del aviso: el de nombre completo igual al título, aunque el
 *     título traiga algo agregado al final (ver `documentosDelAvisoEnOutbox`). Si no está, no hace
 *     nada: sin respaldo en Outbox el aviso no se puede atribuir a un documento propio.
 *  4. Si el documento ya está en "Pendbox", no lo vuelve a mover. Los avisos se repiten (reenvíos,
 *     recordatorios, resumen diario), así que el chequeo evita trabajo al pedo.
 *  5. Mueve ese PDF de Outbox a Pendbox —no se genera ningún archivo extra— y pasa el contrato al
 *     estado de Pendbox («Enviado a la firma») en el momento, sin esperar al escaneo de carpetas.
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
 * EL documento del aviso en Outbox: el archivo cuyo nombre completo (sin la extensión) es el título.
 *
 * Coinciden TODOS los campos —proyecto, persona, tipo, contrato, período, CUIT, email y empresa—, no
 * solo la persona y el período: un alta, su contrato y su release comparten persona y período, y
 * mover «lo de esa persona» se llevó a Pendbox los tres por un aviso que nombraba solo el alta.
 *
 * Lo que el título tenga DESPUÉS del nombre no importa («…_Empresa-30717068374-Frame Firma
 * Digital»): el título de la solicitud es editable y Dropbox Sign o quien envía le agregan cosas.
 * Para que eso no confunda un nombre con otro más largo que lo contiene, después del nombre tiene que
 * venir un separador, no una letra o un número; y si igual quedan dos, gana el más largo.
 *
 * Primero se compara el texto tal cual. Solo si no aparece nada, normalizado a letras y números (por
 * si Dropbox Sign cambió algún símbolo), con la misma regla de «el título empieza con el nombre».
 */
export function documentosDelAvisoEnOutbox(entries: { tag: string; name: string; path: string }[], archivo: string, _ident?: AnclasNombre): { name: string; path: string }[] {
  const pdfs = entries.filter((e) => e.tag === "file" && !/\.json$/i.test(e.name));
  const titulo = String(archivo || "").trim();
  const sinExtension = (n: string) => n.replace(/\.[a-z0-9]{2,4}$/i, "").trim();
  const elMasLargo = (xs: { name: string; path: string }[]) => (xs.length === 0 ? [] : [xs.reduce((a, b) => (sinExtension(b.name).length > sinExtension(a.name).length ? b : a))]);

  const tal = pdfs.filter((e) => {
    const base = sinExtension(e.name);
    return base.length > 0 && titulo.startsWith(base) && (titulo.length === base.length || !/[A-Za-z0-9]/.test(titulo[base.length]));
  });
  if (tal.length > 0) return elMasLargo(tal);

  // Los símbolos se vuelven UN separador genérico, pero el separador queda: sin él, un nombre
  // cortado («…Empresa-3071706837») pasaba por el principio de otro («…Empresa-30717068374»).
  const separadores = (v: string) => sinExtension(String(v || "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const objetivo = separadores(titulo);
  const normalizados = pdfs.filter((e) => {
    const n = separadores(e.name);
    return n.length >= 20 && objetivo.startsWith(n) && (objetivo.length === n.length || objetivo[n.length] === "-");
  });
  return elMasLargo(normalizados);
}

/**
 * El contrato del aviso: la persona (CUIL, si no email) y el período del nombre.
 *
 * Solo si queda UNO. Con dos contratos de la misma persona en el mismo período no se adivina: el
 * escaneo de carpetas lo va a resolver después con el nombre de cada archivo.
 */
async function contratoDelAviso(tenantId: string, ident: AnclasNombre): Promise<{ up: any; idx: number } | null> {
  if (ident.fechas.length === 0) return null;
  const cuit = String(ident.cuit || "").replace(/\D/g, "");
  const filtroPersona = cuit.length === 11 ? { "metadata.cuit": { $in: [cuit, `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`] } } : ident.email ? { email: new RegExp(`^${ident.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } : null;
  if (!filtroPersona) return null;
  const personas = await User.find({ tenantId, ...filtroPersona }).select("_id").lean();
  if (personas.length === 0) return null;
  const ups = await UserProject.find({ userId: { $in: personas.map((p: any) => p._id) } });
  const compacta = (v: unknown) => fechaISO(v as any).replace(/-/g, "");
  const candidatos: { up: any; idx: number }[] = [];
  for (const up of ups) {
    (up.contracts || []).forEach((c: any, idx: number) => {
      const alta = compacta(c.fecha_alta_contrato);
      const baja = compacta(c.fecha_baja_contrato);
      if (alta && ident.fechas.includes(alta) && (!baja || ident.fechas.includes(baja))) candidatos.push({ up, idx });
    });
  }
  return candidatos.length === 1 ? candidatos[0] : null;
}

/**
 * Pasa el contrato al estado de Pendbox («Enviado a la firma») EN EL MOMENTO.
 *
 * El estado destino es el que tiene configurada la carpeta Pendbox (Configuración → Documentos →
 * Dropbox): no se escribe el nombre a mano. `aplicarTransicion` solo avanza, nunca retrocede, así que
 * es seguro repetirlo en cada lectura. Devuelve el texto para el log.
 */
async function avanzarContratoDelAviso(tenantId: string, ident: AnclasNombre): Promise<string> {
  try {
    const { estado } = await resolverProposito("pendbox");
    const destino = estado ? await Info.findOne({ type: "estado-empleado", name: estado }) : null;
    if (!destino) return " No hay un estado con la carpeta Pendbox configurada: el estado no cambió.";
    const contrato = await contratoDelAviso(tenantId, ident);
    if (!contrato) return " No se pudo identificar un único contrato de esa persona y período: el estado no cambió.";
    const r = await aplicarTransicion(contrato.up, contrato.idx, destino);
    return r.aplicada ? ` El contrato pasó a «${destino.name}».` : r.motivo === "ya_estaba" ? ` El contrato ya estaba en «${destino.name}».` : "";
  } catch (e: any) {
    return ` No se pudo cambiar el estado: ${e?.message || e}`;
  }
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
export function yaEstaEnPendbox(entries: { tag: string; name: string }[], archivo: string, _ident?: AnclasNombre): boolean {
  // La MISMA regla que para encontrarlo en Outbox: el nombre completo. Por persona y período, el
  // contrato ya enviado hacía pasar por «duplicado» el aviso de su alta, que nunca se movía.
  return documentosDelAvisoEnOutbox(entries.map((e) => ({ ...e, path: "" })), archivo).length > 0;
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
 * Por qué falló el IMAP, en palabras que sirvan para arreglarlo.
 *
 * `imapflow` tira SIEMPRE «Command failed» cuando el servidor contesta NO/BAD: el motivo real viene
 * aparte, en `responseText` (lo que dijo el servidor) y `authenticationFailed`. Mostrando solo el
 * `message`, la pantalla decía «Command failed» igual para una contraseña rechazada que para
 * cualquier otra cosa, y no había por dónde empezar.
 *
 * El caso que más pasa tiene nombre propio: Gmail no acepta la contraseña de la cuenta por IMAP,
 * pide una «contraseña de aplicación». No se manda nunca `executedCommand`: en un LOGIN lleva la
 * contraseña.
 */
export function motivoFalloImap(e: any): string {
  const texto = String(e?.responseText || "").trim();
  const codigo = String(e?.serverResponseCode || "").trim();
  const credenciales = e?.authenticationFailed === true || /AUTHENTICATIONFAILED|Invalid credentials|Web login required|Application-specific password/i.test(`${codigo} ${texto}`);
  if (credenciales) {
    return `El servidor rechazó el usuario o la contraseña${texto ? ` («${texto}»)` : ""}. Con Gmail no sirve la contraseña de la cuenta: hay que crear una «contraseña de aplicación» (Cuenta de Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones) y pegar esa, de 16 letras, en «Contraseña de la casilla». También tiene que estar habilitado IMAP en la configuración de Gmail.`;
  }
  const base = String(e?.message || e || "error desconocido");
  return texto ? `${base}: ${codigo ? `[${codigo}] ` : ""}${texto}` : base;
}

/**
 * Lee la casilla del tenant y archiva en Pendbox un JSON por cada aviso de envío a firmar.
 * `soloPrueba` conecta y cuenta los avisos sin escribir nada (para el botón "Probar" de la config).
 */
/**
 * UNA LECTURA A LA VEZ POR TENANT. Con la casilla vigilada por IDLE hay tres disparadores —el aviso
 * de Gmail, el sondeo de respaldo y el botón «Leer ahora»— y dos lecturas en paralelo listarían
 * Outbox al mismo tiempo e intentarían mover el mismo PDF dos veces. Se encolan: cada una espera a
 * que termine la anterior.
 */
const lecturasEnCurso = new Map<string, Promise<unknown>>();

export function leerCasillaDropboxSign(tenantId: string, soloPrueba = false): Promise<ResultadoLectura> {
  const anterior = lecturasEnCurso.get(tenantId) || Promise.resolve();
  const esta = anterior.catch(() => {}).then(() => leerCasillaAhora(tenantId, soloPrueba));
  lecturasEnCurso.set(tenantId, esta);
  esta.finally(() => {
    if (lecturasEnCurso.get(tenantId) === esta) lecturasEnCurso.delete(tenantId);
  }).catch(() => {});
  return esta;
}

/** Arma el cliente IMAP de la casilla configurada (lo usan la lectura y la vigilancia). */
function clienteImap(cfg: any, extra: Record<string, unknown> = {}): ImapFlow {
  return new ImapFlow({
    host: String(cfg.imapHost),
    port: Number(cfg.imapPort) || 993,
    secure: cfg.imapSecure !== false,
    auth: { user: String(cfg.imapUser || cfg.email), pass: decryptSecret(cfg.imapPasswordEnc) },
    logger: false,
    ...extra,
  });
}

async function leerCasillaAhora(tenantId: string, soloPrueba = false): Promise<ResultadoLectura> {
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
  const pendbox = await resolverCarpetaPorProposito("pendbox");
  const outbox = await resolverCarpetaPorProposito("outbox");

  const client = clienteImap(cfg);
  // Sin este listener, un corte de la conexión (Gmail cierra sockets ociosos) emite un `error` que
  // nadie escucha, y en Node eso es una excepción no manejada que tumba el proceso entero.
  client.on("error", (e: any) => console.warn("[DROPBOX-SIGN-MAIL] Error de la conexión IMAP:", motivoFalloImap(e)));

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
          // Ya movido en una corrida anterior: no se mueve de nuevo, pero el estado se intenta igual
          // (un sobre movido a mano, o antes de que esto cambiara el estado, quedaba sin avanzar).
          if (yaEstaEnPendbox(enPendbox, archivo, ident)) {
            duplicados++;
            const estado = await avanzarContratoDelAviso(tenantId, ident);
            logs.push({ resultado: "duplicado", asunto, archivo, cuit: ident.cuit, documento: ident.documento, detalle: `El documento ya estaba en Pendbox; no se vuelve a mover.${estado}` });
            continue;
          }

          // Sin documentos en Outbox no hay nada propio al que atribuir el aviso (puede ser de otra
          // cuenta o un reenvío). No se archiva nada; si aparecen después, la próxima corrida los
          // toma, porque el aviso se sigue encontrando mientras esté dentro de la ventana.
          const sobre = documentosDelAvisoEnOutbox(enOutbox, archivo, ident);
          if (sobre.length === 0) {
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
          // El archivo del aviso pasa de Outbox a Pendbox. Los listados en memoria se actualizan para
          // que un aviso repetido de esta misma corrida caiga en el chequeo de duplicado sin volver a
          // pedirle las carpetas a Dropbox.
          for (const pdf of sobre) {
            const destinoPdf = `${pendbox.replace(/\/$/, "")}/${pdf.name}`;
            await moveEntry(tenantId, dropboxCfg, pdf.path, destinoPdf);
            movidos++;
            enOutbox = enOutbox.filter((e) => e.path !== pdf.path);
            enPendbox.push({ tag: "file", name: pdf.name, path: destinoPdf });
          }
          const estado = await avanzarContratoDelAviso(tenantId, ident);

          logs.push({
            resultado: "archivado",
            asunto,
            archivo: sobre.map((p) => p.name).join(" · "),
            cuit: ident.cuit,
            documento: ident.documento,
            detalle: `${sobre.length === 1 ? "El PDF se movió" : `Se movieron ${sobre.length} PDF`} de Outbox a Pendbox.${estado}`,
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
    console.warn("[DROPBOX-SIGN-MAIL] Falló la casilla:", motivoFalloImap(e));
    return { ok: false, detalle: `No se pudo leer la casilla: ${motivoFalloImap(e)}`, avisos, movidos, duplicados, sinArchivoEnOutbox, logs };
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
 * algo o si falló: hay una lectura por cada mail que entra y otra cada 15 minutos, y guardar las vacías llenaría el documento
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

/** Lee la casilla de un tenant y deja registrado el resultado (lo usan el sondeo y la vigilancia). */
async function leerYRegistrar(tenantId: string): Promise<void> {
  try {
    const r = await leerCasillaDropboxSign(tenantId);
    await Tenant.updateOne({ _id: tenantId }, registrarLectura(r));
  } catch (e: any) {
    console.error(`[DROPBOX-SIGN-MAIL] tenant ${tenantId}:`, e?.message || e);
  }
}

/** Corre la lectura para todos los tenants que la tengan activada (el sondeo de respaldo). */
export async function leerCasillasDeTodosLosTenants(): Promise<void> {
  const tenants = await Tenant.find({ "integrations.dropboxSign.enabled": true }).select("_id").lean();
  for (const t of tenants as any[]) {
    await leerYRegistrar(String(t._id));
    // Si la vigilancia de este tenant se cayó y no pudo volver, el sondeo la rearma.
    if (vigilanciaActiva && !vigilancias.has(String(t._id))) void vigilarCasilla(String(t._id));
  }
}

/*
  VIGILANCIA POR IDLE: EL ESTADO CAMBIA APENAS LLEGA EL AVISO.

  Antes la casilla se revisaba cada 5 minutos, así que un contrato tardaba hasta 5 minutos en pasar a
  «Enviado a la firma». Ahora queda UNA conexión abierta por tenant, parada en INBOX en modo IDLE:
  Gmail avisa en el momento que entró un mail (evento `exists`) y se corre la lectura de siempre. No
  hay otra lógica: lo que decide qué se mueve y qué estado cambia sigue siendo `leerCasillaAhora`.

  · Se espera unos segundos antes de leer: Dropbox Sign suele mandar varios avisos juntos (uno por
    documento) y así se procesan en UNA lectura.
  · Gmail corta la conexión IDLE cada tanto (y la red también): se reconecta sola, con una espera
    que crece hasta 5 minutos para no martillar al servidor si la contraseña dejó de servir.
  · El sondeo queda de RED DE SEGURIDAD cada 15 minutos: si un aviso se pierde en una reconexión,
    lo levanta igual (la búsqueda es por los últimos 30 días, no por «lo nuevo»).
*/
interface Vigilancia {
  client: ImapFlow;
  parada: boolean;
  temporizador?: NodeJS.Timeout;
}
const vigilancias = new Map<string, Vigilancia>();
const reintentos = new Map<string, number>();
/** Solo vigila el proceso que corre las tareas programadas (el VPS), no una copia local. */
let vigilanciaActiva = false;

/** Espera antes de leer, para juntar los avisos que llegan en ráfaga. */
const ESPERA_RAFAGA_MS = 5 * 1000;

function dejarDeVigilar(tenantId: string): void {
  const v = vigilancias.get(tenantId);
  if (!v) return;
  v.parada = true;
  if (v.temporizador) clearTimeout(v.temporizador);
  vigilancias.delete(tenantId);
  v.client.logout().catch(() => v.client.close());
}

async function vigilarCasilla(tenantId: string): Promise<void> {
  dejarDeVigilar(tenantId);
  const tenant = await Tenant.findById(tenantId).select("integrations.dropboxSign").lean();
  const cfg: any = (tenant as any)?.integrations?.dropboxSign || {};
  if (!cfg.enabled || !cfg.email || !cfg.imapHost || !cfg.imapPasswordEnc) return;

  // `maxIdleTime`: el IDLE se renueva antes de los ~29 minutos en que Gmail lo da por muerto.
  const client = clienteImap(cfg, { maxIdleTime: 20 * 60 * 1000 });
  const v: Vigilancia = { client, parada: false };
  vigilancias.set(tenantId, v);

  client.on("error", (e: any) => console.warn(`[DROPBOX-SIGN-MAIL] Vigilancia ${tenantId}:`, motivoFalloImap(e)));
  client.on("exists", () => {
    if (v.temporizador) clearTimeout(v.temporizador);
    v.temporizador = setTimeout(() => void leerYRegistrar(tenantId), ESPERA_RAFAGA_MS);
  });
  client.on("close", () => {
    if (v.parada) return;
    vigilancias.delete(tenantId);
    const n = (reintentos.get(tenantId) || 0) + 1;
    reintentos.set(tenantId, n);
    const espera = Math.min(5 * 60 * 1000, 15 * 1000 * 2 ** (n - 1));
    console.warn(`[DROPBOX-SIGN-MAIL] Vigilancia ${tenantId}: se cerró la conexión; reintento en ${Math.round(espera / 1000)} s.`);
    setTimeout(() => {
      if (vigilanciaActiva && !vigilancias.has(tenantId)) void vigilarCasilla(tenantId);
    }, espera);
  });

  try {
    await client.connect();
    // Con el buzón abierto y sin comandos pendientes, imapflow entra solo en IDLE.
    await client.mailboxOpen("INBOX");
    reintentos.delete(tenantId);
    console.log(`[DROPBOX-SIGN-MAIL] Vigilando la casilla de ${tenantId} (IDLE).`);
  } catch (e: any) {
    // El evento `close` agenda el reintento; acá solo queda el motivo.
    console.warn(`[DROPBOX-SIGN-MAIL] Vigilancia ${tenantId}: no se pudo conectar:`, motivoFalloImap(e));
    client.close();
  }
}

/**
 * Rearma la vigilancia de un tenant con su configuración actual. Lo llama la ruta que guarda la
 * casilla: una contraseña nueva o la lectura apagada tienen que regir sin reiniciar el servidor.
 */
export function actualizarVigilancia(tenantId: string): void {
  if (!vigilanciaActiva) return;
  reintentos.delete(tenantId);
  void vigilarCasilla(tenantId);
}

/** El sondeo de respaldo: la vigilancia avisa en el momento, esto levanta lo que se haya perdido. */
const TICK_MS = 15 * 60 * 1000;

/** Arranca la vigilancia de las casillas y el sondeo de respaldo (lo llama server.ts al levantar). */
export const initDropboxSignMailScheduler = (): void => {
  console.log("[DROPBOX-SIGN-MAIL] Initializing scheduler...");
  vigilanciaActiva = true;
  setTimeout(() => {
    leerCasillasDeTodosLosTenants().catch((err) => console.error("[DROPBOX-SIGN-MAIL] Initial tick error:", err));
  }, 20 * 1000);
  setInterval(() => {
    leerCasillasDeTodosLosTenants().catch((err) => console.error("[DROPBOX-SIGN-MAIL] Interval tick error:", err));
  }, TICK_MS);
};
