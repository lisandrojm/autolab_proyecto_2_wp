import { Tenant } from "../models/Tenant.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
import { candidatosDeAlta, correrPresentacionAutomatica } from "./arca/presentacionAutomatica.js";
import { configDe, diaArgentina, horaTexto, leTocaALaCola, yaPasoLaHora } from "./arca/horarioAltasAutomaticas.js";
import { itemDe, verificarAltasEnArca } from "./arca/verificacionAltas.js";

/**
 * EL HORARIO DE LA PRESENTACIÓN AUTOMÁTICA (ver `arca/presentacionAutomatica.ts` y
 * `arca/horarioAltasAutomaticas.ts`):
 *   · LA CORRIDA DEL DÍA: a la hora que configuró cada tenant (14:00 argentinas por defecto), una vez por
 *     día. Presenta primero las altas de ese día y después la cola de atrasadas.
 *   · LA COLA (modo frecuente): cada `cadaMinutos`, lo que ya tuvo su turno y no salió. Si la hora del
 *     día llega mientras corre, corta entre lotes y la del día arranca en el tick siguiente.
 *
 * Mismo patrón que las otras tareas del servidor: un `setInterval` que mira la hora. La hora es la de
 * Argentina y no la del VPS (puede estar en UTC). Si el servidor estuvo caído a la hora del día, corre
 * apenas vuelve, siempre que siga siendo el mismo día.
 *
 * Cada corrida se marca ANTES de presentar (`ultimoDia` / `ultimaCola`), con un filtro que hace de
 * candado entre procesos: una corrida que falla siempre —sin credenciales, por ejemplo— no golpea ARCA
 * cada minuto, y la cola espera su frecuencia.
 *
 * Sólo los tenants que la prendieron (`integrations.arcaSimplificacion.presentacionAutomatica.activa`).
 */

const TICK_MS = 60_000;
const BASE = "integrations.arcaSimplificacion.presentacionAutomatica";
const enCurso = new Set<string>();

async function tick() {
  const hoy = hoyArgentina();
  let tenants: any[] = [];
  try {
    tenants = await Tenant.find({ [`${BASE}.activa`]: true })
      .select(`_id ${BASE}`)
      .lean();
  } catch (e: any) {
    console.error("[presentacion-automatica] no se pudo leer los tenants:", e?.message || e);
    return;
  }
  for (const t of tenants) {
    const id = String(t._id);
    if (enCurso.has(id)) continue;
    const pa = t.integrations?.arcaSimplificacion?.presentacionAutomatica || {};
    const cfg = configDe(pa);
    const ahora = new Date();
    const delDiaPendiente = pa.ultimoDia !== hoy;
    const tipo: "dia" | "cola" | null = delDiaPendiente && yaPasoLaHora(cfg, ahora) ? "dia" : leTocaALaCola(cfg, pa.ultimaCola, ahora) ? "cola" : null;
    if (!tipo) continue;
    enCurso.add(id);
    void (async () => {
      const campoResumen = tipo === "dia" ? "ultimaCorrida" : "ultimaCorridaCola";
      try {
        // La del día también cuenta como pasada de la cola: la cola espera su frecuencia desde acá.
        const marcado =
          tipo === "dia"
            ? await Tenant.updateOne({ _id: t._id, [`${BASE}.ultimoDia`]: { $ne: hoy } }, { $set: { [`${BASE}.ultimoDia`]: hoy, [`${BASE}.ultimaCola`]: ahora.toISOString() } })
            : await Tenant.updateOne({ _id: t._id, [`${BASE}.ultimaCola`]: pa.ultimaCola ?? { $exists: false } }, { $set: { [`${BASE}.ultimaCola`]: ahora.toISOString() } });
        if (marcado.modifiedCount === 0) return;
        console.log(`[presentacion-automatica] ${id}: ${tipo === "dia" ? `corrida del día, ${horaTexto(cfg)} del ${hoy} (anticipación ${cfg.diasAntes} día/s)` : `cola (cada ${cfg.cadaMinutos} min)`}`);
        // La cola le deja el paso a la del día: si llega su hora mientras corre, corta entre lotes.
        const debeCortar = tipo === "cola" ? () => delDiaPendiente && yaPasoLaHora(cfg) : undefined;
        const resumen: any = await correrPresentacionAutomatica(id, t._id, cfg, tipo, { debeCortar });
        if (tipo === "dia") resumen.verificaciones = await verificarTrabadas(id, t._id, hoy);
        await Tenant.updateOne({ _id: t._id }, { $set: { [`${BASE}.${campoResumen}`]: resumen } });
        console.log(`[presentacion-automatica] ${id} (${tipo}): ${resumen.empresas.map((e) => `${e.empresa} ${e.error ? `error: ${e.error}` : `${e.enviados} enviada(s)`}`).join(" · ") || "nada para presentar"}; ${resumen.omitidos.length} sin presentar`);
      } catch (e: any) {
        console.error(`[presentacion-automatica] ${id} (${tipo}):`, e?.message || e);
        await Tenant.updateOne({ _id: t._id }, { $set: { [`${BASE}.${campoResumen}`]: { fecha: new Date().toISOString(), dia: hoy, tipo, empresas: [], omitidos: [], error: String(e?.message || e) } } }).catch(() => {});
      } finally {
        enCurso.delete(id);
      }
    })();
  }
}

/** Tope de verificaciones por corrida del día: las que sobran se miran mañana (como la descarga de constancias). */
const MAX_VERIFICACIONES = 40;

/**
 * DESPUÉS DE LA CORRIDA DEL DÍA, se verifican en ARCA las altas trabadas por «ARCA ya tiene un alta de ese
 * día» (ver `arca/verificacionAltas.ts`): una vez por día cada una, así una que quedó en revisión manual no
 * consulta ARCA en cada pasada. Un error acá no toca el resumen de lo presentado.
 */
async function verificarTrabadas(tenantId: string, tenantObjectId: any, hoy: string) {
  try {
    const candidatos = await candidatosDeAlta(tenantObjectId);
    const items = candidatos.filter((c) => c.verificable && !(c.verificacion && diaArgentina(new Date(c.verificacion.el)) === hoy)).slice(0, MAX_VERIFICACIONES);
    if (items.length === 0) return [];
    const r = await verificarAltasEnArca({ tenantId, tenantObjectId, items: items.map(itemDe), automatica: true });
    return r.map((x) => ({ nombre: x.item.nombre, cuil: x.item.cuil, empresa: x.item.empresaRazonSocial, alta: x.item.alta, resultado: x.decision.accion, accion: x.accion, motivo: x.decision.motivo }));
  } catch (e: any) {
    console.error(`[presentacion-automatica] ${tenantId}: la verificación de altas trabadas falló:`, e?.message || e);
    return [{ nombre: "", cuil: "", empresa: "", alta: "", resultado: "error", accion: "error", motivo: String(e?.message || e) }];
  }
}

export function initPresentacionAutomaticaScheduler(): void {
  setTimeout(() => void tick(), 15_000);
  setInterval(() => void tick(), TICK_MS);
  console.log("[presentacion-automatica] programada: la corrida del día a la hora de cada tenant (Argentina) y, en modo frecuente, la cola cada N minutos");
}
