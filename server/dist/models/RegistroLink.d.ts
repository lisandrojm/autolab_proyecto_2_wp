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
    /**
     * Para DÓNDE es el link, cuando lo genera un supervisor o coordinador desde el móvil (sección Registro):
     * quien se registra queda asociado a ese proyecto, área y turno, y a quien lo invitó. Los links del
     * panel web son generales y no los tienen.
     */
    projectId?: Types.ObjectId;
    areaId?: Types.ObjectId;
    shiftId?: Types.ObjectId;
    /** «mobile» si salió de la sección Registro del móvil (7 días, se renueva solo); ausente = panel web. */
    origen?: "web" | "mobile";
    usageCount: number;
    lastUsedAt?: Date;
    expiresAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare const RegistroLink: Model<IRegistroLink>;
