import { Types } from "mongoose";
/**
 * UNA PERSONA NO TIENE DOS ALTAS A LA VEZ CON LA MISMA EMPLEADORA.
 *
 * Pedido del 10/10/2026: una vez presentada el alta de un contrato, no se presenta otra de la misma
 * persona hasta que termine la vigente. ARCA la aceptaría como una segunda relación laboral
 * superpuesta, y deshacerla es un trámite aparte.
 *
 * Es POR EMPLEADORA a propósito: alguien puede trabajar a la vez para dos CUIT distintos, y eso son
 * dos relaciones legítimas. «Termina» = su fecha de baja; sin baja, la relación sigue abierta.
 *
 * Cuenta como presentada lo que tiene marca y no falló: `presentada`, y también `indeterminado` y
 * `presentando`, que pueden haber entrado en ARCA (ver `altaArcaPresentada` en UserProject).
 */
export interface AltaPresentada {
    userId: string;
    userProjectId: string;
    contractIndex: number;
    empresaId: string;
    alta: string;
    baja: string;
    /** La baja la puso ARCA (Relaciones Laborales sincronizadas), no el contrato de WeProdu. */
    bajaSegunArca?: boolean;
    /** Cuándo se presentó (ISO): si fue después de la última sincronización, ARCA todavía la tiene activa (ver `secuenciaPorPersona.ts`). */
    presentadaEl?: string;
}
/**
 * Las altas ya presentadas de estas personas, en los proyectos del tenant. Con `tenantId`, además se
 * cruzan con las Relaciones Laborales de ARCA (ver `aplicarBajasDeArca`).
 */
export declare function altasPresentadasDe(proyectosDelTenant: Array<string | Types.ObjectId>, userIds: string[], tenantId?: Types.ObjectId | string): Promise<AltaPresentada[]>;
export interface RelacionArcaResumida {
    cuil: string;
    empleadoraCuit: string;
    /** "YYYY-MM-DD" */
    inicio: string;
    /** "YYYY-MM-DD"; vacío = relación abierta en ARCA. */
    fin: string;
    /**
     * ARCA ya procesó la baja («SITUACION De BAJA» cargada). Una relación con fecha de fin pero SIN esto
     * sigue ACTIVA para ARCA: rechaza otra alta de la persona con esa empleadora (ver `secuenciaPorPersona.ts`).
     */
    cerrada?: boolean;
}
/**
 * Las Relaciones Laborales de ARCA de esas personas (con todas las empleadoras), resumidas. Con `desde`
 * ("YYYY-MM-DD"), sólo las que pueden importar: las activas (sin baja procesada), las abiertas y las que
 * terminan desde ese día. Una persona con historia desde 2010 trae decenas de filas (memoria «Latencia = bytes»).
 */
export declare function relacionesArcaDe(tenantId: Types.ObjectId | string, cuils: Iterable<string>, desde?: string): Promise<RelacionArcaResumida[]>;
/**
 * Cuándo fue la última sincronización de Relaciones Laborales que leyó bien cada empleadora (CUIT →
 * ISO). Destraba los rechazos por alta activa (ver `rechazoAltaActivaDestrabado`). Una empleadora con
 * error en esa corrida no figura: sus datos no se refrescaron.
 */
export declare function ultimaSyncOkPorCuit(tenantId: Types.ObjectId | string): Promise<Map<string, string>>;
/**
 * LAS BAJAS LAS DICE ARCA (pedido del 18/10/2026). Un contrato de WeProdu puede no tener fecha de baja
 * (tiempo indeterminado) aunque en ARCA la relación ya terminó (renuncia, fin de plazo): si se lo toma
 * como vigente, bloquea altas nuevas que en ARCA son perfectamente posibles. Para cada alta presentada se
 * busca en las Relaciones Laborales de ARCA la de la misma persona, misma empleadora y misma fecha de
 * inicio; si ARCA tiene baja, manda la de ARCA (la más temprana de las dos). Sin relación en ARCA (todavía
 * no sincronizada) queda lo de WeProdu. Puro.
 */
export declare function aplicarBajasDeArca(presentadas: AltaPresentada[], relaciones: RelacionArcaResumida[], cuilDe: (p: AltaPresentada) => string, cuitDe: (p: AltaPresentada) => string): AltaPresentada[];
/**
 * El alta ya presentada que se superpone con este contrato, si hay. Dos períodos se pisan si cada uno
 * empieza antes de que termine el otro. El mismo contrato no cuenta (es el que se está presentando).
 */
export declare function altaQueSePisa(contrato: {
    userId: string;
    userProjectId: string;
    contractIndex: number;
    empresaId: string;
    alta: string;
    baja: string;
}, presentadas: AltaPresentada[]): AltaPresentada | null;
/** «12/10/2026» para los mensajes. */
export declare const fechaCorta: (iso: string) => string;
export declare const textoAltaQueSePisa: (p: AltaPresentada) => string;
