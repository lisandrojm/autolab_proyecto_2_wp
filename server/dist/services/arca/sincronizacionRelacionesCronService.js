import { Tenant } from "../../models/Tenant.js";
import { hoyArgentina } from "../../utils/contratoVigencia.js";
import { yaPasoLaHora } from "./horarioAltasAutomaticas.js";
import { sincronizarRelacionesTenant } from "./sincronizarRelaciones.js";
import { CandadoArcaOcupado } from "./candadoArca.js";
/**
 * EL HORARIO DE LA SINCRONIZACIÓN DE RELACIONES LABORALES: una vez por día, a la hora que configuró
 * cada tenant (06:00 argentinas por defecto, lejos de las 14:00 de la presentación de altas, porque
 * comparten la sesión de ARCA), se leen los movimientos del mes y se actualiza la antigüedad.
 *
 * Calcado de `presentacionAutomaticaCronService.ts`: un `setInterval` que mira la hora argentina
 * (el VPS puede estar en UTC); si el servidor estuvo caído a esa hora, corre apenas vuelve, mientras
 * siga siendo el mismo día. El día se marca ANTES de correr, con un filtro que hace de candado entre
 * procesos: una corrida que falla no vuelve a golpear ARCA cada minuto; se ve en «Última sincronización»
 * y se puede relanzar con «Sincronizar ahora».
 *
 * Si a esa hora ARCA está ocupada por otra corrida (candado tomado), se reintenta en el próximo tick
 * sin marcar el día: a diferencia de las altas, acá no hay nada urgente que presentar.
 *
 * Sólo los tenants que la prendieron (`integrations.arcaSimplificacion.sincronizacionRelaciones.activa`).
 */
const TICK_MS = 60_000;
export const HORA_POR_DEFECTO = "06:00";
export const MESES_POR_DEFECTO = 1;
const enCurso = new Set();
/** "HH:MM" → { hora, minuto }. Lo que no se entiende cae al default. */
export function horaDe(texto) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(texto ?? "").trim());
    const h = m ? Number(m[1]) : NaN, mi = m ? Number(m[2]) : NaN;
    if (!m || h < 0 || h > 23 || mi < 0 || mi > 59)
        return horaDe(HORA_POR_DEFECTO);
    return { hora: h, minuto: mi };
}
export function configSyncDe(guardado) {
    const { hora, minuto } = horaDe(guardado?.hora);
    const meses = Number(guardado?.meses);
    return {
        activa: guardado?.activa === true,
        hora: `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`,
        meses: Number.isInteger(meses) && meses >= 1 && meses <= 24 ? meses : MESES_POR_DEFECTO,
    };
}
async function tick() {
    const hoy = hoyArgentina();
    let tenants = [];
    try {
        tenants = await Tenant.find({ "integrations.arcaSimplificacion.sincronizacionRelaciones.activa": true })
            .select("_id integrations.arcaSimplificacion.sincronizacionRelaciones")
            .lean();
    }
    catch (e) {
        console.error("[sync-relaciones-arca] no se pudo leer los tenants:", e?.message || e);
        return;
    }
    for (const t of tenants) {
        const id = String(t._id);
        if (enCurso.has(id))
            continue;
        const sr = t.integrations?.arcaSimplificacion?.sincronizacionRelaciones || {};
        if (sr.ultimoDia === hoy)
            continue;
        const cfg = configSyncDe(sr);
        if (!yaPasoLaHora(horaDe(cfg.hora)))
            continue;
        enCurso.add(id);
        void (async () => {
            try {
                const marcado = await Tenant.updateOne({ _id: t._id, "integrations.arcaSimplificacion.sincronizacionRelaciones.ultimoDia": { $ne: hoy } }, { $set: { "integrations.arcaSimplificacion.sincronizacionRelaciones.ultimoDia": hoy } });
                if (marcado.modifiedCount === 0)
                    return;
                console.log(`[sync-relaciones-arca] ${id}: corrida de las ${cfg.hora} del ${hoy} (${cfg.meses} mes/es)`);
                const resumen = await sincronizarRelacionesTenant(id, { meses: cfg.meses, automatica: true });
                console.log(`[sync-relaciones-arca] ${id}: ${resumen.error ? `error: ${resumen.error}` : resumen.empresas.map((e) => `${e.razonSocial} ${e.error ? `error: ${e.error}` : `${e.nuevas} nuevas / ${e.actualizadas} actualizadas`}`).join(" · ")}`);
            }
            catch (e) {
                if (e instanceof CandadoArcaOcupado) {
                    // ARCA está ocupada: se desmarca el día para volver a probar en el próximo tick.
                    await Tenant.updateOne({ _id: t._id }, { $unset: { "integrations.arcaSimplificacion.sincronizacionRelaciones.ultimoDia": "" } }).catch(() => { });
                    return;
                }
                console.error(`[sync-relaciones-arca] ${id}:`, e?.message || e);
            }
            finally {
                enCurso.delete(id);
            }
        })();
    }
}
export function initSincronizacionRelacionesScheduler() {
    setTimeout(() => void tick(), 20_000);
    setInterval(() => void tick(), TICK_MS);
    console.log("[sync-relaciones-arca] programada: todos los días a la hora configurada por cada tenant (Argentina), para los que la tengan activa");
}
