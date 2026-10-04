import { Types } from "mongoose";
import { pathToFileURL } from "node:url";
import UserProject from "../../models/UserProject.js";
import { ArcaAltasLog } from "../../models/ArcaAltasLog.js";
import { abrirSesionArca, credencialesDe, guardarSesion } from "./navegador.js";
import { MOTOR_ALTAS } from "./motor.js";
import { soltarCandado, tomarCandado } from "./candadoArca.js";
import { LoteAltasError, validarLoteAltas } from "./validarLoteAltas.js";
import { correrTandas } from "./tandasAltas.js";
/** Una por tenant, en memoria, igual que la de obras sociales (ver allí por qué). */
const corridas = new Map();
export const corridaAltasDe = (tenantId) => corridas.get(tenantId);
/**
 * En desarrollo NO se presenta nada de verdad salvo que se pida explícito con
 * `ARCA_ALTAS_EN_SECO=false`. En producción es real salvo `ARCA_ALTAS_EN_SECO=true`. El cliente puede
 * pedir seco, nunca lo contrario.
 */
export const enSecoForzado = () => {
    const v = String(process.env.ARCA_ALTAS_EN_SECO || "").toLowerCase();
    if (v === "true")
        return true;
    if (v === "false")
        return false;
    return process.env.NODE_ENV !== "production";
};
export function detenerCorridaAltas(tenantId) {
    const c = corridas.get(tenantId);
    if (!c || c.terminada)
        return { detenida: false, motivo: "No hay una corrida de altas en curso." };
    if (c.porTandas) {
        // No se corta en el medio de una tanda: lo que ya está en la grilla de ARCA se termina de presentar
        // y se guarda. La que no arranca es la tanda siguiente.
        c.detenerPedido = true;
        return { detenida: true, motivo: "Se detiene al terminar la tanda en curso." };
    }
    if (c.irreversible)
        return { detenida: false, motivo: "Ya se apretó el botón que presenta las altas: no se puede detener. Esperá el resultado." };
    c.señal.cortada = true;
    return { detenida: true };
}
export async function arrancarCorridaAltas(opts) {
    const { tenantId, tenantObjectId, usuarioId, modo } = opts;
    // El candado ANTES de cualquier await: dos clicks seguidos no pueden arrancar dos corridas.
    tomarCandado(tenantId, modo);
    try {
        // Altas Masivas valida TODA la selección de una vez, sin tope, y saltea lo ya presentado: así
        // una corrida cortada se relanza con la misma selección y no duplica.
        const lote = await validarLoteAltas({ tenantObjectId, modo, empresaId: opts.empresaId, items: opts.items, forzar: !!opts.forzar, descartarPresentadas: modo === "altas_masivas" });
        if (lote.items.length === 0 && !lote.descartadas.some((d) => d.motivo === "incierta")) {
            throw new LoteAltasError("Todos los contratos de la selección ya están presentados en ARCA: no queda nada por presentar.");
        }
        const cred = await credencialesDe(tenantId);
        if (!cred)
            throw new Error("Faltan las credenciales de ARCA. Cargalas en Configuración → ARCA → Conexión.");
        const enSeco = enSecoForzado() || !!opts.enSeco;
        const corrida = {
            tenantId,
            tipo: modo,
            empresaId: lote.empresa._id,
            empresaRazonSocial: lote.empresa.razonSocial,
            empresaCuit: lote.empresa.cuit,
            personas: lote.items.map((i) => ({ cuil: i.cuil, nombre: i.nombre })),
            total: lote.items.length,
            enSeco,
            eventos: [],
            terminada: false,
            irreversible: false,
            porTandas: modo === "altas_masivas",
            detenerPedido: false,
            descartadas: lote.descartadas.map((d) => ({ cuil: d.cuil, nombre: d.nombre, motivo: d.motivo })),
            señal: { cortada: false },
            arrancadaEl: new Date(),
        };
        corridas.set(tenantId, corrida);
        void (modo === "altas_masivas" ? correrPorTandas : correr)({ corrida, lote, tenantObjectId, usuarioId, cred });
        return { total: lote.items.length, enSeco, empresa: lote.empresa };
    }
    catch (e) {
        soltarCandado(tenantId, modo);
        throw e;
    }
}
async function correr(o) {
    const { corrida, lote, tenantObjectId, usuarioId, cred } = o;
    const emitir = (e) => {
        if (e.tipo === "irreversible")
            corrida.irreversible = true;
        corrida.eventos.push(e);
    };
    const inicio = Date.now();
    let sesion = null;
    let r = null;
    let resultado = "fallo";
    let error;
    let textoArca;
    let codigoNovedad;
    try {
        emitir({ tipo: "abriendo" });
        sesion = await abrirSesionArca(corrida.tenantId, cred);
        emitir({ tipo: "sesion", seLogueo: sesion.seLogueo });
        // Como URL `file://`: en Windows una ruta absoluta («C:\…») no se puede importar tal cual.
        const motor = (await import(pathToFileURL(MOTOR_ALTAS).href));
        const comun = { page: sesion.page, empresaCuit: lote.empresa.cuit, enSeco: corrida.enSeco, onProgreso: emitir, señal: corrida.señal };
        r =
            lote.modo === "carga_masiva"
                ? await motor.cargaMasiva({ ...comun, txt: lote.texto, registros: lote.items.length })
                : await motor.altasMasivas({ ...comun, texto: lote.texto, cuils: lote.items.map((i) => i.cuil) });
        resultado = r?.resultado || "indeterminado";
        codigoNovedad = r?.codigoNovedad;
        emitir({ tipo: "fin", resultado });
    }
    catch (e) {
        error = String(e?.message || e);
        textoArca = e?.textoArca;
        codigoNovedad = e?.codigoNovedad || codigoNovedad;
        if (corrida.irreversible) {
            // Algo falló DESPUÉS de apretar el botón: no sabemos si ARCA lo tomó. No se reintenta: se marca
            // indeterminado para que alguien lo mire en ARCA antes de volver a presentar.
            resultado = "indeterminado";
            emitir({ tipo: "indeterminado", comoVerificar: `Después de presentar hubo un error (${error}). Revisá en ARCA si las altas figuran antes de hacer nada: NO las vuelvas a presentar desde acá.` });
            emitir({ tipo: "fin", resultado });
        }
        else {
            resultado = e?.detenido ? "detenida" : "fallo";
            emitir({ tipo: "fallo", mensaje: error, textoArca, codigoNovedad });
        }
    }
    finally {
        corrida.terminada = true;
        const s = sesion;
        if (s && !error)
            await guardarSesion(corrida.tenantId, s.ctx).catch(() => { });
        await s?.browser.close().catch(() => { });
        soltarCandado(corrida.tenantId, lote.modo);
        // Resultado por contrato. Solo se escribe en el contrato lo que se PRESENTÓ (o puede haberse
        // presentado): un seco, un fallo antes del envío o un «Detener» no dejan marca.
        const porCuil = new Map((r?.porPersona || []).map((p) => [String(p.cuil), { estado: p.estado, motivo: p.motivo }]));
        const resultadoDe = (cuil) => {
            if (resultado === "seco" || resultado === "detenida" || (resultado === "fallo" && !corrida.irreversible))
                return { log: resultado };
            if (lote.modo === "carga_masiva")
                return resultado === "enviada" ? { log: "presentada", contrato: "presentada" } : { log: "indeterminado", contrato: "indeterminado" };
            const p = porCuil.get(cuil);
            if (p?.estado === "alta")
                return { log: "presentada", contrato: "presentada" };
            if (p?.estado === "rechazada")
                return { log: "rechazada", contrato: "fallida", motivo: p.motivo };
            return { log: "indeterminado", contrato: "indeterminado" };
        };
        const log = await ArcaAltasLog.create({
            tenantId: tenantObjectId,
            tipo: lote.modo,
            usuarioId: usuarioId && Types.ObjectId.isValid(usuarioId) ? usuarioId : undefined,
            empresaId: lote.empresa._id,
            empresaCuit: lote.empresa.cuit,
            empresaRazonSocial: lote.empresa.razonSocial,
            enSeco: corrida.enSeco,
            contratos: lote.items.map((i) => {
                const x = resultadoDe(i.cuil);
                return { userProjectId: i.userProjectId, contractIndex: i.contractIndex, cuil: i.cuil, nombre: i.nombre, resultado: x.log, motivo: x.motivo };
            }),
            codigoNovedad,
            nroTransaccion: r?.nroTransaccion,
            fechaPresentacion: r?.fechaPresentacion,
            estadoArca: r?.estado,
            resultado,
            irreversible: corrida.irreversible,
            pasoFallido: error ? corrida.eventos.filter((e) => e.tipo !== "fallo").slice(-1)[0]?.tipo : undefined,
            error,
            textoArca,
            dialogos: r?.dialogos,
            seLogueo: s?.seLogueo,
            tiempos: s?.tiempos,
            duracionMs: Date.now() - inicio,
            htmlResultado: r?.html,
        }).catch((e) => {
            console.error("Altas ARCA: no pude guardar el log:", e?.message || e);
            return null;
        });
        for (const i of lote.items) {
            const x = resultadoDe(i.cuil);
            if (!x.contrato)
                continue;
            await UserProject.updateOne({ _id: i.userProjectId }, {
                $set: {
                    [`contracts.${i.contractIndex}.altaArcaPresentada`]: {
                        via: lote.modo,
                        fecha: new Date(),
                        resultado: x.contrato,
                        codigoNovedad,
                        nroTransaccion: r?.nroTransaccion,
                        motivo: x.motivo,
                        logId: log?._id,
                    },
                },
            }).catch((e) => console.error("Altas ARCA: no pude marcar el contrato:", e?.message || e));
        }
    }
}
/** Pausa entre tandas: el ritmo de una persona, no el de un script. Configurable para los tests. */
const pausaEntreTandas = () => {
    const base = Number(process.env.ARCA_ALTAS_PAUSA_TANDAS_MS);
    const ms = (Number.isFinite(base) && base >= 0 ? base : 4000) + Math.floor(Math.random() * 2000);
    return new Promise((r) => setTimeout(r, ms));
};
/** Cómo se llama en el contrato y en el log cada estado de una persona de la corrida por tandas. */
const NOMBRE_EN_LOG = { registrada: "presentada", rechazada: "rechazada", incierta: "indeterminado", pendiente: "pendiente", seco: "seco", presentando: "indeterminado" };
/**
 * ALTAS MASIVAS POR TANDAS. El orden lo decide `correrTandas` (`tandasAltas.ts`); acá se le dan el
 * navegador y la base.
 *
 * Lo que cambia respecto de `correr` es CUÁNDO se escribe: el contrato se marca «presentando» antes
 * de cada «Aceptar» y con su resultado apenas ARCA contesta, tanda por tanda. Si el servidor se cae
 * a mitad, lo que quedó «presentando» no se vuelve a presentar: la corrida siguiente lo consulta.
 */
async function correrPorTandas(o) {
    const { corrida, lote, tenantObjectId, usuarioId, cred } = o;
    const emitir = (e) => {
        if (e.tipo === "dialogoInesperado")
            corrida.dialogoInesperado = e.mensaje;
        corrida.eventos.push(e);
    };
    const inicio = Date.now();
    let sesion = null;
    let r = null;
    let resultado = "fallo";
    let error;
    const contratosParaLog = (resultados) => resultados
        ? resultados.map((x) => ({ userProjectId: x.item.userProjectId, contractIndex: x.item.contractIndex, cuil: x.item.cuil, nombre: x.item.nombre, resultado: NOMBRE_EN_LOG[x.estado] || x.estado, motivo: x.motivo, tanda: x.tanda, cat: x.cat, porConsulta: x.porConsulta }))
        : lote.items.map((i) => ({ userProjectId: i.userProjectId, contractIndex: i.contractIndex, cuil: i.cuil, nombre: i.nombre, resultado: "pendiente" }));
    // El log se crea ANTES de presentar y se va completando por tanda: si el servidor se cae, queda.
    const log = await ArcaAltasLog.create({
        tenantId: tenantObjectId,
        tipo: "altas_masivas",
        usuarioId: usuarioId && Types.ObjectId.isValid(usuarioId) ? usuarioId : undefined,
        empresaId: lote.empresa._id,
        empresaCuit: lote.empresa.cuit,
        empresaRazonSocial: lote.empresa.razonSocial,
        enSeco: corrida.enSeco,
        contratos: contratosParaLog(null),
        resultado: "en_curso",
        irreversible: false,
    }).catch((e) => {
        console.error("Altas ARCA: no pude crear el log:", e?.message || e);
        return null;
    });
    const marcar = async (i, campos) => {
        await UserProject.updateOne({ _id: i.userProjectId }, { $set: { [`contracts.${i.contractIndex}.altaArcaPresentada`]: { via: "altas_masivas", fecha: new Date(), logId: log?._id, ...campos } } });
    };
    // Sin `catch` a propósito: si no se puede dejar el rastro, la tanda NO se presenta (ver `correrTandas`).
    const guardar = {
        presentando: async (items, tanda) => {
            for (const i of items)
                await marcar(i, { resultado: "presentando", tanda });
        },
        resultado: async (x) => {
            if (x.estado === "pendiente") {
                // No se presentó: se borra la marca de «presentando», y solo esa.
                const campo = `contracts.${x.item.contractIndex}.altaArcaPresentada`;
                await UserProject.updateOne({ _id: x.item.userProjectId, [`${campo}.resultado`]: "presentando" }, { $unset: { [campo]: "" } });
                return;
            }
            const res = x.estado === "registrada" ? "presentada" : x.estado === "rechazada" ? "fallida" : "indeterminado";
            await marcar(x.item, { resultado: res, tanda: x.tanda, motivo: x.motivo, cat: x.cat, porConsulta: x.porConsulta || undefined });
        },
        tanda: async (t, resultados) => {
            if (!log)
                return;
            await ArcaAltasLog.updateOne({ _id: log._id }, { $push: { tandas: t }, $set: { contratos: contratosParaLog(resultados), irreversible: true } }).catch((e) => console.error("Altas ARCA: no pude actualizar el log:", e?.message || e));
        },
    };
    try {
        emitir({ tipo: "abriendo" });
        sesion = await abrirSesionArca(corrida.tenantId, cred);
        emitir({ tipo: "sesion", seLogueo: sesion.seLogueo });
        const motor = (await import(pathToFileURL(MOTOR_ALTAS).href));
        const page = sesion.page;
        const comun = { page, empresaCuit: lote.empresa.cuit, onProgreso: emitir };
        const aItem = (i) => ({ userProjectId: i.userProjectId, contractIndex: i.contractIndex, cuil: i.cuil, nombre: i.nombre, registro: i.registro });
        r = await correrTandas({
            items: lote.items.map(aItem),
            inciertas: lote.descartadas.filter((d) => d.motivo === "incierta").map(aItem),
            enSeco: corrida.enSeco,
            motor: {
                leerTope: () => motor.leerTopeAltasMasivas(comun),
                // «Detener» no entra al motor: corta entre tandas (`cortePedido`), nunca en el medio de una.
                // `yaAdentro`: la empleadora ya se eligió al leer el tope. Volver al selector de CUIT desde
                // adentro cierra la sesión de ARCA (FinSession), y la primera tanda moría ahí.
                presentar: (t) => motor.altasMasivas({ ...comun, ...t, yaAdentro: true, enSeco: corrida.enSeco, señal: { cortada: false } }),
                consultar: (c) => motor.consultarAltaPorCuil({ page, ...c }),
            },
            guardar,
            emitir,
            cortePedido: () => corrida.dialogoInesperado
                ? { motivo: "dialogo", mensaje: `ARCA preguntó algo que no se esperaba («${corrida.dialogoInesperado}») y se respondió que no. Se cortó antes de la tanda siguiente: mirá la pantalla de ARCA.` }
                : corrida.detenerPedido
                    ? { motivo: "detenida", mensaje: "Detenida a pedido, al terminar la tanda en curso." }
                    : null,
            pausa: pausaEntreTandas,
        });
        resultado = r.corte ? (r.corte.motivo === "detenida" ? "detenida" : "cortada") : corrida.enSeco ? "seco" : r.resultados.some((x) => x.estado === "incierta") ? "indeterminado" : "aceptada";
        error = r.corte && r.corte.motivo !== "detenida" ? r.corte.mensaje : undefined;
        emitir({ tipo: "fin", resultado });
    }
    catch (e) {
        error = String(e?.message || e);
        emitir({ tipo: "fallo", mensaje: error, textoArca: e?.textoArca });
    }
    finally {
        corrida.terminada = true;
        const s = sesion;
        if (s && !error)
            await guardarSesion(corrida.tenantId, s.ctx).catch(() => { });
        await s?.browser.close().catch(() => { });
        soltarCandado(corrida.tenantId, "altas_masivas");
        if (log) {
            await ArcaAltasLog.updateOne({ _id: log._id }, {
                $set: {
                    ...(r ? { contratos: contratosParaLog(r.resultados), topeEnPantalla: r.topeEnPantalla ?? undefined, topeUsado: r.tope, motivoCorte: r.corte?.motivo } : {}),
                    resultado,
                    error,
                    seLogueo: s?.seLogueo,
                    tiempos: s?.tiempos,
                    duracionMs: Date.now() - inicio,
                },
            }).catch((e) => console.error("Altas ARCA: no pude cerrar el log:", e?.message || e));
        }
    }
}
