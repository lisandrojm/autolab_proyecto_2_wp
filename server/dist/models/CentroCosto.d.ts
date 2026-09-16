import { Document, Model, Types } from "mongoose";
export interface ICentroCosto extends Document {
    /**
     * DE QUÉ EMPRESA VINO. Cada una tiene su propio Tango y su propio catálogo.
     *
     * La lista es una sola —así se decidió—, pero los códigos SE REPITEN entre empresas: las tres
     * tienen un «1» y un «99», y no son el mismo centro. Por eso la identidad de un centro es
     * (empresa, idAuxiliar) y no `idAuxiliar` solo, y por eso cada fila muestra de dónde vino.
     *
     * Vacío = cargado a mano o traído del export antes de que el catálogo fuera por empresa.
     */
    empresaId?: Types.ObjectId;
    /** El nombre de la empresa, copiado: la lista lo muestra en cada fila y sin esto serían 806 lookups. */
    empresaNombre?: string;
    /** De dónde salió: "tango" (sincronización), "import" (archivo) o "manual". */
    origen?: "tango" | "import" | "manual";
    /** Cuándo lo trajo la última sincronización. */
    sincronizadoEl?: Date;
    /** El id del auxiliar en Tango. Único DENTRO de su empresa. */
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
