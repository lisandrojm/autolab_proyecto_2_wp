import mongoose, { Document, Types } from "mongoose";
export interface IRelease extends Document {
    tenantId: Types.ObjectId;
    name: string;
    version: string;
    description?: string;
    /** Contenido del release redactado en la plataforma (HTML del editor, con variables `{{variable}}`). */
    content: string;
    /** Tipo de release (colección `ReleaseTipo`) al que pertenece este documento. */
    releaseTipoId?: Types.ObjectId;
    isActive: boolean;
    /** Si el release lleva membrete (logo + encabezado de empresa) y firma al generar el PDF. */
    usaMembrete: boolean;
    /** Si el documento se envía a firmar (p. ej. por Dropbox Sign). */
    requiereFirma: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Release: mongoose.Model<IRelease, {}, {}, {}, mongoose.Document<unknown, {}, IRelease, {}, {}> & IRelease & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
