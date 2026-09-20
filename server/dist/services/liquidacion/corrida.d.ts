import { Types } from "mongoose";
import { ILineaCorrida, IExcepcionCorrida } from "../../models/LiquidacionCorrida.js";
import { FiltrosPadron } from "./padron.js";
export interface OpcionesDeCorrida extends FiltrosPadron {
    /** Contra qué fecha se evalúa la vigencia del mapeo. Por defecto, el último día del período. */
    versionMapeo?: string;
    /** Si `false`, calcula y devuelve sin guardar. Sirve para previsualizar. */
    persistir?: boolean;
}
export declare function correrLiquidacion(tenantId: Types.ObjectId, periodo: string, createdBy: Types.ObjectId, opciones?: OpcionesDeCorrida): Promise<{
    tenantId: Types.ObjectId;
    periodo: string;
    filtros: Record<string, unknown>;
    versionMapeo: string;
    createdBy: Types.ObjectId;
    lineas: ILineaCorrida[];
    excepciones: IExcepcionCorrida[];
    resumen: {
        partes: number;
        eventos: number;
        lineas: number;
        personas: number;
        hojas: number;
        excepciones: number;
        bloqueantes: number;
    };
    hashLineas: string;
}>;
