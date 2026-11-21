/**
 * Vigencia de contratos: mismo criterio que usa el front (`frontend/src/utils/contratoVigencia.ts`).
 *
 * Un contrato de TIEMPO INDETERMINADO se guarda con `fecha_baja_contrato` vacía, así que la
 * ausencia de fecha de baja es lo que lo identifica como sin fecha de fin.
 *
 * LA VIGENCIA SALE DEL ESTADO (etapa 3, 19/11/2026; antes salía sólo de las fechas). Un contrato RIGE
 * HOY si su `estadoContrato` es VIGENTE, ya arrancó (alta <= hoy) y, si tiene baja, todavía no pasó
 * (baja >= hoy). Con cualquier otro estado no rige: FINALIZADO, ANULADO, SIN_DETERMINAR (lo decide una
 * persona) y también SIN ESTADO (null o el campo ausente): nunca se adivina a partir de las fechas
 * (decisión del usuario). El estado lo pone el modelo al guardar y lo mantiene la tarea diaria
 * (`services/estadoContratoAlGuardar.ts`, `services/transicionEstadoContratos.ts`).
 *
 * El campo AUSENTE casi siempre es una proyección que se olvidó de pedir `contracts.estadoContrato`:
 * se avisa por consola una vez por lugar (`proyeccionesConEstado.test.ts` lo exige en el código).
 *
 * Las tres copias de esta regla tienen que moverse juntas: `utils/contratosQueRigen.ts` (adentro de
 * Mongo), `services/filtrosDeNovedades.ts` (ídem) y `frontend/src/utils/contratoVigencia.ts`.
 *
 * `esTiempoIndeterminado` sigue siendo «sin fecha de baja»: decide la prioridad entre vigentes, no la
 * vigencia.
 */
/** "Hoy" en hora de Argentina (el VPS puede correr en UTC), como "YYYY-MM-DD". */
export function hoyArgentina() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}
/**
 * Normaliza "YYYY-MM-DD...", "DD/MM/YYYY" y "DD-MM-YYYY" a "YYYY-MM-DD". "" si no se puede.
 * OJO: en la base hay contratos con la fecha de baja guardada como el STRING "null" (no el valor
 * null), así que hay que tratarla explícitamente como vacía: un `if (!baja)` la daría por válida.
 */
export function fechaISO(valor) {
    if (!valor)
        return "";
    const texto = String(valor).trim();
    if (!texto || ["null", "undefined", "-", "—"].includes(texto.toLowerCase()))
        return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(texto))
        return texto.substring(0, 10);
    const partes = texto.split(/[-/]/);
    if (partes.length === 3 && partes[2].length === 4) {
        return `${partes[2]}-${partes[1].padStart(2, "0")}-${partes[0].padStart(2, "0")}`;
    }
    return "";
}
/**
 * ¿Es la LÁPIDA de un contrato anulado? (etapa 2b, ver `utils/anulacionContrato.ts`). No tiene fechas, y
 * sin esta guarda «sin alta» se leía como «ya arrancó» y «sin baja» como «indeterminado»: la lápida
 * quedaba vigente para siempre y `getContratoActivo` la elegía.
 */
export const esContratoAnulado = (contrato) => contrato?.estadoContrato === "ANULADO";
const avisados = new Set();
/** Una vez por lugar: un contrato sin la clave `estadoContrato` es casi seguro una proyección incompleta. */
function avisarSinEstado(contrato) {
    const donde = (new Error().stack || "").split("\n").slice(3, 5).join(" ← ").trim();
    if (avisados.has(donde))
        return;
    avisados.add(donde);
    console.warn(`[vigencia] contrato sin la clave estadoContrato (¿proyección sin contracts.estadoContrato?): no rige. En ${donde}. Campos: ${Object.keys(contrato).slice(0, 8).join(", ")}`);
}
/**
 * Rige hoy = estado VIGENTE, ya arrancó (Alta <= hoy) y no terminó (sin Baja, o Baja >= hoy). Sin
 * estado, o con cualquier otro, no rige: no se adivina por las fechas.
 */
export function esContratoVigente(contrato, hoy = hoyArgentina()) {
    if (!contrato || esContratoAnulado(contrato))
        return false;
    if (contrato.estadoContrato !== "VIGENTE") {
        if (contrato.estadoContrato === undefined && !("estadoContrato" in contrato))
            avisarSinEstado(contrato);
        return false;
    }
    const alta = fechaISO(contrato.fecha_alta_contrato);
    if (!alta || alta > hoy)
        return false;
    const baja = fechaISO(contrato.fecha_baja_contrato);
    return !baja || baja >= hoy;
}
/** Igual que `esContratoVigente`, recibiendo solo la fecha de baja. */
export function esFechaBajaVigente(fechaBaja, hoy = hoyArgentina()) {
    const baja = fechaISO(fechaBaja);
    return !baja || baja >= hoy;
}
/** Un contrato es de tiempo indeterminado cuando no tiene fecha de baja: no vence. */
export function esTiempoIndeterminado(contrato) {
    return !!contrato && !esContratoAnulado(contrato) && !fechaISO(contrato.fecha_baja_contrato);
}
/**
 * Clave de antigüedad de un contrato: fecha de alta y, para desempatar, cuándo se cargó.
 * Se ordena por fecha y NO por la posición en el array, porque según la pantalla los contratos
 * llegan en orden natural o invertido (el modal los muestra del más nuevo al más viejo).
 */
function claveAntiguedad(contrato) {
    return `${fechaISO(contrato.fecha_alta_contrato)}|${String(contrato.fecha_carga || "")}`;
}
/**
 * Contrato que representa la situación actual, por orden de prioridad:
 *
 *  1. Entre los VIGENTES (estado VIGENTE, ya arrancaron y no terminaron), el TIEMPO INDETERMINADO manda, aunque
 *     después figuren cargados contratos a plazo. Un contrato sin fecha de fin sigue abierto.
 *  2. Si no hay indeterminado vigente, el vigente más reciente.
 *  3. Si no hay ninguno vigente (ni siquiera uno que todavía no arrancó), el más reciente de todos
 *     (para seguir mostrando el histórico).
 */
export function getContratoActivo(todos, hoy = hoyArgentina()) {
    // Las lápidas no compiten, tampoco en el «más reciente de todos». Devuelve el MISMO objeto: la posición se busca por identidad.
    const contratos = Array.isArray(todos) ? todos.filter((c) => !esContratoAnulado(c)) : [];
    if (contratos.length === 0)
        return null;
    const masReciente = (lista) => lista.reduce((mejor, actual) => (claveAntiguedad(actual) >= claveAntiguedad(mejor) ? actual : mejor));
    const vigentes = contratos.filter((c) => esContratoVigente(c, hoy));
    if (vigentes.length > 0) {
        const indeterminadosVigentes = vigentes.filter((c) => esTiempoIndeterminado(c));
        if (indeterminadosVigentes.length > 0)
            return masReciente(indeterminadosVigentes);
        return masReciente(vigentes);
    }
    return masReciente(contratos);
}
