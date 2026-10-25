import { leerAnclas } from "../utils/anclasNombre.js";
import { candidatosPorNombre, elMasLargo, type ArchivoConNombre } from "../utils/coincidenciaDeNombre.js";
import { recortarNombre } from "../utils/nomenclatura.js";

/**
 * RESCATE DE FIRMADOS DESDE EL EMAIL (23/10/2026). Doble validación «Requested signatures» / correo.
 *
 * El paso «Enviado a la firma → Firmados» depende de la integración nativa Dropbox Sign → Dropbox, que
 * deposita el PDF firmado en la carpeta con propósito `firmados`. Esa integración se corta a veces y
 * los firmados no llegan. La misma lectura IMAP que mueve Outbox → Pendbox con los avisos de «se inició
 * el proceso de firma» detecta además los avisos de «documento firmado» y, si el PDF NO está en la
 * carpeta, lo baja del adjunto del email y lo sube ella misma. Si la integración ya lo depositó, no
 * hace nada (idempotente). Los estados no se tocan acá: después de un rescate se dispara el escaneo de
 * carpetas y todo sigue por el camino de siempre.
 *
 * Este módulo es PURO (sin IMAP ni Dropbox): recibe los avisos ya leídos y las operaciones inyectadas,
 * así se prueba entero sin red. `dropboxSignMailService.ts` lo alimenta.
 */

/** Remitente de los avisos de Dropbox Sign (confirmado con un mail real: «Frame Zero <noreply@mail.hellosign.com>»). */
export const REMITENTE_FIRMADO = "mail.hellosign.com";

/**
 * Términos del SEARCH IMAP. PALABRAS ENTERAS, con acento: Gmail no busca por subcadena sino por
 * palabra (como su buscador), y por eso «firm» devolvía 0 con 204 mails de «firmó» en la casilla
 * (medido el 25/10/2026: «firm» → 0, «firmo» → 0, «firmó» → 204). El charset no es problema:
 * ImapFlow manda el SEARCH en UTF-8. El filtro fino sigue siendo `extraerArchivoFirmado`.
 */
export const TERMINOS_BUSQUEDA_FIRMADO = ["firmó", "firmado", "firmaron", "signed"];

/**
 * Asuntos de «documento firmado» (ES/EN). El grupo `archivo` es el nombre EXACTO del PDF: trae el
 * `ID-NNNNNN`. Confirmado con un mail real del 22/10/2026:
 *   «ALAN AQUINO firmó 426_LN+_AQUINO_Release_Jornada_D-…_ID-000137.pdf».
 * Las variantes multi-firmante («Todos firmaron…» / «Everyone has signed…») y en inglés se incluyen
 * por forma; los asuntos reales que no matcheen nada los lista `npm run dropbox-sign:asuntos`.
 *
 * Después del «.pdf» puede venir una cola («: Firma solicitada por Frame Zero»): es el título del
 * envío cuando se mandó con mensaje, visto en 9 mails reales el 25/10/2026. Se admite y se descarta.
 */
const COLA = String.raw`(?:\s*:\s.*)?$`;
export const ASUNTO_FIRMADO: RegExp[] = [
  new RegExp(String.raw`^(?<quien>.+?)\s+firm[oó]\s+(?<archivo>.+\.pdf)` + COLA, "i"),
  new RegExp(String.raw`^(?<quien>.+?)\s+(?:ha|han)\s+firmado\s+(?<archivo>.+\.pdf)` + COLA, "i"),
  new RegExp(String.raw`^(?:todos|todas|todos los firmantes|todas las partes)\s+(?:ya\s+)?firmaron\s+(?<archivo>.+\.pdf)` + COLA, "i"),
  new RegExp(String.raw`^(?<quien>.+?)\s+(?:has\s+|have\s+|just\s+)?signed\s+(?<archivo>.+\.pdf)` + COLA, "i"),
  new RegExp(String.raw`^(?:everyone|all parties|all signers)\s+(?:has|have)\s+signed\s+(?<archivo>.+\.pdf)` + COLA, "i"),
  new RegExp(String.raw`^(?:completed|completado|listo)[:!\s]+(?:firmaron\s+(?:tu|el)\s+documento[:\s]+)?(?<archivo>.+\.pdf)` + COLA, "i"),
];

const sinPrefijos = (asunto: string) =>
  String(asunto || "")
    .replace(/^(re|rv|fwd?)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

/** El aviso de firmado leído del asunto: el nombre del PDF (con `.pdf`) y quién firmó, o null si no es de firmado. */
export function extraerAvisoFirmado(asunto: string): { archivo: string; quien: string } | null {
  const limpio = sinPrefijos(asunto);
  for (const re of ASUNTO_FIRMADO) {
    const m = re.exec(limpio);
    const archivo = m?.groups?.archivo?.trim();
    if (archivo) return { archivo: archivo.replace(/[\\/]/g, "-"), quien: String(m?.groups?.quien || "").trim() };
  }
  return null;
}

/** El nombre del PDF firmado tal como aparece en el asunto (con `.pdf`), o "" si el asunto no es de firmado. */
export const extraerArchivoFirmado = (asunto: string): string => extraerAvisoFirmado(asunto)?.archivo || "";

export const esAvisoDeFirmado = (asunto: string): boolean => extraerArchivoFirmado(asunto) !== "";

/** Un adjunto PDF de un mensaje, por su número de parte (para bajarlo). */
export interface AdjuntoPdf {
  part: string;
  nombre: string;
  /** Tamaño codificado (base64), si el servidor lo informa. */
  bytes: number | null;
  tipo: string;
}

/** Los adjuntos PDF de un `bodyStructure` de imapflow (recorre las partes anidadas). */
export function adjuntosPdf(estructura: any): AdjuntoPdf[] {
  const res: AdjuntoPdf[] = [];
  const visitar = (n: any) => {
    if (!n || typeof n !== "object") return;
    const hijos: any[] = Array.isArray(n.childNodes) ? n.childNodes : [];
    const tipo = String(n.type || "").toLowerCase();
    const nombre = String(n.dispositionParameters?.filename || n.parameters?.name || "").trim();
    const esPdf = tipo === "application/pdf" || (tipo === "application/octet-stream" && /\.pdf$/i.test(nombre));
    if (hijos.length === 0 && esPdf) res.push({ part: String(n.part || "1"), nombre, bytes: typeof n.size === "number" ? n.size : null, tipo });
    for (const h of hijos) visitar(h);
  };
  visitar(estructura);
  return res;
}

/** Límites del adjunto: un recibo o contrato pesa entre ~100 KB y unos pocos MB. */
export const MIN_BYTES_PDF = 50 * 1024;
export const MAX_BYTES_PDF = 15 * 1024 * 1024;

/** El adjunto es dato NO confiable: no se interpreta, sólo se verifica que sea un PDF de tamaño razonable. */
export function validarAdjunto(buffer: Buffer): { ok: true } | { ok: false; motivo: string } {
  if (!buffer || buffer.length === 0) return { ok: false, motivo: "el adjunto vino vacío" };
  if (buffer.subarray(0, 5).toString("latin1").indexOf("%PDF") !== 0) return { ok: false, motivo: "el adjunto no es un PDF (no empieza con %PDF)" };
  if (buffer.length < MIN_BYTES_PDF) return { ok: false, motivo: `el adjunto es demasiado chico (${Math.round(buffer.length / 1024)} KB; mínimo ${MIN_BYTES_PDF / 1024} KB)` };
  if (buffer.length > MAX_BYTES_PDF) return { ok: false, motivo: `el adjunto es demasiado grande (${Math.round(buffer.length / 1024 / 1024)} MB; máximo ${MAX_BYTES_PDF / 1024 / 1024} MB)` };
  return { ok: true };
}

/**
 * El nombre con el que se sube: el título del documento (nombre exacto con el que se envió), saneado
 * (sin rutas ni caracteres de control), con el código al final si no lo traía, recortado al tope de
 * Dropbox y con `.pdf`.
 */
export function nombreDestino(titulo: string, codigo?: string): string {
  let base = String(titulo || "")
    .replace(/\.pdf$/i, "")
    .replace(/[\\/]/g, "-")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/^\.+/, "")
    .trim();
  if (codigo && !leerAnclas(base).codigo) base = `${base}_${codigo}`;
  return `${recortarNombre(base, 4)}.pdf`;
}

/** ¿El firmado ya está en la carpeta? Por código si el título lo trae; si no, por nombre (el más largo que coincida). */
export function yaEstaEnFirmados<T extends ArchivoConNombre>(entries: Array<T & { tag?: string }>, titulo: string): T | null {
  const pdfs = entries.filter((e) => (e.tag === undefined || e.tag === "file") && !/\.json$/i.test(e.name));
  const codigo = leerAnclas(titulo).codigo;
  if (codigo) return pdfs.find((e) => leerAnclas(e.name).codigo === codigo) || null;
  return elMasLargo(candidatosPorNombre(pdfs, String(titulo || "").replace(/\.pdf$/i, "")))[0] || null;
}

/** Dropbox contesta 409 `path/conflict/file` cuando ya hay un archivo con ese nombre (subida sin renombrar). */
export function esConflictoDeNombre(e: any): boolean {
  const texto = String(e?.response?.data?.error_summary || e?.error_summary || e?.message || "");
  return /path\/conflict|conflict\/file/i.test(texto);
}

/* ─────────────────────────── la pasada ─────────────────────────── */

export interface AvisoFirmado {
  uid: number;
  asunto: string;
  /** El nombre del PDF según el asunto. */
  titulo: string;
  /** Quién firmó, según el asunto. */
  quien?: string;
  adjuntos: AdjuntoPdf[];
}

export type ResultadoRescate = "firmado-rescatado" | "firmado-ya-estaba" | "firmado-sin-adjunto" | "error";

export interface LineaRescate {
  resultado: ResultadoRescate;
  asunto: string;
  archivo: string;
  cuit?: string;
  documento?: string;
  detalle: string;
  /** Sólo en «firmado-rescatado»: lo que hace falta para el registro permanente. */
  rescate?: { uid: number; codigo: string; titulo: string; quien: string; path: string; carpeta: string; bytes: number };
}

export interface DepsRescate {
  carpetaFirmados: string;
  /** El listado de la carpeta, UNA vez por corrida. Se actualiza en memoria con lo que se sube. */
  enFirmados: ArchivoConNombre[];
  /** Con `soloPrueba` cuenta cuántos faltan sin bajar ni subir nada. */
  soloPrueba: boolean;
  existeDocumento: (codigo: string) => Promise<boolean>;
  descargar: (uid: number, adjunto: AdjuntoPdf) => Promise<Buffer>;
  /** Sube SIN renombrar: si ya existe, tira un error que `esConflictoDeNombre` reconoce. */
  subir: (path: string, buffer: Buffer) => Promise<void>;
  /** UIDs ya resueltos en esta vida del proceso (rescatados o sin adjunto): no se vuelven a bajar. */
  verificados: Set<number>;
  cederHilo?: () => Promise<void>;
}

export interface ResumenRescate {
  avisos: number;
  yaEstaban: number;
  rescatados: number;
  sinAdjunto: number;
  /** Sólo en prueba: cuántos no están en la carpeta (se rescatarían). */
  faltan: number;
  errores: string[];
  logs: LineaRescate[];
}

/** Por cada aviso de firmado: ¿está en la carpeta? Si no, bajar el adjunto, validarlo y subirlo. Idempotente. */
export async function rescatarFirmados(avisos: AvisoFirmado[], deps: DepsRescate): Promise<ResumenRescate> {
  const r: ResumenRescate = { avisos: 0, yaEstaban: 0, rescatados: 0, sinAdjunto: 0, faltan: 0, errores: [], logs: [] };
  const carpeta = deps.carpetaFirmados.replace(/\/$/, "");
  /** Nunca se sube dos veces el mismo código en una corrida (dos avisos del mismo documento). */
  const subidos = new Set<string>();

  for (const [n, a] of avisos.entries()) {
    if (n > 0 && n % 20 === 0) await deps.cederHilo?.();
    r.avisos++;
    const ident = leerAnclas(a.titulo);
    const base = { asunto: a.asunto, archivo: a.titulo, cuit: ident.cuit, documento: ident.documento };
    try {
      const existente = yaEstaEnFirmados(deps.enFirmados, a.titulo);
      if (existente) {
        r.yaEstaban++;
        r.logs.push({ ...base, resultado: "firmado-ya-estaba", detalle: `Ya está en la carpeta de firmados como «${existente.name}».` });
        continue;
      }
      if (deps.verificados.has(a.uid)) {
        // Ya se resolvió en esta vida del proceso (rescatado, o sin adjunto): no se vuelve a bajar.
        r.yaEstaban++;
        continue;
      }
      if (deps.soloPrueba) {
        r.faltan++;
        continue;
      }
      const codigo = ident.codigo || a.adjuntos.map((x) => leerAnclas(x.nombre).codigo).find(Boolean) || "";
      if (!codigo) {
        r.errores.push(`${a.titulo}: sin código`);
        r.logs.push({ ...base, resultado: "error", detalle: "El título no trae el código ID-NNNNNN: no se puede atribuir a un documento de la plataforma y no se sube." });
        continue;
      }
      if (subidos.has(codigo)) {
        r.yaEstaban++;
        r.logs.push({ ...base, resultado: "firmado-ya-estaba", detalle: `El código ${codigo} ya se rescató en esta misma lectura.` });
        continue;
      }
      if (!(await deps.existeDocumento(codigo))) {
        r.errores.push(`${a.titulo}: ${codigo} sin documento registrado`);
        r.logs.push({ ...base, resultado: "error", detalle: `El código ${codigo} no tiene un documento registrado en la plataforma: no se sube.` });
        continue;
      }
      if (a.adjuntos.length === 0) {
        r.sinAdjunto++;
        deps.verificados.add(a.uid);
        r.logs.push({ ...base, resultado: "firmado-sin-adjunto", detalle: "El aviso no trae el PDF firmado adjunto y la integración de Dropbox no lo depositó. Activá en Dropbox Sign la opción de adjuntar el documento firmado en los correos (Configuración → documentos completados)." });
        continue;
      }
      const adjunto = a.adjuntos.find((x) => leerAnclas(x.nombre).codigo === codigo) || a.adjuntos[0];
      // El tamaño codificado (base64) es ~1,37× el real: se frena antes de bajar algo enorme.
      if (adjunto.bytes && adjunto.bytes > MAX_BYTES_PDF * 1.4) {
        r.errores.push(`${a.titulo}: adjunto demasiado grande`);
        r.logs.push({ ...base, resultado: "error", detalle: `El adjunto es demasiado grande (${Math.round(adjunto.bytes / 1024 / 1024)} MB): no se baja.` });
        continue;
      }
      const buffer = await deps.descargar(a.uid, adjunto);
      const v = validarAdjunto(buffer);
      if (v.ok === false) {
        r.errores.push(`${a.titulo}: ${v.motivo}`);
        r.logs.push({ ...base, resultado: "error", detalle: `No se sube: ${v.motivo}.` });
        continue;
      }
      const nombre = nombreDestino(a.titulo, codigo);
      const path = `${carpeta}/${nombre}`;
      try {
        await deps.subir(path, buffer);
      } catch (e: any) {
        if (!esConflictoDeNombre(e)) throw e;
        // Carrera con la integración nativa: lo depositó mientras se rescataba. Es un «ya estaba».
        r.yaEstaban++;
        deps.enFirmados.push({ name: nombre, path });
        deps.verificados.add(a.uid);
        r.logs.push({ ...base, resultado: "firmado-ya-estaba", detalle: `Ya había un archivo con ese nombre en la carpeta (lo depositó la integración de Dropbox): no se subió otro.` });
        continue;
      }
      r.rescatados++;
      subidos.add(codigo);
      deps.enFirmados.push({ name: nombre, path });
      deps.verificados.add(a.uid);
      r.logs.push({
        ...base,
        resultado: "firmado-rescatado",
        archivo: nombre,
        detalle: `La integración de Dropbox no lo había depositado: se rescató del adjunto del email (${Math.round(buffer.length / 1024)} KB) y se subió a «${carpeta}».`,
        rescate: { uid: a.uid, codigo, titulo: a.titulo, quien: a.quien || "", path, carpeta, bytes: buffer.length },
      });
    } catch (e: any) {
      r.errores.push(`${a.titulo}: ${e?.message || e}`);
      r.logs.push({ ...base, resultado: "error", detalle: `No se pudo rescatar: ${e?.message || e}` });
    }
  }
  return r;
}
