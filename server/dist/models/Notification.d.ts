import mongoose, { Document, Types } from "mongoose";
export interface INotification extends Document {
    tenantId: Types.ObjectId;
    userId: Types.ObjectId;
    type: string;
    title: string;
    message: string;
    linkUrl?: string;
    isRead: boolean;
    readAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Notification: mongoose.Model<INotification, {}, {}, {}, mongoose.Document<unknown, {}, INotification, {}, {}> & INotification & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
