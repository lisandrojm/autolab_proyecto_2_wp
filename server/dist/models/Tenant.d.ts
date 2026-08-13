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
        /**
         * Casilla de correo que recibe las copias de "documento enviado" de Dropbox Sign (se activa en
         * Dropbox Sign → Configuración → Perfil → Notificaciones). Leyéndola se detecta qué contratos ya
         * se enviaron a firmar, para moverlos de "Outbox" a "Pendbox" sin que nadie toque archivos.
         */
        dropboxSign?: {
            /** Casilla que recibe las notificaciones (ej. rrhh@frame.com.ar). */
            email?: string;
            imapHost?: string;
            imapPort?: number;
            imapSecure?: boolean;
            /** Usuario IMAP: suele ser el mismo email, pero algunos proveedores usan otro. */
            imapUser?: string;
            /** Contraseña IMAP — cifrada en reposo, igual que el resto de las credenciales. */
            imapPasswordEnc?: string;
            /** Mientras esté en false no se lee la casilla ni se mueve ningún archivo. */
            enabled?: boolean;
            configuredAt?: Date;
            /** Última lectura de la casilla y su resultado, para poder diagnosticar desde la UI. */
            lastCheckAt?: Date;
            lastCheckOk?: boolean;
            lastCheckDetalle?: string;
            /** Detalle aviso por aviso de la última lectura, para entender desde la UI qué pasó con cada uno. */
            lastCheckLogs?: {
                resultado: "archivado" | "duplicado" | "sin-archivo" | "ignorado" | "error";
                asunto?: string;
                archivo?: string;
                cuit?: string;
                documento?: string;
                detalle?: string;
            }[];
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
