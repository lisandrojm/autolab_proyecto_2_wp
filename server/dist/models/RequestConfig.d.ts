import { Document, Types } from "mongoose";
export interface IRequestConfig extends Document {
    tenantId: Types.ObjectId;
    name: string;
    order: number;
    requiresReplacement: boolean;
    isActive: boolean;
    visibility: "all" | "specific";
    allowedProjectIds: Types.ObjectId[];
    createdAt: Date;
    updatedAt: Date;
}
export declare const RequestConfig: import("mongoose").Model<IRequestConfig, {}, {}, {}, Document<unknown, {}, IRequestConfig, {}, {}> & IRequestConfig & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
