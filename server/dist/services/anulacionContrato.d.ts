import { Types } from "mongoose";
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
    origen: "panel" | "borrar_solicitud" | "delete_deprecado";
}): Promise<{
    contratoKey: string;
    vinculoEliminado: boolean;
}>;
