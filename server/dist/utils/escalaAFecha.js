/**
 * QUÉ PERÍODO DE VIGENCIA RIGE A UNA FECHA, Y CÓMO SE ENCADENAN DOS PERÍODOS.
 *
 * Toda la feature de escalas versionadas se apoya en esto: la escala por grupo, los adicionales y el
 * capítulo de pequeñas empresas tienen los mismos dos campos (`desde`, `hasta`) y la misma pregunta
 * ("¿cuánto se pagaba el 15 de mayo?").
 *
 * OJO — ACÁ `hasta` ES INCLUSIVO, al revés que en las valoraciones.
 *
 * En `valoracionAutomatica` los tramos son semiabiertos `[desde, hasta)` porque parten un continuo
 * de porcentajes y hay que decidir de qué lado cae el borde. Un período de paritaria no: el acta
 * dice "del 1 de abril al 31 de mayo", y el 31 de mayo se cobra la escala de abril. Escribirlo
 * semiabierto obligaría a guardar el 1 de junio como fin de un período que no rige ese día, que es
 * justo el tipo de dato que después nadie entiende.
 *
 * `hasta: null` = vigente, sin vencimiento declarado. No es lo mismo que vencido.
 */
/** "2026-06-01" a partir de lo que haya. "" si no se puede leer. Mismo criterio que `auditoriaEscalas`. */
export const aIsoFecha = (v) => {
    if (!v)
        return "";
    if (typeof v === "string")
        return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "";
    const d = new Date(v);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
/** El día anterior, en ISO. Es como se cierra el período viejo cuando entra uno nuevo. */
export const diaAnterior = (iso) => {
    const ms = Date.parse(`${iso}T00:00:00Z`);
    if (!Number.isFinite(ms))
        return "";
    return new Date(ms - 86400000).toISOString().slice(0, 10);
};
/** `true` si la fecha cae dentro del período (bordes incluidos). Sin `desde` legible, no rige nunca. */
export function rigeEn(periodo, fecha) {
    const desde = aIsoFecha(periodo.desde);
    if (!desde || !fecha)
        return false;
    if (fecha < desde)
        return false;
    const hasta = aIsoFecha(periodo.hasta);
    if (!hasta)
        return true; // sin vencimiento declarado: sigue vigente
    return fecha <= hasta;
}
/**
 * El período que rige a esa fecha, o `null`.
 *
 * `fecha` se recibe y no se toma del reloj, igual que en `escalasVencidas`: un cálculo de sueldo que
 * cambia según cuándo se lo corre no se puede testear ni explicar.
 *
 * Si hay más de uno (vigencias mal cargadas que se superponen), gana **el de `desde` más reciente**:
 * ante datos contradictorios, el acta más nueva es la que manda. La superposición en sí se detecta
 * aparte con `periodosSuperpuestos` y se avisa en pantalla — no se resuelve en silencio.
 */
export function periodoVigente(periodos, fecha) {
    const candidatos = periodos.filter((p) => rigeEn(p, fecha));
    if (!candidatos.length)
        return null;
    return candidatos.sort((a, b) => aIsoFecha(b.desde).localeCompare(aIsoFecha(a.desde)))[0];
}
/** Todos los períodos ordenados por `desde` descendente: así se muestra un historial. */
export function ordenarPorVigencia(periodos) {
    return [...periodos].sort((a, b) => aIsoFecha(b.desde).localeCompare(aIsoFecha(a.desde)));
}
/**
 * Pares de períodos que comparten al menos un día.
 *
 * Es la validación del ABM: dos escalas vigentes el mismo día significan que una liquidación puede
 * dar dos resultados distintos. Devuelve los pares en vez de un booleano para poder nombrarlos en el
 * error ("el período que arranca el 01/06/2026 pisa al que arranca el 01/04/2026").
 */
export function periodosSuperpuestos(periodos) {
    const legibles = periodos.filter((p) => aIsoFecha(p.desde));
    const out = [];
    for (let i = 0; i < legibles.length; i++) {
        for (let j = i + 1; j < legibles.length; j++) {
            const a = legibles[i];
            const b = legibles[j];
            const aDesde = aIsoFecha(a.desde);
            const bDesde = aIsoFecha(b.desde);
            const aHasta = aIsoFecha(a.hasta);
            const bHasta = aIsoFecha(b.hasta);
            const arrancaDespues = aDesde <= bDesde ? b : a;
            const arrancaAntes = aDesde <= bDesde ? a : b;
            const hastaDelPrimero = arrancaAntes === a ? aHasta : bHasta;
            const desdeDelSegundo = arrancaDespues === a ? aDesde : bDesde;
            // Sin `hasta`, el primero llega hasta el infinito: cualquier período posterior lo pisa.
            if (!hastaDelPrimero || desdeDelSegundo <= hastaDelPrimero)
                out.push({ a: arrancaAntes, b: arrancaDespues, desde: desdeDelSegundo });
        }
    }
    return out;
}
/**
 * Un período que termina antes de empezar.
 *
 * Existe porque está pasando en producción: los 12 grupos de 0634/11 tienen `fechaActualizacion`
 * 15/09/2026 y `vigenciaHasta` 30/06/2026 —la plantilla de junio con los importes de septiembre— y
 * por eso el banner los muestra como "escala vencida" sin estarlo.
 */
export function vigenciaIncoherente(periodo) {
    const desde = aIsoFecha(periodo.desde);
    const hasta = aIsoFecha(periodo.hasta);
    return Boolean(desde && hasta && hasta < desde);
}
