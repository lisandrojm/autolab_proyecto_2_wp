import mongoose, { Document, Types } from "mongoose";
import { IOrderConfig } from "./OrderConfig.js";
export interface IOrder extends Document {
    tenantId: Types.ObjectId;
    userId: Types.ObjectId;
    orderNumber: string;
    description: string;
    category: string;
    categoryId?: Types.ObjectId | IOrderConfig;
    subcategories: string[];
    status: "pending" | "pre_approved" | "approved" | "rejected" | "delivered" | "cancelled";
    requestedAt: Date;
    preApprovedBy?: Types.ObjectId;
    preApprovedAt?: Date;
    approvedBy?: Types.ObjectId;
    approvedAt?: Date;
    deliveredAt?: Date;
    amount?: number;
    photoUrl?: string;
    documentoUrl?: string;
    actionCompleted?: boolean;
    dynamicValue?: any;
    daysRequested?: number;
    requiereAccionFutura?: boolean;
    futureActionId?: Types.ObjectId;
    signatureStatus?: "not_required" | "pending" | "sent" | "signed";
    signatureSentAt?: Date;
    signatureNotifiedAt?: Date;
    signedAt?: Date;
    signedBy?: Types.ObjectId;
    pdfPreAprobacionUrl?: string;
    metadata?: Record<string, any>;
    documents: any[];
    futureActions: any[];
    createdAt: Date;
    updatedAt: Date;
}
export declare const Order: mongoose.Model<IOrder, {}, {}, {}, mongoose.Document<unknown, {}, IOrder, {}, {}> & IOrder & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
