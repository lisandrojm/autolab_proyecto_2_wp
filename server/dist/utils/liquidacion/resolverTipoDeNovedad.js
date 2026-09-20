import { RequestConfig } from "../../models/RequestConfig.js";
import { claveExactaDeMotivo } from "./nombresDeMotivo.js";
export async function resolverTiposDeNovedad(tenantId, attendance) {
    const renglones = Array.isArray(attendance) ? attendance : [];
    if (renglones.length === 0)
        return { attendance: renglones, sinResolver: [] };
    const tipos = await RequestConfig.find({ tenantId }).select("_id name").lean();
    const porNombre = new Map(tipos.map((t) => [claveExactaDeMotivo(t.name), t._id]));
    const idsValidos = new Set(tipos.map((t) => String(t._id)));
    const faltantes = new Map();
    const resueltos = renglones.map((r) => {
        /*
          UN `typeId` QUE NO EXISTE ES PEOR QUE NO TENERLO: apunta a un tipo borrado y nadie lo nota.
          Si llegó uno así se descarta y se intenta resolver por nombre, como si no hubiera venido.
        */
        if (r?.typeId && idsValidos.has(String(r.typeId)))
            return r;
        const motivo = String(r?.absenceReason || "").trim();
        // Sin motivo es un presente: no es una novedad de ningún tipo.
        if (!motivo)
            return { ...r, typeId: undefined };
        const id = porNombre.get(claveExactaDeMotivo(motivo));
        if (!id) {
            faltantes.set(motivo, (faltantes.get(motivo) || 0) + 1);
            return r;
        }
        return { ...r, typeId: id };
    });
    return {
        attendance: resueltos,
        sinResolver: [...faltantes.entries()].map(([motivo, n]) => ({ motivo, renglones: n })),
    };
}
