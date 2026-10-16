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
    /**
     * PLANTILLA CUSTOM: el cuerpo se escribe al generar el documento (Firma digital) y vive en el trámite
     * (`UserProject.contracts[i].contenidoCustom…`). `content` guarda sólo el placeholder. Ver
     * `compartido/textoCustom.ts`.
     */
    esCustom: boolean;
    /**
     * DEL SISTEMA: «Contrato custom» / «Release custom» (y sus tipos). Los crea el server solo (ver
     * `services/plantillasCustomSistema.ts`) y no se pueden eliminar.
     */
    delSistema?: boolean;
    /**
     * LOS TIPOS DE CONTRATO A LOS QUE PERTENECE (`Contrato._id`), como `ContratoFrame.contratoIds`
     * (16/10/2026). VACÍO o ausente = vale para TODOS los tipos, como antes de existir el campo: los
     * releases que nadie asigne siguen saliendo para todos los contratos.
     */
    contratoIds?: string[];
    createdAt: Date;
    updatedAt: Date;
}
export declare const Release: mongoose.Model<IRelease, {}, {}, {}, mongoose.Document<unknown, {}, IRelease, {}, {}> & IRelease & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
