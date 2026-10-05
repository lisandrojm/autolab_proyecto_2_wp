import { Types } from "mongoose";
import { RoleFrame } from "../models/RoleFrame.js";
import { CategoriaSat } from "../models/CategoriaSat.js";
import { Valoracion } from "../models/Valoracion.js";
import { valorarPorBruto } from "../utils/valoracionPorBruto.js";
const nivelesActivos = async (tenantId) => (await Valoracion.find({ tenantId, activo: { $ne: false } })
    .select("_id name orden color")
    .lean());
/**
 * Sugerencia para un conjunto de categorías del catálogo, por su `_id`: lo que el formulario tiene
 * tildado. La regla necesita el grupo entero —«la más barata» es relativa a las otras—, por eso se
 * pide por conjunto y no de a una.
 */
export async function sugerirPorBruto(tenantId, categoriaIds) {
    const ids = categoriaIds.filter((id) => Types.ObjectId.isValid(id));
    const [niveles, categorias] = await Promise.all([nivelesActivos(tenantId), CategoriaSat.find({ _id: { $in: ids } }).select("name data.nombre data.convenio data.sueldoBruto").lean()]);
    const r = valorarPorBruto(categorias.map((c) => ({ id: String(c._id), convenio: String(c.data?.convenio || "").trim(), bruto: c.data?.sueldoBruto, nombre: String(c.data?.nombre || c.name || "") })), niveles);
    return Object.fromEntries(r);
}
/**
 * Qué cambiaría en cada función si se aplicara la regla. NO escribe.
 *
 * Sin `incluirValoradas`, las funciones que ya tienen alguna categoría valorada se saltean: eso lo
 * hizo alguien a propósito, o lo hizo la regla antes. Con él, se alinean todas —también se limpia lo
 * que la regla deja sin valorar—.
 */
export async function planValoracionPorBruto(tenantId, { incluirValoradas = false } = {}) {
    const [niveles, catalogo, funciones] = await Promise.all([
        nivelesActivos(tenantId),
        CategoriaSat.find({}).select("data.id data.nombre data.convenio data.sueldoBruto").lean(),
        RoleFrame.find({ "data.categoriasSat.0": { $exists: true } })
            .select("name data.categoriasSat")
            .sort({ name: 1 })
            .lean(),
    ]);
    const delCatalogo = new Map(catalogo.map((c) => [Number(c.data?.id), c.data]));
    const plan = {
        niveles: niveles.map((n) => ({ _id: String(n._id), name: String(n.name), orden: n.orden ?? null, color: String(n.color || "") })),
        funciones: [],
        salteadas: [],
        operaciones: [],
    };
    for (const f of funciones) {
        const asociadas = f.data?.categoriasSat || [];
        if (!incluirValoradas && asociadas.some((c) => c?.valoracionId)) {
            plan.salteadas.push(String(f.name));
            continue;
        }
        const filas = asociadas.map((c) => {
            const vigente = delCatalogo.get(Number(c.id));
            return { c, vigente, bruto: Number(vigente?.sueldoBruto ?? c.sueldoBruto) };
        });
        const sugerido = valorarPorBruto(filas.map(({ c, vigente, bruto }) => ({ id: String(c.id), convenio: String(vigente?.convenio || "").trim(), bruto, nombre: String(vigente?.nombre || c.nombre || "") })), niveles);
        const cambios = [];
        for (const { c, vigente, bruto } of filas) {
            const antes = c.valoracionId ? String(c.valoracionId) : null;
            const s = sugerido.get(String(c.id));
            const despues = s?.valoracionId ?? null;
            if (antes === despues)
                continue;
            cambios.push({ categoriaId: Number(c.id), nombre: String(vigente?.nombre || c.nombre || c.id), convenio: String(vigente?.convenio || "").trim(), bruto: Number.isFinite(bruto) && bruto > 0 ? bruto : null, antes, despues, motivo: s?.motivo });
            /*
              Una actualización POR CATEGORÍA con arrayFilters, y no reescribir el array entero: si alguien
              edita la función en Roles Empresa mientras esto corre, reescribir el array le pisaría los
              cambios. Así sólo se toca el `valoracionId` de esa entrada.
            */
            plan.operaciones.push({
                updateOne: {
                    filter: { _id: f._id },
                    update: { $set: { "data.categoriasSat.$[c].valoracionId": despues ? new Types.ObjectId(despues) : null } },
                    arrayFilters: [{ "c.id": c.id }],
                },
            });
        }
        // Por convenio y de la más barata a la más cara, como en el formulario: así se lee la regla.
        cambios.sort((a, b) => a.convenio.localeCompare(b.convenio) || (a.bruto ?? Infinity) - (b.bruto ?? Infinity));
        if (cambios.length > 0)
            plan.funciones.push({ funcionId: String(f._id), funcion: String(f.name), cambios });
    }
    return plan;
}
/** Escribe un plan. Devuelve cuántas categorías cambiaron. */
export async function aplicarPlan(plan) {
    if (plan.operaciones.length === 0)
        return 0;
    // Directo a la colección: Mongoose no castea adentro de arrayFilters, y el ObjectId ya va armado.
    const r = await RoleFrame.collection.bulkWrite(plan.operaciones, { ordered: false });
    return r.modifiedCount;
}
