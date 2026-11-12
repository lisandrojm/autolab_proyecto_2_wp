import mongoose, { Types } from "mongoose";
import { Project } from "../models/Project.js";
import { contratosQueRigenDelProyecto } from "../utils/contratosQueRigen.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
import { firmaDeAreas } from "../compartido/configDelEquipo.js";
import { registrarCambiosDelEquipo } from "../services/historialEquipo.js";
/**
 * EL ÁREA Y EL TURNO DEL EQUIPO, IGUALES A LOS DEL CONTRATO QUE RIGE (12/11/2026).
 *
 * Pedido: «el equipo debe tener exactamente los turnos del contrato». Desde hoy cada guardado los deja
 * iguales; este script alinea lo que ya estaba desparejo (un miembro con «Mañana» en el contrato y
 * «Tarde» en el equipo). Manda el CONTRATO QUE RIGE: la fila del equipo pasa a tener exactamente sus
 * áreas, turnos y sedes. Quien tiene un contrato sin área cargada no se toca (se lista aparte).
 *
 *   npm run equipo:igualar-al-contrato                       (solo lectura: lista lo que haría)
 *   APLICAR=1 npm run equipo:igualar-al-contrato             (escribe; cada cambio queda en historial_equipo)
 *   PROYECTO=<id> npm run equipo:igualar-al-contrato         (un solo proyecto)
 *
 * Cada escritura es por persona (`userId`), nunca por posición ni reemplazando el array.
 */
const APLICAR = process.env.APLICAR === "1";
const PROYECTO = process.env.PROYECTO || "";
const oid = (v) => new Types.ObjectId(String(v?._id ?? v));
function plano(asignaciones) {
    return (asignaciones || [])
        .filter((a) => a?.areaId && Types.ObjectId.isValid(String(a.areaId?._id ?? a.areaId)))
        .map((a) => ({
        areaId: oid(a.areaId),
        shiftIds: (a.shiftIds || []).filter((s) => Types.ObjectId.isValid(String(s?._id ?? s))).map(oid),
        ...(Number(a.sedeId) > 0 ? { sedeId: Number(a.sedeId) } : {}),
    }));
}
async function main() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
    await mongoose.connect(uri, { dbName });
    console.log(`Base ${dbName} · ${APLICAR ? "APLICANDO" : "solo lectura"}${PROYECTO ? ` · proyecto ${PROYECTO}` : ""}\n`);
    const hoy = hoyArgentina();
    const proyectos = await Project.find(PROYECTO ? { _id: oid(PROYECTO) } : {}).select("name tenantId teamConfig").lean();
    let distintos = 0, sinFila = 0, contratoSinArea = 0, iguales = 0;
    for (const p of proyectos) {
        const contratoDe = await contratosQueRigenDelProyecto(String(p._id), hoy);
        const filaDe = new Map((p.teamConfig || []).map((f) => [String(f.userId), f]));
        const lineas = [];
        const cambios = [];
        for (const [userId, contrato] of contratoDe) {
            const nuevas = plano(contrato?.areaShiftAssignments || []);
            const fila = filaDe.get(userId);
            if (!nuevas.length) {
                if (fila?.areaShiftAssignments?.length)
                    contratoSinArea++;
                continue;
            }
            if (fila && firmaDeAreas(fila.areaShiftAssignments) === firmaDeAreas(nuevas)) {
                iguales++;
                continue;
            }
            const antes = JSON.parse(firmaDeAreas(fila?.areaShiftAssignments));
            const campos = { areaShiftAssignments: nuevas, areaId: nuevas[0].areaId, shiftId: nuevas[0].shiftIds[0] ?? null, updatedAt: new Date() };
            if (fila)
                distintos++;
            else
                sinFila++;
            lineas.push(`  ${fila ? "~" : "+"} ${userId}: ${firmaDeAreas(fila?.areaShiftAssignments)} → ${firmaDeAreas(nuevas)}`);
            if (!APLICAR)
                continue;
            const r = fila
                ? await Project.updateOne({ _id: p._id }, { $set: Object.fromEntries(Object.entries(campos).map(([k, v]) => [`teamConfig.$[f].${k}`, v])) }, { arrayFilters: [{ "f.userId": oid(userId) }] })
                : await Project.updateOne({ _id: p._id, "teamConfig.userId": { $ne: oid(userId) } }, { $push: { teamConfig: { userId: oid(userId), canRegister: true, useProjectSchedule: true, ...campos } } });
            if (r.modifiedCount)
                cambios.push({ userId, campo: "areas", antes, despues: JSON.parse(firmaDeAreas(nuevas)) });
        }
        if (lineas.length) {
            console.log(`${p.name} (${p._id}): ${lineas.length}`);
            lineas.slice(0, 20).forEach((l) => console.log(l));
            if (lineas.length > 20)
                console.log(`  … y ${lineas.length - 20} más`);
        }
        if (APLICAR && cambios.length)
            await registrarCambiosDelEquipo({ tenantId: p.tenantId, projectId: p._id, origen: "script:equipo-igualar-al-contrato", cambios });
    }
    console.log(`\nDistintos del contrato: ${distintos} · sin fila en el equipo: ${sinFila} · ya iguales: ${iguales} · con área en el equipo y contrato sin área (no se tocan): ${contratoSinArea}`);
    console.log(APLICAR ? "Aplicado." : "Nada escrito. Para aplicar: APLICAR=1");
}
main()
    .catch((e) => {
    console.error(e);
    process.exitCode = 1;
})
    .finally(() => mongoose.disconnect());
