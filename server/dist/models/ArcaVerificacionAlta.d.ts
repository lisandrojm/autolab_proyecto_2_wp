import { Document, Model, Types } from "mongoose";
/**
 * AUDITORÍA DE LA VERIFICACIÓN DE ALTAS EN ARCA (pedido del 02/11/2026, ver
 * `services/arca/verificacionAltas.ts`): una fila por cada alta verificada, con lo que se vio en ARCA,
 * qué se decidió y qué se hizo. Es el «resultado crudo» que la pantalla muestra en el detalle de un alta
 * que quedó para revisión manual.
 *
 * `html` es la pantalla de Consultas tal como quedó, anonimizada por el motor (`htmlAnonimo`: sin CUIL,
 * CUIT ni VIEWSTATE). Pesa: el listado no la trae, se pide por id.
 */
export interface IArcaVerificacionAlta extends Document {
    tenantId: Types.ObjectId;
    userProjectId: Types.ObjectId;
    contractIndex: number;
    cuil: string;
    nombre: string;
    empresaId?: Types.ObjectId;
    empresaRazonSocial?: string;
    /** El contrato al verificarlo: "YYYY-MM-DD". */
    alta: string;
    baja: string;
    /** La automática (después de la corrida del día) o alguien con «Reverificar en ARCA». */
    automatica: boolean;
    usuarioId?: Types.ObjectId;
    /** Sin escribir en el contrato: sólo se miró qué pasaría. */
    enSeco: boolean;
    /** Lo que devolvió la consulta: `ok` con las relaciones leídas, o el error. */
    consulta: {
        ok: boolean;
        error?: string;
        encontrada?: boolean | null;
        relaciones?: Array<{
            inicio: string;
            fin: string;
            baja?: string;
            texto?: string;
        }>;
    } | null;
    /** Qué se decidió (`decidirVerificacion`). */
    decision: "presentada" | "revision_manual";
    motivo: string;
    /** Qué se hizo con el contrato: `marcada_presentada`, `revision_manual`, `ya_resuelta` (otra corrida llegó antes), `contrato_cambio`, `en_seco`. */
    accion: string;
    html?: string;
    createdAt: Date;
}
export declare const ArcaVerificacionAlta: Model<IArcaVerificacionAlta>;
