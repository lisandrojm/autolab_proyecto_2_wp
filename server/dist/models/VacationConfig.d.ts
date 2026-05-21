import { Document, Types, Model } from "mongoose";
export interface IEmbeddedOverlap {
    _id?: Types.ObjectId;
    areaId?: Types.ObjectId;
    positionId?: Types.ObjectId;
    levelId?: Types.ObjectId;
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
