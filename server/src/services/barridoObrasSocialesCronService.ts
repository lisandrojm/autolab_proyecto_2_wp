import { Tenant } from "../models/Tenant.js";
import { validacionAutomaticaActiva } from "./arca/colaObrasSociales.js";
import { barrerTenant } from "./arca/barridoObrasSociales.js";

/**
 * EL RELOJ DEL BARRIDO DE OBRAS SOCIALES (ver `arca/barridoObrasSociales.ts`): cada
 * `ARCA_BARRIDO_OS_MIN` minutos (10), por tenant con credenciales de ARCA, valida lo que quedó sin
 * validar. Mismo patrón que las otras tareas: un `setInterval` corto que decide si le toca.
 *
 * Se apaga entero con `ARCA_VALIDACION_AUTOMATICA=0` (el server local), igual que la cola: el local no
 * tiene que abrir una sesión de ARCA al lado de la del VPS.
 */

const TICK_MS = 60_000;
const enCurso = new Set<string>();
const ultimaPasada = new Map<string, number>();

const cadaMs = (): number => {
  const n = Number(String(process.env.ARCA_BARRIDO_OS_MIN ?? "").trim() || 10);
  return (Number.isFinite(n) && n > 0 ? n : 10) * 60_000;
};

/** Cuándo vuelve a pasar el barrido por un tenant (para la pantalla). */
export const proximoBarridoDe = (tenantId: string): Date => new Date((ultimaPasada.get(tenantId) || Date.now()) + cadaMs());

async function tick() {
  if (!validacionAutomaticaActiva()) return;
  let tenants: any[] = [];
  try {
    tenants = await Tenant.find({ "integrations.arcaSimplificacion.claveEnc": { $exists: true, $ne: "" } })
      .select("_id")
      .lean();
  } catch (e: any) {
    console.error("[barrido-obras-sociales] no se pudo leer los tenants:", e?.message || e);
    return;
  }
  const ahora = Date.now();
  for (const t of tenants) {
    const id = String(t._id);
    if (enCurso.has(id)) continue;
    if (ahora - (ultimaPasada.get(id) || 0) < cadaMs()) continue;
    enCurso.add(id);
    void (async () => {
      try {
        const r = await barrerTenant(id, t._id, (l) => console.log(`[barrido-obras-sociales] ${id}: ${l}`));
        // Con ARCA ocupada no se marca la pasada: se vuelve a probar en el próximo minuto.
        if (r.resultado !== "ocupado") ultimaPasada.set(id, Date.now());
      } finally {
        enCurso.delete(id);
      }
    })();
  }
}

export function initBarridoObrasSocialesScheduler(): void {
  setTimeout(() => void tick(), 45_000);
  setInterval(() => void tick(), TICK_MS);
  console.log(`[barrido-obras-sociales] programado cada ${Math.round(cadaMs() / 60_000)} min, para los tenants con credenciales de ARCA`);
}
