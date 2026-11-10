/**
 * EL CICLO DE LA CONSTANCIA DE UN ALTA PRESENTADA EN ARCA (07/11/2026). Puro: sin base, sin ARCA, sin Dropbox.
 *
 * Una presentación es persona + empleadora + fecha de alta (`claveConstancia`). Su constancia pasa por:
 *
 *   presentada → constancia_pendiente → constancia_descargada → enviada_a_firmar → firmada → archivada
 *
 * y dos terminales: `baja_mismo_dia_ok` (la constancia de una relación que ya terminó, que no va a
 * firma) y `requiere_revision` (con un motivo en castellano). Es la única fuente de verdad: Pendientes,
 * Presentadas, el panel de descargas y el Registro leen de acá (colección `constancias_arca`).
 *
 * POR QUÉ EXISTE. Antes la cola era «todo lo presentado sin constancia validada», en el orden en que
 * venía de la base, y lo que rebotaba no dejaba rastro: la constancia de BAJA de una jornada (ARCA la
 * emite así cuando la relación ya terminó) rebotaba todos los días, para siempre, y ocupaba el tope de
 * 40 por empleadora antes que las nuevas. Ahora cada intento queda anotado, se reintenta a lo sumo
 * `MAX_INTENTOS` veces con espera creciente, y el cupo es primero para las nunca intentadas.
 */
/** Se intenta, como mucho, esta cantidad de veces en las corridas automáticas. */
export const MAX_INTENTOS = 3;
/** Días de espera después del intento fallido n (1.º → 1 día, 2.º → 2 días). Al 3.º, a revisión. */
export const ESPERA_DIAS = [1, 2, 4];
/**
 * Después de un fallo de la descarga ENCADENADA a la presentación (11/11/2026) se espera esto y no un
 * día: la encadenada de las 00:05 que no pudo bajar una constancia tiene que entrar en el barrido de
 * ESE día (15:00). Con un día de espera vencía a las 00:05 siguientes y recién salía en el barrido de
 * pasado mañana.
 */
export const ESPERA_TRAS_ENCADENADA_MS = 2 * 60 * 60_000;
/** El orden del circuito, para no volver nunca para atrás (ver `siguienteEstado`). */
const PASO = {
    presentada: 0,
    constancia_pendiente: 1,
    requiere_revision: 1,
    constancia_descargada: 2,
    enviada_a_firmar: 3,
    firmada: 4,
    archivada: 5,
    baja_mismo_dia_ok: 5,
};
const digitos = (v) => String(v ?? "").replace(/\D/g, "");
/** Persona + empleadora + fecha de alta: lo que identifica una constancia. Dos corridas sobre lo mismo dan la misma clave. */
export const claveConstancia = (o) => `${digitos(o.cuil)}|${digitos(o.empresaCuit)}|${String(o.fechaAlta ?? "").slice(0, 10)}`;
/** Ya tiene su constancia: no se vuelve a pedir a ARCA ni cuenta contra el tope, nunca. */
export const yaTieneConstancia = (estado) => PASO[estado] >= PASO.constancia_descargada;
/** Se puede pedir en una corrida AUTOMÁTICA: nueva, o un reintento cuya espera ya pasó. */
export function sePuedePedir(item, ahora) {
    if (item.estado === "presentada")
        return true;
    if (item.estado !== "constancia_pendiente")
        return false;
    return !item.proximoIntentoEl || new Date(item.proximoIntentoEl).getTime() <= ahora.getTime();
}
/** Los intentos que cuentan hoy: los posteriores al último «Volver a bajar» (una re-descarga arranca con sus 3 intentos). */
export const intentosDesdeLaRedescarga = (intentos) => {
    const i = intentos.map((x) => x.resultado).lastIndexOf("redescarga");
    return i < 0 ? intentos : intentos.slice(i + 1);
};
/**
 * ¿SE PUEDE «VOLVER A BAJAR»? Sólo una constancia en revisión porque su documento no está en ninguna
 * carpeta del circuito (se borró). Idempotente: si el documento reapareció (ya no está en revisión, o
 * está por otro motivo) o ya hay una re-descarga en curso, no. Puro.
 */
export function puedeVolverABajarse(item) {
    if (item.redescarga?.enCurso && !yaTieneConstancia(item.estado))
        return { ok: false, motivo: "Ya se pidió volver a bajarla: está en la cola." };
    if (item.estado !== "requiere_revision")
        return { ok: false, motivo: yaTieneConstancia(item.estado) ? "El documento está ubicado: no hace falta volver a bajarla." : "Todavía no tiene constancia: sale sola en la próxima descarga." };
    // Fuera del circuito también: es lo que hace «Retomar el circuito» cuando el PDF que apareció no sirve.
    if (!item.documento?.noUbicadoDesde && !item.documento?.fueraDelCircuito)
        return { ok: false, motivo: "Está en revisión por otro motivo, no por un documento perdido: usá «Reintentar»." };
    return { ok: true };
}
/**
 * Qué pasa con la constancia después de un intento fallido. Puro.
 *
 * Cuentan sólo los intentos automáticos: un «Reintentar» a mano que falla vuelve a revisión sin gastar
 * los que le quedaban, y uno que sale bien la saca. Lo que no se arregla reintentando (`sinArreglo`)
 * no espera tres días para decirlo.
 */
export function trasUnFallo(intentosPrevios, fallo, ahora, o = {}) {
    const automaticos = intentosDesdeLaRedescarga(intentosPrevios).filter((i) => !i.manual && i.resultado !== "descargada").length + (o.manual ? 0 : 1);
    if (fallo.sinArreglo)
        return { estado: "requiere_revision", proximoIntentoEl: null, motivoRevision: fallo.detalle || "ARCA muestra varias relaciones distintas para esa fecha: hay que elegir a mano." };
    if (o.manual)
        return { estado: "requiere_revision", proximoIntentoEl: null, motivoRevision: `El reintento a mano tampoco la bajó: ${textoDelFallo(fallo)}` };
    if (automaticos >= MAX_INTENTOS)
        return { estado: "requiere_revision", proximoIntentoEl: null, motivoRevision: `No se pudo bajar en ${MAX_INTENTOS} intentos. El último: ${textoDelFallo(fallo)}` };
    // Cuenta como intento igual; lo que cambia es cuánto espera (ver `ESPERA_TRAS_ENCADENADA_MS`).
    if (o.origen === "encadenada")
        return { estado: "constancia_pendiente", proximoIntentoEl: new Date(ahora.getTime() + ESPERA_TRAS_ENCADENADA_MS) };
    const dias = ESPERA_DIAS[Math.min(automaticos, ESPERA_DIAS.length) - 1];
    return { estado: "constancia_pendiente", proximoIntentoEl: new Date(ahora.getTime() + dias * 86_400_000) };
}
const TEXTO_FALLO = {
    rechazada: "la constancia que dio ARCA no coincide con el contrato",
    sin_constancia: "ARCA no mostró la constancia de esa relación",
    ambigua: "ARCA muestra varias relaciones para esa fecha",
    error: "falló la descarga",
};
const textoDelFallo = (f) => `${TEXTO_FALLO[f.resultado]}${f.detalle ? ` (${f.detalle})` : ""}.`;
/**
 * LAS QUE ENTRAN EN UNA CORRIDA AUTOMÁTICA, con su tope. Puro.
 *
 * Primero las nunca intentadas (de la más vieja a la más nueva), después los reintentos ya vencidos
 * (el que más espera, primero). Lo que ya tiene constancia, lo que está en revisión y los reintentos
 * que todavía esperan no entran ni ocupan lugar. Devuelve cuántas quedaron afuera y por qué.
 */
export function elegirParaCorrida(items, o) {
    const nuevas = items.filter((i) => i.estado === "presentada").sort((a, b) => a.fechaAlta.localeCompare(b.fechaAlta));
    const reintentos = items
        .filter((i) => i.estado === "constancia_pendiente" && sePuedePedir(i, o.ahora))
        .sort((a, b) => new Date(a.proximoIntentoEl || 0).getTime() - new Date(b.proximoIntentoEl || 0).getTime() || a.fechaAlta.localeCompare(b.fechaAlta));
    const tope = o.tope > 0 ? o.tope : Infinity;
    const elegidas = [...nuevas, ...reintentos].slice(0, tope);
    const nuevasElegidas = Math.min(nuevas.length, elegidas.length);
    return {
        elegidas,
        fuera: {
            nuevasPorTope: nuevas.length - nuevasElegidas,
            reintentosPorTope: reintentos.length - (elegidas.length - nuevasElegidas),
            esperandoReintento: items.filter((i) => i.estado === "constancia_pendiente" && !sePuedePedir(i, o.ahora)).length,
            enRevision: items.filter((i) => i.estado === "requiere_revision").length,
        },
    };
}
/**
 * LAS QUE ENTRAN EN LA DESCARGA ENCADENADA A UNA PRESENTACIÓN (11/11/2026). Puro.
 *
 * Exactamente las altas recién presentadas de esa tanda (`recien`), sin tope: el lote ya lo acota el
 * tamaño de la tanda. De ésas, sólo lo que una corrida automática puede pedir: lo que ya tiene su
 * constancia no se vuelve a bajar (idempotencia por clave), y lo que está en revisión o esperando su
 * reintento sigue su ciclo —no se fuerza por haberse presentado de nuevo—.
 */
export function elegirEncadenadas(items, recien, ahora) {
    const pedidas = new Set(recien.map((i) => `${i.userProjectId}:${Number(i.contractIndex)}`));
    return items.filter((i) => pedidas.has(`${String(i.userProjectId)}:${i.contractIndex}`) && !yaTieneConstancia(i.estado) && sePuedePedir(i, ahora)).sort((a, b) => a.fechaAlta.localeCompare(b.fechaAlta));
}
/**
 * ¿SE PUEDE «RETOMAR EL CIRCUITO»? Sólo una constancia en revisión porque su documento apareció fuera
 * de las carpetas del circuito (alguien lo movió del Outbox a otra carpeta). Puro.
 */
export function puedeRetomarCircuito(item) {
    if (item.estado !== "requiere_revision")
        return { ok: false, motivo: yaTieneConstancia(item.estado) ? "Ya está en el circuito: no hace falta retomarlo." : "Todavía no tiene constancia: sale sola en la próxima descarga." };
    if (!item.documento?.fueraDelCircuito || !item.documento.path)
        return { ok: false, motivo: "El documento no apareció fuera del circuito: si se perdió, usá «Volver a bajar»." };
    return { ok: true };
}
const PASO_CARPETA = { outbox: 1, pendbox: 2, firmados: 3, alta_firmadas: 4, no_firmar: 4 };
/** De todas las carpetas donde aparece el código, la más avanzada del circuito. Puro. */
export const carpetaMasAvanzada = (donde) => [...donde].sort((a, b) => PASO_CARPETA[b] - PASO_CARPETA[a])[0] || null;
/** El estado que corresponde a esa carpeta. Puro. */
export function estadoPorCarpeta(carpeta, o = {}) {
    switch (carpeta) {
        case "outbox":
            return "constancia_descargada";
        case "pendbox":
            return "enviada_a_firmar";
        case "firmados":
            return "firmada";
        case "alta_firmadas":
            return "archivada";
        case "no_firmar":
            return o.esDeBaja ? "baja_mismo_dia_ok" : "archivada";
    }
}
/**
 * El estado nuevo, sin volver nunca para atrás en el circuito. Puro.
 *
 * Desde revisión se sale a cualquier estado con documento (reapareció, o se resolvió a mano). Lo que no
 * se hace es retroceder: una constancia firmada no vuelve a «en firma» porque un listado viejo la vea
 * todavía en Pendbox.
 */
export function siguienteEstado(actual, nuevo) {
    if (nuevo === actual)
        return actual;
    if (nuevo === "requiere_revision")
        return actual === "archivada" || actual === "baja_mismo_dia_ok" ? actual : nuevo;
    if (actual === "requiere_revision")
        return nuevo;
    return PASO[nuevo] > PASO[actual] ? nuevo : actual;
}
export function categoriaDe(estado, o = {}) {
    switch (estado) {
        case "presentada":
        case "constancia_pendiente":
            return "pendientes";
        case "constancia_descargada":
        case "baja_mismo_dia_ok":
            return "descargadas";
        case "enviada_a_firmar":
            return "en_firma";
        case "firmada":
            return "firmadas";
        case "archivada":
            return o.firmada ? "firmadas" : "descargadas";
        case "requiere_revision":
            return "revision";
    }
}
