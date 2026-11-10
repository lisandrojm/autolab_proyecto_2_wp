/**
 * LA FILA DE DESCARGAS ENCADENADAS A LAS PRESENTACIONES (11/11/2026). Sin base, sin ARCA: lo que toca
 * el mundo entra por `DepsColaEncadenada`, así se prueba en memoria (`colaEncadenada.test.ts`). El
 * cableado real está en `descargaEncadenada.ts`.
 *
 * POR QUÉ. Las altas se presentan a las 00:05 y las constancias se bajaban en otra corrida, a las
 * 15:00: para entonces la jornada ya terminó y ARCA emite la constancia como «baja». Ahora, apenas una
 * corrida de altas termina, las que ARCA aceptó se encolan acá y se bajan enseguida, con la relación
 * todavía activa. El cron diario queda como barrido de lo que no salió.
 *
 * LAS REGLAS:
 *   · NUNCA DOS CORRIDAS DE ARCA A LA VEZ. La descarga espera a que el candado esté libre (`libre`), y
 *     si otra corrida se lo gana en el medio, vuelve a esperar. Una por vez, en el orden en que llegaron.
 *   · LAS PRESENTACIONES VAN PRIMERO. Mientras haya una fila de presentaciones en marcha (varias
 *     empleadoras, las atrasadas después de las del día), la descarga espera: presentar no se deshace y
 *     tiene hora; bajar sólo lee. Ver `conPresentacionesEnFila`.
 *   · SIN TOPE DIARIO: el lote es la tanda que se acaba de presentar.
 *   · NADA DOS VECES: lo que ya está en la fila no se vuelve a encolar, y al arrancar la descarga se
 *     vuelve a mirar `constancias_arca` (lo que ya tiene constancia no se pide).
 *   · SI NO PUEDE (el candado no se libera, ARCA falla), los ítems quedan como estaban y los levanta el
 *     barrido diario. La encadenada es una mejora, no el único camino.
 */
const claveItem = (i) => `${i.userProjectId}:${Number(i.contractIndex)}`;
export function crearColaEncadenada(dep) {
    const filas = new Map();
    const trabajando = new Set();
    const ahora = dep.ahora || (() => Date.now());
    const paso = dep.pasoMs ?? 5000;
    const plazoLibre = dep.plazoLibreMs ?? 3 * 60 * 60_000;
    const plazoFin = dep.plazoFinMs ?? 90 * 60_000;
    const filaDe = (tenantId) => filas.get(tenantId) || [];
    async function bajar(t) {
        const limite = ahora() + plazoLibre;
        let pedidas = 0;
        for (;;) {
            while (!dep.libre(t.tenantId)) {
                if (ahora() > limite)
                    return { resultado: "sin_turno", detalle: "ARCA estuvo ocupada con otra corrida: quedan para el barrido diario." };
                await dep.esperar(paso);
            }
            try {
                pedidas = (await dep.arrancar(t)).total;
                break;
            }
            catch (e) {
                // Otra corrida tomó la sesión entre que se miró y se arrancó: se vuelve a esperar, no se pisa.
                if (dep.esOcupado(e)) {
                    if (ahora() > limite)
                        return { resultado: "sin_turno", detalle: "ARCA estuvo ocupada con otra corrida: quedan para el barrido diario." };
                    await dep.esperar(paso);
                    continue;
                }
                return { resultado: "nada", detalle: String(e?.message || e) };
            }
        }
        t.estado = "bajando";
        const fin = ahora() + plazoFin;
        while (dep.corriendo(t.tenantId)) {
            if (ahora() > fin)
                return { resultado: "error", detalle: "La descarga no terminó a tiempo: lo que faltó queda para el barrido diario." };
            await dep.esperar(paso);
        }
        return { resultado: "bajada", pedidas };
    }
    async function trabajar(tenantId) {
        if (trabajando.has(tenantId))
            return;
        trabajando.add(tenantId);
        try {
            for (;;) {
                const t = filaDe(tenantId)[0];
                if (!t)
                    break;
                let r;
                try {
                    r = await bajar(t);
                }
                catch (e) {
                    r = { resultado: "error", detalle: String(e?.message || e) };
                }
                filaDe(tenantId).shift();
                dep.alTerminar?.(t, r);
            }
            await dep.alVaciarse?.(tenantId).catch(() => { });
        }
        finally {
            trabajando.delete(tenantId);
            // Llegó otra tanda mientras se cerraba: se sigue.
            if (filaDe(tenantId).length > 0)
                void trabajar(tenantId);
        }
    }
    return {
        /**
         * Encola la descarga de las altas recién presentadas de una tanda y vuelve enseguida. `apagada`: el
         * tenant no baja al presentar (las levanta el barrido). `vacia`: nada nuevo que encolar.
         */
        async encolar(t) {
            if (t.items.length === 0)
                return "vacia";
            if (!(await dep.activa(t.tenantId)))
                return "apagada";
            const yaEnFila = new Set(filaDe(t.tenantId).flatMap((x) => x.items.map(claveItem)));
            const items = t.items.filter((i, n, todos) => !yaEnFila.has(claveItem(i)) && todos.findIndex((x) => claveItem(x) === claveItem(i)) === n);
            if (items.length === 0)
                return "vacia";
            if (!filas.has(t.tenantId))
                filas.set(t.tenantId, []);
            filas.get(t.tenantId).push({ ...t, items, encoladaEl: new Date(ahora()), estado: "en_fila" });
            void trabajar(t.tenantId);
            return "encolada";
        },
        /** Lo que espera o se está bajando ahora, para la pantalla. */
        enFila: (tenantId) => [...filaDe(tenantId)],
        vacia: (tenantId) => filaDe(tenantId).length === 0 && !trabajando.has(tenantId),
    };
}
/** Las altas que ARCA aceptó en una corrida por tandas: sólo ésas tienen constancia que bajar. Puro. */
export function presentadasDeLaCorrida(resultados) {
    return resultados.filter((x) => x.estado === "registrada").map((x) => ({ userProjectId: String(x.item.userProjectId), contractIndex: Number(x.item.contractIndex) }));
}
/*
  LAS PRESENTACIONES EN FILA. Una presentación automática o un forzado en masa son varias corridas de
  altas seguidas (una por empleadora y por vuelta). Mientras dure la fila, las descargas encadenadas
  esperan: si se metieran entre corrida y corrida, la presentación siguiente tendría que esperar a que
  termine una descarga larga —y pasados 30 minutos se da por vencida—. Es un contador y no un flag
  porque se anidan (la corrida del día envuelve a las del día y a las atrasadas).
*/
const presentando = new Map();
export const hayPresentacionesEnFila = (tenantId) => (presentando.get(tenantId) || 0) > 0;
export async function conPresentacionesEnFila(tenantId, hacer) {
    presentando.set(tenantId, (presentando.get(tenantId) || 0) + 1);
    try {
        return await hacer();
    }
    finally {
        const n = (presentando.get(tenantId) || 1) - 1;
        if (n <= 0)
            presentando.delete(tenantId);
        else
            presentando.set(tenantId, n);
    }
}
