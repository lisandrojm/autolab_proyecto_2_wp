import { Company } from "../../models/Company.js";
import { ArcaObrasSocialesLog } from "../../models/ArcaObrasSocialesLog.js";
import { aplicarLoteObrasSociales } from "../obrasSocialesLoteService.js";
import { abrirSesionArca, credencialesDe, guardarSesion, revalidarSesionArca } from "./navegador.js";
import { dejarSesionTibia, tomarSesionTibia } from "./sesionTibia.js";
import { MOTOR } from "./motor.js";
import { soltarCandado, tomarCandado } from "./candadoArca.js";
/**
 * Una corrida por tenant, en memoria.
 *
 * En memoria y no en una cola porque no hay Redis configurado, y montar la infraestructura para esto
 * sería resolver un problema que no existe: una corrida dura minutos y hay una sola por vez. Lo que
 * se pierde es que no sobrevive a un reinicio del servidor — y eso es aceptable porque la corrida se
 * puede volver a disparar, y lo ya guardado quedó guardado.
 *
 * UNA POR TENANT, y no una global: dos corridas del mismo tenant compartirían la sesión de ARCA y se
 * pisarían la pantalla. Dos tenants distintos tienen usuarios de AFIP distintos y no se estorban.
 */
const corridas = new Map();
export const corridaDe = (tenantId) => corridas.get(tenantId);
export const corriendo = (tenantId) => {
    const c = corridas.get(tenantId);
    return !!c && !c.terminada;
};
export function detenerCorrida(tenantId) {
    const c = corridas.get(tenantId);
    if (!c || c.terminada)
        return false;
    c.señal.cortada = true;
    return true;
}
const soloDigitos = (v) => String(v ?? "").replace(/\D/g, "");
/**
 * Arranca la corrida y vuelve enseguida.
 *
 * No se espera a que termine: son minutos, y un request HTTP colgado ese tiempo se corta solo en
 * cualquier proxy. El progreso se sigue por `corridaDe`.
 *
 * UNA SOLA CORRIDA PARA TODA LA SELECCIÓN. Antes Solicitudes disparaba una corrida por empleadora,
 * y cada una abría su Chromium y su sesión de ARCA. Ahora las empleadoras van en `grupos` y se leen
 * en la misma página, cambiando de CUIT en el selector (ver `prepararAltas` en el motor).
 */
export async function arrancarCorrida(opts) {
    const { tenantId, tenantObjectId, usuarioId } = opts;
    // El candado es COMPARTIDO con las corridas de altas (ver `candadoArca.ts`): usan la misma sesión.
    // Se toma antes de cualquier `await`, para que dos requests simultáneos no pasen los dos.
    tomarCandado(tenantId, "obras_sociales");
    try {
        // Normalizado y sin grupos vacíos. Un mismo CUIL puede estar en dos empleadoras (tiene contrato
        // con las dos): se LEE una vez —la obra social es de la persona— y se GUARDA en las dos.
        const grupos = opts.grupos
            .map((g) => ({ empresaId: String(g.empresaId || ""), cuils: [...new Set(g.cuils.map(soloDigitos).filter((c) => c.length === 11))] }))
            .filter((g) => g.empresaId && g.cuils.length > 0);
        const todos = new Set(grupos.flatMap((g) => g.cuils));
        if (todos.size === 0)
            throw new Error("No hay ninguna persona para validar.");
        const cred = await credencialesDe(tenantId);
        if (!cred)
            throw new Error("Faltan las credenciales de ARCA. Cargalas en Configuración → ARCA → Conexión.");
        const empresas = await Company.find({ _id: { $in: grupos.map((g) => g.empresaId) } })
            .select("cuit razonSocial")
            .lean();
        const empresaDe = new Map(empresas.map((e) => [String(e._id), e]));
        const conCuit = grupos.map((g) => {
            const e = empresaDe.get(g.empresaId);
            return { ...g, empresaCuit: soloDigitos(e?.cuit), razonSocial: String(e?.razonSocial || "") };
        });
        if (conCuit.every((g) => g.empresaCuit.length !== 11)) {
            throw new Error("La empleadora no tiene CUIT cargado: sin eso no se puede elegir en ARCA.");
        }
        const corrida = {
            tenantId,
            empresaId: grupos[0].empresaId,
            empresaIds: grupos.map((g) => g.empresaId),
            total: todos.size,
            eventos: [],
            terminada: false,
            señal: { cortada: false },
            arrancadaEl: new Date(),
        };
        corridas.set(tenantId, corrida);
        const emitir = (e) => corrida.eventos.push(e);
        // Sin `await`: la corrida sigue por su cuenta y este request vuelve ya. El candado lo suelta
        // `correr` al terminar.
        void correr({ corrida, emitir, tenantId, tenantObjectId, usuarioId, cred, grupos: conCuit, total: todos.size });
        return { total: todos.size, grupos: grupos.map((g) => ({ empresaId: g.empresaId, total: g.cuils.length })) };
    }
    catch (e) {
        soltarCandado(tenantId, "obras_sociales");
        throw e;
    }
}
async function correr(o) {
    const { corrida, emitir, tenantId, tenantObjectId, usuarioId, cred, grupos, total } = o;
    const inicio = Date.now();
    let sesion = null;
    /** Lo que se midió. Va entero al log: es lo que dice dónde se fue el tiempo de la corrida. */
    const tiempos = {
        aperturas: [],
        grupos: [],
        reintentos: [],
        guardarMs: 0,
        totalMs: 0,
        resumen: {},
    };
    let seLogueo = false;
    /** cuil → rnos leído ('' = sin afiliación propia: rige la del convenio). */
    const leidos = new Map();
    /** cuil → último motivo de error. Se borra cuando otra empleadora lo resuelve. */
    const fallidos = new Map();
    /** cuil → empleadora con la que se intentó leer primero (la que lo rechazó por «alta activa»). */
    const empresaDeLectura = new Map();
    let sinSesion = false;
    let error;
    const aplicados = [];
    const porGrupo = [];
    const abrir = async (motivo) => {
        /*
          LA SESIÓN TIBIA DE LA CORRIDA ANTERIOR, si quedó una y ARCA todavía la reconoce (ver
          `sesionTibia.ts`). Abrir una sesión es ~11 s de los ~15 que tarda validar a una persona; con
          la tibia es una navegación de ~1 s. Sólo al inicio: un reintento llega acá justamente porque
          la sesión en uso no sirvió, y ahí se abre una nueva.
    
          Queda en `aperturas` con `sesionGuardadaMs` = lo que costó revalidar y `loginMs` 0, para que el
          resumen de tiempos muestre la diferencia sin inventar una fase nueva.
        */
        if (motivo === "inicio") {
            const t = Date.now();
            const tibia = await tomarSesionTibia(tenantId, revalidarSesionArca);
            if (tibia) {
                sesion = tibia;
                tiempos.aperturas.push({ lanzarMs: 0, sesionGuardadaMs: Date.now() - t, loginMs: 0, seLogueo: false, motivo: "inicio (sesión tibia)" });
                return;
            }
        }
        sesion = await abrirSesionArca(tenantId, cred);
        seLogueo = seLogueo || sesion.seLogueo;
        tiempos.aperturas.push({ ...sesion.tiempos, seLogueo: sesion.seLogueo, motivo });
    };
    /**
     * Lee un conjunto de CUIL con una empleadora, en la sesión abierta.
     *
     * `enSesionActual`: se intenta primero en la MISMA página, con `esperaMin: 0` —si ARCA no deja
     * cambiar de empleadora, falla enseguida en vez de esperar un minuto—, y recién si eso falla se
     * cae al camino de antes: cerrar el navegador y abrir una sesión nueva. Lo que no se cae es el caso
     * en que la empleadora no está en el selector de CUIT: una sesión nueva tampoco la va a tener.
     */
    const leerCon = async (empresaCuit, razonSocial, cuils, esperaMin) => {
        const med = { empresaCuit, razonSocial, cuils: cuils.length, porCuil: [] };
        const t = Date.now();
        const { validarObrasSociales } = (await import(MOTOR));
        const correrMotor = (espera) => validarObrasSociales({
            empresa: "",
            empresaCuit,
            cuils,
            // `soloLeer`: el motor NO escribe en WeProdu. Lo que guarda es `aplicarLoteObrasSociales`, que
            // valida contra las obras sociales registradas por la empleadora.
            soloLeer: true,
            paginaExistente: sesion.page,
            onProgreso: emitir,
            señal: corrida.señal,
            esperaMin: espera,
            medicion: med,
        });
        try {
            if (!sesion)
                await abrir("inicio");
            return { r: await correrMotor(esperaMin), med };
        }
        catch (e) {
            const msg = String(e?.message || e);
            if (corrida.señal.cortada || esperaMin > 0 || /no est[aá] en el selector/i.test(msg))
                throw Object.assign(e, { med });
            // Cambiar de empleadora en la misma sesión no anduvo: el camino de antes, sesión nueva.
            console.error(`Obras sociales: no pude cambiar a ${razonSocial || empresaCuit} en la misma sesión (${msg}). Abro otra.`);
            med.sesionNueva = true;
            med.primerIntentoFallo = msg;
            const s = sesion;
            await s?.browser.close().catch(() => { });
            sesion = null;
            await abrir(`reintento ${razonSocial || empresaCuit}`);
            return { r: await correrMotor(1), med };
        }
        finally {
            med.totalMs = Date.now() - t;
        }
    };
    const motivoDe = (cuil) => {
        for (let i = corrida.eventos.length - 1; i >= 0; i--) {
            const e = corrida.eventos[i];
            if (e.tipo === "error" && soloDigitos(e.cuil) === cuil)
                return e.motivo || "";
        }
        return "";
    };
    /** Pasa el resultado de una lectura a los mapas de la corrida. Devuelve cuántos leyó. */
    const absorber = (r) => {
        let n = 0;
        for (const it of r?.items || []) {
            const c = soloDigitos(it.cuil);
            leidos.set(c, soloDigitos(it.rnos));
            fallidos.delete(c);
            n++;
        }
        for (const c of (r?.errores || []).map(soloDigitos))
            if (!leidos.has(c))
                fallidos.set(c, motivoDe(c) || "ARCA no devolvió fila.");
        // Los que el motor no llegó a tocar (sesión caída, Detener) no son fallas de esa persona: no van
        // a `fallidos`, y cuentan como «faltaron» con el motivo de la sesión.
        if (r?.sinSesion)
            sinSesion = true;
        return n;
    };
    try {
        emitir({ tipo: "abriendo" });
        // Las empleadoras sin CUIT no se pueden elegir en ARCA: sus personas salen con el motivo, y el
        // resto de la selección sigue.
        for (const g of grupos.filter((x) => x.empresaCuit.length !== 11)) {
            for (const c of g.cuils) {
                fallidos.set(c, "Su empleadora no tiene CUIT cargado: sin eso no se puede elegir en ARCA.");
                emitir({ tipo: "error", cuil: c, motivo: fallidos.get(c), hechas: 0, total });
            }
        }
        // ── 1. Cada empleadora de la selección, en la misma sesión ──────────────────────────────────
        const asignados = new Set();
        for (const g of grupos) {
            if (corrida.señal.cortada || sinSesion)
                break;
            if (g.empresaCuit.length !== 11)
                continue;
            const aLeer = g.cuils.filter((c) => !asignados.has(c));
            if (aLeer.length === 0)
                continue;
            for (const c of aLeer) {
                asignados.add(c);
                empresaDeLectura.set(c, g.empresaId);
            }
            emitir({ tipo: "empleadora", razonSocial: g.razonSocial || g.empresaCuit, cuils: aLeer });
            try {
                // La primera lectura entra con la sesión recién abierta: se le dan los 2 minutos de siempre.
                // Las siguientes cambian de empleadora en la misma página (ver `leerCon`).
                const { r, med } = await leerCon(g.empresaCuit, g.razonSocial, aLeer, tiempos.grupos.length === 0 ? 2 : 0);
                tiempos.grupos.push(med);
                absorber(r);
            }
            catch (e) {
                if (e?.med)
                    tiempos.grupos.push({ ...e.med, error: String(e?.message || e) });
                // Una empleadora que no se pudo abrir no tumba a las otras: sus personas salen con el motivo.
                const motivo = String(e?.message || e);
                for (const c of aLeer) {
                    if (leidos.has(c))
                        continue;
                    fallidos.set(c, motivo);
                    emitir({ tipo: "error", cuil: c, motivo, hechas: leidos.size, total });
                }
                if (!sesion) {
                    // No se pudo ni abrir ARCA: no tiene sentido seguir, y es un error de la corrida entera.
                    error = motivo;
                    break;
                }
            }
        }
        /*
          ── 2. «CUIL YA TIENE UN ALTA ACTIVA»: SE LEE CON OTRA EMPLEADORA, EN LA MISMA SESIÓN ─────────
    
          Con la empleadora del contrato ARCA no deja agregar a quien ya tiene un alta activa con ella
          —que es justo el caso de los contratos «Pedido de ARCA» ya presentados—, y la obra social no se
          puede leer. Pero la obra social que ARCA precompleta es la de la PERSONA, no la de la
          empleadora: cargada con otra empleadora del tenant, el bloque aparece con el mismo dato.
    
          Antes cada reintento cerraba el Chromium y abría otra sesión. Ahora se vuelve al selector de
          CUIT de la misma página (ver `leerCon`). Las empleadoras se prueban empezando por la que más
          resolvió en corridas anteriores, y se corta apenas no queda nadie. Lo leído se GUARDA contra la
          empleadora del contrato: `aplicarLoteObrasSociales` sigue validando contra las obras sociales
          que ELLA tiene registradas. Nada se registra: el motor nunca aprieta «Aceptar».
        */
        const pendientes = new Set([...fallidos.entries()].filter(([, m]) => /alta activa/i.test(m)).map(([c]) => c));
        if (pendientes.size > 0 && !corrida.señal.cortada && !sinSesion && sesion) {
            const otras = await Company.find({ cuit: { $exists: true, $ne: "" } }).select("cuit razonSocial").lean();
            const orden = await ordenarParaReintento(tenantObjectId, otras, grupos.map((g) => g.empresaCuit));
            for (const otra of orden) {
                if (pendientes.size === 0 || corrida.señal.cortada || sinSesion)
                    break;
                const otraCuit = soloDigitos(otra?.cuit);
                if (otraCuit.length !== 11)
                    continue;
                // A nadie se lo reintenta con la misma empleadora que ya lo rechazó.
                const elegibles = [...pendientes].filter((c) => empresaDeLectura.get(c) !== String(otra._id));
                if (elegibles.length === 0)
                    continue;
                const razonSocial = String(otra.razonSocial || otraCuit);
                emitir({ tipo: "otraEmpleadora", razonSocial, cuils: elegibles });
                try {
                    const { r, med } = await leerCon(otraCuit, razonSocial, elegibles, 0);
                    const resueltos = absorber(r);
                    tiempos.reintentos.push({ ...med, intentados: elegibles.length, resueltos });
                    for (const it of r?.items || [])
                        pendientes.delete(soloDigitos(it.cuil));
                }
                catch (e) {
                    // Una empleadora que no se pudo abrir no tumba lo ya leído: se prueba con la siguiente.
                    if (e?.med)
                        tiempos.reintentos.push({ ...e.med, intentados: elegibles.length, resueltos: 0, error: String(e?.message || e) });
                    console.error(`Obras sociales: reintento con ${razonSocial} falló:`, e?.message || e);
                    if (!sesion)
                        break;
                }
            }
        }
        // ── 3. Guardar, por empleadora, contra la empleadora del contrato ───────────────────────────
        const tGuardar = Date.now();
        let guardando = false;
        for (const g of grupos) {
            const filas = g.cuils.filter((c) => leidos.has(c)).map((c) => ({ cuil: c, rnos: leidos.get(c) || "" }));
            const resumen = {
                empresaId: g.empresaId,
                empresaRazonSocial: g.razonSocial,
                empresaCuit: g.empresaCuit,
                total: g.cuils.length,
                validadas: filas.filter((f) => f.rnos).length,
                sinDeclarar: filas.filter((f) => !f.rnos).length,
                guardadas: 0,
                faltaron: g.cuils.length - filas.length,
            };
            if (filas.length > 0) {
                if (!guardando)
                    emitir({ tipo: "guardando" });
                guardando = true;
                try {
                    const aplicado = await aplicarLoteObrasSociales({ tenantObjectId, empresaId: g.empresaId, filas, origen: "panel", usuarioId });
                    resumen.guardadas = aplicado.aplicados;
                    aplicados.push(aplicado);
                }
                catch (e) {
                    console.error(`Obras sociales: no pude guardar lo de ${g.razonSocial}:`, e?.message || e);
                    error = `No se pudo guardar lo leído para ${g.razonSocial || g.empresaCuit}: ${e?.message || e}`;
                }
            }
            porGrupo.push(resumen);
        }
        tiempos.guardarMs = Date.now() - tGuardar;
        const faltaron = total - leidos.size;
        const motivo = motivoDeQueFaltaran({ faltaron, sinSesion, errores: [...fallidos.keys()] }, corrida.eventos);
        emitir({
            tipo: "fin",
            validadas: porGrupo.reduce((n, g) => n + g.guardadas, 0),
            faltaron,
            motivo,
            detalle: aplicados.flatMap(detalleDeLoAplicado),
        });
    }
    catch (e) {
        error = String(e?.message || e);
        emitir({ tipo: "fallo", mensaje: error });
    }
    finally {
        // La pantalla ya puede cerrarse: lo que sigue es limpieza y log, y no tiene que demorarla.
        corrida.terminada = true;
        const s = sesion;
        // Las cookies que AFIP renovó durante la corrida se guardan: es lo que mantiene viva la sesión
        // guardada para la próxima (ver `abrirSesionArca`). Con la sesión caída no hay nada que guardar.
        if (s && !sinSesion && !error)
            await guardarSesion(tenantId, s.ctx).catch(() => { });
        /*
          El navegador lo abrió esta función, así que lo cierra esta función… salvo que la sesión haya
          quedado SANA: ahí se deja tibia unos minutos para la corrida siguiente (`sesionTibia.ts`), que
          es quien la cierra —al vencer por inactividad, o al no reconocerla ARCA—. Con error, sin sesión
          o cortada a mano no se deja: pudo quedar a mitad de un bloque, y una sesión dudosa no se reusa.
          Apagada (`ARCA_SESION_TIBIA_MIN=0`) `dejarSesionTibia` devuelve false y se cierra como siempre.
          Cada corrida que se olvide de cerrarlo deja un Chromium vivo comiéndose la memoria del VPS.
        */
        const sana = !!s && !sinSesion && !error && !corrida.señal.cortada;
        if (!(sana && dejarSesionTibia(tenantId, s)))
            await s?.browser.close().catch(() => { });
        // Recién con el navegador cerrado —o guardado tibio, que nadie más puede tomar sin el candado—
        // se libera la sesión de ARCA para otra corrida.
        soltarCandado(tenantId, "obras_sociales");
        tiempos.totalMs = Date.now() - inicio;
        tiempos.resumen = resumirTiempos(tiempos);
        // El log se escribe al final y de una sola vez, no evento por evento: una corrida son minutos
        // y cientos de eventos, y guardar cada uno sería escribir en Mongo mientras se maneja el
        // navegador de ARCA. `catch` vacío a propósito — que falle el log no puede tumbar la corrida
        // ni tapar el error real con otro.
        const primero = grupos[0];
        const validadas = [...leidos.values()].filter(Boolean).length;
        await ArcaObrasSocialesLog.create({
            tenantId: tenantObjectId,
            empresaId: primero?.empresaId,
            empresaRazonSocial: grupos.map((g) => g.razonSocial || g.empresaCuit).join(" + "),
            empresaCuit: primero?.empresaCuit,
            usuarioId,
            total,
            validadas,
            guardadas: porGrupo.reduce((n, g) => n + g.guardadas, 0),
            sinDeclarar: leidos.size - validadas,
            errores: fallidos.size,
            faltaron: total - leidos.size,
            motivo: motivoDeQueFaltaran({ faltaron: total - leidos.size, sinSesion, errores: [...fallidos.keys()] }, corrida.eventos),
            seLogueo,
            duracionMs: Date.now() - corrida.arrancadaEl.getTime(),
            error,
            renombrados: [],
            detalle: detallePorPersona(corrida.eventos),
            grupos: porGrupo,
            tiempos,
        }).catch(() => { });
    }
}
/**
 * En qué orden se prueban las otras empleadoras para los de «alta activa».
 *
 * Primero la que más personas resolvió en reintentos de corridas anteriores (sale de los logs), y
 * a igualdad las que están en esta misma selección —ya se sabe que el usuario de ARCA las tiene en su
 * selector—. Así lo normal es que se resuelvan todos con la primera y la corrida corte ahí.
 */
export async function ordenarParaReintento(tenantObjectId, otras, cuitsDeLaSeleccion) {
    const puntaje = new Map();
    try {
        const logs = await ArcaObrasSocialesLog.find({ tenantId: tenantObjectId, "tiempos.reintentos.0": { $exists: true } })
            .select("tiempos.reintentos")
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        for (const l of logs)
            for (const r of l?.tiempos?.reintentos || [])
                puntaje.set(soloDigitos(r.empresaCuit), (puntaje.get(soloDigitos(r.empresaCuit)) || 0) + (Number(r.resueltos) || 0));
    }
    catch {
        /* sin historial se ordena igual, por la selección */
    }
    return ordenarPorPuntaje(otras, puntaje, cuitsDeLaSeleccion);
}
/** La regla de orden sola, sin base, para poder probarla. */
export function ordenarPorPuntaje(otras, puntaje, cuitsDeLaSeleccion) {
    const enSeleccion = new Set(cuitsDeLaSeleccion.map(soloDigitos));
    return otras
        .map((o, i) => ({ o, i, p: puntaje.get(soloDigitos(o?.cuit)) || 0, s: enSeleccion.has(soloDigitos(o?.cuit)) ? 1 : 0 }))
        .sort((a, b) => b.p - a.p || b.s - a.s || a.i - b.i)
        .map((x) => x.o);
}
/**
 * Promedios por fase, para leer el log de un vistazo sin sumar a mano cada persona.
 *
 * `porPersonaMs` separa las que ARCA leyó de las que rechazó: son costos distintos (un rechazo no
 * lee ni suele necesitar vaciar) y promediarlas juntas escondería justo la mejora de los rechazos.
 */
export function resumirTiempos(t) {
    const todas = [...t.grupos, ...t.reintentos].flatMap((g) => g.porCuil || []);
    const prom = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
    const suma = (xs) => xs.reduce((a, b) => a + b, 0);
    const total = (p) => p.agregarMs + p.leerMs + p.vaciarMs;
    const leidas = todas.filter((p) => p.desenlace === "leido");
    const rechazos = todas.filter((p) => p.desenlace === "rechazo" || p.desenlace === "sin_respuesta");
    return {
        abrirSesionMs: suma(t.aperturas.map((a) => a.lanzarMs + a.sesionGuardadaMs + a.loginMs)),
        aperturas: t.aperturas.length,
        prepararMs: suma([...t.grupos, ...t.reintentos].map((g) => (g.prepararMs || 0) + (g.vaciarInicialMs || 0))),
        personasMs: suma(todas.map(total)),
        guardarMs: t.guardarMs,
        totalMs: t.totalMs,
        leidas: leidas.length,
        rechazos: rechazos.length,
        porLeidaMs: { agregar: prom(leidas.map((p) => p.agregarMs)), leer: prom(leidas.map((p) => p.leerMs)), vaciar: prom(leidas.map((p) => p.vaciarMs)), total: prom(leidas.map(total)) },
        porRechazoMs: { agregar: prom(rechazos.map((p) => p.agregarMs)), vaciar: prom(rechazos.map((p) => p.vaciarMs)), total: prom(rechazos.map(total)) },
        vaciarCon: [...new Set(todas.map((p) => p.vaciarCon).filter(Boolean))],
    };
}
/**
 * Por qué faltaron personas. Un final con `faltaron > 0` y sin motivo es un bug en sí mismo.
 *
 * Ya pasó en el camino del Asistente: el motor abortaba antes de la primera persona, devolvía cero
 * hechas y cero errores, y la pantalla lo mostraba como un final exitoso — veinte filas «en cola»
 * para siempre, sin nada que explicara nada.
 */
function motivoDeQueFaltaran(r, eventos = []) {
    if (!r.faltaron)
        return "";
    if (r.sinSesion)
        return "Se cortó la sesión de ARCA, o se pidió detener la corrida.";
    if (r.errores?.length) {
        /*
          EL MOTIVO DE CADA PERSONA, NO UNA SUPOSICIÓN.
    
          Decía siempre «puede que no tengan relación laboral registrada», y el motivo real de cada CUIL
          —que el motor sí informa— era otro: ARCA lento, o un cartel de ARCA rechazando a la persona.
          Leído en el log, el resumen mandaba a buscar el problema donde no estaba. Ahora se agrupan los
          motivos reales; con uno solo, es ése.
        */
        const motivos = new Map();
        // Sólo los que siguen sin leer: el que falló con una empleadora y se leyó con otra ya no falta.
        const faltan = new Set((r.errores || []).map(soloDigitos));
        const ultimo = new Map();
        for (const e of eventos)
            if (e.tipo === "error" && e.motivo && faltan.has(soloDigitos(e.cuil)))
                ultimo.set(soloDigitos(e.cuil), e.motivo);
        for (const m of ultimo.values())
            motivos.set(m, (motivos.get(m) || 0) + 1);
        if (motivos.size === 1) {
            const [[m, n]] = [...motivos];
            return n === 1 ? m : `${n} CUIL: ${m}`;
        }
        if (motivos.size > 1)
            return [...motivos].map(([m, n]) => `${n} × ${m}`).join(" · ");
        return `ARCA no devolvió fila para ${r.errores.length} CUIL.`;
    }
    return "La corrida terminó sin procesar a nadie y el motor no informó ningún error.";
}
/**
 * Qué contestó ARCA para cada persona, sacado de los eventos de la corrida.
 *
 * Se arma de los eventos y no del resultado final porque los eventos existen aunque la corrida se
 * caiga: si se cortó la sesión en la persona doce, quedan las once que sí se leyeron.
 */
function detallePorPersona(eventos) {
    const out = [];
    for (const e of eventos) {
        if (e.tipo === "resultado")
            out.push({ cuil: e.cuil, rnos: e.rnos });
        else if (e.tipo === "error")
            out.push({ cuil: e.cuil, error: e.motivo || "ARCA no devolvió fila." });
    }
    return out;
}
/** Lo que el lote NO pudo aplicar, en frases. Es lo que hace falta para saber qué revisar. */
function detalleDeLoAplicado(r) {
    const l = [];
    if (r.sinContrato?.length)
        l.push(`${r.sinContrato.length} sin contrato en esta empleadora.`);
    if (r.yaBloqueados?.length)
        l.push(`${r.yaBloqueados.length} ya estaban validadas y no se pisaron.`);
    if (r.rnosDesconocido?.length)
        l.push(`${r.rnosDesconocido.length} con un código que no está en el catálogo de Obras Sociales.`);
    if (r.noRegistrada?.length)
        l.push(`${r.noRegistrada.length} con una obra social que la empleadora no tiene registrada ante ARCA: el organismo rechazaría el alta.`);
    return l;
}
