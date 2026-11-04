/**
 * QUÉ HACER CON UN ALTA TRABADA POR «ARCA YA TIENE UN ALTA DE ESE DÍA» después de mirarla en ARCA
 * (pedido del 02/11/2026). Puro: la consulta llega por parámetro. La corre `verificacionAltas.ts`.
 *
 * La traba (`bloqueoPorVigencia`, regla 4) sale de las Relaciones Laborales SINCRONIZADAS: hay una
 * relación con esa empleadora que empieza el mismo día. Casi siempre es ESTA alta, hecha a mano en ARCA
 * o por un contrato duplicado, y quedaba trabada para siempre hasta que alguien la revisara. Acá se
 * consulta ARCA en vivo (Relaciones Laborales → Consultas, por CUIL, solo lectura) y se decide:
 *
 *   · UNA relación que empieza ese día, con el mismo fin que el contrato (o las dos sin fin) → el alta
 *     ya está hecha: se marca PRESENTADA. Nunca se vuelve a presentar (sería el rechazo por alta activa).
 *   · Esa relación sin fecha de fin y el contrato con baja → REVISIÓN MANUAL: falta informar la baja, y
 *     el sistema no presenta bajas (decisión del 02/11/2026). Con fin, ARCA la cierra sola al vencer.
 *   · Fechas que no coinciden, más de una relación ese día, ninguna, la consulta que falla, o otro
 *     contrato de WeProdu que ya es esa alta → REVISIÓN MANUAL, con lo que se vio.
 *
 * «No la encontré» NO destraba nada (decisión del 02/11/2026): el lector de ARCA sólo afirma lo que ve
 * (ver `altaEnConsulta` en el motor) y la sincronización sí la había traído. Volver a presentarla por un
 * «no la vi» es justo el rechazo que se quiere evitar.
 */
/** Una relación tal como la mostró la consulta. Fechas "YYYY-MM-DD"; `fin` vacío = sin fecha de fin. */
export interface RelacionConsultada {
    inicio: string;
    fin: string;
    /** La «situación de baja» si la tarjeta la nombra; vacío si no. */
    baja?: string;
    texto?: string;
    /** Sólo la trae la sincronización (alta externa): la consulta en vivo no la lee. */
    modalidad?: string;
}
export type ConsultaArca = {
    ok: true;
    relaciones: RelacionConsultada[]; /** El CUIL y la fecha están en pantalla (o null: no se pudo afirmar). */
    encontrada: true | null;
} | {
    ok: false;
    error: string;
};
export interface AltaAVerificar {
    /** "YYYY-MM-DD" */
    alta: string;
    /** "YYYY-MM-DD"; vacío = tiempo indeterminado. */
    baja: string;
    /** Otro contrato de WeProdu de la misma persona y empleadora, ya presentado, empieza el mismo día. */
    otroContratoMismoDia: boolean;
}
export type DecisionVerificacion = {
    accion: "presentada";
    motivo: string;
    relacion: RelacionConsultada;
} | {
    accion: "revision_manual";
    motivo: string;
    relacion?: RelacionConsultada;
};
/** Si otro contrato de WeProdu ya es esa alta, no hace falta consultar ARCA: es un duplicado para revisar. */
export declare function decisionSinConsultar(a: AltaAVerificar): DecisionVerificacion | null;
export declare function decidirVerificacion(a: AltaAVerificar, consulta: ConsultaArca): DecisionVerificacion;
