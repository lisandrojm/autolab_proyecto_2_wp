/**
 * QUÉ CONTRATO LLEVA UN RECIBO DE SUELDO (24/11/2026).
 *
 * El contrato que se le cuelga a un recibo decide el nombre del archivo que va a firmar
 * («{{centroDeCosto}}_{{proyecto}}_REC_SUELDO_…»), y la regla que había era «el contrato vigente de alta
 * más reciente, en cualquier proyecto». Con eso una persona con contratos en varios proyectos salía con
 * el proyecto equivocado: la sábana «99_PRODUCTORA_…» de una persona con cinco contratos de la misma
 * fecha salió dos meses seguidos como «726_RAMON-DESARROLLO_…», porque el desempate era por el string
 * de la fecha («2024-02-01T00:00:00.000Z» le gana a «2024-02-01») y después por el orden en que Mongo
 * devolvía los vínculos. Y un contrato TERMINADO con alta más nueva le ganaba a uno vigente, porque
 * `getContratoActivo` devuelve «el más reciente de todos» cuando no hay ninguno vigente y eso se tomaba
 * por vigente.
 *
 * La regla ahora:
 *   1. LA SÁBANA MANDA. MEMOSOFT nombra cada liquidación con el centro de costo adelante
 *      («99_PRODUCTORA_REC_SUELDO_2026_PERIODO_10_MES.pdf», «FZERO SRL - 426_LA NACION_…»). Si la
 *      persona tiene contrato en un proyecto de ese centro de costo, el recibo va con ese contrato,
 *      vigente o no: el recibo es de esa liquidación.
 *   2. Entre los candidatos, el VIGENTE de alta más reciente (fechas comparadas como ISO, no como
 *      string crudo); dentro de cada vínculo rige la prioridad de `getContratoActivo` (el de tiempo
 *      indeterminado antes que los a plazo).
 *   3. Sin ninguno vigente, el ÚLTIMO contrato (alta más reciente, cualquier estado salvo ANULADO).
 *   4. Sin contrato en el centro de la sábana, lo mismo sobre todos los vínculos de la persona, y la
 *      fila lo avisa (`enElCentro: false`).
 *
 * Es puro: recibe los vínculos con su centro de costo ya resuelto, para poder probarlo sin base.
 */
import { esContratoAnulado, esContratoVigente, fechaISO, getContratoActivo } from "./contratoVigencia.js";

/**
 * El centro de costo con el que viene nombrada la sábana: el número pegado al primer «_», al principio
 * del nombre o después de un prefijo sin «_» que termina en espacio o guion («FZERO SRL - 426_…»).
 * «REC_SUELDO_2026_…» no cuenta como centro: el prefijo lleva «_». Vacío si no hay.
 */
export function centroDeCostoDeSabana(nombreArchivo: unknown): string {
  const m = String(nombreArchivo || "")
    .trim()
    .match(/^(?:[^_]*[\s-])?(\d{1,6})_/);
  return m ? m[1] : "";
}

export interface VinculoDelRecibo {
  up: { _id?: unknown; projectId?: unknown; contracts?: any[] | null; [k: string]: any };
  /** El código del centro de costo del proyecto del vínculo («99»), ya resuelto; "" si no tiene. */
  centroDeCosto: string;
}

export interface ContratoElegido {
  up: VinculoDelRecibo["up"];
  idx: number;
  contrato: any;
  /** Rige hoy (estado VIGENTE, ya arrancó, no terminó). */
  vigente: boolean;
  /** Está en un proyecto del centro de costo de la sábana (false también cuando la sábana no trae centro). */
  enElCentro: boolean;
}

export function elegirContratoDelRecibo(vinculos: VinculoDelRecibo[], o: { hoy: string; centroDeCosto?: string }): ContratoElegido | null {
  const cc = String(o.centroDeCosto || "").trim();
  const vivos = (up: VinculoDelRecibo["up"]) => (Array.isArray(up.contracts) ? up.contracts : []).filter((c) => c && !esContratoAnulado(c));
  const conContrato = vinculos.filter((v) => vivos(v.up).length > 0);
  const delCentro = cc ? conContrato.filter((v) => String(v.centroDeCosto || "").trim() === cc) : [];
  const enElCentro = delCentro.length > 0;
  const candidatos = enElCentro ? delCentro : conContrato;

  // 2. El vigente de alta más reciente. Empate: el primero (el orden de los vínculos es el de carga).
  let mejor: { v: VinculoDelRecibo; c: any; alta: string } | null = null;
  for (const v of candidatos) {
    const c: any = getContratoActivo(v.up.contracts || [], o.hoy);
    if (!c || !esContratoVigente(c, o.hoy)) continue;
    const alta = fechaISO(c.fecha_alta_contrato);
    if (!mejor || alta > mejor.alta) mejor = { v, c, alta };
  }
  if (mejor) return { up: mejor.v.up, idx: (mejor.v.up.contracts || []).indexOf(mejor.c), contrato: mejor.c, vigente: true, enElCentro };

  // 3. Sin vigente: el último contrato que haya (un contrato sin alta también sirve, si es lo único).
  for (const v of candidatos) {
    for (const c of vivos(v.up)) {
      const alta = fechaISO(c.fecha_alta_contrato);
      if (!mejor || alta > mejor.alta) mejor = { v, c, alta };
    }
  }
  if (!mejor) return null;
  return { up: mejor.v.up, idx: (mejor.v.up.contracts || []).indexOf(mejor.c), contrato: mejor.c, vigente: false, enElCentro };
}
