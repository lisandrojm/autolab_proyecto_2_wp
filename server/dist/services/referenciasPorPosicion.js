import mongoose, { Types } from "mongoose";
const db = () => mongoose.connection.db;
const oid = (v) => (v && Types.ObjectId.isValid(String(v)) ? new Types.ObjectId(String(v)) : null);
export const SIN_CLAVE = { $in: [null] }; // null o sin el campo
/** Las referencias que todavía no tienen clave (lo único que miran el backfill y la reubicación). */
export async function leerReferencias() {
    const refs = [];
    const top = async (coleccion, campoIndice, proy, huella, texto) => {
        const docs = await db().collection(coleccion).find({ contratoKey: SIN_CLAVE, userProjectId: { $ne: null } }).project({ userProjectId: 1, [campoIndice]: 1, ...proy }).toArray();
        for (const d of docs)
            refs.push({ coleccion, _id: d._id, userProjectId: d.userProjectId, indice: d[campoIndice] ?? null, campoIndice, huella: huella(d), texto: texto(d) });
    };
    await top("arca_verificaciones_altas", "contractIndex", { alta: 1, empresaId: 1, nombre: 1 }, (d) => ({ alta: d.alta, empresaId: d.empresaId }), (d) => `${d.nombre || ""} · alta ${d.alta || "?"}`);
    await top("constancias_arca", "contractIndex", { fechaAlta: 1, empresaId: 1, nombre: 1, logId: 1 }, (d) => ({ alta: d.fechaAlta, empresaId: d.empresaId, logId: d.logId }), (d) => `${d.nombre || ""} · alta ${d.fechaAlta || "?"}`);
    await top("renovaciones_contrato", "indiceContrato", { fechaBajaContrato: 1, decision: 1 }, (d) => ({ baja: d.fechaBajaContrato }), (d) => `${d.decision} · baja ${d.fechaBajaContrato}`);
    await top("recibos_sueldo_enviados", "contractIndex", { periodo: 1, nombreUsuario: 1 }, () => ({}), (d) => `${d.nombreUsuario || ""} · ${d.periodo || ""}`);
    // Solicitudes de renovación (en `users`).
    const sols = await db().collection("users").find({ "metadata.renovacionDe.userProjectId": { $ne: null }, "metadata.renovacionDe.contratoKey": SIN_CLAVE }).project({ "metadata.renovacionDe": 1, firstName: 1, lastName: 1 }).toArray();
    for (const d of sols) {
        const r = d.metadata.renovacionDe;
        const up = oid(r.userProjectId);
        if (!up)
            continue;
        refs.push({ coleccion: "users", _id: d._id, userProjectId: up, indice: r.indiceContrato ?? null, campoIndice: "metadata.renovacionDe.indiceContrato", huella: { baja: r.fechaBajaContrato }, texto: `solicitud ${d.firstName || ""} ${d.lastName || ""} · baja ${r.fechaBajaContrato}` });
    }
    // Los que viven en arrays. El log de una corrida: su `_id` es el `logId` que el contrato presentado guarda.
    const logs = await db().collection("arca_altas_logs").find({ contratos: { $elemMatch: { userProjectId: { $ne: null }, contratoKey: SIN_CLAVE } } }).project({ empresaId: 1, createdAt: 1, "contratos.userProjectId": 1, "contratos.contractIndex": 1, "contratos.contratoKey": 1, "contratos.nombre": 1 }).toArray();
    for (const l of logs)
        for (const c of l.contratos || []) {
            if (!c?.userProjectId || c.contratoKey)
                continue;
            refs.push({ coleccion: "arca_altas_logs", arreglo: "contratos", _id: l._id, userProjectId: c.userProjectId, indice: c.contractIndex ?? null, campoIndice: "contractIndex", huella: { empresaId: l.empresaId, logId: l._id }, texto: `log ${l.createdAt ? new Date(l.createdAt).toISOString().slice(0, 10) : ""} · ${c.nombre || ""}` });
        }
    const lotes = await db().collection("recibos_sueldo_lotes").find({ recibos: { $elemMatch: { userProjectId: { $ne: null }, contratoKey: SIN_CLAVE } } }).project({ periodo: 1, "recibos.userProjectId": 1, "recibos.contractIndex": 1, "recibos.contratoKey": 1, "recibos.nombreUsuario": 1 }).toArray();
    for (const l of lotes)
        for (const r of l.recibos || []) {
            if (!r?.userProjectId || r.contratoKey)
                continue;
            refs.push({ coleccion: "recibos_sueldo_lotes", arreglo: "recibos", _id: l._id, userProjectId: r.userProjectId, indice: r.contractIndex ?? null, campoIndice: "contractIndex", huella: {}, texto: `lote ${l.periodo || ""} · ${r.nombreUsuario || ""}` });
        }
    return refs;
}
/** Los contratos de cada vínculo, con lo que hace falta para comparar huellas. */
export async function contratosDe(ids) {
    const out = new Map();
    const unicos = [...new Set(ids.map(String))].map((s) => new Types.ObjectId(s));
    for (let i = 0; i < unicos.length; i += 300) {
        const ups = await db().collection("users_&_projects").find({ _id: { $in: unicos.slice(i, i + 300) } })
            .project({ "contracts.contratoKey": 1, "contracts.fecha_alta_contrato": 1, "contracts.fecha_baja_contrato": 1, "contracts.empresaContratoId": 1, "contracts.estadoContrato": 1, "contracts.altaArcaPresentada.logId": 1 }).toArray();
        for (const u of ups)
            out.set(String(u._id), u.contracts || []);
    }
    return out;
}
/** El campo de la clave y el del vínculo, según la colección. */
export const campoClave = (coleccion) => (coleccion === "users" ? "metadata.renovacionDe.contratoKey" : "contratoKey");
export const campoVinculo = (coleccion) => (coleccion === "users" ? "metadata.renovacionDe.userProjectId" : "userProjectId");
