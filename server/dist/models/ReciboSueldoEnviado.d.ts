import { Document, Model, Types } from "mongoose";
/**
 * EL REGISTRO DE LOS RECIBOS DE SUELDO ENVIADOS A FIRMAR (pedido del 21/10/2026: «que quede guardado lo
 * enviado, no perder los datos»).
 *
 * Una fila por recibo que salió al Outbox, con la FOTO de lo que se mandó: la persona, su contrato, todos
 * los datos del recibo (legajo, categoría, importes, conceptos…), el nombre y el código con que salió,
 * quién lo mandó y cuándo, y si ya volvió firmado. No depende del lote: aunque el lote cambie o se
 * borre, el registro queda. Se escribe al enviar (`enviarAFirmar`) y se marca firmado al volver
 * (`marcarReciboFirmado`). Nunca se borra desde la aplicación.
 *
 * Un recibo se identifica por su lote y su id dentro del lote (`loteId` + `reciboId`, único): reenviar
 * el mismo recibo actualiza su fila, no la duplica.
 */
export interface IReciboSueldoEnviado extends Document {
    tenantId: Types.ObjectId;
    loteId: Types.ObjectId;
    reciboId: Types.ObjectId;
    /** De qué archivos salió. */
    nombreSabana: string;
    nombreTxt: string;
    fuente: string;
    paginas: number[];
    /** "YYYY-MM" del período liquidado. */
    periodo: string;
    userId: Types.ObjectId | null;
    nombreUsuario: string;
    userProjectId: Types.ObjectId | null;
    projectId: Types.ObjectId | null;
    contractIndex: number | null;
    nombreProyecto: string;
    asignadoAMano: boolean;
    /** Todo lo leído del recibo, tal cual se mandó (incluye los conceptos). */
    datos: Record<string, any>;
    /** El PDF que se mandó: `/storage/<tenant>/recibos-sueldo/<lote>/<n>.pdf`. */
    archivoUrl: string;
    nombreEnviado: string;
    codigo: string;
    enviadoEl: Date;
    enviadoPor: Types.ObjectId | null;
    nombreEnviadoPor: string;
    estado: "enviado" | "firmado";
    firmadoEl: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ReciboSueldoEnviado: Model<IReciboSueldoEnviado>;
