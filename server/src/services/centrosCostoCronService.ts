import { sincronizarCentrosCostoDesdeTango } from "./centrosCostoSync.js";
import { TangoApi } from "./tangoApi.js";

/*
  LA SINCRONIZACIÓN DIARIA DEL CATÁLOGO DE CENTROS DE COSTO.

  UNA VEZ POR DÍA, TEMPRANO, con el mismo patrón que la vigilancia de paritarias: un tick cada cinco
  minutos que mira si ya es la hora, y una marca del día para no repetir.

  Temprano porque un centro nuevo se crea en Tango en cualquier momento y lo que importa es que quien
  abre WeProdu a la mañana ya lo tenga para elegir. Más seguido no aporta: el catálogo cambia de a un
  centro por semana, y son tres consultas a sistemas de terceros.

  SI TANGO NO ESTÁ CONFIGURADO, NO CORRE NADA y se dice una vez. Un scheduler que falla cada cinco
  minutos contra una URL vacía llena el log de ruido y esconde los errores que sí importan.
*/

const HORA = 6;
const MINUTO = 45;
const TICK_MS = 5 * 60 * 1000;

let ultimoDiaCorrido = "";

const hoyLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const initCentrosCostoScheduler = () => {
  if (!TangoApi.configurada()) {
    console.log("[CENTROS-COSTO-CRON] Sin TANGO_API_URL: la sincronización diaria queda apagada.");
    return;
  }
  console.log(`[CENTROS-COSTO-CRON] Sincronización diaria a las ${HORA}:${String(MINUTO).padStart(2, "0")}.`);

  const tick = async () => {
    const hoy = hoyLocal();
    if (ultimoDiaCorrido === hoy) return;
    const ahora = new Date();
    if (ahora.getHours() < HORA || (ahora.getHours() === HORA && ahora.getMinutes() < MINUTO)) return;

    // Se marca ANTES de correr: si falla, se reintenta mañana y no cada cinco minutos contra Tango.
    ultimoDiaCorrido = hoy;

    try {
      const r = await sincronizarCentrosCostoDesdeTango();
      const conError = r.empresas.filter((e) => !e.ok);
      console.log(`[CENTROS-COSTO-CRON] ${r.empresas.length} empresa(s) · ${r.totalCatalogo} centros en el catálogo${conError.length > 0 ? ` · ${conError.length} con problema` : ""}`);
      for (const e of conError) console.warn(`[CENTROS-COSTO-CRON]   ${e.empresa}: ${e.errores[0] || "sin detalle"}`);
    } catch (e: any) {
      console.error("[CENTROS-COSTO-CRON] Falló la corrida diaria:", e?.message || e);
    }
  };

  setInterval(() => {
    tick().catch((e) => console.error("[CENTROS-COSTO-CRON] Tick error:", e));
  }, TICK_MS);
};
