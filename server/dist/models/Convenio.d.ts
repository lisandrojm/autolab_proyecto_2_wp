import { Document, Model } from "mongoose";
/**
 * Convenio Colectivo de Trabajo (CCT) del nomenclador de AFIP/ARCA — Simplificación Registral.
 *
 * Sigue la forma de los catálogos simples de FRAME, con estos nombres de dominio:
 *   externalId → código CCT, con el formato "NNNN/AA" (ej. "0130/75"). NO es numérico: lleva barra
 *                y ceros a la izquierda, así que se guarda tal cual como string y `data.id` queda
 *                vacío (a diferencia de Obras Sociales, donde el RNOS sí es un número).
 *   name       → descripción de la actividad.
 *   signatario → descripción de los signatarios del convenio.
 */
export interface IConvenio extends Document {
    externalId: string;
    name: string;
    signatario?: string;
    data: {
        id?: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const Convenio: Model<IConvenio>;
