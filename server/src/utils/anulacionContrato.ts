import { buildContractKey, claveDeIdentidad } from "./additiveSync.js";

/*
  ANULAR UN CONTRATO EN VEZ DE BORRARLO (etapa 2b, 18/11/2026). Puro: sin base.

  Borrar un contrato del array corre la posición de todos los que vienen después, y siete colecciones
  guardan esa posición. Anular deja en su lugar una LÁPIDA y manda el contrato entero a la colección
  `contratos_anulados` (con quién, cuándo y por qué).

  LA LÁPIDA NO TIENE FECHAS NI NADA DEL CONTRATO, a propósito. Hay 160 archivos que leen `contracts[]`;
  los que exigen fecha de alta (casi todos los que deciden algo: vigencia, superposición, candidatos de
  ARCA) la saltean solos. Los que no, la tienen que saltear con `esLapida`.

  `claveFrame` es la clave con la que el import de FRAME reconoce un contrato que ya tiene
  (`buildContractKey`). Sin ella, el próximo import vería que falta y lo volvería a agregar: anular no
  serviría de nada para los contratos que vinieron de FRAME (con el borrado físico pasa lo mismo hoy).
*/

export const ANULADO = "ANULADO" as const;

export interface DatosDeAnulacion {
  el: Date;
  por: unknown;
  porNombre: string;
  motivo: string;
}

/** ¿Es la lápida de un contrato anulado? */
export const esLapida = (c: any): boolean => c?.estadoContrato === ANULADO;

/** La lápida que queda en la posición del contrato anulado: su clave, la marca y nada más. */
export function lapidaDe(contrato: Record<string, any>, contratoKey: unknown, datos: DatosDeAnulacion) {
  return {
    contratoKey,
    estadoContrato: ANULADO,
    // `claveIdentidad` (18/11/2026): el import también reconoce por proyecto, persona, alta y tipo por
    // nombre, así un anulado no vuelve aunque FRAME le cambie la categoría (ver `findNewContracts`).
    anulacion: { ...datos, claveFrame: buildContractKey(contrato), claveIdentidad: claveDeIdentidad(contrato, []) || "" },
  };
}

/** ¿Queda algún contrato de verdad si se anula el de la posición `idx`? Si no, se va el vínculo entero. */
export const quedanContratosSiSeAnula = (contratos: any[], idx: number): boolean => contratos.some((c, i) => i !== idx && !esLapida(c));

/** La posición del último contrato que no es una lápida, o -1. Para los que caen «al último» cuando no les dicen cuál. */
export const ultimoNoAnulado = (contratos: any[]): number => {
  for (let i = contratos.length - 1; i >= 0; i--) if (!esLapida(contratos[i])) return i;
  return -1;
};

const CAMPOS_DE_LAPIDA = new Set(["contratoKey", "estadoContrato", "anulacion"]);
/** Vacío como lo deja Mongoose con sus defaults (null, false, "", [] y objetos con sólo eso adentro). */
const vacio = (v: unknown): boolean =>
  v === null || v === undefined || v === false || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && !("_bsontype" in (v as any)) && Object.values(v as object).every(vacio));

/**
 * Los campos de contrato que tiene una lápida (debería no tener ninguno). Una lápida con datos es un
 * contrato anulado que alguien volvió a escribir —un endpoint por índice que apuntó a su posición— y
 * lo estaría «resucitando» a medias. El modelo se niega a guardarla (ver `UserProject`, pre validate).
 */
export function camposDeContratoEnLapida(lapida: Record<string, unknown>): string[] {
  return Object.entries(lapida || {})
    .filter(([k, v]) => !CAMPOS_DE_LAPIDA.has(k) && !vacio(v))
    .map(([k]) => k);
}
