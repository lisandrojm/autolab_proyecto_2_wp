import { revisarTodas } from "./paritariasVigilanciaService.js";
/**
 * La rutina diaria de vigilancia de paritarias.
 *
 * UNA VEZ POR DÍA, TEMPRANO. Bajar tres páginas y comparar hashes es barato, pero las paritarias se
 * publican sin aviso previo y sin horario: consultar más seguido no adelanta nada y es descortés con
 * sitios de entidades gremiales de los que dependemos y que no nos deben nada.
 *
 * Temprano porque el valor está en que quien abre WeProdu a la mañana ya vea el aviso: un acuerdo
 * publicado el martes tiene que estar en la pantalla el miércoles al empezar el día.
 */
/** A qué hora corre, hora local del server. */
const HORA = 6;
const MINUTO = 30;
/** Cada cuánto se FIJA si ya es la hora. No es el intervalo de revisión. */
const TICK_MS = 5 * 60 * 1000;
/** El último día que ya se revisó, como "2026-08-29". */
let ultimoDiaCorrido = "";
const hoyLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const initParitariasScheduler = () => {
    console.log("[PARITARIAS-CRON] Initializing scheduler...");
    const tick = async () => {
        const hoy = hoyLocal();
        if (ultimoDiaCorrido === hoy)
            return;
        const ahora = new Date();
        if (ahora.getHours() < HORA || (ahora.getHours() === HORA && ahora.getMinutes() < MINUTO))
            return;
        /*
          Se marca el día ANTES de correr, no después.
    
          Si se marcara al terminar y la corrida falla a la mitad, el próximo tick volvería a intentarlo
          —y el siguiente, y el siguiente— machacando los sitios de las entidades cada cinco minutos
          hasta que alguien lo note. Una revisión perdida se recupera mañana; un bucle de reintentos
          contra un sitio de terceros se paga con un bloqueo.
        */
        ultimoDiaCorrido = hoy;
        try {
            const resultados = await revisarTodas();
            const nuevas = resultados.reduce((a, r) => a + r.nuevas, 0);
            const conProblema = resultados.filter((r) => r.resultado !== "ok");
            // Queda registro de CADA revisión, con o sin novedades: «no encontró nada» y «no corrió» se
            // ven igual en un log que solo escribe cuando hay algo.
            console.log(`[PARITARIAS-CRON] ${resultados.length} fuente(s) revisada(s) · ${nuevas} publicación(es) nueva(s) · ${conProblema.length} con problema`);
            for (const r of resultados) {
                console.log(`[PARITARIAS-CRON]   ${r.nombre}: ${r.resultado} · ${r.enlaces} enlace(s) · ${r.nuevas} nueva(s)${r.lineaBase ? " (línea de base)" : ""}${r.error ? ` · ${r.error}` : ""}${r.aviso ? ` · ⚠ ${r.aviso}` : ""}`);
            }
        }
        catch (e) {
            console.error("[PARITARIAS-CRON] Falló la corrida diaria:", e?.message || e);
        }
    };
    setInterval(() => {
        tick().catch((e) => console.error("[PARITARIAS-CRON] Tick error:", e));
    }, TICK_MS);
};
