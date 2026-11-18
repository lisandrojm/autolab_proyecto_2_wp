import { Types } from "mongoose";
import { type ReferenciasDeContrato } from "./referenciasContrato.js";
export interface QuienAnula {
    tenantId?: Types.ObjectId | string | null;
    por?: Types.ObjectId | string | null;
    porNombre?: string;
}
export declare class AnulacionInvalida extends Error {
}
export declare function anularContrato(o: QuienAnula & {
    up: any;
    idx: number;
    motivo: string;
    origen: "panel" | "borrar_solicitud" | "delete_deprecado" | "script";
}, 
/** Inyectable para probar sin base. */
deps?: {
    referencias?: (upId: any, idx: number) => Promise<Pick<ReferenciasDeContrato, "totalBloqueantes" | "textoBloqueantes">>;
}): Promise<{
    contratoKey: string;
    vinculoEliminado: boolean;
}>;
