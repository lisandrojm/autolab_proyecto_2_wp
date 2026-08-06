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
    integrations?: {
        dropbox?: {
            appKey?: string;
            appSecretEnc?: string;
            refreshTokenEnc?: string;
            rootPath?: string;
            accountEmail?: string;
            connectedAt?: Date;
            /** Cada cuántos minutos se revisan las carpetas vigiladas por transición automática. Default 20. */
            scanIntervalMinutes?: number;
        };
        afip?: {
            /** CUIT representada (el CUIT propio del tenant, dado de alta en AFIP como titular del certificado). */
            cuitRepresentada?: string;
            /** Certificado X.509 en formato PEM — no es secreto, se guarda tal cual. */
            certificadoPem?: string;
            /** Clave privada del certificado — cifrada en reposo. */
            clavePrivadaEnc?: string;
            ambiente?: "homologacion" | "produccion";
            connectedAt?: Date;
            /** Resultado de la última autoconsulta de prueba contra Consulta Padrón A13 (no solo el login
             *  WSAA) — ver `verificarServicioPadron` en afipService.ts. "connected" (arriba) no garantiza
             *  que el servicio esté autorizado en AFIP; esto sí lo prueba. */
            servicioPadronOk?: boolean;
            servicioPadronEstado?: "ok" | "no_autorizado" | "error";
            servicioPadronDetalle?: string;
            servicioPadronFaultCode?: string;
            servicioPadronFaultString?: string;
            servicioPadronVerificadoAt?: Date;
        };
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
