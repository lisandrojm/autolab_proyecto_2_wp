/**
 * ═══════════════════════════════════════════════════════════════════════
 * CÓDIGO COMPARTIDO SERVER ↔ FRONTEND (`server/src/compartido/`)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Solo código puro: nada de Node, Mongoose ni del DOM, y sin imports (ver `jornadas.ts`).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SUCURSAL Y ACTIVIDAD: SON DE CADA EMPRESA, NO DEL DOMICILIO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * En ARCA (Simplificación Registral → Datos del Empleador → Domicilios de Explotación) tanto el
 * CÓDIGO de sucursal como las ACTIVIDADES habilitadas en ella son de cada CUIT. El mismo domicilio
 * tiene códigos distintos según quién lo declare: Ruiz Huidobro 4365 es la 00001 de 2030 S.R.L. y la
 * 00003 de FZERO y de GRINI.
 *
 * El catálogo (`ArcaSucursal`) guardaba UN código por domicilio, compartido. Con eso, un alta de 2030
 * salió con sucursal 00003: ARCA no la reconoció para ese CUIT, la cambió sola a la 00001 y dejó la
 * actividad vacía — sin error, y uno se enteraba recién mirando la grilla.
 *
 * Desde acá, el domicilio sigue siendo uno solo en el catálogo y lo que cambia por empresa vive en la
 * asociación empresa–domicilio (`Company.sucursalActividades`): su `codigo` y sus `actividades`.
 *
 * LO USAN LOS DOS LADOS: el generador de los registros de 130 y de 85 (frontend) y el cotejo del lote
 * (servidor). Si cada uno resolviera por su cuenta podrían discrepar, y el server rechazaría un
 * archivo que el navegador armó bien —o peor, dejaría pasar uno que armó mal—.
 */
/** Código canónico de sucursal: solo dígitos, 5 posiciones con ceros a la izquierda. "" si no hay. */
export const codigoSucursal = (v) => {
    const d = String(v ?? "").replace(/\D/g, "");
    return d ? d.slice(-5).padStart(5, "0") : "";
};
/** Código canónico de actividad: solo dígitos, 6 posiciones. "" si no hay. */
export const codigoActividad = (v) => {
    const d = String(v ?? "").replace(/\D/g, "");
    return d ? d.slice(-6).padStart(6, "0") : "";
};
const idDe = (v) => String(v?._id ?? v ?? "");
/** La fila de esa empresa para ese domicilio, o `undefined` si no declaró nada ahí. */
export const filaDeSucursal = (asociaciones, sucursalId) => {
    const buscado = idDe(sucursalId);
    return buscado ? (asociaciones || []).find((x) => idDe(x?.sucursalId) === buscado) : undefined;
};
/**
 * EL CÓDIGO DE SUCURSAL QUE VA AL ARCHIVO para un contrato de esta empresa en ese domicilio.
 *
 *   1. el de la EMPRESA (su fila en `sucursalActividades`), que es el de su padrón en ARCA;
 *   2. si la empresa todavía no tiene el suyo cargado, el del catálogo, como hasta ahora.
 *
 * El segundo escalón existe para no cambiar lo que ya salía bien: una empresa a la que nadie le cargó
 * su código sigue generando exactamente el mismo registro que antes. `origen` dice de cuál salió,
 * para que la pantalla pueda marcar el que todavía es el compartido.
 */
export function codigoDeSucursalParaEmpresa(asociaciones, sucursalId, codigoDelCatalogo) {
    const propio = codigoSucursal(filaDeSucursal(asociaciones, sucursalId)?.codigo);
    if (propio)
        return { codigo: propio, origen: "empresa" };
    const compartido = codigoSucursal(codigoDelCatalogo);
    return compartido ? { codigo: compartido, origen: "catalogo" } : { codigo: "", origen: "ninguno" };
}
/**
 * Las actividades que ESTA empresa tiene habilitadas en ese domicilio. Sin fila, ninguna: no se
 * hereda de otra empresa ni del domicilio (ARCA rechaza una que ese CUIT no declaró ahí).
 */
export function actividadesDeSucursalParaEmpresa(asociaciones, sucursalId) {
    return (filaDeSucursal(asociaciones, sucursalId)?.actividades || []).filter((a) => !!a && !!String(a.codigo || "").trim());
}
/**
 * ¿Qué tiene de malo la sucursal o la actividad de un contrato, mirado contra SU empresa? `null` = nada.
 *
 * Es la validación previa a generar el archivo: lo que ARCA hoy corrige o vacía en silencio.
 *
 *  · `sucursalId` es el domicilio YA RESUELTO (el del contrato, o el habitual de la empleadora).
 *    Vacío no es problema de acá: «todavía no eligió» lo dice el checklist.
 *  · `actividad` es la del contrato. Vacía y con una sola habilitada, se hereda: no hay problema.
 */
export function problemaDeSucursalYActividad(o) {
    const id = idDe(o.sucursalId);
    if (!id)
        return null;
    if (!(o.sucursalIdsDeLaEmpresa || []).map(idDe).includes(id))
        return "sucursal_ajena";
    if (!codigoDeSucursalParaEmpresa(o.asociaciones, id, o.codigoDelCatalogo).codigo)
        return "sin_codigo";
    const habilitadas = actividadesDeSucursalParaEmpresa(o.asociaciones, id).map((a) => codigoActividad(a.codigo));
    if (habilitadas.length === 0)
        return "sin_actividades";
    const elegida = codigoActividad(o.actividad);
    if (!elegida)
        return habilitadas.length === 1 ? null : "actividad_sin_elegir";
    return habilitadas.includes(elegida) ? null : "actividad_no_habilitada";
}
/** Cómo se le dice a una persona qué corregir y dónde, para cada problema. */
export const TEXTO_PROBLEMA_SUCURSAL = {
    sucursal_ajena: "la sucursal del contrato no es un domicilio de explotación de esa empresa",
    sin_codigo: "la empresa no tiene cargado el código de sucursal de ese domicilio",
    sin_actividades: "la empresa no tiene ninguna actividad habilitada en esa sucursal",
    actividad_sin_elegir: "la sucursal tiene más de una actividad habilitada y el contrato no eligió cuál declara",
    actividad_no_habilitada: "la actividad del contrato no está habilitada en esa sucursal para esa empresa",
};
