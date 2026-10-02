import { Document, Model } from "mongoose";
/**
 * Tabla oficial de ARCA (Simplificación Registral): puesto desempeñado (4 díg.).
 *
 * Solo la usa el registro de 85 (Registrar Nuevas Altas → Altas Masivas, pos. 29-32): el de 130 lo
 * deja en blanco. Se siembra desde el CSV (`src/scripts/seedTablasArca.ts`). `externalId` es el
 * código con sus ceros a la izquierda.
 */
export interface IArcaPuestoDesempenado extends Document {
    externalId: string;
    name: string;
    data: {
        id: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const ArcaPuestoDesempenado: Model<IArcaPuestoDesempenado>;
