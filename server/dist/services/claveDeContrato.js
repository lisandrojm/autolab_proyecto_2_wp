import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { claveEnPosicion } from "../utils/identidadContrato.js";
/*
  ETAPA 2c (18/11/2026). Para los escritores que sólo tienen (vínculo, posición) a mano —las corridas de
  ARCA arman sus ítems sin el contrato—: trae las claves de todos los pares en UNA consulta.
  Clave del mapa: `${userProjectId}:${posición}`.
*/
export async function clavesDeContratos(pares) {
    const ids = [...new Set(pares.map((p) => String(p.userProjectId || "")).filter((s) => Types.ObjectId.isValid(s)))];
    const out = new Map();
    if (!ids.length)
        return out;
    const ups = await UserProject.find({ _id: { $in: ids.map((s) => new Types.ObjectId(s)) } }).select("contracts.contratoKey").lean();
    const porId = new Map(ups.map((u) => [String(u._id), u.contracts || []]));
    for (const p of pares)
        out.set(`${String(p.userProjectId)}:${p.contractIndex}`, claveEnPosicion(porId.get(String(p.userProjectId)), p.contractIndex));
    return out;
}
export async function claveDeContrato(userProjectId, contractIndex) {
    return (await clavesDeContratos([{ userProjectId, contractIndex }])).get(`${String(userProjectId)}:${contractIndex}`) ?? null;
}
