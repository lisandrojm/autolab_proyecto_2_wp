import { Document, Model, Types } from "mongoose";
export interface IAfipLog extends Document {
    tenantId: Types.ObjectId;
    /** "padron" = consulta real (Validar CUIT / bulk); "servicio_test" = autoconsulta de Revalidar servicio. */
    tipo: "padron" | "servicio_test";
    cuitConsultado: string;
    cuitRepresentada: string;
    ambiente: "homologacion" | "produccion";
    encontrado: boolean;
    estado: "activo" | "inactivo" | "desconocido";
    faultCode?: string;
    faultString?: string;
    raw: any;
    /** Si la llamada tiró una excepción (transporte/WSAA) en vez de devolver un resultado. */
    error?: string;
    createdAt: Date;
}
export declare const AfipLog: Model<IAfipLog>;
