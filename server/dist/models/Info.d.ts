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
        /** Estados: marca los estados de índole impositiva, para poder darles un tratamiento distinto. */
        esImpositivo?: boolean;
        /** Estados impositivos: texto del badge secundario que se muestra en las tarjetas de Contrato. */
        etiquetaSecundaria?: string;
        /** Estados impositivos: color del badge secundario (mismo formato que `color`). */
        colorEtiquetaSecundaria?: string;
        /** Estados: orden visual en el ABM y en el dropdown del wizard (guía, no bloquea transiciones). */
        orden?: number;
        [key: string]: any;
    };
    name: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Info: Model<IInfo>;
