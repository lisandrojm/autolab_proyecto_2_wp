import { hoyArgentina } from "../utils/contratoVigencia.js";
import { barridoDiarioDeCambiosDeTurno } from "./pedidoCambioDeTurno.js";
/*
  CAMBIOS DE TURNO: UNA VEZ POR DÍA (26/11/2026). Mismo esquema que `transicionEstadoContratos.ts`: se
  despierta cada 30 minutos y el primer tick de cada día (hora de Argentina) corre el barrido, que aplica
  los cambios aprobados cuya `fechaDesde` llegó y devuelve a su turno a quien terminó un cambio temporal.
  Se registra en `server.ts` dentro del bloque que `SIN_TAREAS_PROGRAMADAS` apaga.
*/
const CADA_MS = 30 * 60_000;
let ultimoDia = "";
let enCurso = false;
async function tick() {
    if (enCurso)
        return;
    const hoy = hoyArgentina();
    if (ultimoDia === hoy)
        return;
    enCurso = true;
    try {
        const r = await barridoDiarioDeCambiosDeTurno(hoy);
        ultimoDia = hoy;
        console.log(`[cambio-turno] ${hoy}: ${r.aplicados} aplicados, ${r.revertidos} revertidos, ${r.fallos} con fallo`);
    }
    catch (e) {
        console.error("[cambio-turno] falló el barrido diario:", e?.message || e);
    }
    finally {
        enCurso = false;
    }
}
export function initCambioTurnoScheduler() {
    setTimeout(() => void tick(), 150_000);
    setInterval(() => void tick(), CADA_MS);
    console.log("[cambio-turno] programado: barrido diario de cambios de turno (cada 30 min, corre una vez por día)");
}
