import mongoose, { Document, Types } from "mongoose";
export interface IPdf extends Document {
    tenantId: Types.ObjectId;
    code: "dinero" | "fechaRango" | "fechaUnica" | "fechasMultiples" | "vacaciones" | "objeto" | "otros" | "datosPersonales";
    name: string;
    title?: string;
    content: string;
    variablesHint?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Pdf: mongoose.Model<IPdf, {}, {}, {}, mongoose.Document<unknown, {}, IPdf, {}, {}> & IPdf & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
