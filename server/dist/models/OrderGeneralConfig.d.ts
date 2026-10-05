import { Document, Types, Model } from "mongoose";
export interface IContractDayRule {
    contractId: number;
    contractName: string;
    saturday: boolean;
    sunday: boolean;
    holiday: boolean;
}
export interface IOrderGeneralConfig extends Document {
    tenantId: Types.ObjectId;
    orderingEnabled: boolean;
    contractRules: IContractDayRule[];
    createdAt: Date;
    updatedAt: Date;
}
interface IOrderGeneralConfigModel extends Model<IOrderGeneralConfig> {
    getOrCreateDefault(tenantId: Types.ObjectId): Promise<IOrderGeneralConfig>;
}
export declare const OrderGeneralConfig: IOrderGeneralConfigModel;
export {};
