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
        const { porId, porNombre } = await catalogoDeTipos();
        const hoy = hoyArgentina();
        for (const c of pendientes) {
            const r = estadoSegunDatosLocales(c, tipoEsIndeterminado(c, porId, porNombre), hoy);
            c.estadoContrato = r.estado;
            c.estadoContratoMotivo = r.motivo || undefined;
        }
    });
}
