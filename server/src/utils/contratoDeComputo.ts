import { esContratoVigente, fechaISO, hoyArgentina } from "./contratoVigencia.js";

/**
 * EL CONTRATO VIGENTE DE UNA PERSONA EN SU EMPRESA DE CÓMPUTO (16/11/2026).
 *
 * La campaña de goce puede invitar sólo a ciertos tipos de contrato, y el tipo que se mira es el de UN
 * contrato: el que rige hoy con la empleadora de la que sale la antigüedad (`empresaDeComputo`, en
 * `antiguedadArca.ts`). Quien tiene contratos vigentes con dos empleadoras se mide sólo por el de la de
 * cómputo; el de la otra no cuenta.
 *
 *  · Vigente = `esContratoVigente` (ya arrancó y no terminó).
 *  · Varios vigentes en esa empresa: el de ALTA MÁS RECIENTE (a igualdad, el que se cargó después). No es
 *    la regla de `getContratoActivo`, donde manda el tiempo indeterminado: acá se pidió la fecha de alta.
 *  · Ninguno vigente en esa empresa: `null`.
 *
 * `claveEmpresa` es como `saldos.ts` identifica a la empleadora: su CUIT, o el id si no tiene CUIT. Con
 * `claveDeComputo` en `null` (no hay de dónde elegir una empresa: contratos sin empleadora cargada) se
 * miran todos los vigentes.
 */
export interface ContratoConEmpresa {
  fecha_alta_contrato?: string;
  fecha_baja_contrato?: string;
  fecha_carga?: string;
  /** La empleadora del contrato; "" si no la tiene cargada. */
  claveEmpresa: string;
  [key: string]: any;
}

export function contratoVigenteDeComputo<T extends ContratoConEmpresa>(contratos: T[] | null | undefined, claveDeComputo: string | null, hoy: string = hoyArgentina()): T | null {
  const clave = (c: T) => `${fechaISO(c.fecha_alta_contrato)}|${String(c.fecha_carga || "")}`;
  let mejor: T | null = null;
  for (const c of contratos || []) {
    if (!esContratoVigente(c, hoy)) continue;
    if (claveDeComputo !== null && c.claveEmpresa !== claveDeComputo) continue;
    if (!mejor || clave(c) >= clave(mejor)) mejor = c;
  }
  return mejor;
}
