import { Document, Model, Types } from "mongoose";
export interface IDocumentoGenerado extends Document {
    tenantId: Types.ObjectId;
    /** «ID-000123»: el texto exacto que va en el nombre. */
    codigo: string;
    /** El número del correlativo (123), para ordenar y para saber cuál sigue. */
    numero: number;
    /** El tipo de la nomenclatura: Contrato, Release, AltaAFIP, ConstanciaCUIT, Documentacion, Pedido, Vacacion. */
    tipo: string;
    /** El nombre con el que se generó, SIN extensión. */
    archivo: string;
    userId?: Types.ObjectId | null;
    userProjectId?: Types.ObjectId | null;
    projectId?: Types.ObjectId | null;
    contrato?: {
        indice?: number | null;
        /** YYYY-MM-DD, como las guarda el contrato. */
        alta?: string;
        baja?: string;
        carga?: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const DocumentoGenerado: Model<IDocumentoGenerado>;
/** El próximo número del correlativo de documentos del tenant. */
export declare function proximoNumeroDeDocumento(tenantId: unknown): Promise<number>;
/** «ID-000123»: seis dígitos como mínimo, para que el ancho no cambie durante mucho tiempo. */
export declare const formatoCodigo: (numero: number) => string;
