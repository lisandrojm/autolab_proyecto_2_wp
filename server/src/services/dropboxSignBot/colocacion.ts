import { createHash } from "node:crypto";
import type { Worker } from "tesseract.js";
import { DropboxSignEnvio, type ResumenColocacion } from "../../models/DropboxSignEnvio.js";
import { downloadFileContent } from "../dropboxService.js";
import { leerAnclas } from "../../utils/anclasNombre.js";
import { abrirOcr } from "../../utils/ocrPaginas.js";
import { deteccionDesdeDeclarada, reglaDe, resolverColocacion, type ColocacionDeclarada, type Deteccion, type PaginaPdf, type ReglaColocacion } from "../../compartido/reglasColocacionFirma.js";
import { Types } from "mongoose";
import { DocumentoGenerado } from "../../models/DocumentoGenerado.js";
import { sha256 } from "../colocacionDePlantilla.js";
import { paginasParaColocacion, renderizarPaginaPng } from "./ocrAnclas.js";
import { reglasDelTenant } from "./reglasTenant.js";
import { leerOutbox, resolverFirmante, type ConfigDropbox } from "./outbox.js";

/**
 * LA DETECCIÓN DEL ANCLA, FUERA DEL NAVEGADOR (22/10/2026): el mismo código que usa la corrida, para
 * poder VERLO antes de que el bot envíe nada.
 *
 *  · `detectarParaArchivo`: baja el PDF del Outbox, lee el texto (y el OCR de la franja si la regla lo
 *    pide) y resuelve la colocación. Es lo que corre la tanda antes de abrir Chromium.
 *  · `previsualizarColocacion`: lo mismo, más la página renderizada a imagen, para dibujar encima el
 *    campo, el ancla y lo descartado.
 *  · `arrancarVerificacion`: «Verificar todos», en segundo plano con avance: la cola, lo que requiere
 *    revisión o el Outbox entero. No cambia estados; deja en cada registro el resumen (✓/✗, página,
 *    rótulo, motivo) que muestran la cola y el tab.
 */

export interface DeteccionDeArchivo {
  archivo: string;
  codigo: string;
  tipo: string | null;
  firmante: { nombre: string; email: string } | null;
  motivoSinFirmante?: string;
  deteccion: Deteccion;
  paginas: PaginaPdf[] | null;
  buffer: Buffer;
  ocrMs: number;
  /** «plantilla»: la posición la declaró la plantilla al generar (familia A). «ancla»: por regla (familia B). */
  origen: "plantilla" | "ancla";
  /** Con la posición declarada no se leen las páginas: el total viene de la captura. */
  totalPaginas: number;
  /** La posición declarada que había, si la hubo (aunque no se haya podido usar). */
  declarada: ColocacionDeclarada | null;
  /** Por qué, habiendo posición declarada, se usó la regla por ancla (el PDF cambió). */
  notaOrigen?: string;
}

/** La posición de la firma declarada por la plantilla al generar ese documento, si la hay. */
export async function declaradaDe(tenantId: string, codigo: string): Promise<ColocacionDeclarada | null> {
  if (!codigo || !Types.ObjectId.isValid(tenantId)) return null;
  const doc: any = await DocumentoGenerado.findOne({ tenantId: new Types.ObjectId(tenantId), codigo }).select("colocacionFirma").lean().catch(() => null);
  const c = doc?.colocacionFirma;
  return c && c.origen === "plantilla" && c.campo && c.sha256 ? (c as ColocacionDeclarada) : null;
}

/** Los códigos (de esta lista) cuyos documentos traen posición declarada, con el nombre de la plantilla. */
export async function declaradasDe(tenantId: string, codigos: string[]): Promise<Map<string, { plantillaNombre: string }>> {
  const res = new Map<string, { plantillaNombre: string }>();
  if (!codigos.length || !Types.ObjectId.isValid(tenantId)) return res;
  const docs: any[] = await DocumentoGenerado.find({ tenantId: new Types.ObjectId(tenantId), codigo: { $in: codigos }, "colocacionFirma.origen": "plantilla" }).select("codigo colocacionFirma.plantillaNombre").lean().catch(() => []);
  for (const d of docs) res.set(d.codigo, { plantillaNombre: String(d.colocacionFirma?.plantillaNombre || "") });
  return res;
}

/**
 * Baja el PDF y resuelve la colocación. El firmante, si no viene, se resuelve desde la base.
 *
 * PRIMERO LA POSICIÓN DECLARADA (25/10/2026): si el documento se generó desde una plantilla con
 * `{{firma}}`, la posición se capturó al generarlo y se usa tal cual —sin leer texto ni hacer OCR,
 * que es más lento y podría dar distinto—, siempre que el PDF del Outbox sea EXACTAMENTE el generado
 * (mismo SHA-256). Si no lo es (alguien lo reemplazó), la posición no vale y se sigue por regla.
 */
export async function detectarParaArchivo(tenantId: string, ctx: { cfg: ConfigDropbox; outbox: string }, archivo: string, reglas: ReglaColocacion[], opciones: { firmante?: { nombre: string; email: string } | null; worker?: Worker } = {}): Promise<DeteccionDeArchivo> {
  const { codigo } = leerAnclas(archivo);
  const buffer = await downloadFileContent(tenantId, ctx.cfg, `${ctx.outbox}/${archivo}`);
  const f = opciones.firmante === undefined ? await resolverFirmante(tenantId, archivo) : { firmante: opciones.firmante, motivoSinFirmante: undefined };
  const declarada = await declaradaDe(tenantId, codigo);
  let notaOrigen: string | undefined;
  if (declarada) {
    if (sha256(buffer) === declarada.sha256) {
      return { archivo, codigo, tipo: `Plantilla «${declarada.plantillaNombre}»`, firmante: f.firmante, motivoSinFirmante: f.motivoSinFirmante, deteccion: deteccionDesdeDeclarada(declarada), paginas: null, buffer, ocrMs: 0, origen: "plantilla", totalPaginas: declarada.totalPaginas, declarada };
    }
    notaOrigen = "El PDF del Outbox no es el que se generó con la plantilla (cambió después): la posición declarada no vale y se ubica por regla.";
  }
  const regla = reglaDe(archivo, reglas);
  const { paginas, ocrMs } = regla && regla.estado === "activo" ? await paginasParaColocacion(buffer, regla, opciones.worker) : { paginas: null, ocrMs: 0 };
  let deteccion = resolverColocacion(archivo, paginas, { nombreFirmante: f.firmante?.nombre }, reglas);
  if (notaOrigen && deteccion.ok === false) deteccion = { ...deteccion, motivo: `${notaOrigen} ${deteccion.motivo}` };
  return { archivo, codigo, tipo: regla?.tipo || null, firmante: f.firmante, motivoSinFirmante: f.motivoSinFirmante, deteccion, paginas, buffer, ocrMs, origen: "ancla", totalPaginas: paginas?.length || 0, declarada, notaOrigen };
}

export function resumenDe(d: Deteccion): ResumenColocacion {
  if (d.ok === true) return { verificadaAt: new Date(), ok: true, pagina: d.ancla.pagina, rotulo: d.ancla.texto, fuente: d.ancla.fuente, motivo: "", campo: d.colocacion.campo, descartados: d.descartados.length };
  return { verificadaAt: new Date(), ok: false, pagina: d.paginaIndex === null ? null : d.paginaIndex + 1, rotulo: "", fuente: "", motivo: d.motivo, campo: null, descartados: d.descartados.length };
}

/**
 * El hash de contenido de Dropbox (`content_hash`): SHA-256 de cada bloque de 4 MB, y SHA-256 de esos
 * hashes concatenados. Calculado sobre el PDF verificado, se compara después con el que lista Dropbox
 * sin volver a bajar el archivo.
 */
export function hashDropbox(b: Buffer): string {
  const BLOQUE = 4 * 1024 * 1024;
  const partes: Buffer[] = [];
  for (let i = 0; i < b.length; i += BLOQUE) partes.push(createHash("sha256").update(b.subarray(i, i + BLOQUE)).digest());
  return createHash("sha256").update(Buffer.concat(partes)).digest("hex");
}

/** El resumen con lo necesario para saber después si sigue valiendo (PDF, reglas, plantilla). */
export function resumenDeArchivo(d: DeteccionDeArchivo, reglasAt: Date | null): ResumenColocacion {
  return {
    ...resumenDe(d.deteccion),
    origen: d.origen,
    contentHash: hashDropbox(d.buffer),
    reglasAt: d.origen === "ancla" ? reglasAt : null,
    ...(d.origen === "plantilla" && d.declarada ? { plantillaId: d.declarada.plantillaId, plantillaVersion: d.declarada.plantillaVersion } : {}),
  };
}


/** Deja el resumen en el registro del archivo, si lo hay (no crea registros: eso lo hace el encolado). */
export async function guardarResumen(tenantId: string, codigo: string, resumen: ResumenColocacion): Promise<void> {
  if (!codigo) return;
  await DropboxSignEnvio.updateOne({ tenantId, codigo }, { $set: { colocacion: resumen } }).catch((e) => console.warn("[DROPBOX-SIGN-BOT] No se pudo guardar el resumen de colocación:", e?.message || e));
}

const ESCALA_IMAGEN = 2;

export interface Previsualizacion {
  archivo: string;
  codigo: string;
  tipo: string | null;
  regla: { tipo: string; descripcion: string; pagina: string } | null;
  firmante: { nombre: string; email: string } | null;
  motivoSinFirmante?: string;
  deteccion: Deteccion;
  /** La página que se muestra (la del campo, o donde se buscó). */
  pagina: { numero: number; total: number; ancho: number; alto: number };
  imagen: { base64: string; ancho: number; alto: number };
  ocrMs: number;
  /** «plantilla» = posición declarada por la plantilla; «ancla» = por regla. */
  origen: "plantilla" | "ancla";
  /** Lo que conviene saber de la posición (varias líneas de firma, página del medio, PDF cambiado). */
  avisos: string[];
}

/** La detección más la página renderizada, para dibujar encima el campo, el ancla y lo descartado. */
export async function previsualizarColocacion(tenantId: string, archivo: string): Promise<Previsualizacion> {
  const { reglas, cambiadasAt } = await reglasDelTenant(tenantId);
  const { cfg, outbox, archivos } = await leerOutbox(tenantId);
  if (!archivos.includes(archivo)) throw Object.assign(new Error("Ese archivo no está en Outbox."), { status: 404 });
  const d = await detectarParaArchivo(tenantId, { cfg, outbox }, archivo, reglas);
  const total = d.totalPaginas || d.paginas?.length || 0;
  // Con la posición declarada, lo que se muestra como «regla» es la plantilla (no hay regla por nombre).
  const regla =
    d.origen === "plantilla" && d.declarada
      ? { tipo: `Plantilla «${d.declarada.plantillaNombre}»`, descripcion: `Posición declarada por la plantilla (v${d.declarada.plantillaVersion}) con {{firma}}, capturada al generar el documento. Se define en el ABM de Plantillas.`, pagina: "declarada" as any }
      : reglaDe(archivo, reglas);
  // Qué página mostrar: la del campo; si no hubo, la que la regla miraba o la del primer descartado.
  const det = d.deteccion;
  const idx = det.ok === true ? det.colocacion.paginaIndex : det.paginaIndex ?? (det.descartados[0] ? det.descartados[0].paginaIndex : 0);
  const numero = Math.min(Math.max(idx + 1, 1), Math.max(total, 1));
  const pag = d.paginas?.[numero - 1];
  const { png, ancho, alto } = await renderizarPaginaPng(d.buffer, numero, ESCALA_IMAGEN);
  await guardarResumen(tenantId, d.codigo, resumenDeArchivo(d, cambiadasAt));
  return {
    archivo,
    codigo: d.codigo,
    tipo: d.tipo,
    regla: regla ? { tipo: regla.tipo, descripcion: regla.descripcion, pagina: regla.pagina } : null,
    firmante: d.firmante,
    motivoSinFirmante: d.motivoSinFirmante,
    deteccion: d.deteccion,
    pagina: { numero, total, ancho: pag?.ancho || d.declarada?.paginaSize.w || 595, alto: pag?.alto || d.declarada?.paginaSize.h || 842 },
    origen: d.origen,
    avisos: d.origen === "plantilla" ? d.declarada?.avisos || [] : d.notaOrigen ? [d.notaOrigen] : [],
    imagen: { base64: png.toString("base64"), ancho, alto },
    ocrMs: d.ocrMs,
  };
}

/* ─────────────────────────── «Verificar todos» ─────────────────────────── */

export type AlcanceVerificacion = "cola" | "revision" | "cola_y_revision" | "outbox";

export interface ResultadoVerificado {
  archivo: string;
  codigo: string;
  tipo: string | null;
  /** Estado del registro del bot al momento de verificar ("" si no tiene). */
  estado: string;
  firmante: string;
  ok: boolean;
  pagina: number | null;
  rotulo: string;
  fuente: string;
  motivo: string;
  ms: number;
  /** Cuándo se verificó (ISO): la pantalla lo muestra junto al resultado. */
  verificadaAt: string;
  /** El email del firmante resuelto (para reencolar con sus datos). */
  email?: string;
  origen: "plantilla" | "ancla";
}

export interface Verificacion {
  tenantId: string;
  alcance: AlcanceVerificacion;
  arrancadaEl: Date;
  terminadaEl: Date | null;
  total: number;
  hechos: number;
  enviables: number;
  noEnviables: number;
  actual: string | null;
  resultados: ResultadoVerificado[];
  /** Cuántos no enviables por motivo (resumido: sin el nombre del archivo). */
  porMotivo: Record<string, number>;
  error: string | null;
  detenerPedido: boolean;
}

const verificaciones = new Map<string, Verificacion>();
export const verificacionDe = (tenantId: string): Verificacion | undefined => verificaciones.get(tenantId);

export function detenerVerificacion(tenantId: string): { ok: boolean; motivo?: string } {
  const v = verificaciones.get(tenantId);
  if (!v || v.terminadaEl) return { ok: false, motivo: "No hay una verificación en curso." };
  v.detenerPedido = true;
  return { ok: true };
}

/** El motivo sin lo particular del archivo, para agrupar. */
const motivoResumido = (m: string) => m.replace(/\(.*?\)/g, "").replace(/«[^»]*» en la pág\. \d+/g, "").replace(/;.*$/, "").replace(/\s+/g, " ").trim().slice(0, 140);

/** Arranca «Verificar todos» y vuelve en el acto; la UI sigue el avance con `verificacionDe`. */
export async function arrancarVerificacion(tenantId: string, alcance: AlcanceVerificacion = "outbox"): Promise<{ total: number }> {
  const previa = verificaciones.get(tenantId);
  if (previa && !previa.terminadaEl) throw Object.assign(new Error("Ya hay una verificación en curso."), { status: 409 });
  const { reglas, cambiadasAt } = await reglasDelTenant(tenantId);
  const { cfg, outbox, archivos } = await leerOutbox(tenantId);
  const enOutbox = new Set(archivos);
  const estados = alcance === "cola" ? ["en_cola", "limite"] : alcance === "revision" ? ["requiere_revision", "error"] : ["en_cola", "limite", "requiere_revision", "error"];
  const registros: any[] = await DropboxSignEnvio.find({ tenantId, estado: { $in: estados } }).sort({ orden: 1, updatedAt: -1 }).lean();
  const porArchivo = new Map<string, any>(registros.map((r) => [r.archivo, r]));
  const lista: string[] = alcance === "outbox" ? archivos.filter((a) => porArchivo.get(a)?.estado !== "enviado") : registros.map((r) => r.archivo).filter((a) => enOutbox.has(a));
  const v: Verificacion = { tenantId, alcance, arrancadaEl: new Date(), terminadaEl: null, total: lista.length, hechos: 0, enviables: 0, noEnviables: 0, actual: null, resultados: [], porMotivo: {}, error: null, detenerPedido: false };
  verificaciones.set(tenantId, v);
  void (async () => {
    let worker: Worker | null = null;
    try {
      if (reglas.some((r) => r.ocr)) worker = await abrirOcr();
      for (const archivo of lista) {
        if (v.detenerPedido) break;
        v.actual = archivo;
        const t0 = Date.now();
        const registro = porArchivo.get(archivo);
        let resultado: ResultadoVerificado;
        // Si el PDF no se pudo bajar o leer, es la red o Dropbox: no dice nada del documento y no se aplica.
        let seLeyo = true;
        try {
          const firmantePrevio = registro?.firmante && registro?.email ? { nombre: registro.firmante, email: registro.email } : undefined;
          const d = await detectarParaArchivo(tenantId, { cfg, outbox }, archivo, reglas, { firmante: firmantePrevio, worker: worker || undefined });
          const resumen = resumenDeArchivo(d, cambiadasAt);
          await guardarResumen(tenantId, d.codigo, resumen);
          const det = d.deteccion;
          const motivo = det.ok === true ? (d.firmante ? "" : d.motivoSinFirmante || "No se pudo resolver al firmante en la base.") : det.motivo;
          resultado = { archivo, codigo: d.codigo, tipo: d.tipo, estado: registro?.estado || "", firmante: d.firmante?.nombre || "", email: d.firmante?.email || "", ok: !motivo, pagina: resumen.pagina, rotulo: resumen.rotulo, fuente: resumen.fuente, motivo, ms: Date.now() - t0, verificadaAt: new Date().toISOString(), origen: d.origen };
        } catch (e: any) {
          seLeyo = false;
          resultado = { archivo, codigo: leerAnclas(archivo).codigo, tipo: reglaDe(archivo, reglas)?.tipo || null, estado: registro?.estado || "", firmante: registro?.firmante || "", ok: false, pagina: null, rotulo: "", fuente: "", motivo: `No se pudo bajar o leer el PDF: ${e?.message || e}`, ms: Date.now() - t0, verificadaAt: new Date().toISOString(), origen: "ancla" };
        }
        // La verificación ESCRIBE el estado (25/10/2026): la cola y los trabados leen del registro, no de otra caché.
        // Y el resultado informa el estado QUE QUEDÓ, no el de antes: nada de `ok: true` + `requiere_revision` (26/10/2026).
        if (seLeyo) resultado.estado = await aplicarVerificacion(tenantId, registro || null, resultado).catch((e) => {
          console.warn("[DROPBOX-SIGN-BOT] No se pudo aplicar la verificación:", e?.message || e);
          return resultado.estado;
        });
        v.resultados.push(resultado);
        v.hechos++;
        if (resultado.ok) v.enviables++;
        else {
          v.noEnviables++;
          const k = motivoResumido(resultado.motivo);
          v.porMotivo[k] = (v.porMotivo[k] || 0) + 1;
        }
      }
    } catch (e: any) {
      v.error = e?.message || String(e);
    } finally {
      v.actual = null;
      v.terminadaEl = new Date();
      await worker?.terminate().catch(() => {});
    }
  })();
  return { total: lista.length };
}

/**
 * LO QUE DIJO LA VERIFICACIÓN, AL REGISTRO DEL DOCUMENTO (25/10/2026). Antes «Verificar todos» sólo
 * dejaba el ✓/✗ y la lista de «requiere revisión» seguía mostrando lo de días atrás: 59/59 enviables
 * y 79 trabados a la vez.
 *  · trabado que ahora sale bien → vuelve a la cola, al final (alguien ya lo había mandado a firmar);
 *  · en la cola y ahora sale mal → «requiere revisión» con el motivo nuevo (no se va a enviar igual);
 *  · trabado que sigue mal → se actualiza el motivo.
 * Un «error» de envío NO se toca: pudo haber quedado a medio enviar y eso lo decide una persona.
 */
async function aplicarVerificacion(tenantId: string, registro: any | null, r: ResultadoVerificado): Promise<string> {
  // Sin registro (un archivo del Outbox que nunca se encoló): si sale bien queda ELEGIBLE (se encola
  // desde la lista); si sale mal se registra como «requiere revisión» con su motivo, para que se vea.
  if (!registro) {
    if (r.ok || !r.codigo) return "";
    await DropboxSignEnvio.updateOne(
      { tenantId, codigo: r.codigo },
      { $set: { archivo: r.archivo, estado: "requiere_revision", detalle: r.motivo, orden: null, ...(r.firmante ? { firmante: r.firmante } : {}), ...(r.email ? { email: r.email } : {}), ...(r.tipo ? { tipo: r.tipo } : {}) }, $setOnInsert: { tenantId: new Types.ObjectId(tenantId), codigo: r.codigo } },
      { upsert: true },
    );
    return "requiere_revision";
  }
  const estado = String(registro.estado || "");
  if (r.ok && estado === "requiere_revision") {
    const ultimo: any = await DropboxSignEnvio.findOne({ tenantId, orden: { $ne: null } }).sort({ orden: -1 }).select("orden").lean();
    await DropboxSignEnvio.updateOne({ tenantId, codigo: registro.codigo, estado: "requiere_revision" }, { $set: { estado: "en_cola", detalle: "", orden: (Number(ultimo?.orden) || 0) + 1, ...(registro.encoladoAt ? {} : { encoladoAt: new Date() }), ...(r.firmante && r.email ? { firmante: r.firmante, email: r.email } : {}), ...(r.tipo ? { tipo: r.tipo } : {}) } });
    return "en_cola";
  }
  if (!r.ok && (estado === "en_cola" || estado === "limite")) {
    await DropboxSignEnvio.updateOne({ tenantId, codigo: registro.codigo, estado }, { $set: { estado: "requiere_revision", detalle: r.motivo, orden: null } });
    return "requiere_revision";
  }
  if (!r.ok && estado === "requiere_revision" && r.motivo && r.motivo !== registro.detalle) {
    await DropboxSignEnvio.updateOne({ tenantId, codigo: registro.codigo, estado }, { $set: { detalle: r.motivo } });
  }
  return estado;
}
