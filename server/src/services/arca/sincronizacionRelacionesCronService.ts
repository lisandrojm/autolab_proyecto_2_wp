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

/*
  REINTENTOS DE LA AUTOMÁTICA (25/10/2026). La corrida de las 06:00 del 25/10 falló al entrar al
  servicio desde el portal (una pestaña que tardó) y el día quedó sin sincronizar hasta que alguien
  apretara «Sincronizar ahora»: la regla era «una por día, falle o no». Ahora, si falla por algo que
  puede andar en un rato, se reintenta hasta MAX_REINTENTOS veces ese mismo día, con una hora de aire.

  NUNCA se reintenta lo que puede bloquear la cuenta o no se arregla solo: clave rechazada, segundo
  factor o captcha, CUIT no reconocido, servicio no delegado. Repetir un login rechazado contra AFIP es
  la forma de que bloqueen la clave fiscal de la empresa.
*/
export const MAX_REINTENTOS = 2;
export const ESPERA_REINTENTO_MS = 60 * 60_000;
const NO_REINTENTAR = /rechaz[oó] la clave|segundo factor|captcha|no reconoce el CUIT|no aparece entre sus servicios|bloque/i;

/** Cuándo reintentar después de una corrida automática, o `null` si no corresponde. Pura: se prueba sin ARCA. */
export function siguienteReintento(error: string | undefined, intentosHechos: number, ahora: Date): { numero: number; desde: Date } | null {
  if (!error) return null;
  if (NO_REINTENTAR.test(error)) return null;
  if (intentosHechos >= MAX_REINTENTOS) return null;
  return { numero: intentosHechos + 1, desde: new Date(ahora.getTime() + ESPERA_REINTENTO_MS) };
}

export const HORA_POR_DEFECTO = "06:00";
export const MESES_POR_DEFECTO = 1;
const enCurso = new Set<string>();

/** "HH:MM" → { hora, minuto }. Lo que no se entiende cae al default. */
export function horaDe(texto: unknown): { hora: number; minuto: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(texto ?? "").trim());
  const h = m ? Number(m[1]) : NaN, mi = m ? Number(m[2]) : NaN;
  if (!m || h < 0 || h > 23 || mi < 0 || mi > 59) return horaDe(HORA_POR_DEFECTO);
  return { hora: h, minuto: mi };
}

export function configSyncDe(guardado: any): { activa: boolean; hora: string; meses: number } {
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
  let tenants: any[] = [];
  try {
    tenants = await Tenant.find({ "integrations.arcaSimplificacion.sincronizacionRelaciones.activa": true })
      .select("_id integrations.arcaSimplificacion.sincronizacionRelaciones")
      .lean();
  } catch (e: any) {
    console.error("[sync-relaciones-arca] no se pudo leer los tenants:", e?.message || e);
    return;
  }
  for (const t of tenants) {
    const id = String(t._id);
    if (enCurso.has(id)) continue;
    const sr = t.integrations?.arcaSimplificacion?.sincronizacionRelaciones || {};
    const cfg = configSyncDe(sr);
    const R = "integrations.arcaSimplificacion.sincronizacionRelaciones";
    // ¿Toca un reintento de hoy? (la corrida del día ya se marcó y falló; ver `siguienteReintento`)
    const re = sr.reintento || {};
    const reintentoPendiente = sr.ultimoDia === hoy && re.dia === hoy && !!re.desde && Date.now() >= new Date(re.desde).getTime();
    if (sr.ultimoDia === hoy && !reintentoPendiente) continue;
    if (!reintentoPendiente && !yaPasoLaHora(horaDe(cfg.hora))) continue;
    enCurso.add(id);
    void (async () => {
      const intentosHechos = reintentoPendiente ? Number(re.numero) || 0 : 0;
      try {
        /*
          El filtro hace de candado entre procesos: la corrida del día se toma marcando `ultimoDia`; un
          reintento, borrando su `desde` (así ningún otro proceso lo toma dos veces).
        */
        const marcado = reintentoPendiente
          ? await Tenant.updateOne({ _id: t._id, [`${R}.reintento.desde`]: re.desde }, { $set: { [`${R}.reintento.desde`]: null } })
          : await Tenant.updateOne({ _id: t._id, [`${R}.ultimoDia`]: { $ne: hoy } }, { $set: { [`${R}.ultimoDia`]: hoy }, $unset: { [`${R}.reintento`]: "" } });
        if (marcado.modifiedCount === 0) return;
        console.log(`[sync-relaciones-arca] ${id}: ${reintentoPendiente ? `reintento ${intentosHechos} de ${MAX_REINTENTOS}` : `corrida de las ${cfg.hora}`} del ${hoy} (${cfg.meses} mes/es)`);
        const resumen = await sincronizarRelacionesTenant(id, { meses: cfg.meses, automatica: true });
        console.log(`[sync-relaciones-arca] ${id}: ${resumen.error ? `error: ${resumen.error}` : resumen.empresas.map((e) => `${e.razonSocial} ${e.error ? `error: ${e.error}` : `${e.nuevas} nuevas / ${e.actualizadas} actualizadas`}`).join(" · ")}`);
        await programarReintento(t._id, hoy, resumen.error, intentosHechos);
      } catch (e: any) {
        if (e instanceof CandadoArcaOcupado) {
          // ARCA está ocupada: se devuelve lo tomado para volver a probar en el próximo tick.
          const deshacer = reintentoPendiente ? { $set: { [`${R}.reintento.desde`]: re.desde } } : { $unset: { [`${R}.ultimoDia`]: "" } };
          await Tenant.updateOne({ _id: t._id }, deshacer).catch(() => {});
          return;
        }
        console.error(`[sync-relaciones-arca] ${id}:`, e?.message || e);
        await programarReintento(t._id, hoy, String(e?.message || e), intentosHechos).catch(() => {});
      } finally {
        enCurso.delete(id);
      }
    })();
  }
}

/** Deja agendado el próximo reintento del día, o lo borra si salió bien o no corresponde. */
async function programarReintento(tenantId: unknown, hoy: string, error: string | undefined, intentosHechos: number): Promise<void> {
  const R = "integrations.arcaSimplificacion.sincronizacionRelaciones";
  const sig = siguienteReintento(error, intentosHechos, new Date());
  if (sig) {
    await Tenant.updateOne({ _id: tenantId }, { $set: { [`${R}.reintento`]: { dia: hoy, numero: sig.numero, desde: sig.desde } } });
    console.log(`[sync-relaciones-arca] ${String(tenantId)}: reintento ${sig.numero} de ${MAX_REINTENTOS} a las ${sig.desde.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" })}`);
  } else {
    await Tenant.updateOne({ _id: tenantId }, { $unset: { [`${R}.reintento`]: "" } });
  }
}

export function initSincronizacionRelacionesScheduler(): void {
  setTimeout(() => void tick(), 20_000);
  setInterval(() => void tick(), TICK_MS);
  console.log("[sync-relaciones-arca] programada: todos los días a la hora configurada por cada tenant (Argentina), para los que la tengan activa");
}
