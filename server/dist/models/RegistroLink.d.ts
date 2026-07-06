import { Document, Model, Types } from "mongoose";
/** Tiempo de vida de un link de registro: 30 días desde su creación. */
export declare const REGISTRO_LINK_TTL_MS: number;
/** Devuelve el timestamp (ms) en que vence un link, con fallback a createdAt + TTL para links legacy sin expiresAt. */
export declare function getRegistroLinkExpiry(link: {
    expiresAt?: Date | null;
    createdAt: Date;
}): number;
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
    expiresAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare const RegistroLink: Model<IRegistroLink>;
