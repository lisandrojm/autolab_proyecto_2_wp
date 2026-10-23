import { Document, Model, Types } from "mongoose";
/**
 * EL REGISTRO DE LOS FIRMADOS RESCATADOS DESDE EL EMAIL (pedido del 23/10/2026): un documento por
 * PDF firmado que la integración Dropbox Sign → Dropbox NO depositó en «Requested signatures» y que la
 * lectura de la casilla subió desde el adjunto del aviso. Es la prueba de qué entró por ese camino y
 * cuándo. No depende del historial de lecturas (que se recorta a 30 corridas) y nunca se borra desde
 * la aplicación.
 *
 * Único por tenant y nombre de archivo subido: si el mismo documento se rescatara otra vez (porque
 * alguien borró el archivo de la carpeta), se actualiza la fila, no se duplica.
 */
export interface IFirmadoRescatado extends Document {
    tenantId: Types.ObjectId;
    /** «ID-NNNNNN» del documento. */
    codigo: string;
    /** El nombre con el que se subió. */
    archivo: string;
    /** Ruta en Dropbox. */
    path: string;
    carpeta: string;
    /** El título según el asunto del aviso. */
    titulo: string;
    asunto: string;
    /** Quién firmó, según el asunto («ALAN AQUINO firmó …»). */
    firmante: string;
    cuit: string;
    /** UID del mensaje en la casilla. */
    uid: number | null;
    bytes: number;
    rescatadoEl: Date;
    /** Cuántas veces se rescató (normalmente 1). */
    veces: number;
    createdAt: Date;
    updatedAt: Date;
}
export declare const FirmadoRescatado: Model<IFirmadoRescatado>;
