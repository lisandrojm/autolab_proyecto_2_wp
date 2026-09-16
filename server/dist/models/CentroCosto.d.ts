import { Document, Model } from "mongoose";
export interface ICentroCosto extends Document {
    /** El id del auxiliar en Tango. Único: es la identidad del centro. */
    idAuxiliar?: number;
    /** El código con el que se lo nombra («682»). Único. Es lo que se muestra. */
    codAuxiliar?: string;
    descAuxiliar?: string;
    habilitado?: "S" | "N";
    externalId: string;
    name: string;
    data: {
        id: number;
        nombre: string;
        descripcion?: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Deja `name`, `externalId` y `data` en línea con los cuatro campos de Tango.
 *
 * Exportada para que los caminos que escriben con `insertMany`/`bulkWrite` —que NO pasan por los
 * hooks de documento— guarden exactamente lo mismo que un `save()`.
 */
export declare const sincronizarCamposDerivados: <T extends Partial<ICentroCosto>>(doc: T) => T;
export declare const CentroCosto: Model<ICentroCosto>;
