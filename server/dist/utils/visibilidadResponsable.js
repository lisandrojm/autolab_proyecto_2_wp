import { Types } from "mongoose";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
const VACIO = { proyectos: [], clientes: [] };
export async function alcanceDeResponsable(tenantId, userId) {
    if (!tenantId || !userId)
        return VACIO;
    const usuario = await User.findById(userId).select("metadata.id").lean();
    const idFrame = Number(usuario?.metadata?.id);
    // Sin id de FRAME no hay forma de matchear `responsableId`: se devuelve vacío y manda `assignedUsers`.
    if (!Number.isFinite(idFrame))
        return VACIO;
    const proyectos = await Project.find({ tenantId, "metadata.responsableId": idFrame }).select("_id clientId").lean();
    if (proyectos.length === 0)
        return VACIO;
    const clientes = [...new Set(proyectos.map((p) => (p.clientId ? String(p.clientId) : "")).filter(Boolean))].map((id) => new Types.ObjectId(id));
    return { proyectos: proyectos.map((p) => p._id), clientes };
}
