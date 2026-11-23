/**
 * EL MOTIVO DE BAJA DEL CONTRATO (22/11/2026, pedido del usuario).
 *
 * La baja en ARCA exige el motivo (la «situación de baja», un código de la tabla de ARCA) y, si es una renuncia, la
 * fecha del telegrama. Hasta acá esos dos datos sólo existían en el panel, en el momento de mandar. Ahora viven en el
 * contrato (`motivoBajaArca`, `fechaTelegramaBaja`), se cargan junto a la fecha de baja o desde la fila de Bajas
 * ARCA, y el panel los trae precargados. Son la condición para presentar una baja sin una persona delante: sin
 * motivo no hay nada que automatizar.
 *
 * REGLAS (las mismas en el server y en las pantallas):
 *  · NUNCA hay un motivo por defecto. Tampoco «vencimiento de plazo» para un plazo fijo: lo elige una persona.
 *  · La fecha de telegrama sólo existe cuando el motivo es renuncia: con otro motivo no se pide, no se valida y no
 *    se guarda (si había una, se borra).
 *  · No son obligatorios al cargar la fecha de baja. Lo que falta se ve en Bajas ARCA como «falta el motivo» o
 *    «falta la fecha de telegrama».
 */

/** Código de ARCA de «Renuncia del trabajador / ART.240 - LCT»: la única situación que lleva fecha de telegrama. */
export const SITUACION_RENUNCIA = "21";

export const esRenuncia = (motivo: unknown): boolean => String(motivo ?? "").trim() === SITUACION_RENUNCIA;

const esISO = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export interface MotivoDeBaja {
  motivoBajaArca: string;
  fechaTelegramaBaja: string;
}

/**
 * Lo que se guarda en el contrato a partir de lo que mandó una pantalla. Tira si la fecha de telegrama de una
 * renuncia no es una fecha; con cualquier otro motivo la fecha se descarta sin mirarla. `catalogo`: los códigos
 * válidos (la tabla de situaciones de baja); sin él no se valida el código.
 */
export function motivoDeBajaParaGuardar(entrada: { motivo?: unknown; fechaTelegrama?: unknown }, catalogo?: Set<string> | Map<string, unknown>): MotivoDeBaja {
  const motivo = String(entrada.motivo ?? "").trim();
  if (!motivo) return { motivoBajaArca: "", fechaTelegramaBaja: "" };
  if (catalogo && catalogo.size > 0 && !catalogo.has(motivo)) throw new Error(`El motivo de baja «${motivo}» no está en la tabla de situaciones de baja de ARCA.`);
  if (!esRenuncia(motivo)) return { motivoBajaArca: motivo, fechaTelegramaBaja: "" };
  const telegrama = String(entrada.fechaTelegrama ?? "").trim().slice(0, 10);
  if (telegrama && !esISO(telegrama)) throw new Error("La fecha del telegrama tiene que ser una fecha (aaaa-mm-dd).");
  return { motivoBajaArca: motivo, fechaTelegramaBaja: telegrama };
}

export type FaltaParaPresentar = "" | "motivo" | "telegrama";
export const TEXTO_FALTA: Record<Exclude<FaltaParaPresentar, "">, string> = { motivo: "Falta el motivo", telegrama: "Falta la fecha de telegrama" };

/** Qué le falta al contrato para poder presentar su baja sin que nadie elija nada: el motivo, o el telegrama de una renuncia. */
export function faltaParaPresentar(c: { motivoBajaArca?: unknown; fechaTelegramaBaja?: unknown }): FaltaParaPresentar {
  const motivo = String(c.motivoBajaArca ?? "").trim();
  if (!motivo) return "motivo";
  return esRenuncia(motivo) && !String(c.fechaTelegramaBaja ?? "").trim() ? "telegrama" : "";
}
