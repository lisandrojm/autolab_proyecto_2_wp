/**
 * ═══════════════════════════════════════════════════════════════════════
 * AUTOMATIZACIONES DE CONTRATACIÓN (27/11/2026, pedido del usuario): la configuración de cada una
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Dos relojes, por tenant, apagados por defecto (se prenden desde su bandeja):
 *   · GENERACIÓN DE DOCUMENTOS (paso 3): cada N minutos genera lo que falte de lo que está en «Envío de
 *     documentación» y lo manda a firmar («Para Firmar»). Ver `generacionDocumentos.ts`.
 *   · VALIDACIÓN DEL CUIT (paso 2, Constancia de CUIT): cada N minutos consulta al padrón de ARCA los
 *     contratos de constancia de CUIT sin validar, archiva y avanza. Ver `validacionCuit.ts`.
 *
 * Viven en `Tenant.integrations.automatizacionesContratacion.<clave>` con lo mismo que las otras tareas
 * del servidor: si está activa, cada cuánto, cuándo corrió por última vez (que además hace de candado
 * entre procesos), qué hizo y el último error. Puro: sin base, para probar con node:test.
 */
export const CLAVES = ["generacionDocumentos", "validacionCuit"];
export const BASE = "integrations.automatizacionesContratacion";
/** Las frecuencias que ofrece la pantalla (minutos). */
export const FRECUENCIAS_MINUTOS = [10, 15, 30, 60, 120, 240, 480, 720, 1440];
export const POR_DEFECTO = {
    generacionDocumentos: { activa: false, cadaMinutos: 30 },
    validacionCuit: { activa: false, cadaMinutos: 60 },
};
export const TITULO = {
    generacionDocumentos: "Generación y envío automáticos de documentos",
    validacionCuit: "Validación automática del CUIT en ARCA",
};
/** La configuración efectiva: lo guardado completado con lo de siempre. */
export function configDe(guardado, clave) {
    const base = POR_DEFECTO[clave];
    const cada = Number(guardado?.cadaMinutos);
    return { activa: guardado?.activa === true, cadaMinutos: Number.isFinite(cada) && cada >= 1 ? Math.trunc(cada) : base.cadaMinutos };
}
/** Lo que llega de la pantalla, validado. Sólo cambian los campos que vienen. */
export function validarCambios(body) {
    const cambios = {};
    if (body?.activa !== undefined) {
        if (typeof body.activa !== "boolean")
            return { ok: false, error: "«activa» tiene que ser verdadero o falso." };
        cambios.activa = body.activa;
    }
    if (body?.cadaMinutos !== undefined) {
        const n = Number(body.cadaMinutos);
        if (!Number.isInteger(n) || n < 5 || n > 1440)
            return { ok: false, error: "La frecuencia tiene que ser un número entero de minutos, entre 5 y 1440." };
        cambios.cadaMinutos = n;
    }
    return { ok: true, cambios };
}
/** ¿Le toca correr? Activa y pasó la frecuencia desde la última corrida (o nunca corrió). */
export function leToca(cfg, ultimaCorridaAt, ahora = new Date()) {
    if (!cfg.activa)
        return false;
    if (!ultimaCorridaAt)
        return true;
    const ultima = new Date(ultimaCorridaAt).getTime();
    if (!Number.isFinite(ultima))
        return true;
    return ahora.getTime() - ultima >= cfg.cadaMinutos * 60_000;
}
/** Cuándo vuelve a correr, para la pantalla. `null` si está apagada. */
export function proximaCorrida(cfg, ultimaCorridaAt, ahora = new Date()) {
    if (!cfg.activa)
        return null;
    if (!ultimaCorridaAt)
        return ahora;
    const ultima = new Date(ultimaCorridaAt).getTime();
    if (!Number.isFinite(ultima))
        return ahora;
    return new Date(Math.max(ahora.getTime(), ultima + cfg.cadaMinutos * 60_000));
}
