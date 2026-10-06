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
import { DocumentoGenerado } from "../models/DocumentoGenerado.js";

/**
 * Detección de "documento enviado a firmar" leyendo la casilla de correo.
 *
 * Dropbox Sign (en el plan actual) no avisa por API qué contratos ya se mandaron a firmar, pero sí
 * copia por mail a quien se ponga en CC. Por eso el instructivo de "Para Firmar" pide agregar la
 * casilla configurada acá en CC: ese mail es la ÚNICA señal de que el envío ocurrió.
 *
 * La casilla la usan personas, así que el job es de solo lectura sobre el correo: no marca nada como
 * leído ni mueve mensajes. Busca por asunto dentro de una ventana de días y lo que evita reprocesar
 * es que el PDF ya salió de Outbox.
 *
 * Qué hace por cada aviso encontrado:
 *  1. Lee del ASUNTO el nombre del documento ("Se inició el proceso de firma de <archivo>").
 *  2. De ese nombre saca quién es (CUIL o email) y de qué período habla (ver `leerAnclas`).
 *  3. Busca en "Outbox" EL archivo del aviso: el de nombre completo igual al título, aunque el
 *     título traiga algo agregado al final (ver `documentosDelAvisoEnOutbox`). Si no está, no hace
 *     nada: sin respaldo en Outbox el aviso no se puede atribuir a un documento propio.
 *  4. Si el documento ya no está en Outbox, no hace nada: ya se movió en una lectura anterior. Los
 *     avisos se repiten (cada lectura revisa 30 días), y Pendbox no se lista: ver `leerCasillaAhora`.
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
  /*
    CON CÓDIGO («ID-000123»), EL CÓDIGO Y NADA MÁS. Es único por documento: no hace falta comparar el
    resto del nombre, y no se cae a la comparación por nombre si no aparece — un código que no está
    en la carpeta es un documento que no está, no uno que haya que adivinar por parecido.
  */
  const codigo = leerAnclas(archivo).codigo;
  if (codigo) return pdfs.filter((e) => leerAnclas(e.name).codigo === codigo).slice(0, 1);
  const titulo = String(archivo || "").trim();
  // Un título SIN código contra un archivo que ya lo tiene (se renombró con `codigosEnOutbox` después de
  // mandarlo a firmar): se compara el archivo sin su código, que es el nombre con el que se envió.
  const sinExtension = (n: string) => n.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/_ID-\d{6,}$/, "").trim();
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
 * El contrato de un documento con código: el que quedó registrado en `documentos_generados` al
 * generarlo. Se lo busca por sus fechas (no cambian) y, si no aparece, por la posición guardada.
 */
async function contratoDelCodigo(tenantId: string, codigo: string): Promise<{ up: any; idx: number } | null> {
  const doc: any = await DocumentoGenerado.findOne({ tenantId, codigo }).lean();
  if (!doc?.userProjectId) return null;
  const up: any = await UserProject.findById(doc.userProjectId);
  if (!up) return null;
  const c = doc.contrato || {};
  const contratos: any[] = up.contracts || [];
  const porFechas = contratos
    .map((x, idx) => ({ x, idx }))
    .filter(({ x }) => fechaISO(x.fecha_alta_contrato) === (c.alta || "") && fechaISO(x.fecha_baja_contrato) === (c.baja || "") && (!c.carga || String(x.fecha_carga ?? "") === c.carga));
  if (porFechas.length === 1) return { up, idx: porFechas[0].idx };
  if (typeof c.indice === "number" && contratos[c.indice]) return { up, idx: c.indice };
  return null;
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
    // Con código, el contrato es el que quedó registrado al generar el documento; sin código, se deduce.
    const contrato = ident.codigo ? await contratoDelCodigo(tenantId, ident.codigo) : await contratoDelAviso(tenantId, ident);
    if (ident.codigo && !contrato) return ` El código ${ident.codigo} no tiene un contrato registrado: el estado no cambió.`;
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
 * UNA LECTURA A LA VEZ POR TENANT. Hay dos disparadores —el sondeo y el botón «Leer ahora»— y dos
 * lecturas en paralelo listarían
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

/** Arma el cliente IMAP de la casilla configurada. */
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
  // Sin el historial de lecturas: es lo que más pesa del tenant y acá no se usa.
  const tenant = await Tenant.findById(tenantId).select("-integrations.dropboxSign.lastCheckHistorial").lean();
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

  /*
    SOLO SE LISTA OUTBOX, NO PENDBOX.

    Pendbox acumula todo lo enviado (cientos de archivos) y se listaba ENTERO en cada lectura para
    preguntar, por cada aviso de los últimos 30 días, si ya estaba ahí: un recorrido síncrono de
    avisos × archivos que dejaba al servidor sin atender requests (un /health tardó 27 s). No hace
    falta: si el documento está en Outbox se mueve; si no está, ya se movió antes o no es de la
    plataforma, y en los dos casos no hay nada que hacer. Un aviso repetido en la misma corrida cae
    en el segundo caso porque el PDF ya salió de `enOutbox`.
  */
  let enOutbox: { tag: string; name: string; path: string }[] = [];
  if (!soloPrueba && dropboxCfg) {
    try {
      if (outbox) enOutbox = ((await listFolder(tenantId, dropboxCfg, outbox, true)).entries || []) as any[];
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
      // para siempre. Lo que evita reprocesar es que el PDF ya salió de Outbox, y por eso tampoco
      // se tocan los flags del mensaje: la bandeja queda tal como la dejó su dueño.
      const desde = new Date(Date.now() - DIAS_ATRAS * 24 * 60 * 60 * 1000);
      const encontrados = new Set<number>();
      for (const termino of TERMINOS_BUSQUEDA) {
        const r = await client.search({ subject: termino, since: desde }, { uid: true });
        for (const u of r || []) encontrados.add(u);
      }
      // De más viejo a más nuevo: si un documento tiene varios avisos, gana el primero.
      const uids = [...encontrados].sort((a, b) => a - b).slice(0, MAX_MENSAJES);

      // Los asuntos de TODOS los mensajes en un solo FETCH, no uno por mensaje: eran cientos de idas y
      // vueltas a Gmail por lectura, y ahora hay una lectura por cada mail que entra.
      const asuntos = new Map<number, string>();
      if (uids.length > 0) {
        for await (const m of client.fetch(uids.join(","), { envelope: true }, { uid: true })) asuntos.set(Number((m as any).uid), (m as any)?.envelope?.subject || "");
      }

      for (const [n, uid] of uids.entries()) {
        // Cada 20 avisos se le devuelve el hilo a Node: mientras esto corre, el servidor sigue
        // atendiendo requests en vez de esperar a que termine la lectura entera.
        if (n > 0 && n % 20 === 0) await new Promise((r) => setImmediate(r));
        const asunto = asuntos.get(uid) || "";
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
          // No está en Outbox: ya se movió en una lectura anterior (o en esta, por un aviso repetido),
          // o no es de un documento de la plataforma. No se hace nada, ni se carga ningún contrato: es
          // la situación de casi todos los avisos de la ventana de 30 días, en CADA lectura.
          const sobre = documentosDelAvisoEnOutbox(enOutbox, archivo, ident);
          if (sobre.length === 0) {
            sinArchivoEnOutbox++;
            logs.push({ resultado: "sin-archivo", asunto, archivo, cuit: ident.cuit, documento: ident.documento, detalle: `No está en Outbox: ya se movió a Pendbox antes, o no es de un documento de la plataforma.` });
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
  } catch (e: any) {
    console.warn("[DROPBOX-SIGN-MAIL] Falló la casilla:", motivoFalloImap(e));
    return { ok: false, detalle: `No se pudo leer la casilla: ${motivoFalloImap(e)}`, avisos, movidos, duplicados, sinArchivoEnOutbox, logs };
  } finally {
    // SIEMPRE se cierra, también si la lectura falló a mitad de camino: antes el error salteaba el
    // `logout` y la conexión con Gmail quedaba abierta, acumulándose de a una por lectura fallida.
    await client.logout().catch(() => client.close());
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
 * algo o si falló: hay una lectura cada 2 minutos, y guardar las vacías llenaría el documento
 * del tenant sin aportar nada. Se conservan las últimas 50, de la más reciente a la más vieja.
 */
/** Lo que vale guardar de una lectura: lo que se movió y lo que falló. Lo demás se repite en cada una. */
const LINEAS_QUE_SE_GUARDAN = new Set<LineaLog["resultado"]>(["archivado", "error"]);

export function registrarLectura(r: ResultadoLectura): any {
  const update: any = {
    $set: {
      "integrations.dropboxSign.lastCheckAt": new Date(),
      "integrations.dropboxSign.lastCheckOk": r.ok,
      "integrations.dropboxSign.lastCheckDetalle": r.detalle,
    },
  };
  /*
    SOLO LECTURAS CON NOVEDADES. Antes se guardaba cada lectura con un log de TODOS los avisos de la
    ventana de 30 días —los mismos, repetidos—, y con una lectura por cada mail que entra eso inflaba
    el documento del tenant, que se lee en muchas pantallas. Ahora: una lectura entra al historial si
    movió algo o falló, y solo con esas líneas.
  */
  const lineas = r.logs.filter((l) => LINEAS_QUE_SE_GUARDAN.has(l.resultado));
  if (lineas.length > 0 || !r.ok) {
    update.$push = {
      "integrations.dropboxSign.lastCheckHistorial": {
        $each: [{ at: new Date(), ok: r.ok, detalle: r.detalle, logs: lineas }],
        $position: 0,
        $slice: 30,
      },
    };
  }
  return update;
}

/** Lee la casilla de un tenant y deja registrado el resultado. */
async function leerYRegistrar(tenantId: string): Promise<void> {
  try {
    const r = await leerCasillaDropboxSign(tenantId);
    await Tenant.updateOne({ _id: tenantId }, registrarLectura(r));
  } catch (e: any) {
    console.error(`[DROPBOX-SIGN-MAIL] tenant ${tenantId}:`, e?.message || e);
  }
}

/*
  SONDEO PERIÓDICO, SIN VIGILANCIA POR IDLE.

  Del 06/10/2026 10:41 al de la tarde hubo una vigilancia por IDLE: una conexión fija con Gmail que
  disparaba una lectura completa por CADA mail que entraba a la casilla. Con ella el servidor se
  bloqueaba de a 20–55 segundos (un /health tardaba eso en abrir el TLS) y con la lectura apagada
  volvía a responder. Se sacó: se lee cada `TICK_MS`, una lectura a la vez, y si la anterior no
  terminó la siguiente se saltea en vez de encolarse.
*/
let sondeoEnCurso = false;

/** Corre la lectura para todos los tenants que la tengan activada. */
export async function leerCasillasDeTodosLosTenants(): Promise<void> {
  if (sondeoEnCurso) {
    console.warn("[DROPBOX-SIGN-MAIL] La lectura anterior todavía no terminó: se saltea esta vuelta.");
    return;
  }
  sondeoEnCurso = true;
  try {
    const tenants = await Tenant.find({ "integrations.dropboxSign.enabled": true }).select("_id").lean();
    for (const t of tenants as any[]) await leerYRegistrar(String(t._id));
  } finally {
    sondeoEnCurso = false;
  }
}

/** Cada cuánto se revisa la casilla: lo que tarda, como mucho, un envío en pasar a «Enviado a la firma». */
const TICK_MS = 2 * 60 * 1000;

/** Arranca la lectura periódica de la casilla (lo llama server.ts al levantar). */
export const initDropboxSignMailScheduler = (): void => {
  console.log("[DROPBOX-SIGN-MAIL] Initializing scheduler...");
  setTimeout(() => {
    leerCasillasDeTodosLosTenants().catch((err) => console.error("[DROPBOX-SIGN-MAIL] Initial tick error:", err));
  }, 60 * 1000);
  setInterval(() => {
    leerCasillasDeTodosLosTenants().catch((err) => console.error("[DROPBOX-SIGN-MAIL] Interval tick error:", err));
  }, TICK_MS);
};
