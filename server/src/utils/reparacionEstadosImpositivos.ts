import { claveEstado } from "./estadoClave.js";

/**
 * QUÉ HACER CON LOS ESTADOS IMPOSITIVOS DE SISTEMA DOBLES (05/11/2026). Puro: lo aplica
 * `scripts/repararEstadosImpositivos.ts`.
 *
 * Al renombrar uno («Pedido de AFIP» → «AFIP») el sistema creaba otro con el nombre original y sin
 * tipos de contrato. Quedan dos para el mismo trámite. Se conserva el que tiene la configuración (el de
 * más tipos de contrato) y vuelve al nombre de fábrica, que es el que tienen los contratos guardados; el
 * otro se borra, y sus tipos, si tuviera, pasan al que queda.
 */
export interface EstadoParaReparar {
  _id: string;
  name: string;
  data?: { id?: number; esSistema?: boolean; tipoImpositivo?: string; contratoFrameIds?: string[] };
}

export interface ReparacionEstado {
  tipoImpositivo: string;
  conservar: EstadoParaReparar;
  /** El nombre de fábrica: con el que tiene que quedar. */
  nombreFinal: string;
  renombrar: boolean;
  borrar: EstadoParaReparar[];
  /** Los tipos de contrato del que queda: los suyos y los de los que se borran. */
  contratoFrameIds: string[];
}

export function planDeReparacion(estados: EstadoParaReparar[], semillas: Array<{ name: string; tipoImpositivo: string }>): ReparacionEstado[] {
  const plan: ReparacionEstado[] = [];
  for (const s of semillas) {
    const delTramite = estados.filter((e) => e.data?.esSistema === true && e.data?.tipoImpositivo === s.tipoImpositivo);
    if (delTramite.length === 0) continue;
    const tipos = (e: EstadoParaReparar) => (e.data?.contratoFrameIds || []).length;
    // Con los mismos tipos, el que ya tiene el nombre de fábrica.
    const orden = [...delTramite].sort((a, b) => tipos(b) - tipos(a) || Number(claveEstado(b.name) === claveEstado(s.name)) - Number(claveEstado(a.name) === claveEstado(s.name)));
    const conservar = orden[0];
    const borrar = orden.slice(1);
    const renombrar = claveEstado(conservar.name) !== claveEstado(s.name);
    if (!renombrar && borrar.length === 0) continue;
    plan.push({ tipoImpositivo: s.tipoImpositivo, conservar, nombreFinal: s.name, renombrar, borrar, contratoFrameIds: [...new Set(orden.flatMap((e) => (e.data?.contratoFrameIds || []).map(String)))] });
  }
  return plan;
}
