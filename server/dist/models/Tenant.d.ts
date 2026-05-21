import mongoose, { Document } from "mongoose";
export interface ITenant extends Document {
    name: string;
    slug: string;
    domain?: string;
    userIds: mongoose.Types.ObjectId[];
    isSystem: boolean;
    company: {
        legalName: string;
        taxId?: string;
        industry?: string;
        address?: {
            street: string;
            city: string;
            state?: string;
            postalCode: string;
            country: string;
        };
        website?: string;
        description?: string;
        logoUrl?: string;
        firmaRRHHUrl?: string;
    };
    contact: {
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
        position?: string;
        department?: string;
    };
    settings: {
        timezone: string;
        currency: string;
        language: string;
        features: string[];
    };
    subscription: {
        plan: "free" | "basic" | "pro" | "enterprise";
        status: "active" | "suspended" | "cancelled";
        expiresAt?: Date;
    };
    usage: {
        users: {
            current: number;
            limit: number;
        };
        clients: {
            current: number;
            limit: number;
        };
        storage: {
            usedMB: number;
            limitMB: number;
        };
        apiCalls: {
            current: number;
            limit: number;
            resetDate: Date;
        };
        lastUpdated: Date;
    };
    billing: {
        currentPeriod: {
            startDate: Date;
            endDate: Date;
            amount: number;
            currency: string;
        };
        paymentMethod?: {
            type: "card" | "bank" | "paypal";
            last4?: string;
            expiryDate?: string;
        };
        invoices: {
            id: string;
            date: Date;
            amount: number;
            status: "paid" | "pending" | "overdue" | "cancelled";
            downloadUrl?: string;
        }[];
        nextBillingDate?: Date;
        autoRenew: boolean;
    };
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Tenant: mongoose.Model<ITenant, {}, {}, {}, mongoose.Document<unknown, {}, ITenant, {}, {}> & ITenant & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
