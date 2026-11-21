/**
 * EL ESTADO SE PONE AL GUARDAR (etapa 3, 19/11/2026).
 *
 * Todo lo que crea o reemplaza un contrato con `save()` (el wizard, las solicitudes, el import…) lo deja
 * sin `estadoContrato`: el wizard arma el contrato entero de nuevo. En vez de que cada ruta se acuerde,
 * el modelo lo calcula antes de guardar con la misma regla de la migración (`estadoSegunDatosLocales`:
 * alta, baja y si el tipo es de tiempo indeterminado; lo indecidible queda SIN_DETERMINAR, nunca VIGENTE
 * por defecto).
 *
 * Cuándo lo calcula, por contrato (no anulado):
 *  - no tiene estado (nuevo, o reemplazado por el wizard);
 *  - cambió su alta, su baja o su tipo respecto de cómo se cargó (comparado por `contratoKey`).
 * Un contrato que no se tocó conserva su estado, aunque el calendario haya avanzado: eso lo hace la
 * transición diaria, en un solo sentido (`transicionEstadoContratos.ts`).
 *
 * Las escrituras por `updateOne` no pasan por el hook: las que crean contratos o les cambian alta, baja o
 * tipo ponen el estado ELLAS MISMAS con `estadoAlEscribir` / `conEstadoCalculado` (el mismo cálculo que el
 * hook). Lo exige `scripts/estadoEnEscrituras.test.ts`, que falla si aparece una escritura así sin estado.
 * La barrida de la tarea (cada 30 min) queda como red, y el reporte cuenta lo que completó: si ese
 * número sube, apareció un camino nuevo (pedido del usuario, 19/11).
 */
import mongoose from "mongoose";
import { Contrato } from "../models/Contrato.js";
import { hoyArgentina, fechaISO } from "../utils/contratoVigencia.js";
import { estadoSegunDatosLocales, tipoEsIndeterminado } from "../utils/estadoDeContrato.js";
let cache = null;
const VIDA_MS = 5 * 60 * 1000;
/** El catálogo de tipos (¿es de tiempo indeterminado?), cacheado unos minutos. */
export async function catalogoDeTipos() {
    if (cache && Date.now() - cache.el < VIDA_MS)
        return cache;
    const tipos = await Contrato.find({}).select("name data.esTiempoIndeterminado").lean();
    cache = {
        el: Date.now(),
        porId: new Map(tipos.map((t) => [String(t._id), !!t.data?.esTiempoIndeterminado])),
        porNombre: new Map(tipos.map((t) => [String(t.name || "").trim().toLowerCase(), !!t.data?.esTiempoIndeterminado])),
    };
    return cache;
}
const dia = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : fechaISO(v));
const huellaDeEstado = (c) => `${dia(c?.fecha_alta_contrato)}|${dia(c?.fecha_baja_contrato)}|${String(c?.contrato_id || "")}|${String(c?.nombre_contrato || "").trim().toLowerCase()}`;
/** ¿Hay que (re)calcular el estado de este contrato? Puro. `previo` = como estaba al cargar (por clave). */
export function hayQueCalcularEstado(c, previo) {
    if (!c || c.estadoContrato === "ANULADO")
        return false;
    if (!c.estadoContrato)
        return true;
    return !!previo && huellaDeEstado(previo) !== huellaDeEstado(c);
}
/** El tipo sólo importa sin baja (¿es indeterminado?). */
const necesitaTipo = (c) => !!dia(c?.fecha_alta_contrato) && !dia(c?.fecha_baja_contrato);
/**
 * EL CÁLCULO COMPARTIDO (hook, escrituras por `updateOne`, scripts): el estado de un contrato según sus
 * datos locales. `null` = no se puede decidir ahora sin adivinar (necesita el tipo y no hay catálogo):
 * queda sin estado para la barrida. Nunca VIGENTE por defecto. Puro con el catálogo dado.
 */
export function estadoAlEscribir(c, catalogo, hoy = hoyArgentina()) {
    if (!c || c.estadoContrato === "ANULADO")
        return null;
    if (necesitaTipo(c) && !catalogo)
        return null;
    const r = estadoSegunDatosLocales(c, catalogo ? tipoEsIndeterminado(c, catalogo.porId, catalogo.porNombre) : undefined, hoy);
    return r.motivo ? { estadoContrato: r.estado, estadoContratoMotivo: r.motivo } : { estadoContrato: r.estado };
}
/** Para un `$push` de contratos nuevos: les pone el estado (pide el catálogo sólo si hace falta). */
export async function conEstadoCalculado(contratos, hoy = hoyArgentina()) {
    const catalogo = contratos.some((c) => !c?.estadoContrato && necesitaTipo(c)) ? await catalogoDeTipos() : null;
    return contratos.map((c) => {
        if (!c || c.estadoContrato)
            return c;
        const e = estadoAlEscribir(c, catalogo, hoy);
        return e ? { ...c, ...e } : c;
    });
}
export function instalarEstadoAlGuardar(schema) {
    schema.pre("validate", async function () {
        if (!this.isNew && !this.isModified("contracts"))
            return;
        const contratos = this.contracts || [];
        const alCargar = this.$locals?.contratosAlCargar || [];
        const previoPorClave = new Map(alCargar.filter((c) => c?.contratoKey).map((c) => [String(c.contratoKey), c]));
        const pendientes = contratos.filter((c) => hayQueCalcularEstado(c, c?.contratoKey ? previoPorClave.get(String(c.contratoKey)) : undefined));
        if (!pendientes.length)
            return;
        const hoy = hoyArgentina();
        // El catálogo se pide sólo si algún contrato lo necesita, y sin conexión a la base (validaciones en
        // tests) ese contrato queda sin estado para la barrida. Nunca se adivina el tipo.
        const conectado = mongoose.connection.readyState === 1;
        const catalogo = pendientes.some(necesitaTipo) && conectado ? await catalogoDeTipos() : null;
        for (const c of pendientes) {
            const e = estadoAlEscribir(c, catalogo, hoy);
            if (!e)
                continue;
            c.estadoContrato = e.estadoContrato;
            c.estadoContratoMotivo = e.estadoContratoMotivo || undefined;
        }
    });
}
