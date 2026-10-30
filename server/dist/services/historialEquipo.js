import { Types } from "mongoose";
import { HistorialEquipo } from "../models/HistorialEquipo.js";
import { User } from "../models/User.js";
import { firmaDeAreas } from "../compartido/configDelEquipo.js";
import { nombreDePersona } from "./novedadesNotificaciones.js";
/** Las filas de `teamConfig` que cambiaron de área/turno entre `antes` y `despues` (por miembro). */
export function cambiosDeAreas(antes, despues) {
    const previo = new Map((antes || []).map((c) => [String(c.userId), c]));
    const cambios = [];
    const vistos = new Set();
    for (const c of despues || []) {
        const id = String(c.userId);
        vistos.add(id);
        const a = previo.get(id)?.areaShiftAssignments || [];
        const d = c.areaShiftAssignments || [];
        if (firmaDeAreas(a) !== firmaDeAreas(d))
            cambios.push({ userId: c.userId, campo: "areas", antes: JSON.parse(firmaDeAreas(a)), despues: JSON.parse(firmaDeAreas(d)) });
    }
    for (const [id, c] of previo)
        if (!vistos.has(id) && (c.areaShiftAssignments || []).length)
            cambios.push({ userId: c.userId, campo: "areas", antes: JSON.parse(firmaDeAreas(c.areaShiftAssignments)), despues: [] });
    return cambios;
}
/** Copia simple de `teamConfig` para comparar después de modificarlo en el lugar. */
export const fotoDeAreas = (config) => (config || []).map((c) => ({ userId: String(c.userId), areaShiftAssignments: JSON.parse(firmaDeAreas(c.areaShiftAssignments)) }));
export async function registrarCambiosDelEquipo(p) {
    if (!p.cambios.length)
        return;
    try {
        const quien = p.porUserId ? await User.findById(p.porUserId).select("firstName lastName metadata.fullName").lean() : null;
        const el = new Date();
        await HistorialEquipo.insertMany(p.cambios.map((c) => ({
            tenantId: p.tenantId ? new Types.ObjectId(String(p.tenantId)) : undefined,
            projectId: new Types.ObjectId(String(p.projectId)),
            userId: new Types.ObjectId(String(c.userId)),
            campo: c.campo,
            antes: c.antes,
            despues: c.despues,
            origen: p.origen,
            payload: p.payload,
            por: p.porUserId && Types.ObjectId.isValid(p.porUserId) ? new Types.ObjectId(p.porUserId) : undefined,
            porNombre: quien ? nombreDePersona(quien) : "",
            el,
        })));
    }
    catch (e) {
        console.warn("[HISTORIAL-EQUIPO] No se pudo registrar el cambio:", e?.message || e);
    }
}
