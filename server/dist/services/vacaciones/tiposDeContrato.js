/**
 * LOS TIPOS DE CONTRATO PARA VACACIONES, DEL CATÁLOGO (23/11/2026). Ver `compartido/vacaciones/tipoDeContrato.ts`
 * por qué no se usa más el número de FRAME. Acá se cargan el catálogo y las plantillas UNA vez por pedido, y se arma:
 *  · `lectorDeTiposDeContrato`: el tipo del catálogo de un contrato (saldos, campaña, perfil).
 *  · `tiposParaVacaciones`: la lista que muestran «Visibilidad por tipo de Contrato» y la campaña de goce.
 */
import { Types } from "mongoose";
import { Contrato } from "../../models/Contrato.js";
import { ContratoFrame } from "../../models/ContratoFrame.js";
import { User } from "../../models/User.js";
import UserProject from "../../models/UserProject.js";
import { esContratoVigente, hoyArgentina } from "../../utils/contratoVigencia.js";
import { tipoDelCatalogo, tipoDeLaRegla, tiposSinVacaciones } from "../../compartido/vacaciones/tipoDeContrato.js";
export async function cargarCatalogoDeTipos() {
    const [tipos, plantillas] = await Promise.all([
        Contrato.find({}).select("name isActive orden data.afipModalidadContrato data.afipTipoServicio data.afipModalidadLiquidacion").lean(),
        ContratoFrame.find({}).select("name data.id data.nombre contratoId contratoIds").lean(),
    ]);
    return {
        tipos: tipos.map((t) => ({
            _id: String(t._id),
            name: String(t.name || ""),
            activo: t.isActive !== false,
            orden: Number.isFinite(Number(t.orden)) ? Number(t.orden) : 9999,
            arca: { modalidad: String(t.data?.afipModalidadContrato || ""), servicio: String(t.data?.afipTipoServicio || ""), liquidacion: String(t.data?.afipModalidadLiquidacion || "") },
        })),
        plantillas: plantillas.map((p) => ({ name: p.name, data: p.data ? { id: p.data.id, nombre: p.data.nombre } : null, contratoId: p.contratoId, contratoIds: p.contratoIds || [] })),
    };
}
/** El tipo del catálogo de cada contrato, con el catálogo ya cargado. */
export async function lectorDeTiposDeContrato(cat) {
    const { tipos, plantillas } = cat || (await cargarCatalogoDeTipos());
    return (c) => tipoDelCatalogo(c, tipos, plantillas);
}
/** Los tipos del catálogo sin vacaciones, según las reglas guardadas (viejas o nuevas). */
export async function tiposSinVacacionesDe(reglas, cat) {
    if (!reglas?.length)
        return [];
    const { tipos, plantillas } = cat || (await cargarCatalogoDeTipos());
    return tiposSinVacaciones(reglas, tipos, plantillas);
}
/**
 * LA LISTA DE TIPOS para «Visibilidad por tipo de Contrato» y la campaña de goce: uno por tipo del catálogo, en su
 * orden. Van los activos, y un inactivo sólo si todavía hay alguien con un contrato vigente de ese tipo.
 */
export async function tiposParaVacaciones(tenantId, reglas) {
    const tid = new Types.ObjectId(String(tenantId));
    const hoy = hoyArgentina();
    const [cat, usuarios] = await Promise.all([cargarCatalogoDeTipos(), User.find({ tenantId: tid, isSystem: { $ne: true } }).select("_id").lean()]);
    const delTenant = new Set(usuarios.map((u) => String(u._id)));
    // Sólo los contratos vigentes, con los campos que hacen falta: la base está lejos.
    const ups = await UserProject.aggregate([
        { $match: { "contracts.estadoContrato": "VIGENTE" } },
        {
            $project: {
                _id: 0,
                userId: 1,
                cs: {
                    $map: {
                        input: { $filter: { input: { $ifNull: ["$contracts", []] }, as: "c", cond: { $eq: ["$$c.estadoContrato", "VIGENTE"] } } },
                        as: "c",
                        in: { estadoContrato: "$$c.estadoContrato", fecha_alta_contrato: "$$c.fecha_alta_contrato", fecha_baja_contrato: "$$c.fecha_baja_contrato", contrato_id: "$$c.contrato_id", nombre_contrato: "$$c.nombre_contrato", tipo_contrato_id: "$$c.tipo_contrato_id" },
                    },
                },
            },
        },
    ]);
    const personas = new Map();
    for (const up of ups) {
        if (!delTenant.has(String(up.userId)))
            continue;
        for (const c of up.cs || []) {
            if (!esContratoVigente(c, hoy))
                continue;
            const t = tipoDelCatalogo(c, cat.tipos, cat.plantillas);
            if (t)
                (personas.get(t) || personas.set(t, new Set()).get(t)).add(String(up.userId));
        }
    }
    const sinVacaciones = new Set(tiposSinVacaciones(reglas, cat.tipos, cat.plantillas));
    return cat.tipos
        .map((t) => ({ id: t._id, name: t.name, activo: t.activo, arca: t.arca, vigentes: personas.get(t._id)?.size || 0, vacationsEnabled: !sinVacaciones.has(t._id), orden: t.orden }))
        .filter((t) => t.activo || t.vigentes > 0)
        .sort((a, b) => a.orden - b.orden || a.name.localeCompare(b.name, "es"))
        .map(({ orden: _o, ...t }) => t);
}
/** Las reglas que se guardan desde «Visibilidad por tipo de Contrato»: una por tipo del catálogo. */
export function reglasParaGuardar(entrada, cat) {
    if (!Array.isArray(entrada))
        return [];
    const nombre = new Map(cat.tipos.map((t) => [t._id, t.name]));
    const vistas = new Map();
    for (const r of entrada) {
        const id = tipoDeLaRegla(r, cat.tipos, cat.plantillas);
        if (!id || !nombre.has(id))
            continue;
        vistas.set(id, { tipoContratoId: id, contractName: nombre.get(id), vacationsEnabled: r.vacationsEnabled !== false });
    }
    return [...vistas.values()];
}
