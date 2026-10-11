import { Tenant } from "../models/Tenant.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
import { correrPresentacionDelDia } from "./arca/presentacionAutomatica.js";
import { configDe, horaTexto, yaPasoLaHora } from "./arca/horarioAltasAutomaticas.js";
/**
 * EL HORARIO DE LA PRESENTACIÓN AUTOMÁTICA: a la hora que configuró cada tenant (14:00 argentinas por
 * defecto), una vez por día, se presentan en ARCA las altas que empiezan ese día o en los días de
 * anticipación configurados (ver `arca/presentacionAutomatica.ts` y `arca/horarioAltasAutomaticas.ts`).
 *
 * Mismo patrón que las otras tareas del servidor: un `setInterval` que mira la hora. La hora es la de
 * Argentina y no la del VPS (puede estar en UTC). Si el servidor estuvo caído a esa hora, corre apenas
 * vuelve, siempre que siga siendo el mismo día. Si se cambia la hora a una más tarde cuando la corrida
 * de hoy ya pasó, no vuelve a correr hoy.
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
        const pa = t.integrations?.arcaSimplificacion?.presentacionAutomatica || {};
        if (pa.ultimoDia === hoy)
            continue;
        const cfg = configDe(pa);
        if (!yaPasoLaHora(cfg))
            continue;
        enCurso.add(id);
        void (async () => {
            try {
                // Se marca el día primero, con un filtro que hace de candado entre procesos: si otro ya lo marcó, no corre.
                const marcado = await Tenant.updateOne({ _id: t._id, "integrations.arcaSimplificacion.presentacionAutomatica.ultimoDia": { $ne: hoy } }, { $set: { "integrations.arcaSimplificacion.presentacionAutomatica.ultimoDia": hoy } });
                if (marcado.modifiedCount === 0)
                    return;
                console.log(`[presentacion-automatica] ${id}: corrida de las ${horaTexto(cfg)} del ${hoy} (anticipación ${cfg.diasAntes} día/s)`);
                const resumen = await correrPresentacionDelDia(id, t._id, cfg);
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
    console.log("[presentacion-automatica] programada: todos los días a la hora configurada por cada tenant (Argentina), para los que la tengan activa");
}
