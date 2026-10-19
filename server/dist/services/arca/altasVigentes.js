import { Types } from "mongoose";
import UserProject from "../../models/UserProject.js";
import { User } from "../../models/User.js";
import { Company } from "../../models/Company.js";
import { RelacionLaboralArca } from "../../models/RelacionLaboralArca.js";
import { fechaISO } from "../../utils/contratoVigencia.js";
const ABIERTA = "9999-12-31";
/**
 * Las altas ya presentadas de estas personas, en los proyectos del tenant. Con `tenantId`, además se
 * cruzan con las Relaciones Laborales de ARCA (ver `aplicarBajasDeArca`).
 */
export async function altasPresentadasDe(proyectosDelTenant, userIds, tenantId) {
    const ids = [...new Set(userIds)].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    if (ids.length === 0 || proyectosDelTenant.length === 0)
        return [];
    const filas = await UserProject.aggregate([
        { $match: { userId: { $in: ids }, projectId: { $in: proyectosDelTenant.map((p) => new Types.ObjectId(String(p))) }, "contracts.altaArcaPresentada.resultado": { $in: ["presentada", "indeterminado", "presentando"] } } },
        {
            $project: {
                userId: 1,
                c: {
                    $map: {
                        input: { $range: [0, { $size: { $ifNull: ["$contracts", []] } }] },
                        as: "i",
                        /*
                          CADA CAMPO DEL MISMO CONTRATO. Antes se leía `$contracts.altaArcaPresentada.resultado` por
                          índice, pero ese camino devuelve sólo los contratos QUE TIENEN el campo: con un contrato viejo
                          sin marca adelante, el resultado del contrato 15 caía en el 0. Así un contrato de 2023 sin
                          baja y nunca presentado figuraba «presentado» y bloqueaba altas nuevas (Pereda, 18/10/2026).
                        */
                        in: {
                            $let: {
                                vars: { k: { $arrayElemAt: ["$contracts", "$$i"] } },
                                in: { i: "$$i", r: "$$k.altaArcaPresentada.resultado", e: "$$k.empresaContratoId", a: "$$k.fecha_alta_contrato", b: "$$k.fecha_baja_contrato" },
                            },
                        },
                    },
                },
            },
        },
    ]);
    const out = [];
    for (const f of filas) {
        for (const c of f.c || []) {
            if (!["presentada", "indeterminado", "presentando"].includes(String(c.r || "")))
                continue;
            out.push({ userId: String(f.userId), userProjectId: String(f._id), contractIndex: Number(c.i), empresaId: String(c.e || ""), alta: fechaISO(c.a), baja: fechaISO(c.b) });
        }
    }
    if (!tenantId || out.length === 0)
        return out;
    // Lo que ARCA tiene registrado de estas personas con estas empleadoras: de ahí salen las bajas que WeProdu no tiene.
    const [usuarios, empresas] = await Promise.all([
        User.find({ _id: { $in: [...new Set(out.map((p) => p.userId))] } }).select("metadata.cuit").lean(),
        Company.find({ _id: { $in: [...new Set(out.map((p) => p.empresaId))].filter((id) => Types.ObjectId.isValid(id)) } }).select("cuit").lean(),
    ]);
    const digitos = (v) => String(v ?? "").replace(/\D/g, "");
    const cuilDe = new Map(usuarios.map((u) => [String(u._id), digitos(u.metadata?.cuit)]));
    const cuitDe = new Map(empresas.map((e) => [String(e._id), digitos(e.cuit)]));
    const cuils = [...new Set([...cuilDe.values()].filter((c) => c.length === 11))];
    if (cuils.length === 0)
        return out;
    const rels = await RelacionLaboralArca.find({ tenantId: new Types.ObjectId(String(tenantId)), cuil: { $in: cuils } }).select("cuil empleadoraCuit fechaInicio fechaFin").lean();
    return aplicarBajasDeArca(out, rels.map((r) => ({ cuil: r.cuil, empleadoraCuit: r.empleadoraCuit, inicio: r.fechaInicio ? new Date(r.fechaInicio).toISOString().slice(0, 10) : "", fin: r.fechaFin ? new Date(r.fechaFin).toISOString().slice(0, 10) : "" })), (p) => cuilDe.get(p.userId) || "", (p) => cuitDe.get(p.empresaId) || "");
}
/**
 * LAS BAJAS LAS DICE ARCA (pedido del 18/10/2026). Un contrato de WeProdu puede no tener fecha de baja
 * (tiempo indeterminado) aunque en ARCA la relación ya terminó (renuncia, fin de plazo): si se lo toma
 * como vigente, bloquea altas nuevas que en ARCA son perfectamente posibles. Para cada alta presentada se
 * busca en las Relaciones Laborales de ARCA la de la misma persona, misma empleadora y misma fecha de
 * inicio; si ARCA tiene baja, manda la de ARCA (la más temprana de las dos). Sin relación en ARCA (todavía
 * no sincronizada) queda lo de WeProdu. Puro.
 */
export function aplicarBajasDeArca(presentadas, relaciones, cuilDe, cuitDe) {
    return presentadas.map((p) => {
        const cuil = cuilDe(p);
        const cuit = cuitDe(p);
        if (!cuil || !cuit || !p.alta)
            return p;
        const r = relaciones.find((x) => x.cuil === cuil && x.empleadoraCuit === cuit && x.inicio === p.alta);
        if (!r || !r.fin)
            return p;
        if (p.baja && p.baja <= r.fin)
            return p;
        return { ...p, baja: r.fin, bajaSegunArca: true };
    });
}
/**
 * El alta ya presentada que se superpone con este contrato, si hay. Dos períodos se pisan si cada uno
 * empieza antes de que termine el otro. El mismo contrato no cuenta (es el que se está presentando).
 */
export function altaQueSePisa(contrato, presentadas) {
    const alta = fechaISO(contrato.alta);
    if (!alta || !contrato.empresaId)
        return null;
    const baja = fechaISO(contrato.baja) || ABIERTA;
    for (const p of presentadas) {
        if (p.userId !== contrato.userId || p.empresaId !== contrato.empresaId)
            continue;
        if (p.userProjectId === contrato.userProjectId && p.contractIndex === contrato.contractIndex)
            continue;
        if (!p.alta)
            continue;
        const pBaja = p.baja || ABIERTA;
        if (p.alta <= baja && alta <= pBaja)
            return p;
    }
    return null;
}
/** «12/10/2026» para los mensajes. */
export const fechaCorta = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—");
export const textoAltaQueSePisa = (p) => `ya tiene un alta presentada con esta empleadora del ${fechaCorta(p.alta)} ${p.baja ? `al ${fechaCorta(p.baja)}${p.bajaSegunArca ? " (baja según ARCA)" : ""}` : "sin fecha de baja"}: no se da otra hasta que termine la vigente`;
