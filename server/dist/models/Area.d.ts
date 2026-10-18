import mongoose, { Document, Types } from "mongoose";
export interface IArea extends Document {
    tenantId: Types.ObjectId;
    name: string;
    description?: string;
    isSystem: boolean;
    /**
     * LOS ROLES EMPRESA QUE TRABAJAN EN ESTA ÁREA (pedido del 18/10/2026). Un rol puede estar en varias
     * áreas (un Asistente está en Técnica y en Postproducción); lo que importa es que TODO rol esté en
     * alguna: así, al pedir un contrato desde la app, se ofrecen sólo las áreas (y turnos) donde ese rol
     * existe, y no la lista entera. `GET /areas/roles-sin-area` dice cuáles faltan.
     */
    rolesFrame: Types.ObjectId[];
    vacationConfig?: {
        useGlobalConfig: boolean;
        permiteFraccionadas: boolean;
        minDiasFraccion?: number;
        diasCorridos?: boolean;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const Area: mongoose.Model<IArea, {}, {}, {}, mongoose.Document<unknown, {}, IArea, {}, {}> & IArea & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
