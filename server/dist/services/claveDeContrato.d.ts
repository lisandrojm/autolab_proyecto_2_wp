import { Types } from "mongoose";
export declare function clavesDeContratos(pares: Array<{
    userProjectId: unknown;
    contractIndex: number | null | undefined;
}>): Promise<Map<string, Types.ObjectId | null>>;
export declare function claveDeContrato(userProjectId: unknown, contractIndex: number | null | undefined): Promise<Types.ObjectId | null>;
