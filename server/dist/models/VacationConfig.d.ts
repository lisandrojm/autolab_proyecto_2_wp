import { Document, Types, Model } from "mongoose";
export interface IEmbeddedOverlap {
    _id?: Types.ObjectId;
    areaId?: Types.ObjectId;
    projectId?: Types.ObjectId;
    clientId?: Types.ObjectId;
    roleFrameId?: Types.ObjectId;
    maxSimultaneousUsers: number;
    description?: string;
    isActive: boolean;
    useActiveContractSchedule?: boolean;
}
export interface IVacationConfig extends Document {
    tenantId: Types.ObjectId;
    diasBeneficio?: number;
    maxDiasGozados?: number;
    permiteArrastre: boolean;
    maxDiasArrastre?: number;
    vencimientoArrastreDias?: number;
    maxDiasHabiles?: number;
    anticipacionMinimaDias?: number;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos: boolean;
    /**
     * VENTANA ANUAL DE GOCE (10/11/2026): el tramo del año en que se pueden tomar vacaciones, sin año
     * ("MM-DD"), p. ej. 11-01 → 04-30. Apagada por defecto. Reglas en `compartido/ventanaGoce.ts`.
     */
    ventanaGoce?: {
        enabled: boolean;
        inicio: string;
        fin: string;
    };
    requiereFirma: boolean;
    pdfId?: string;
    overlaps: IEmbeddedOverlap[];
    contractRules?: {
        contractId: number;
        contractName: string;
        vacationsEnabled: boolean;
    }[];
    vacationSequence: number;
    createdAt: Date;
    updatedAt: Date;
}
interface IVacationConfigModel extends Model<IVacationConfig> {
    getOrCreateDefault(tenantId: Types.ObjectId): Promise<IVacationConfig>;
    getNextVacationSequence(tenantId: Types.ObjectId): Promise<number>;
}
export declare const VacationConfig: IVacationConfigModel;
export {};
