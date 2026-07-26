import { Document, Model } from "mongoose";
export interface IContratoFrame extends Document {
    externalId: string;
    name: string;
    /** Contenido del contrato redactado en la plataforma (HTML del editor, con variables `{{variable}}`). */
    content: string;
    data: {
        id: number;
        nombre: string;
        cantidadJornadas: number;
        multiplicadorDiario: number;
        esTiempoIndeterminado: boolean;
    };
    /** Si el contrato lleva membrete (logo + encabezado de empresa) y firma al generar el PDF. */
    usaMembrete: boolean;
    /** Contrato activo/inactivo (para habilitarlo o no en el catálogo). */
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ContratoFrame: Model<IContratoFrame>;
