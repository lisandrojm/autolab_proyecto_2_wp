/**
 * EL RELOJ DE LAS AUTOMATIZACIONES DE CONTRATACIÓN (ver `config.ts`): cada minuto, para cada tenant que
 * prendió alguna, si pasó su frecuencia desde la última corrida, corre. Mismo patrón que las otras
 * tareas del servidor (`presentacionAutomaticaCronService.ts`, `dropboxSignBot/cron.ts`): un
 * `setInterval` corto que decide si le toca, y un candado entre procesos con un `updateOne`
 * condicional sobre `ultimaCorridaAt` ANTES de correr (dos instancias no arrancan la misma corrida).
 *
 * Una corrida que falla deja `ultimoError` y espera su frecuencia: no golpea a Dropbox ni a ARCA cada
 * minuto. «Correr ahora» desde la pantalla pasa por `correrAhora`, con el mismo candado.
 */
import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { BASE, CLAVES, ClaveAutomatizacion, configDe, FRECUENCIAS_MINUTOS, leToca, proximaCorrida } from "./config.js";
import { correrGeneracionDocumentos } from "./generacionDocumentos.js";
import { correrValidacionCuit } from "./validacionCuit.js";

const TICK_MS = 60_000;
const enCurso = new Set<string>();
const candado = (tenantId: string, clave: ClaveAutomatizacion) => `${tenantId}:${clave}`;

const correrDe: Record<ClaveAutomatizacion, (tenantObjectId: Types.ObjectId, log: (l: string) => void) => Promise<any>> = {
  generacionDocumentos: correrGeneracionDocumentos,
  validacionCuit: correrValidacionCuit,
};

/** Corre una automatización para un tenant y deja el resumen (o el error) en el tenant. */
async function correr(tenantObjectId: Types.ObjectId, clave: ClaveAutomatizacion, origen: "reloj" | "a mano"): Promise<any> {
  const id = String(tenantObjectId);
  const etiqueta = `[automatizaciones-contratacion] ${id} ${clave}`;
  console.log(`${etiqueta}: corrida ${origen}`);
  try {
    const resumen = await correrDe[clave](tenantObjectId, (l) => console.log(`${etiqueta}: ${l}`));
    await Tenant.updateOne({ _id: tenantObjectId }, { $set: { [`${BASE}.${clave}.ultimaCorrida`]: { ...resumen, origen }, [`${BASE}.${clave}.ultimoError`]: "" } });
    console.log(`${etiqueta}: ${JSON.stringify({ ...resumen, paraResolver: resumen.paraResolver?.length, errores: resumen.errores?.length })}`);
    return resumen;
  } catch (e: any) {
    const mensaje = e?.message || String(e);
    await Tenant.updateOne({ _id: tenantObjectId }, { $set: { [`${BASE}.${clave}.ultimoError`]: mensaje } }).catch(() => {});
    console.error(`${etiqueta}: falló: ${mensaje}`);
    throw e;
  }
}

async function tick() {
  let tenants: any[] = [];
  try {
    tenants = await Tenant.find({ $or: CLAVES.map((c) => ({ [`${BASE}.${c}.activa`]: true })) })
      .select(`_id ${BASE}`)
      .lean();
  } catch (e: any) {
    console.error("[automatizaciones-contratacion] no se pudo leer los tenants:", e?.message || e);
    return;
  }
  const ahora = new Date();
  for (const t of tenants) {
    const guardadas = t.integrations?.automatizacionesContratacion || {};
    for (const clave of CLAVES) {
      const cfg = configDe(guardadas[clave], clave);
      if (!leToca(cfg, guardadas[clave]?.ultimaCorridaAt, ahora)) continue;
      const k = candado(String(t._id), clave);
      if (enCurso.has(k)) continue;
      enCurso.add(k);
      void (async () => {
        try {
          // Candado entre procesos: sólo quien logra escribir `ultimaCorridaAt` corre.
          const limite = new Date(ahora.getTime() - cfg.cadaMinutos * 60_000);
          const marcado = await Tenant.updateOne(
            { _id: t._id, $or: [{ [`${BASE}.${clave}.ultimaCorridaAt`]: null }, { [`${BASE}.${clave}.ultimaCorridaAt`]: { $lte: limite } }] },
            { $set: { [`${BASE}.${clave}.ultimaCorridaAt`]: ahora } },
          );
          if (marcado.modifiedCount === 0) return;
          await correr(t._id, clave, "reloj").catch(() => {});
        } finally {
          enCurso.delete(k);
        }
      })();
    }
  }
}

export function initAutomatizacionesContratacionScheduler(): void {
  console.log("[automatizaciones-contratacion] reloj iniciado (cada minuto mira qué tenant tiene una corrida pendiente).");
  setInterval(() => void tick(), TICK_MS);
}

/** «Correr ahora» desde la pantalla. Si ya hay una corrida en curso en este proceso, lo dice. */
export async function correrAhora(tenantObjectId: Types.ObjectId, clave: ClaveAutomatizacion): Promise<any> {
  const k = candado(String(tenantObjectId), clave);
  if (enCurso.has(k)) throw new Error("Ya hay una corrida en curso: esperá a que termine.");
  enCurso.add(k);
  try {
    await Tenant.updateOne({ _id: tenantObjectId }, { $set: { [`${BASE}.${clave}.ultimaCorridaAt`]: new Date() } });
    return await correr(tenantObjectId, clave, "a mano");
  } finally {
    enCurso.delete(k);
  }
}

/** Lo que la pantalla muestra de una automatización. */
export function estadoDe(tenant: any, clave: ClaveAutomatizacion, ahora: Date = new Date()) {
  const g = tenant?.integrations?.automatizacionesContratacion?.[clave] || {};
  const cfg = configDe(g, clave);
  return {
    ...cfg,
    ultimaCorridaAt: g.ultimaCorridaAt || null,
    ultimaCorrida: g.ultimaCorrida || null,
    ultimoError: g.ultimoError || "",
    proximaAt: proximaCorrida(cfg, g.ultimaCorridaAt, ahora),
    enCurso: enCurso.has(candado(String(tenant?._id), clave)),
    frecuencias: [...FRECUENCIAS_MINUTOS],
  };
}
