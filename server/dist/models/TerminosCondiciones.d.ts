import mongoose, { Document, Types } from "mongoose";
/**
 * TÉRMINOS Y CONDICIONES que acepta quien se registra con un link.
 *
 * Puede haber varios cargados (borradores, una versión nueva en preparación), pero a lo sumo UNO
 * VIGENTE por tenant: es el que muestra el formulario de registro y el que hay que aceptar para
 * terminarlo. Sin ninguno vigente el registro sigue como siempre, sin casilla.
 *
 * EL TEXTO ACEPTADO NO SE PIERDE AL EDITARLO. Cada cambio de título o contenido sube la `version` y
 * guarda la anterior en `historial`. La persona queda registrada con la versión que aceptó
 * (`metadata.terminosAceptados.version`), así que siempre se puede saber qué decía el texto que
 * aceptó, aunque después se haya corregido.
 */
export interface ITerminosCondiciones extends Document {
    tenantId: Types.ObjectId;
    titulo: string;
    /** HTML del editor (negrita, cursiva, subrayado, listas, tablas…). */
    contenido: string;
    vigente: boolean;
    version: number;
    historial: {
        version: number;
        titulo: string;
        contenido: string;
        hasta: Date;
    }[];
    createdBy?: Types.ObjectId;
    updatedBy?: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
export declare const TerminosCondiciones: mongoose.Model<ITerminosCondiciones, {}, {}, {}, mongoose.Document<unknown, {}, ITerminosCondiciones, {}, {}> & ITerminosCondiciones & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
