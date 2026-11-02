import { Types } from "mongoose";
import { type ConsultaArca, type DecisionVerificacion } from "./decisionVerificacionAlta.js";
import type { CandidatoAlta } from "./presentacionAutomatica.js";
/**
 * VERIFICACIÓN AUTOMÁTICA EN ARCA de las altas trabadas por «ARCA ya tiene un alta de ese día» (pedido
 * del 02/11/2026). Antes quedaban «Sin fecha prevista» para siempre, hasta que alguien entrara a ARCA a
 * mirarlas. Ahora se consulta ARCA (Relaciones Laborales → Consultas, por CUIL: SOLO LECTURA, nunca se
 * presenta nada) y se aplica lo que decide `decidirVerificacion`:
 *
 *   · presentada → el contrato queda presentado (`altaArcaPresentada.via = "verificacion"`, `porConsulta`)
 *     y avanza a Generar Documentos como cualquier alta presentada. La constancia la baja después la
 *     descarga automática de siempre (`descargaConstanciasAutomatica.ts`), que toma toda alta presentada
 *     sin constancia. Queda en la pestaña Presentadas (un `ArcaAltasLog` de tipo `verificacion`).
 *   · revision_manual → sigue trabada, con el motivo a la vista (`verificacionArca` en el contrato).
 *
 * Cada decisión queda auditada en `ArcaVerificacionAlta`, con la pantalla de ARCA anonimizada.
 *
 * IDEMPOTENTE: marcar presentada es un `updateOne` condicionado a que el contrato siga sin presentar (o
 * con un rechazo): si otra corrida llegó antes, no se toca y la acción dice `ya_resuelta`. Y antes de
 * escribir se comprueba que el índice siga siendo ESE contrato (misma fecha de alta y empleadora).
 *
 * COMO EL RESTO DEL MÓDULO: el candado de ARCA (no se pisa con otra corrida), una sesión por empleadora
 * (volver al selector de CUIT cierra la sesión), y una pausa de 1,5 a 3 s entre personas.
 */
export interface ItemVerificacion {
    userProjectId: string;
    contractIndex: number;
    cuil: string;
    nombre: string;
    empresaId: string;
    empresaRazonSocial: string;
    /** "YYYY-MM-DD" */
    alta: string;
    baja: string;
    otroContratoMismoDia: boolean;
}
export interface ResultadoVerificacion {
    item: ItemVerificacion;
    decision: DecisionVerificacion;
    /** `marcada_presentada`, `revision_manual`, `ya_resuelta`, `contrato_cambio`, `en_seco`. */
    accion: string;
    /** Lo que devolvió ARCA (sin la pantalla): va al resumen y a la auditoría. */
    consulta: ConsultaArca | null;
}
export declare const itemDe: (c: CandidatoAlta) => ItemVerificacion;
/** Lo que el motor devuelve, más la pantalla para la auditoría. */
export type ConsultaConPantalla = ConsultaArca & {
    html?: string;
};
/**
 * EL RECORRIDO, sin Mongo ni navegador: consulta (si hace falta), decide y aplica, persona por persona.
 * Una consulta que tira no corta a las demás: esa persona queda en revisión manual con el error.
 */
export declare function verificarLote(o: {
    items: ItemVerificacion[];
    consultar: (i: ItemVerificacion) => Promise<ConsultaConPantalla>;
    aplicar: (i: ItemVerificacion, d: DecisionVerificacion, consulta: ConsultaConPantalla | null) => Promise<string>;
    pausa?: () => Promise<void>;
}): Promise<ResultadoVerificacion[]>;
/** Lo que está verificando un tenant, para que la pantalla muestre qué filas esperan resultado. */
export interface VerificacionEnCurso {
    arrancadaEl: Date;
    claves: string[];
    terminada: boolean;
    resultados: Array<{
        clave: string;
        nombre: string;
        resultado: string;
        motivo: string;
    }>;
    error?: string;
}
export declare const verificacionEnCursoDe: (tenantId: string) => VerificacionEnCurso | null;
export declare const claveDe: (i: {
    userProjectId: string;
    contractIndex: number;
}) => string;
/**
 * Verifica en ARCA estas altas: una sesión por empleadora, con el candado de ARCA. `enSeco`: consulta
 * ARCA y decide, pero no escribe NADA en la base (ni el contrato, ni la auditoría, ni el registro).
 */
export declare function verificarAltasEnArca(o: {
    tenantId: string;
    tenantObjectId: Types.ObjectId;
    items: ItemVerificacion[];
    automatica: boolean;
    usuarioId?: string | null;
    enSeco?: boolean;
}): Promise<ResultadoVerificacion[]>;
