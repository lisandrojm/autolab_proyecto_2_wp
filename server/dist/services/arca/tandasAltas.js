import { MAX_ALTAS_MASIVAS, partirEnTandas } from "../../compartido/layoutAltaArca.js";
/** Más de esta cantidad de rechazos SEGUIDOS corta la corrida: algo está mal armado y no es una persona. */
export const maxRechazosSeguidos = () => {
    const n = Number(process.env.ARCA_ALTAS_MAX_RECHAZOS_SEGUIDOS);
    return Number.isInteger(n) && n >= 0 ? n : 3;
};
/** La fecha de inicio del registro de 85 (posiciones 48–55, ddmmaaaa): es lo que se busca en la consulta. */
export const fechaInicioDeRegistro85 = (registro) => String(registro || "").slice(47, 55);
export async function correrTandas(o) {
    const { motor, guardar, enSeco } = o;
    const emitir = o.emitir || (() => { });
    const maxRechazos = o.maxRechazos ?? maxRechazosSeguidos();
    const porContrato = new Map();
    const clave = (i) => `${i.userProjectId}:${i.contractIndex}`;
    const anotar = async (r, escribir = true) => {
        porContrato.set(clave(r.item), r);
        emitir({ tipo: "personaTanda", cuil: r.item.cuil, tanda: r.tanda, estado: r.estado, motivo: r.motivo, cat: r.cat, porConsulta: r.porConsulta });
        if (escribir && !enSeco)
            await guardar.resultado(r);
    };
    for (const i of o.items)
        porContrato.set(clave(i), { item: i, estado: "pendiente" });
    // Si una consulta falla (sesión caída), no se insiste con las demás: quedan inciertas.
    let consultaRota = false;
    const resolverIncierta = async (item, tanda) => {
        let r = { encontrada: null };
        if (!consultaRota) {
            try {
                r = await motor.consultar({ cuil: item.cuil, fechaInicio: fechaInicioDeRegistro85(item.registro) });
            }
            catch {
                consultaRota = true;
            }
        }
        if (r.encontrada === true)
            await anotar({ item, estado: "registrada", tanda, cat: r.cat, porConsulta: true });
        else
            await anotar({ item, estado: "incierta", tanda, motivo: "No se pudo confirmar en ARCA si el alta quedó registrada. Mirala en Relaciones Laborales → Consultas antes de volver a presentarla." });
    };
    // ── El tope: el menor entre lo que dice ARCA y la constante ─────────────────────────────────────
    const enPantalla = await motor.leerTope();
    if (enPantalla === null)
        throw new Error("La pantalla de Altas Masivas no dice cuántos registros admite: cambió, y no se presenta sin saberlo.");
    const tope = Math.min(enPantalla, MAX_ALTAS_MASIVAS);
    emitir({ tipo: "tope", enPantalla, usado: tope });
    // ── Lo que quedó sin resultado de una corrida anterior: se consulta, no se presenta ─────────────
    if (!enSeco)
        for (const i of o.inciertas || [])
            await resolverIncierta(i);
    const cola = [...o.items];
    const totalTandas = partirEnTandas(cola, tope).length;
    emitir({ tipo: "plan", tandas: totalTandas, total: cola.length, tope });
    const tandas = [];
    const yaDevueltas = new Set();
    let corte;
    let rechazosSeguidos = 0;
    let n = 0;
    while (cola.length > 0 && !corte) {
        const pedido = o.cortePedido?.();
        if (pedido) {
            corte = pedido;
            break;
        }
        if (n > 0)
            await o.pausa?.();
        const lote = cola.splice(0, tope);
        n++;
        const inicio = new Date();
        const cuils = lote.map((i) => i.cuil);
        emitir({ tipo: "tanda", n, de: Math.max(totalTandas, n), cuils, estado: "presentando" });
        /** Los CUIL por los que se llegó a apretar «Aceptar» en esta tanda (o se estaba por apretar). */
        let aceptando = null;
        let r = null;
        let error;
        try {
            r = await motor.presentar({
                texto: lote.map((i) => i.registro).join("\n"),
                cuils,
                tope,
                antesDeAceptar: async (enGrilla) => {
                    const items = lote.filter((i) => enGrilla.includes(i.cuil));
                    // PRIMERO se escribe, DESPUÉS se aprieta: si no se puede dejar el rastro, no se presenta.
                    await guardar.presentando(items, n);
                    aceptando = enGrilla;
                    for (const i of items)
                        emitir({ tipo: "personaTanda", cuil: i.cuil, tanda: n, estado: "presentando" });
                },
            });
        }
        catch (e) {
            error = String(e?.message || e);
            corte = { motivo: aceptando ? "error_despues_de_presentar" : e?.detenido ? "detenida" : "error", mensaje: error };
        }
        const porCuil = new Map((r?.porPersona || []).map((p) => [String(p.cuil), p]));
        const presentadas = aceptando || [];
        for (const item of lote) {
            const p = porCuil.get(item.cuil);
            if (r?.resultado === "seco") {
                await anotar({ item, estado: "seco", tanda: n }, false);
            }
            else if (p?.estado === "alta") {
                rechazosSeguidos = 0;
                await anotar({ item, estado: "registrada", tanda: n, cat: p.cat });
            }
            else if (p?.estado === "rechazada") {
                rechazosSeguidos++;
                await anotar({ item, estado: "rechazada", tanda: n, motivo: p.motivo || "ARCA rechazó el registro." });
            }
            else if (p?.estado === "devuelta") {
                // ARCA no registró ninguna de la tanda por el error de otra fila: esta no se presentó. Vuelve
                // a la cola UNA vez; si la devuelven de nuevo queda pendiente, sin insistir.
                await anotar({ item, estado: "pendiente", motivo: "ARCA no registró la tanda por el error de otra fila." });
                if (!yaDevueltas.has(clave(item))) {
                    yaDevueltas.add(clave(item));
                    cola.push(item);
                }
            }
            else if (presentadas.includes(item.cuil)) {
                // Se apretó «Aceptar» con esta persona en la grilla y no hay resultado: no se reintenta, se consulta.
                await resolverIncierta(item, n);
            }
            // Si no: nunca llegó al «Aceptar» (la tanda falló antes). Sigue pendiente y sin marca.
        }
        const fin = new Date();
        const hecha = { n, cuils, inicio, fin, duracionMs: fin.getTime() - inicio.getTime(), resultado: error ? "fallo" : r?.resultado || "indeterminado", error };
        tandas.push(hecha);
        emitir({ tipo: "tanda", n, de: Math.max(totalTandas, n), cuils, estado: "terminada", resultado: hecha.resultado, duracionMs: hecha.duracionMs });
        if (!enSeco)
            await guardar.tanda(hecha, [...porContrato.values()]);
        if (!corte && rechazosSeguidos > maxRechazos) {
            corte = { motivo: "rechazos_seguidos", mensaje: `ARCA rechazó ${rechazosSeguidos} altas seguidas. Se cortó para revisar el armado antes de seguir.` };
        }
    }
    if (corte)
        emitir({ tipo: "corte", ...corte });
    return { tope, topeEnPantalla: enPantalla, tandas, resultados: [...porContrato.values()], corte };
}
