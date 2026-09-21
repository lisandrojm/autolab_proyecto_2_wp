import type { ILiquidacionCorrida } from "../../models/LiquidacionCorrida.js";
import type { Evento } from "./normalizar.js";
/**
 * EL ARCHIVO QUE VA A MEMOSOFT.
 *
 * Una hoja por cada `hoja` distinta de la corrida, y dentro, una fila por (legajo, concepto).
 */
export declare function generarImportMemosoft(corrida: ILiquidacionCorrida): Promise<Buffer>;
/** Una fila de la planilla de control: el grano más fino que existe, un día de una persona. */
export interface FilaDePlanilla extends Evento {
    proyectoNombre?: string | null;
    areaNombre?: string | null;
    turnoNombre?: string | null;
    /** Qué conceptos generó este evento, ya resueltos: "0017 Feriado (6)". */
    conceptos: string[];
    reportNumber?: string | null;
}
/**
 * LA PLANILLA DE CONTROL.
 *
 * Es el archivo que se mira cuando un número del import no cierra, y el que se cruza contra el
 * reloj. Por eso tiene el grano más fino que existe —un día de una persona— y no está agregada.
 */
export declare function generarPlanillaDeControl(filas: FilaDePlanilla[], periodo: string): Promise<Buffer>;
/**
 * EL ANEXO DE EXCEPCIONES.
 *
 * Lo que la corrida no pudo resolver sola, con las bloqueantes primero: son las que impiden bajar
 * el import, así que son las que hay que trabajar.
 */
export declare function generarAnexoDeExcepciones(corrida: ILiquidacionCorrida): Promise<Buffer>;
