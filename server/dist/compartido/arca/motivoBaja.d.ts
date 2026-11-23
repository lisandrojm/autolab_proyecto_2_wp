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
export declare const SITUACION_RENUNCIA = "21";
export declare const esRenuncia: (motivo: unknown) => boolean;
export interface MotivoDeBaja {
    motivoBajaArca: string;
    fechaTelegramaBaja: string;
}
/**
 * Lo que se guarda en el contrato a partir de lo que mandó una pantalla. Tira si la fecha de telegrama de una
 * renuncia no es una fecha; con cualquier otro motivo la fecha se descarta sin mirarla. `catalogo`: los códigos
 * válidos (la tabla de situaciones de baja); sin él no se valida el código.
 */
export declare function motivoDeBajaParaGuardar(entrada: {
    motivo?: unknown;
    fechaTelegrama?: unknown;
}, catalogo?: Set<string> | Map<string, unknown>): MotivoDeBaja;
export type FaltaParaPresentar = "" | "motivo" | "telegrama";
export declare const TEXTO_FALTA: Record<Exclude<FaltaParaPresentar, "">, string>;
/** Qué le falta al contrato para poder presentar su baja sin que nadie elija nada: el motivo, o el telegrama de una renuncia. */
export declare function faltaParaPresentar(c: {
    motivoBajaArca?: unknown;
    fechaTelegramaBaja?: unknown;
}): FaltaParaPresentar;
