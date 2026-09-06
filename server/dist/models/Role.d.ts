import mongoose, { Document, Types } from "mongoose";
export interface IRole extends Document {
    tenantId: Types.ObjectId;
    name: string;
    description?: string;
    /**
     * Permisos asignados al rol.
     * Formato: "modulo:accion" (ej. "admin_users:view").
     * El sistema simplificado otorga acceso total si se posee el permiso ":view" del módulo.
     */
    permissions: string[];
    isDefault: boolean;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Role: mongoose.Model<IRole, {}, {}, {}, mongoose.Document<unknown, {}, IRole, {}, {}> & IRole & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
