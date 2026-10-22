import type { Worker } from "tesseract.js";
import { DropboxSignEnvio, type ResumenColocacion } from "../../models/DropboxSignEnvio.js";
import { downloadFileContent } from "../dropboxService.js";
import { leerAnclas } from "../../utils/anclasNombre.js";
import { abrirOcr } from "../../utils/ocrPaginas.js";
import { reglaDe, resolverColocacion, type Deteccion, type PaginaPdf, type ReglaColocacion } from "../../compartido/reglasColocacionFirma.js";
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
}

/** Baja el PDF y resuelve la colocación con las reglas dadas. El firmante, si no viene, se resuelve desde la base. */
export async function detectarParaArchivo(tenantId: string, ctx: { cfg: ConfigDropbox; outbox: string }, archivo: string, reglas: ReglaColocacion[], opciones: { firmante?: { nombre: string; email: string } | null; worker?: Worker } = {}): Promise<DeteccionDeArchivo> {
  const { codigo } = leerAnclas(archivo);
  const regla = reglaDe(archivo, reglas);
  const buffer = await downloadFileContent(tenantId, ctx.cfg, `${ctx.outbox}/${archivo}`);
  const f = opciones.firmante === undefined ? await resolverFirmante(tenantId, archivo) : { firmante: opciones.firmante, motivoSinFirmante: undefined };
  const { paginas, ocrMs } = regla && regla.estado === "activo" ? await paginasParaColocacion(buffer, regla, opciones.worker) : { paginas: null, ocrMs: 0 };
  const deteccion = resolverColocacion(archivo, paginas, { nombreFirmante: f.firmante?.nombre }, reglas);
  return { archivo, codigo, tipo: regla?.tipo || null, firmante: f.firmante, motivoSinFirmante: f.motivoSinFirmante, deteccion, paginas, buffer, ocrMs };
}

export function resumenDe(d: Deteccion): ResumenColocacion {
  if (d.ok === true) return { verificadaAt: new Date(), ok: true, pagina: d.ancla.pagina, rotulo: d.ancla.texto, fuente: d.ancla.fuente, motivo: "", campo: d.colocacion.campo, descartados: d.descartados.length };
  return { verificadaAt: new Date(), ok: false, pagina: d.paginaIndex === null ? null : d.paginaIndex + 1, rotulo: "", fuente: "", motivo: d.motivo, campo: null, descartados: d.descartados.length };
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
}

/** La detección más la página renderizada, para dibujar encima el campo, el ancla y lo descartado. */
export async function previsualizarColocacion(tenantId: string, archivo: string): Promise<Previsualizacion> {
  const { reglas } = await reglasDelTenant(tenantId);
  const { cfg, outbox, archivos } = await leerOutbox(tenantId);
  if (!archivos.includes(archivo)) throw Object.assign(new Error("Ese archivo no está en Outbox."), { status: 404 });
  const d = await detectarParaArchivo(tenantId, { cfg, outbox }, archivo, reglas);
  const total = d.paginas?.length || 0;
  const regla = reglaDe(archivo, reglas);
  // Qué página mostrar: la del campo; si no hubo, la que la regla miraba o la del primer descartado.
  const det = d.deteccion;
  const idx = det.ok === true ? det.colocacion.paginaIndex : det.paginaIndex ?? (det.descartados[0] ? det.descartados[0].paginaIndex : 0);
  const numero = Math.min(Math.max(idx + 1, 1), Math.max(total, 1));
  const pag = d.paginas?.[numero - 1];
  const { png, ancho, alto } = await renderizarPaginaPng(d.buffer, numero, ESCALA_IMAGEN);
  await guardarResumen(tenantId, d.codigo, resumenDe(d.deteccion));
  return {
    archivo,
    codigo: d.codigo,
    tipo: d.tipo,
    regla: regla ? { tipo: regla.tipo, descripcion: regla.descripcion, pagina: regla.pagina } : null,
    firmante: d.firmante,
    motivoSinFirmante: d.motivoSinFirmante,
    deteccion: d.deteccion,
    pagina: { numero, total, ancho: pag?.ancho || 595, alto: pag?.alto || 842 },
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
export async function arrancarVerificacion(tenantId: string, alcance: AlcanceVerificacion = "cola_y_revision"): Promise<{ total: number }> {
  const previa = verificaciones.get(tenantId);
  if (previa && !previa.terminadaEl) throw Object.assign(new Error("Ya hay una verificación en curso."), { status: 409 });
  const { reglas } = await reglasDelTenant(tenantId);
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
        try {
          const firmantePrevio = registro?.firmante && registro?.email ? { nombre: registro.firmante, email: registro.email } : undefined;
          const d = await detectarParaArchivo(tenantId, { cfg, outbox }, archivo, reglas, { firmante: firmantePrevio, worker: worker || undefined });
          const resumen = resumenDe(d.deteccion);
          await guardarResumen(tenantId, d.codigo, resumen);
          const det = d.deteccion;
          const motivo = det.ok === true ? (d.firmante ? "" : d.motivoSinFirmante || "No se pudo resolver al firmante en la base.") : det.motivo;
          resultado = { archivo, codigo: d.codigo, tipo: d.tipo, estado: registro?.estado || "", firmante: d.firmante?.nombre || "", ok: !motivo, pagina: resumen.pagina, rotulo: resumen.rotulo, fuente: resumen.fuente, motivo, ms: Date.now() - t0 };
        } catch (e: any) {
          resultado = { archivo, codigo: leerAnclas(archivo).codigo, tipo: reglaDe(archivo, reglas)?.tipo || null, estado: registro?.estado || "", firmante: registro?.firmante || "", ok: false, pagina: null, rotulo: "", fuente: "", motivo: `No se pudo bajar o leer el PDF: ${e?.message || e}`, ms: Date.now() - t0 };
        }
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
