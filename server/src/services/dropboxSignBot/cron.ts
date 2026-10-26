import { Tenant } from "../../models/Tenant.js";
import { arrancarCorridaEnvio, configDelTenant } from "./corridaEnvio.js";
import { puedeCorrer } from "./planificador.js";
import { quienTieneDropboxSign } from "./candado.js";

/**
 * EL SCHEDULER DEL ENVÍO AUTOMÁTICO A LA FIRMA (patrón `presentacionAutomaticaCronService.ts`): cada
 * minuto, para cada tenant con `bot.envio.activo`, si pasaron `intervaloHoras` desde la última
 * corrida, hay cupo diario, es dentro de la ventana horaria (hora de Argentina) y no hay enfriamiento,
 * dispara una tanda. El candado entre procesos es un `updateOne` condicional sobre `ultimaCorridaAt`
 * ANTES de correr: dos instancias no arrancan la misma tanda.
 */
const BASE = "integrations.dropboxSign.bot";
const TICK_MS = 60_000;

async function tick(): Promise<void> {
  const tenants: any[] = await Tenant.find({ [`${BASE}.envio.activo`]: true }).select("_id").lean();
  for (const t of tenants) {
    const tenantId = String(t._id);
    if (quienTieneDropboxSign(tenantId)) continue;
    try {
      const { config, estado } = await configDelTenant(tenantId);
      const ahora = new Date();
      if (!puedeCorrer(config, estado, ahora).ok) continue;
      // Candado entre procesos: sólo quien logra escribir `ultimaCorridaAt` corre.
      const limite = new Date(ahora.getTime() - config.intervaloHoras * 3600_000);
      const previo: any = await Tenant.findOneAndUpdate(
        { _id: t._id, $or: [{ [`${BASE}.ultimaCorridaAt`]: null }, { [`${BASE}.ultimaCorridaAt`]: { $lt: limite } }] },
        { $set: { [`${BASE}.ultimaCorridaAt`]: ahora } },
        { new: false, projection: { [`${BASE}.ultimaCorridaAt`]: 1 } },
      ).lean();
      if (!previo) continue;
      try {
        // `yaReservada` adentro: el candado que se acaba de escribir no cuenta como «la última corrida».
        await arrancarCorridaEnvio(tenantId, { automatica: true });
        console.log(`[DROPBOX-SIGN-BOT] Tanda automática arrancada para el tenant ${tenantId}.`);
      } catch (e) {
        // NO ARRANCÓ (26/10/2026): se devuelve `ultimaCorridaAt` a lo que era. Antes quedaba escrita y el
        // panel decía «Todavía no pasaron 4 h» para siempre sin que saliera ninguna tanda.
        await Tenant.updateOne({ _id: t._id, [`${BASE}.ultimaCorridaAt`]: ahora }, { $set: { [`${BASE}.ultimaCorridaAt`]: previo?.integrations?.dropboxSign?.bot?.ultimaCorridaAt ?? null } }).catch(() => {});
        throw e;
      }
    } catch (e: any) {
      console.error(`[DROPBOX-SIGN-BOT] No se pudo arrancar la tanda automática del tenant ${tenantId}:`, e?.message || e);
    }
  }
}

export function initDropboxSignEnvioScheduler(): void {
  setTimeout(() => void tick().catch((e) => console.error("[DROPBOX-SIGN-BOT] tick:", e)), 60_000);
  setInterval(() => void tick().catch((e) => console.error("[DROPBOX-SIGN-BOT] tick:", e)), TICK_MS);
  console.log("📝 Envío automático a Dropbox Sign: scheduler iniciado (revisa cada minuto los tenants con el envío activado).");
}
