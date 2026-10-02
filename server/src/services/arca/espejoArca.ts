import { ArcaCatalogo } from "../../models/ArcaCatalogo.js";
import { ConvenioGrupo } from "../../models/ConvenioGrupo.js";
import { EstadoCategoriaArca, FilaCatalogo, claveCatalogo, estadoCategoria, textoComparable } from "../../compartido/catalogoArca.js";

/**
 * El espejo de ARCA (`arca_catalogo`) visto desde el resto del server: leerlo, aplicarle un lote de
 * filas, y calcular el estado de cada categoría de WeProdu contra él.
 *
 * `aplicarFilas` es el ÚNICO camino de escritura del espejo. Lo llaman la semilla desde el CSV y la
 * aplicación de una lectura de ARCA confirmada; ningún endpoint de ABM.
 */

export interface FilaParaAplicar extends FilaCatalogo {
  codigoPadded?: string;
  largo?: number;
  alcance?: string;
  orden?: number;
}

/**
 * Aplica un lote de filas al espejo, dentro de un ALCANCE: las tablas leídas y, si se indican, los
 * padres que se vieron (los convenios de esa empleadora). Lo del alcance que no vino pasa a
 * `vigente: false`; lo de fuera del alcance no se toca.
 */
export async function aplicarFilas(o: { filas: FilaParaAplicar[]; origen: "csv" | "arca"; empresaCuit?: string | null; tablas: string[]; filtros?: Record<string, string[]>; sinBajas?: string[]; ahora?: Date }) {
  const ahora = o.ahora || new Date();
  // `sinBajas`: tablas que dependen de la empleadora (sus convenios, domicilios, actividades). Que una
  // empleadora no tenga algo no significa que ARCA lo dejó de publicar: de esas no se da de baja nada.
  const enAlcance = (f: { tabla: string; filtroPadre: string }) => o.tablas.includes(f.tabla) && !(o.sinBajas || []).includes(f.tabla) && (!o.filtros?.[f.tabla] || o.filtros[f.tabla].includes(f.filtroPadre || ""));
  const existentes = await ArcaCatalogo.find({ tabla: { $in: o.tablas } }).lean();
  const porClave = new Map(existentes.map((e: any) => [claveCatalogo(e), e]));
  const vistas = new Set<string>();
  const ops: any[] = [];
  let nuevos = 0;
  let cambiados = 0;
  for (const f of o.filas) {
    const k = claveCatalogo(f);
    if (vistas.has(k)) continue; // filas repetidas (el CSV trae una): una sola
    vistas.add(k);
    const previo: any = porClave.get(k);
    const extra = {
      ...(f.codigoPadded !== undefined ? { codigoPadded: f.codigoPadded } : {}),
      ...(f.largo !== undefined ? { largo: f.largo } : {}),
      ...(f.alcance !== undefined ? { alcance: f.alcance } : {}),
      ...(f.orden !== undefined ? { orden: f.orden } : {}),
    };
    const fuente = o.empresaCuit ? { empresaCuit: o.empresaCuit, ultimaVezVisto: ahora } : null;
    if (!previo) {
      nuevos++;
      ops.push({
        insertOne: {
          document: { tabla: f.tabla, filtroPadre: f.filtroPadre || "", codigo: f.codigo, descripcion: f.descripcion, vigente: true, primeraVezVisto: ahora, ultimaVezVisto: ahora, origen: o.origen, fuentes: fuente ? [fuente] : [], codigoPadded: f.codigoPadded ?? f.codigo, largo: f.largo ?? 0, alcance: f.alcance ?? "", orden: f.orden ?? 999999, createdAt: ahora, updatedAt: ahora },
        },
      });
      continue;
    }
    const cambia = textoComparable(previo.descripcion) !== textoComparable(f.descripcion) || previo.vigente === false;
    if (cambia) cambiados++;
    const set: any = { ultimaVezVisto: ahora, vigente: true, updatedAt: ahora, ...extra };
    if (cambia) set.descripcion = f.descripcion;
    const update: any = { $set: set };
    if (fuente) {
      // Una fuente por CUIT: se reemplaza la de ese CUIT.
      const otras = (previo.fuentes || []).filter((x: any) => x.empresaCuit !== fuente.empresaCuit);
      set.fuentes = [...otras, fuente];
    }
    ops.push({ updateOne: { filter: { _id: previo._id }, update } });
  }
  // Lo del alcance que ya no vino: deja de ser vigente. Nunca se borra.
  const bajas = existentes.filter((e: any) => enAlcance(e) && e.vigente !== false && !vistas.has(claveCatalogo(e)));
  for (const b of bajas) ops.push({ updateOne: { filter: { _id: (b as any)._id }, update: { $set: { vigente: false, updatedAt: ahora } } } });
  if (ops.length) await ArcaCatalogo.collection.bulkWrite(ops, { ordered: false });
  invalidarEspejo();
  return { nuevos, cambiados, bajas: bajas.length };
}

// ───────────────────────────────────────────────────────────────── categorías

/** convenio|codigo → fila del espejo. Memo corto: lo piden el listado de categorías y cada alta. */
let memo: { en: number; mapa: Map<string, { codigo: string; descripcion: string; vigente: boolean }>; hay: boolean } | null = null;
const MEMO_MS = 30_000;

export const invalidarEspejo = () => {
  memo = null;
};

export async function espejoCategorias() {
  if (memo && Date.now() - memo.en < MEMO_MS) return memo;
  const filas: any[] = await ArcaCatalogo.find({ tabla: "CATEGORIA_CCT" }).select("filtroPadre codigo descripcion vigente").lean();
  const mapa = new Map(filas.map((f) => [`${f.filtroPadre}|${f.codigo}`, { codigo: f.codigo, descripcion: f.descripcion, vigente: f.vigente !== false }]));
  memo = { en: Date.now(), mapa, hay: filas.length > 0 };
  return memo;
}

export interface EstadoArcaDeCategoria {
  estadoArca: EstadoCategoriaArca | null;
  estadoArcaConfirmada: boolean;
  descripcionArcaEspejo: string;
}

/**
 * El estado de una categoría contra el espejo. `estadoArca: null` = el espejo todavía no se sembró:
 * no se sabe, y NO se bloquea nada por eso (sería frenar todas las altas por una tabla vacía).
 */
export function estadoDe(
  espejo: Awaited<ReturnType<typeof espejoCategorias>>,
  c: { nombre?: string; convenio?: string; codigoArca?: string; confirmacionNombre?: { descripcionArca?: string } | null },
  grupoNumero: number | null | undefined,
): EstadoArcaDeCategoria {
  if (!espejo.hay) return { estadoArca: null, estadoArcaConfirmada: false, descripcionArcaEspejo: "" };
  const fila = espejo.mapa.get(`${String(c.convenio || "").trim()}|${String(c.codigoArca || "").trim()}`) || null;
  const e = estadoCategoria({ nombre: String(c.nombre || ""), grupoNumero, fila, confirmacion: c.confirmacionNombre });
  return { estadoArca: e.estado, estadoArcaConfirmada: e.confirmada, descripcionArcaEspejo: e.descripcionArca };
}

/** Número de grupo por `_id` de `ConvenioGrupo`, para los que necesitan el estado de muchas categorías. */
export async function numerosDeGrupo(): Promise<Map<string, number>> {
  const grupos: any[] = await ConvenioGrupo.find().select("numero").lean();
  return new Map(grupos.map((g) => [String(g._id), Number(g.numero)]));
}
