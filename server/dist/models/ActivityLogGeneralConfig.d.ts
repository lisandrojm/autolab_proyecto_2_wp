import { Document, Types, Model } from "mongoose";
export interface IActivityLogGeneralConfig extends Document {
    tenantId: Types.ObjectId;
    allowedPastDays: number;
    createdAt: Date;
    updatedAt: Date;
}
interface IActivityLogGeneralConfigModel extends Model<IActivityLogGeneralConfig> {
    getOrCreateDefault(tenantId: Types.ObjectId): Promise<IActivityLogGeneralConfig>;
}
export declare const ActivityLogGeneralConfig: IActivityLogGeneralConfigModel;
export {};
