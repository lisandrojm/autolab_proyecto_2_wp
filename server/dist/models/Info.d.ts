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
        /** Estados impositivos: trámite excluyente que representa. */
        tipoImpositivo?: "alta_temprana_afip" | "constancia_cuit";
        /** Estados: orden visual en el ABM y en el dropdown del wizard (guía, no bloquea transiciones). */
        orden?: number;
        /** Estados: paso dentro del flujo de dependencias (alternativas comparten número). Ausente = fuera del flujo. */
        ordenDependencia?: number;
        /** Estados: transición automática hacia ESTE estado al ocurrir un evento. Requiere `ordenDependencia`. */
        transicionAutomatica?: {
            evento: "alta_documento_subido" | "dropbox_carpeta";
            /** Solo con evento "dropbox_carpeta": carpeta a vigilar, relativa al rootPath de Dropbox del tenant. */
            dropboxCarpeta?: string;
            /** Nota libre de quien la configuró (ej. qué significa esta carpeta puntual en su flujo). */
            detalle?: string;
        };
        [key: string]: any;
    };
    name: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Info: Model<IInfo>;
