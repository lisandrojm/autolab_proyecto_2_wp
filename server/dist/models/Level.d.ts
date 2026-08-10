import mongoose, { Document, Types } from "mongoose";
export interface ILevel extends Document {
    tenantId: Types.ObjectId;
    name: string;
    description?: string;
    type: "general" | "position-specific";
    positionId?: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Level: mongoose.Model<ILevel, {}, {}, {}, mongoose.Document<unknown, {}, ILevel, {}, {}> & ILevel & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
