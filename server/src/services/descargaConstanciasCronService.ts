import { Tenant } from "../models/Tenant.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
import { correrDescargaConstanciasDelDia } from "./arca/descargaConstanciasAutomatica.js";
import { configDe, horaTexto, yaPasoLaHora } from "./arca/horarioAltasAutomaticas.js";

/**
 * EL HORARIO DE LA DESCARGA AUTOMÁTICA DE CONSTANCIAS: a la hora que configuró cada tenant, una vez por
 * día, se bajan de ARCA las constancias de las altas ya presentadas (ver `arca/descargaConstanciasAutomatica.ts`).
 *
 * Mismo patrón que la presentación automática (`presentacionAutomaticaCronService.ts`): un `setInterval`
 * que mira la hora argentina; si el servidor estuvo caído a esa hora, corre apenas vuelve, el mismo día;
 * el día se marca ANTES de correr (candado entre procesos) y una corrida que falla no se repite sola:
 * lo que quedó sin constancia se ve en Contratos y se baja a mano o mañana.
 *
 * Sólo los tenants que la prendieron (`integrations.arcaSimplificacion.descargaConstancias.activa`).
 * Conviene ponerla DESPUÉS de la hora de las Altas Automáticas (14:00): así baja las constancias de lo
 * que se presentó ese mismo día.
 */

const TICK_MS = 60_000;
const enCurso = new Set<string>();
const BASE = "integrations.arcaSimplificacion.descargaConstancias";

async function tick() {
  const hoy = hoyArgentina();
  let tenants: any[] = [];
  try {
    tenants = await Tenant.find({ [`${BASE}.activa`]: true }).select(`_id slug ${BASE}`).lean();
  } catch (e: any) {
    console.error("[descarga-constancias] no se pudo leer los tenants:", e?.message || e);
    return;
  }
  for (const t of tenants) {
    const id = String(t._id);
    if (enCurso.has(id)) continue;
    const dc = t.integrations?.arcaSimplificacion?.descargaConstancias || {};
    if (dc.ultimoDia === hoy) continue;
    const cfg = configDe({ hora: dc.hora ?? 15, minuto: dc.minuto ?? 0 });
    if (!yaPasoLaHora(cfg)) continue;
    enCurso.add(id);
    void (async () => {
      try {
        const marcado = await Tenant.updateOne({ _id: t._id, [`${BASE}.ultimoDia`]: { $ne: hoy } }, { $set: { [`${BASE}.ultimoDia`]: hoy } });
        if (marcado.modifiedCount === 0) return;
        console.log(`[descarga-constancias] ${id}: corrida de las ${horaTexto(cfg)} del ${hoy}`);
        const resumen = await correrDescargaConstanciasDelDia(id, t._id, id, hoy);
        await Tenant.updateOne({ _id: t._id }, { $set: { [`${BASE}.ultimaCorrida`]: resumen } });
        console.log(`[descarga-constancias] ${id}: ${resumen.empresas.map((e) => `${e.empresa} ${e.error ? `error: ${e.error}` : `${e.listas}/${e.pedidas} bajada(s)`}`).join(" · ") || "nada pendiente"}`);
      } catch (e: any) {
        console.error(`[descarga-constancias] ${id}:`, e?.message || e);
        await Tenant.updateOne({ _id: t._id }, { $set: { [`${BASE}.ultimaCorrida`]: { fecha: new Date().toISOString(), dia: hoy, empresas: [], error: String(e?.message || e) } } }).catch(() => {});
      } finally {
        enCurso.delete(id);
      }
    })();
  }
}

export function initDescargaConstanciasScheduler(): void {
  setTimeout(() => void tick(), 20_000);
  setInterval(() => void tick(), TICK_MS);
  console.log("[descarga-constancias] programada: todos los días a la hora configurada por cada tenant (Argentina), para los que la tengan activa");
}
