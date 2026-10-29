import { Types } from "mongoose";
import { PlanillaJornaleros } from "../utils/planillaJornaleros.js";
/** `server/plantillas/` desde `src/services` (tsx) y desde `dist/services` (producción). */
export declare const RUTA_PLANTILLA: string;
export declare const TIPO_CONTRATO_JORNALEROS = "Jornada";
export declare function datosPlanillaJornaleros(tenantId: Types.ObjectId, mes: string): Promise<PlanillaJornaleros>;
export declare function xlsxPlanillaJornaleros(p: PlanillaJornaleros): Promise<Buffer>;
