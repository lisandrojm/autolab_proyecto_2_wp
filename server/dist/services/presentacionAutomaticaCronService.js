import { Tenant } from "../models/Tenant.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
import { HORA_PRESENTACION, correrPresentacionDelDia, horaArgentina } from "./arca/presentacionAutomatica.js";
/**
 * EL HORARIO DE LA PRESENTACIÓN AUTOMÁTICA: a las 14 h argentinas, una vez por día y por tenant, se
 * presentan en ARCA las altas que empiezan ese día (ver `arca/presentacionAutomatica.ts`).
 *
 * Mismo patrón que las otras tareas del servidor: un `setInterval` que mira la hora. La hora es la de
 * Argentina y no la del VPS (puede estar en UTC). Si el servidor estuvo caído a las 14 h, corre apenas
 * vuelve, siempre que siga siendo el mismo día: «sólo lo de ese día».
 *
 * El día se marca ANTES de presentar: si el proceso se cae a mitad de camino no se reintenta solo, y lo
 * que quedó sin presentar se ve en la pantalla con su botón «Forzar». Relanzar sería seguro igual
 * (`validarLoteAltas` saltea lo ya presentado), pero una corrida que falla siempre —sin credenciales,
 * por ejemplo— no tiene que golpear ARCA cada minuto.
 *
 * Sólo los tenants que la prendieron (`integrations.arcaSimplificacion.presentacionAutomatica.activa`).
 */
const TICK_MS = 60_000;
const enCurso = new Set();
async function tick() {
    if (horaArgentina() < HORA_PRESENTACION)
        return;
    const hoy = hoyArgentina();
    let tenants = [];
    try {
        tenants = await Tenant.find({ "integrations.arcaSimplificacion.presentacionAutomatica.activa": true })
            .select("_id integrations.arcaSimplificacion.presentacionAutomatica")
            .lean();
    }
    catch (e) {
        console.error("[presentacion-automatica] no se pudo leer los tenants:", e?.message || e);
        return;
    }
    for (const t of tenants) {
        const id = String(t._id);
        if (enCurso.has(id))
            continue;
        if (t.integrations?.arcaSimplificacion?.presentacionAutomatica?.ultimoDia === hoy)
            continue;
        enCurso.add(id);
        void (async () => {
            try {
                // Se marca el día primero, con un filtro que hace de candado entre procesos: si otro ya lo marcó, no corre.
                const marcado = await Tenant.updateOne({ _id: t._id, "integrations.arcaSimplificacion.presentacionAutomatica.ultimoDia": { $ne: hoy } }, { $set: { "integrations.arcaSimplificacion.presentacionAutomatica.ultimoDia": hoy } });
                if (marcado.modifiedCount === 0)
                    return;
                console.log(`[presentacion-automatica] ${id}: presentando las altas del ${hoy}`);
                const resumen = await correrPresentacionDelDia(id, t._id);
                await Tenant.updateOne({ _id: t._id }, { $set: { "integrations.arcaSimplificacion.presentacionAutomatica.ultimaCorrida": resumen } });
                console.log(`[presentacion-automatica] ${id}: ${resumen.empresas.map((e) => `${e.empresa} ${e.error ? `error: ${e.error}` : `${e.enviados} enviada(s)`}`).join(" · ") || "nada para presentar"}; ${resumen.omitidos.length} sin presentar`);
            }
            catch (e) {
                console.error(`[presentacion-automatica] ${id}:`, e?.message || e);
                await Tenant.updateOne({ _id: t._id }, { $set: { "integrations.arcaSimplificacion.presentacionAutomatica.ultimaCorrida": { fecha: new Date().toISOString(), dia: hoy, empresas: [], omitidos: [], error: String(e?.message || e) } } }).catch(() => { });
            }
            finally {
                enCurso.delete(id);
            }
        })();
    }
}
export function initPresentacionAutomaticaScheduler() {
    setTimeout(() => void tick(), 15_000);
    setInterval(() => void tick(), TICK_MS);
    console.log(`[presentacion-automatica] programada: todos los días a las ${HORA_PRESENTACION} h (Argentina), para los tenants que la tengan activa`);
}
