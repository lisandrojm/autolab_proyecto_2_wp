import { CandadoArcaOcupado, quienTiene } from "./candadoArca.js";
import { yaConstatadaEnArca } from "../obrasSocialesLoteService.js";
const segundos = (valor, porDefecto) => {
    const n = Number(String(valor ?? "").trim() || porDefecto);
    return (Number.isFinite(n) && n >= 0 ? n : porDefecto) * 1000;
};
/** Hasta 20 reintentos de 30 s: diez minutos esperando a que se libere ARCA. Después se suelta. */
export const MAX_INTENTOS = 20;
const depsReales = () => ({
    // Import perezoso: la corrida trae Playwright y los modelos, y encolar no los necesita hasta vaciar.
    pendientes: async (tenantObjectId, empresaId) => (await import("../obrasSocialesLoteService.js")).pendientesObraSocial(tenantObjectId, empresaId),
    arrancar: async (o) => (await import("./corridaServidor.js")).arrancarCorrida(o),
    ocupado: (tenantId) => !!quienTiene(tenantId),
    esperaMs: segundos(process.env.ARCA_COLA_ESPERA_SEG, 20),
    reintentoMs: segundos(process.env.ARCA_COLA_REINTENTO_SEG, 30),
    maxIntentos: MAX_INTENTOS,
});
export const validacionAutomaticaActiva = (valor = process.env.ARCA_VALIDACION_AUTOMATICA) => String(valor ?? "").trim() !== "0";
const colas = new Map();
const soloDigitos = (v) => String(v ?? "").replace(/\D/g, "");
/** Lo encolado de un tenant, para mirar y para los tests. */
export const enCola = (tenantId) => [...(colas.get(tenantId)?.porEmpresa || [])].map(([empresaId, cuils]) => ({ empresaId, cuils: [...cuils] }));
/** Olvida todo sin validar nada. Para los tests. */
export function olvidarColas() {
    for (const c of colas.values())
        if (c.temporizador)
            clearTimeout(c.temporizador);
    colas.clear();
}
const programar = (tenantId, ms, deps) => {
    const c = colas.get(tenantId);
    if (!c)
        return;
    if (c.temporizador)
        clearTimeout(c.temporizador);
    c.temporizador = setTimeout(() => {
        c.temporizador = null;
        // Sin `await` y con `catch`: es un temporizador, nadie espera el resultado y no puede tirar.
        void vaciarCola(tenantId, deps).catch((e) => console.error("[COLA-OBRAS-SOCIALES] No pude vaciar la cola:", e?.message || e));
    }, ms);
    // La cola no tiene que impedir que el proceso termine.
    c.temporizador.unref?.();
};
/**
 * Suma una persona a la cola de su tenant. Devuelve si quedó encolada.
 *
 * El temporizador se arma con el PRIMER encolado y no se reinicia con los siguientes: los que llegan
 * dentro de la ventana se suman a esa corrida, y una ráfaga larga no posterga para siempre a los
 * primeros.
 */
export function encolarValidacionObraSocial(p, deps = depsReales()) {
    const cuil = soloDigitos(p.cuil);
    const empresaId = String(p.empresaId || "");
    if (!p.tenantId || !empresaId || cuil.length !== 11)
        return false;
    let c = colas.get(p.tenantId);
    if (!c) {
        c = { tenantObjectId: p.tenantObjectId, porEmpresa: new Map(), temporizador: null, intentos: 0 };
        colas.set(p.tenantId, c);
    }
    const lista = c.porEmpresa.get(empresaId) || new Set();
    lista.add(cuil);
    c.porEmpresa.set(empresaId, lista);
    if (p.usuarioId)
        c.usuarioId = p.usuarioId;
    if (!c.temporizador)
        programar(p.tenantId, deps.esperaMs, deps);
    return true;
}
/**
 * Saca la cola del tenant en UNA corrida. La llama el temporizador; exportada para probarla.
 *
 * Lo que entra a la corrida se quita de la cola recién cuando la corrida ARRANCÓ: si ARCA estaba
 * ocupada o el arranque falla por el candado, sigue encolado. Lo que se encole mientras tanto
 * (durante el `await` de pendientes) no se pierde: queda para la vuelta siguiente.
 */
export async function vaciarCola(tenantId, deps = depsReales()) {
    const c = colas.get(tenantId);
    if (!c || c.porEmpresa.size === 0) {
        colas.delete(tenantId);
        return "vacia";
    }
    const reintentarOSoltar = () => {
        c.intentos++;
        if (c.intentos > deps.maxIntentos) {
            // No es un error: quedan pendientes, como estaban antes de que existiera la cola.
            console.warn(`[COLA-OBRAS-SOCIALES] ARCA siguió ocupada tras ${deps.maxIntentos} intentos: suelto la cola del tenant ${tenantId}. Quedan pendientes para validar a mano.`);
            colas.delete(tenantId);
            return "abandonada";
        }
        programar(tenantId, deps.reintentoMs, deps);
        return "ocupado";
    };
    if (deps.ocupado(tenantId))
        return reintentarOSoltar();
    // Foto de lo encolado: lo que llegue durante los `await` de abajo queda para la próxima vuelta.
    const foto = new Map([...c.porEmpresa].map(([e, cuils]) => [e, new Set(cuils)]));
    const quitarFoto = () => {
        for (const [e, cuils] of foto) {
            const viva = c.porEmpresa.get(e);
            if (!viva)
                continue;
            for (const cuil of cuils)
                viva.delete(cuil);
            if (viva.size === 0)
                c.porEmpresa.delete(e);
        }
        if (c.porEmpresa.size === 0) {
            if (c.temporizador)
                clearTimeout(c.temporizador);
            colas.delete(tenantId);
        }
        else if (!c.temporizador) {
            programar(tenantId, deps.esperaMs, deps);
        }
    };
    const grupos = [];
    for (const [empresaId, cuils] of foto) {
        try {
            const pendientes = new Set((await deps.pendientes(c.tenantObjectId, empresaId)).map((p) => soloDigitos(p.cuil)));
            const aValidar = [...cuils].filter((cuil) => pendientes.has(cuil));
            if (aValidar.length > 0)
                grupos.push({ empresaId, cuils: aValidar });
        }
        catch (e) {
            // Una empleadora que no se pudo resolver no frena a las demás; los suyos quedan para el botón.
            console.error(`[COLA-OBRAS-SOCIALES] No pude resolver los pendientes de la empleadora ${empresaId}:`, e?.message || e);
        }
    }
    if (grupos.length === 0) {
        quitarFoto();
        return "nada_pendiente";
    }
    try {
        await deps.arrancar({ tenantId, tenantObjectId: c.tenantObjectId, grupos, usuarioId: c.usuarioId });
    }
    catch (e) {
        // Otra corrida tomó ARCA entre el chequeo y el arranque: no se perdió nada, se reintenta.
        if (e instanceof CandadoArcaOcupado)
            return reintentarOSoltar();
        // Faltan credenciales, la empleadora no tiene CUIT…: reintentar no lo arregla. Quedan para el botón.
        console.error(`[COLA-OBRAS-SOCIALES] No pude arrancar la validación automática del tenant ${tenantId}:`, e?.message || e);
        quitarFoto();
        return "fallo";
    }
    c.intentos = 0;
    quitarFoto();
    return "arrancada";
}
/**
 * El gancho para las rutas: encola si el contrato lo amerita. No tira nunca.
 *
 * Mismos requisitos que el botón «Validar obra social» (ver `CeldaObraSocial`): empleadora, categoría
 * —de ella sale el convenio; un servicio no lleva obra social— y CUIL válido. Lo ya constatado en ARCA
 * no se encola: no hay nada que validar.
 */
export function encolarSiCorresponde(o, deps) {
    try {
        if (!validacionAutomaticaActiva())
            return false;
        const c = o.contrato || {};
        if (!o.tenantObjectId || !c.empresaContratoId || c.categoria_sat_id == null || c.categoria_sat_id === "")
            return false;
        if (yaConstatadaEnArca(c))
            return false;
        return encolarValidacionObraSocial({ tenantId: String(o.tenantObjectId), tenantObjectId: o.tenantObjectId, empresaId: String(c.empresaContratoId), cuil: o.cuit, usuarioId: o.usuarioId }, deps);
    }
    catch (e) {
        console.error("[COLA-OBRAS-SOCIALES] No pude encolar:", e?.message || e);
        return false;
    }
}
