import { CampaniaVacaciones } from "../models/CampaniaVacaciones.js";
import { barrerCampania } from "./vacaciones/campaniaVacaciones.js";

/**
 * EL RELOJ DE LA CAMPAÑA DE GOCE (15/11/2026): una vez por hora, en cada campaña lanzada, marca como
 * vencidas las invitaciones que pasaron la fecha límite sin elegir (y les sugiere el tramo único que
 * asigna la empresa) y manda el recordatorio automático 2 días antes del vencimiento. Mismo patrón que
 * las otras tareas: `setInterval`, sin solaparse consigo misma.
 */

const CADA_MS = 60 * 60_000;
let enCurso = false;

async function tick() {
  if (enCurso) return;
  enCurso = true;
  try {
    const campanias = await CampaniaVacaciones.find({ estado: "lanzada" });
    for (const c of campanias) {
      try {
        const r = await barrerCampania(c);
        if (r.vencidas || r.recordadas) console.log(`[campania-vacaciones] ${c.nombre} (${c.tenantId}): ${r.vencidas} vencida(s), ${r.recordadas} recordatorio(s)`);
      } catch (e: any) {
        console.error(`[campania-vacaciones] ${c._id}:`, e?.message || e);
      }
    }
  } catch (e: any) {
    console.error("[campania-vacaciones] no se pudo leer las campañas:", e?.message || e);
  } finally {
    enCurso = false;
  }
}

export function initCampaniaVacacionesScheduler(): void {
  setTimeout(() => void tick(), 90_000);
  setInterval(() => void tick(), CADA_MS);
  console.log("[campania-vacaciones] programado cada 60 min (vencimientos y recordatorios de las campañas lanzadas)");
}
