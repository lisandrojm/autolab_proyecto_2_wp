import { Document, Model, Types } from "mongoose";
/**
 * UN LOTE DE RECIBOS DE SUELDO: la sábana PDF que se subió, partida en un recibo por persona (módulo
 * Contratación › Recibos de sueldo, 20/10/2026).
 *
 * Cada recibo guarda sus páginas como PDF propio en `storage/<tenant>/recibos-sueldo/<lote>/`, lo que se
 * leyó del texto (`datos`), el texto crudo entero (para verlo y exportarlo cuando algo no cierra) y a
 * quién se asoció: la persona por su CUIL y su contrato que rige, que es lo que la nomenclatura y el
 * circuito de firma necesitan. El circuito es el de los contratos: el PDF va al Outbox de Dropbox con
 * la nomenclatura «Recibos de sueldo» y se reconoce al volver por su código («ID-000123»).
 *
 * `textoCrudo` puede pesar (unos KB por página): los listados lo excluyen con `select`.
 */
export type EstadoRecibo = "sin_persona" | "listo" | "enviado" | "firmado" | "error";
export interface IReciboDelLote {
    _id: Types.ObjectId;
    /** Páginas de la sábana (base 1) que forman este recibo. */
    paginas: number[];
    datos: {
        cuil: string;
        empleadorCuit: string;
        nombre: string;
        periodo: string;
        legajo: string;
        neto: string;
        cuitsEncontrados: string[];
    };
    textoCrudo: string;
    /** `/storage/<tenant>/recibos-sueldo/<lote>/<n>.pdf` */
    archivoUrl: string;
    userId?: Types.ObjectId | null;
    userProjectId?: Types.ObjectId | null;
    projectId?: Types.ObjectId | null;
    contractIndex?: number | null;
    /** Para mostrar sin volver a buscar. */
    nombreUsuario?: string;
    nombreProyecto?: string;
    /** Si la persona se eligió a mano (el CUIL no se leyó o no coincidía). */
    asignadoAMano?: boolean;
    estado: EstadoRecibo;
    enviadoEl?: Date | null;
    firmadoEl?: Date | null;
    /** El nombre con el que salió al Outbox, y su código. */
    nombreEnviado?: string;
    codigo?: string;
    error?: string;
}
export interface ILoteRecibosSueldo extends Document {
    tenantId: Types.ObjectId;
    nombreArchivo: string;
    subidoPor?: Types.ObjectId | null;
    paginas: number;
    paginasPorRecibo: number;
    /** El período que más se repite entre los recibos leídos ("YYYY-MM"), o "". */
    periodo: string;
    recibos: Types.DocumentArray<IReciboDelLote & Types.Subdocument>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const LoteRecibosSueldo: Model<ILoteRecibosSueldo>;
