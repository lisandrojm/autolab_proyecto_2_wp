import { Document, Model } from "mongoose";
/**
 * Tabla oficial de ARCA (Simplificación Registral): situación de revista (2 díg.).
 *
 * Solo la usa el registro de 85 (Altas Masivas, pos. 84-85). Un alta nueva es «01 — Activo», que es
 * el valor si nadie configura otro. Se siembra desde el CSV (`src/scripts/seedTablasArca.ts`).
 */
export interface IArcaSituacionRevista extends Document {
    externalId: string;
    name: string;
    data: {
        id: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const ArcaSituacionRevista: Model<IArcaSituacionRevista>;
