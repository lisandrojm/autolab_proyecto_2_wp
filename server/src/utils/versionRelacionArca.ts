/**
 * QUÉ VERSIÓN DE UNA RELACIÓN LABORAL GANA cuando la misma clave natural (empleadora, CUIL, fecha
 * de inicio) aparece dos veces con contenido distinto. Decisión pura, sin Mongo.
 *
 * En los TXT reales (ver `models/RelacionLaboralArca.ts`) la terna se repite porque ARCA lista
 * versiones de la misma relación: un plazo fijo prorrogado (la fecha de fin se corre), una baja que
 * cierra una relación abierta, un sueldo actualizado. La relación es una; se guarda la versión más
 * nueva.
 *
 *  - En `sync` la nueva viene de leer ARCA ahora mismo: es la más nueva por definición y gana siempre.
 *  - En `seed` el orden de llegada no dice nada (son archivos históricos), así que se mira el
 *    contenido: una cerrada le gana a una abierta (la baja se registra después del alta), y entre dos
 *    cerradas gana la que termina más tarde (la prórroga es posterior). A igual fin gana la nueva:
 *    así el resultado depende del orden de los archivos, que es estable, y correr el seed dos veces
 *    da lo mismo.
 */
export type ModoCarga = "seed" | "sync";

export interface VersionRelacion {
  /** ISO YYYY-MM-DD o `null` (abierta). */
  fechaFin: string | null;
}

export function ganaLaNueva(existente: VersionRelacion, nueva: VersionRelacion, modo: ModoCarga): boolean {
  if (modo === "sync") return true;
  if (existente.fechaFin === null) return true; // abierta: cualquier versión (cerrada o igual) la reemplaza
  if (nueva.fechaFin === null) return false; // la existente ya está cerrada; una abierta es anterior
  return nueva.fechaFin >= existente.fechaFin;
}

/** ¿La nueva versión aplica una baja? (la existente estaba abierta y la nueva tiene fin). */
export const aplicaBaja = (existente: VersionRelacion | null, nueva: VersionRelacion): boolean => existente !== null && existente.fechaFin === null && nueva.fechaFin !== null;

/**
 * Reduce una lista de filas (de un mismo archivo o de una misma consulta) a una por clave natural,
 * quedándose con la versión ganadora según el modo. La clave la da quien llama.
 */
export function unaPorClave<T extends VersionRelacion>(filas: T[], claveDe: (f: T) => string, modo: ModoCarga): Map<string, T> {
  const out = new Map<string, T>();
  for (const f of filas) {
    const k = claveDe(f);
    const actual = out.get(k);
    if (!actual || ganaLaNueva(actual, f, modo)) out.set(k, f);
  }
  return out;
}
