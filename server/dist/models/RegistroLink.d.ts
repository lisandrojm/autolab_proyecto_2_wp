import { Document, Model, Types } from "mongoose";
export interface IRegistroLink extends Document {
    tenantId: Types.ObjectId;
    token: string;
    tenantSlug: string;
    clientId?: Types.ObjectId;
    label?: string;
    active: boolean;
    createdBy?: Types.ObjectId;
    usageCount: number;
    lastUsedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare const RegistroLink: Model<IRegistroLink>;
