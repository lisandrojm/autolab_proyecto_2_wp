import { Types } from "mongoose";
import { FiltrosPadron } from "./padron.js";
export interface OpcionesDeCorrida extends FiltrosPadron {
    /** Contra qué fecha se evalúa la vigencia del mapeo. Por defecto, el último día del período. */
    versionMapeo?: string;
    /** Si `false`, calcula y devuelve sin guardar. Sirve para previsualizar. */
    persistir?: boolean;
    /**
     * Devolver además el detalle evento por evento, para armar la planilla de control.
     *
     * No se guarda en la corrida: son 2.000 filas por mes y sólo hacen falta cuando alguien baja el
     * archivo. Guardarlas engordaría cada documento para algo que se usa una vez.
     */
    detalle?: boolean;
}
export declare function correrLiquidacion(tenantId: Types.ObjectId, periodo: string, createdBy: Types.ObjectId, opciones?: OpcionesDeCorrida): Promise<any>;
