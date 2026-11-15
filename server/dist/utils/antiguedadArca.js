/**
 * LA ANTIGÜEDAD DE UNA PERSONA A PARTIR DE SUS RELACIONES LABORALES EN ARCA. Cálculo puro: recibe
 * las relaciones de UN CUIL (de una empleadora o de todas) y «hoy», y devuelve las métricas que se
 * guardan en `AntiguedadArca`. Sin Mongo, sin reloj: todo entra por parámetro.
 *
 * Se devuelven LAS DOS medidas porque las dos se usan:
 *  - `antiguedadDesdePrimeraAlta`: días corridos entre la primera alta y hoy, con huecos y todo.
 *  - `diasTrabajados`: los días de cada relación (fin − inicio + 1), FUSIONANDO las que se solapan
 *    para no contar un día dos veces. Una relación abierta cuenta hasta hoy; una que termina después
 *    de hoy, también hasta hoy (lo que falta no se trabajó todavía).
 *
 * Fechas como "YYYY-MM-DD"; los días se cuentan en UTC para que ningún cambio de hora reste uno.
 */
const MS_DIA = 86_400_000;
const utc = (iso) => Date.parse(`${iso}T00:00:00.000Z`);
/** Días corridos de `a` a `b` (b − a). Negativo si `b` es anterior. */
export const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / MS_DIA);
/** Años con dos decimales, a 365,25 días el año. */
export const aniosDe = (dias) => Math.round((dias / 365.25) * 100) / 100;
/**
 * Une los tramos que se tocan o se solapan. Dos relaciones 10→20 y 15→25 son un solo tramo 10→25;
 * 10→20 y 21→25 también (son días consecutivos). 10→20 y 22→25 quedan como dos.
 */
export function fusionarTramos(tramos) {
    const ordenados = [...tramos].filter((t) => t.hasta >= t.desde).sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));
    const out = [];
    for (const t of ordenados) {
        const ultimo = out[out.length - 1];
        if (ultimo && diasEntre(ultimo.hasta, t.desde) <= 1) {
            if (t.hasta > ultimo.hasta)
                ultimo.hasta = t.hasta;
        }
        else {
            out.push({ ...t });
        }
    }
    return out;
}
/** Días de un tramo, inclusive de las dos puntas (10→10 es un día). */
export const diasDeTramo = (t) => diasEntre(t.desde, t.hasta) + 1;
/**
 * El tramo efectivamente trabajado de una relación al día de hoy: hasta el fin, o hasta hoy si está
 * abierta o si el fin es futuro. `null` si todavía no empezó.
 */
export function tramoTrabajado(r, hoy) {
    if (r.fechaInicio > hoy)
        return null;
    const hasta = r.fechaFin === null || r.fechaFin > hoy ? hoy : r.fechaFin;
    return { desde: r.fechaInicio, hasta: hasta < r.fechaInicio ? r.fechaInicio : hasta };
}
/** Las métricas de un CUIL. `null` si no hay relaciones. */
export function antiguedadDe(relaciones, hoy) {
    if (relaciones.length === 0)
        return null;
    const porInicio = [...relaciones].sort((a, b) => (a.fechaInicio < b.fechaInicio ? -1 : a.fechaInicio > b.fechaInicio ? 1 : 0));
    const primeraAlta = porInicio[0].fechaInicio;
    const tieneRelacionAbierta = relaciones.some((r) => r.fechaFin === null);
    const mayorFin = relaciones.reduce((m, r) => (r.fechaFin !== null && (m === null || r.fechaFin > m) ? r.fechaFin : m), null);
    const ultimaFecha = tieneRelacionAbierta || mayorFin === null ? hoy : mayorFin;
    const tramos = fusionarTramos(relaciones.map((r) => tramoTrabajado(r, hoy)).filter((t) => t !== null));
    const diasTrabajados = tramos.reduce((s, t) => s + diasDeTramo(t), 0);
    const dias = Math.max(0, diasEntre(primeraAlta, hoy));
    // El nombre más reciente: el de la relación que empezó última (ARCA puede haberlo corregido).
    const masReciente = porInicio[porInicio.length - 1];
    return {
        apellidoNombre: masReciente.apellidoNombre || relaciones.find((r) => r.apellidoNombre)?.apellidoNombre || "",
        primeraAlta,
        ultimaFecha,
        antiguedadDesdePrimeraAlta: { dias, anios: aniosDe(dias) },
        diasTrabajados,
        aniosTrabajados: aniosDe(diasTrabajados),
        cantidadContratos: relaciones.length,
        tieneRelacionAbierta,
        empresas: [...new Set(relaciones.map((r) => r.empleadoraCuit))].sort(),
    };
}
/**
 * Las filas que van a `AntiguedadArca` para un CUIL: una por empleadora y la global (todas juntas,
 * `empleadoraCuit: null`). Si la persona tiene una sola empleadora, la global es igual a la de ella.
 * Desde el 15/11/2026 la global queda para auditar: las vacaciones toman la antigüedad de UNA
 * empleadora (`empresaDeComputo`), no la suma de todas.
 */
export function antiguedadesDe(relaciones, hoy) {
    const global = antiguedadDe(relaciones, hoy);
    if (!global)
        return [];
    const out = [{ empleadoraCuit: null, metricas: global }];
    for (const cuit of global.empresas)
        out.push({ empleadoraCuit: cuit, metricas: antiguedadDe(relaciones.filter((r) => r.empleadoraCuit === cuit), hoy) });
    return out;
}
/** Fecha guardada (Date o string) a "YYYY-MM-DD"; "" si no hay. */
export const isoDia = (v) => {
    if (!v)
        return "";
    if (typeof v === "string")
        return v.slice(0, 10);
    const d = new Date(v);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
/** Vigente hoy: relación abierta, o una que termina hoy o después. */
const esVigente = (f, hoy) => f.tieneRelacionAbierta || (!!f.ultimaFecha && f.ultimaFecha >= hoy);
/** La empleadora vigente (ver la regla arriba). `null` si no hay filas. */
export function empresaVigenteDe(filas, hoy) {
    if (filas.length === 0)
        return null;
    const orden = [...filas].sort((a, b) => {
        const va = esVigente(a, hoy) ? 1 : 0;
        const vb = esVigente(b, hoy) ? 1 : 0;
        if (va !== vb)
            return vb - va;
        if (a.ultimaFecha !== b.ultimaFecha)
            return a.ultimaFecha < b.ultimaFecha ? 1 : -1;
        if (a.primeraAlta !== b.primeraAlta)
            return a.primeraAlta < b.primeraAlta ? 1 : -1;
        return a.empleadoraCuit.localeCompare(b.empleadoraCuit);
    });
    return orden[0];
}
/**
 * La empleadora cuya antigüedad cuenta y por qué. `precedencia`: CUITs en orden, la primera presente
 * gana (sólo en modo manual). Una sola empleadora es «unica» sea cual sea el modo.
 */
export function empresaDeComputo(filas, hoy, config = {}) {
    if (filas.length === 0)
        return null;
    if (new Set(filas.map((f) => f.empleadoraCuit)).size === 1)
        return { fila: filas[0], motivo: "unica" };
    if (config.modo === "precedenciaManual") {
        for (const cuit of config.precedencia || []) {
            const fila = filas.find((f) => f.empleadoraCuit === cuit);
            if (fila)
                return { fila, motivo: "precedencia" };
        }
    }
    const fila = empresaVigenteDe(filas, hoy);
    return fila ? { fila, motivo: "vigente" } : null;
}
/**
 * LA BASE DE ANTIGÜEDAD DE LAS VACACIONES (la usa `services/vacaciones/saldos.ts`). Devuelve los días que
 * cuentan y de qué empleadora salen:
 *  - Si hay que sumar (`motivoSuma`: la config lo pide o el período ya cerró): los días de siempre
 *    (`diasSumados`: la fila global de ARCA o la suma de contratos) y ninguna empresa.
 *  - Con ARCA: la fila de la empresa de cómputo. Sin ARCA: el grupo de contratos de esa empresa
 *    (`porContratos` es `null` cuando algún contrato no tiene empresa: no se puede repartir).
 *  - Si no hay de dónde elegir: los días de siempre.
 */
export function baseDeAntiguedad(a) {
    if (a.motivoSuma)
        return { dias: a.diasSumados, elegida: null };
    const filas = a.hayArca ? a.porArca : a.porContratos || [];
    const r = empresaDeComputo(filas, a.hoy, { modo: a.modo, precedencia: a.precedencia });
    if (!r)
        return { dias: a.diasSumados, elegida: null };
    return { dias: r.fila.dias, elegida: { fila: r.fila, motivo: r.motivo, fuente: a.hayArca ? "arca" : "contratos", consideradas: filas } };
}
/**
 * El CUIT de la empleadora cuya antigüedad cuenta (la forma corta de `empresaDeComputo`): con precedencia
 * manual, la primera de `precedenciaCuits` que la persona tenga; si no, la vigente (abierta → última
 * fecha → primera alta). `null` si no hay filas. `hoy` por defecto, el día UTC.
 */
export function empresaVigenteCuit(filasPorEmpresa, modo = "empresaVigente", precedenciaCuits = [], hoy = new Date().toISOString().slice(0, 10)) {
    return empresaDeComputo(filasPorEmpresa, hoy, { modo, precedencia: precedenciaCuits })?.fila.empleadoraCuit ?? null;
}
