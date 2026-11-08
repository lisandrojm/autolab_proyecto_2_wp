import { Document, Model, Types } from "mongoose";
import type { EstadoConstancia, Intento, CarpetaDelDocumento, Redescarga } from "../services/arca/cicloConstancia.js";
/**
 * LA CONSTANCIA DE CADA ALTA PRESENTADA EN ARCA (07/11/2026): una por persona + empleadora + fecha de
 * alta (`clave`, única por tenant), con su estado en el circuito, cada intento de bajarla y dónde está
 * hoy el documento. Las reglas son de `services/arca/cicloConstancia.ts`; quien escribe acá es
 * `services/arca/constanciasArca.ts`.
 *
 * Va en su colección y no en el contrato: los intentos crecen, y `users_&_projects` es lo que más pesa
 * en cada lectura de contratos. El contrato sigue guardando su `altaConstancia` (lo que se validó y a
 * dónde se subió) como siempre.
 */
export interface IConstanciaArca extends Document {
    tenantId: Types.ObjectId;
    clave: string;
    cuil: string;
    nombre: string;
    userId?: Types.ObjectId | null;
    userProjectId: Types.ObjectId;
    contractIndex: number;
    empresaId?: Types.ObjectId | null;
    empresaCuit: string;
    empresaRazonSocial: string;
    /** YYYY-MM-DD. */
    fechaAlta: string;
    fechaBaja: string;
    presentadaEl?: Date | null;
    /** La corrida que la presentó (`arca_altas_logs`), si se sabe. */
    logId?: Types.ObjectId | null;
    estado: EstadoConstancia;
    /** La constancia que dio ARCA: «alta», o «baja» de una relación que ya terminó (aceptada). */
    tipoConstancia?: "alta" | "baja" | null;
    /** Alta y baja el mismo día (jornada). */
    mismoDia: boolean;
    intentos: Intento[];
    proximoIntentoEl?: Date | null;
    motivoRevision?: string | null;
    documento?: {
        /** «ID-000663»: con esto se lo encuentra en cualquier carpeta. */
        codigo?: string;
        nombre?: string;
        /** El path de hoy (o el último conocido). */
        path?: string;
        /** El id de Dropbox del archivo subido: sigue al archivo si se mueve o renombra. */
        dropboxId?: string;
        carpeta?: CarpetaDelDocumento | null;
        vaAFirma?: boolean;
        /** Ya pasó por firma (para contarla como firmada aunque esté archivada). */
        firmadaEl?: Date | null;
        archivadaEn?: string | null;
        ubicadoEl?: Date | null;
        /** No aparece en ninguna carpeta del circuito. */
        noUbicadoDesde?: Date | null;
    } | null;
    /** «Volver a bajar» (documento no ubicado): lo que había antes y si la re-descarga sigue en curso. */
    redescarga?: Redescarga | null;
    /** Cada cambio de estado, para la trazabilidad. */
    historial: Array<{
        estado: EstadoConstancia;
        fecha: Date;
        motivo?: string;
    }>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ConstanciaArca: Model<IConstanciaArca>;
