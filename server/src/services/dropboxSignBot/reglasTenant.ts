import { Tenant } from "../../models/Tenant.js";
import { REGLAS_BASE, validarReglas, type ReglaColocacion } from "../../compartido/reglasColocacionFirma.js";

/**
 * LAS REGLAS DE COLOCACIÓN DE CADA TENANT. El catálogo de `compartido/reglasColocacionFirma.ts` es el
 * de fábrica; lo que la UI edita se guarda entero en `integrations.dropboxSign.bot.reglasColocacion`
 * (patrones como texto). Si no hay nada guardado, o lo guardado no pasa la validación, rige el catálogo.
 */
const BASE = "integrations.dropboxSign.bot";

export interface ReglasDelTenant {
  reglas: ReglaColocacion[];
  /** Hay una copia editada guardada (si no, rige el catálogo de fábrica). */
  personalizadas: boolean;
  actualizadasAt: Date | null;
}

export async function reglasDelTenant(tenantId: string): Promise<ReglasDelTenant> {
  const t: any = await Tenant.findById(tenantId).select(`${BASE}.reglasColocacion ${BASE}.reglasColocacionAt`).lean();
  const bot = t?.integrations?.dropboxSign?.bot || {};
  const guardadas = bot.reglasColocacion;
  if (Array.isArray(guardadas) && guardadas.length > 0) {
    const v = validarReglas(guardadas);
    if (v.ok === true) return { reglas: v.reglas, personalizadas: true, actualizadasAt: bot.reglasColocacionAt ? new Date(bot.reglasColocacionAt) : null };
    console.warn(`[DROPBOX-SIGN-BOT] Las reglas de colocación guardadas del tenant ${tenantId} no pasan la validación (${v.error}): rige el catálogo.`);
  }
  return { reglas: REGLAS_BASE, personalizadas: false, actualizadasAt: null };
}

/** Guarda la lista entera (validada). Con `null` se vuelve al catálogo de fábrica. */
export async function guardarReglasDelTenant(tenantId: string, entrada: unknown | null): Promise<ReglasDelTenant> {
  if (entrada === null) {
    await Tenant.updateOne({ _id: tenantId }, { $unset: { [`${BASE}.reglasColocacion`]: "", [`${BASE}.reglasColocacionAt`]: "" } });
    return { reglas: REGLAS_BASE, personalizadas: false, actualizadasAt: null };
  }
  const v = validarReglas(entrada);
  if (v.ok === false) throw Object.assign(new Error(v.error), { status: 400 });
  const ahora = new Date();
  await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.reglasColocacion`]: v.reglas, [`${BASE}.reglasColocacionAt`]: ahora } });
  return { reglas: v.reglas, personalizadas: true, actualizadasAt: ahora };
}
