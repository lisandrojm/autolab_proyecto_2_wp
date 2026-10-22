import { Document, Model, Types } from "mongoose";
/**
 * Registro de cada CORRIDA del bot de envío a la firma (patrón `ArcaAltasLog`): qué documentos
 * intentó, con qué resultado, y si frenó por el límite antiabuso. Se borra solo a los 30 días (TTL).
 * `capturaError` es la captura de pantalla del paso que falló, como PNG en base64, sólo cuando hubo
 * fallo: sirve para entender qué cambió en la pantalla sin volver a correr nada.
 */
export interface ILineaEnvio {
    archivo: string;
    codigo: string;
    email: string;
    estado: "enviado" | "error" | "limite" | "requiere_revision" | "seco" | "salteado";
    detalle?: string;
}
export interface IDropboxSignEnvioLog extends Document {
    tenantId: Types.ObjectId;
    inicio: Date;
    fin?: Date | null;
    /** `ok` | `limite` | `fallo` | `detenida` | `sin_tanda` */
    resultado: string;
    enviados: number;
    errores: number;
    limite: boolean;
    enSeco: boolean;
    automatica: boolean;
    lineas: ILineaEnvio[];
    error?: string;
    capturaError?: string;
    createdAt: Date;
}
export declare const DropboxSignEnvioLog: Model<IDropboxSignEnvioLog>;
