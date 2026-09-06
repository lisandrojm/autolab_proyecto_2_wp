import { Document, Model } from "mongoose";
import { PropositoCarpeta } from "../utils/propositosCarpeta.js";
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
        /**
         * Estado creado por el sistema (ver `utils/estadosImpositivosSistema.ts`): NO se puede borrar.
         * Los dos trámites impositivos existen siempre; el ABM los edita, pero no los da de baja.
         */
        esSistema?: boolean;
        /** El estado admite también personas SIN CUIT/CUIL argentino (badge "Sin CUIT" en vez del trámite). */
        aceptaSinCuit?: boolean;
        /** Estados: orden visual en el ABM y en el dropdown del wizard (guía, no bloquea transiciones). */
        orden?: number;
        /** Estados: paso dentro del flujo de dependencias (alternativas comparten número). Ausente = fuera del flujo. */
        ordenDependencia?: number;
        /** Estados: transición automática hacia ESTE estado cuando aparece un archivo en CUALQUIERA de
         *  estas carpetas de Dropbox. Requiere `ordenDependencia`. */
        transicionAutomatica?: {
            evento: "dropbox_carpeta";
            carpetas: {
                /** Carpeta a vigilar (path de Dropbox). */
                dropboxCarpeta: string;
                /** Nota libre de quien la configuró (ej. qué significa esta carpeta puntual en su flujo). */
                detalle?: string;
                /**
                 * PARA QUÉ SIRVE esta carpeta, explícito. Ver `utils/propositosCarpeta.ts`.
                 *
                 * Opcional a propósito: las carpetas cargadas antes de que este campo existiera no lo tienen,
                 * y se siguen resolviendo por el nombre. Hacerlo obligatorio antes de que el backfill haya
                 * corrido en todos lados rompería el guardado de las que quedaron sin migrar.
                 */
                proposito?: PropositoCarpeta;
            }[];
        };
        [key: string]: any;
    };
    name: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Info: Model<IInfo>;
