import { Types } from "mongoose";
import UserProject from "../../models/UserProject.js";
import { fechaISO } from "../../utils/contratoVigencia.js";
const ABIERTA = "9999-12-31";
/** Las altas ya presentadas de estas personas, en los proyectos del tenant. */
export async function altasPresentadasDe(proyectosDelTenant, userIds) {
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
                        in: {
                            i: "$$i",
                            r: { $arrayElemAt: ["$contracts.altaArcaPresentada.resultado", "$$i"] },
                            e: { $arrayElemAt: ["$contracts.empresaContratoId", "$$i"] },
                            a: { $arrayElemAt: ["$contracts.fecha_alta_contrato", "$$i"] },
                            b: { $arrayElemAt: ["$contracts.fecha_baja_contrato", "$$i"] },
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
    return out;
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
export const textoAltaQueSePisa = (p) => `ya tiene un alta presentada con esta empleadora del ${fechaCorta(p.alta)} ${p.baja ? `al ${fechaCorta(p.baja)}` : "sin fecha de baja"}: no se da otra hasta que termine la vigente`;
