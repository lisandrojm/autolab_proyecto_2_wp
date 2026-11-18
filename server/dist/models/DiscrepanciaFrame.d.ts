import { Model, Types } from "mongoose";
/**
 * UN CONTRATO QUE FRAME MANDA DISTINTO DE COMO ESTÁ EN WEPRODU (18/11/2026; ver `utils/additiveSync.ts`).
 *
 * El import reconoce el contrato (mismo proyecto, persona, alta y tipo) pero FRAME trae otra categoría.
 * No se crea un contrato nuevo ni se pisa la de WeProdu: queda acá, una fila por (contrato, campo, valor
 * de FRAME), con cuándo se vio por primera y última vez. Se identifica por `contratoKey`, nunca por
 * posición. Lo resuelve una persona (o la alerta de la etapa 5 cuando exista).
 */
export interface IDiscrepanciaFrame {
    tenantId: Types.ObjectId | null;
    userProjectId: Types.ObjectId;
    userId: Types.ObjectId | null;
    contratoKey: Types.ObjectId | null;
    /** La posición al detectarla: sólo para leer, la identidad es la clave. */
    posicion: number;
    campo: "categoria_sat_id";
    weprodu: {
        id: unknown;
        nombre: string;
    };
    frame: {
        id: unknown;
        nombre: string;
    };
    claveFrame: string;
    detectadaEl: Date;
    ultimaVezEl: Date;
    veces: number;
    resuelta: boolean;
    resueltaEl?: Date | null;
    resueltaPor?: string;
    resolucion?: string;
}
export declare const DiscrepanciaFrame: Model<IDiscrepanciaFrame>;
export default DiscrepanciaFrame;
