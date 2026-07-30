import { Document, Model } from "mongoose";
export interface IInfo extends Document {
    externalId: string;
    type: string;
    data: {
        id: number;
        nombre: string;
        /** Estados (type "estado-empleado"): color del texto del badge; el fondo es ese color con transparencia. */
        color?: string;
        /** Estados: tipos de contrato (contratos-frame) en los que se ofrece. Vacío = todos. */
        contratoFrameIds?: string[];
        /** Estados: cómo se llama el estado dentro del contrato (obligatorio si el estado es Activo/Inactivo). */
        nombreEnContrato?: string;
        /** Estados: marca los estados de índole impositiva, para poder darles un tratamiento distinto. */
        esImpositivo?: boolean;
        /** Estados: orden visual en el ABM y en el dropdown del wizard (guía, no bloquea transiciones). */
        orden?: number;
        [key: string]: any;
    };
    name: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Info: Model<IInfo>;
