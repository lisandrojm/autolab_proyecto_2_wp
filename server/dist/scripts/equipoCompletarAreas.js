import mongoose, { Types } from "mongoose";
import { Project } from "../models/Project.js";
import { contratosQueRigenDelProyecto } from "../utils/contratosQueRigen.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
import { firmaDeAreas } from "../compartido/configDelEquipo.js";
import { registrarCambiosDelEquipo } from "../services/historialEquipo.js";
/**
 * EL ÁREA DE CADA MIEMBRO, CARGADA EN EL EQUIPO (fase 3, 30/10/2026).
 *
 * Desde la fase 2 el equipo (`teamConfig`) es la verdad del área: una fila vacía es «sin área» y el
 * contrato que rige sólo vale para quien no tiene fila. Hasta acá, a quien no tenía fila o la tenía vacía
 * las pantallas le mostraban el área del contrato que rige HOY, que cambia con el calendario. Este script
 * congela eso que se ve hoy: a cada miembro sin fila o con la fila vacía le carga el área de su contrato
 * que rige. Además alinea los campos viejos (`areaId`/`shiftId`) con la primera asignación.
 *
 * Correrlo JUSTO ANTES de reiniciar con la fase 2 (git pull → script → forever restart): así nadie pasa a
 * verse «sin área» por el cambio de regla.
 *
 *   npm run equipo:completar-areas            (solo lectura: lista lo que haría)
 *   APLICAR=1 npm run equipo:completar-areas  (escribe; cada cambio queda en historial_equipo)
 *
 * Cada escritura es por persona y condicionada: si mientras corre alguien le cargó un área, no se pisa.
 */
const APLICAR = process.env.APLICAR === "1";
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
    console.log(`Base ${dbName} · ${APLICAR ? "APLICANDO" : "solo lectura"}\n`);
    const hoy = hoyArgentina();
    const proyectos = await Project.find({}).select("name tenantId teamConfig").lean();
    let sinFila = 0, vacias = 0, viejos = 0, sinDatos = 0;
    for (const p of proyectos) {
        const contratoDe = await contratosQueRigenDelProyecto(String(p._id), hoy);
        const filaDe = new Map((p.teamConfig || []).map((f) => [String(f.userId), f]));
        const lineas = [];
        const cambios = [];
        for (const [userId, contrato] of contratoDe) {
            const fila = filaDe.get(userId);
            const tiene = !!fila?.areaShiftAssignments?.length;
            if (tiene)
                continue;
            const nuevas = plano(contrato?.areaShiftAssignments || []);
            if (!nuevas.length) {
                sinDatos++;
                continue;
            }
            const legacy = { areaId: nuevas[0].areaId, shiftId: nuevas[0].shiftIds[0] };
            if (!fila) {
                sinFila++;
                lineas.push(`  + ${userId} sin fila → ${firmaDeAreas(nuevas)}`);
                if (APLICAR) {
                    const r = await Project.updateOne({ _id: p._id, "teamConfig.userId": { $ne: oid(userId) } }, { $push: { teamConfig: { userId: oid(userId), canRegister: true, useProjectSchedule: true, areaShiftAssignments: nuevas, ...legacy, updatedAt: new Date() } } });
                    if (r.modifiedCount)
                        cambios.push({ userId, campo: "areas", antes: [], despues: JSON.parse(firmaDeAreas(nuevas)) });
                }
            }
            else {
                vacias++;
                lineas.push(`  ~ ${userId} fila vacía → ${firmaDeAreas(nuevas)}`);
                if (APLICAR) {
                    const r = await Project.updateOne({ _id: p._id }, { $set: { "teamConfig.$[f].areaShiftAssignments": nuevas, "teamConfig.$[f].areaId": legacy.areaId, "teamConfig.$[f].shiftId": legacy.shiftId, "teamConfig.$[f].updatedAt": new Date() } }, 
                    // Sólo si sigue vacía (falta o []): si alguien le cargó un área mientras corría, no se pisa.
                    { arrayFilters: [{ "f.userId": oid(userId), "f.areaShiftAssignments.0": { $exists: false } }] });
                    if (r.modifiedCount)
                        cambios.push({ userId, campo: "areas", antes: [], despues: JSON.parse(firmaDeAreas(nuevas)) });
                }
            }
        }
        // Campos viejos desalineados con la primera asignación (el parte del móvil los leía).
        for (const f of p.teamConfig || []) {
            const a = f.areaShiftAssignments?.[0];
            if (!a)
                continue;
            const area = String(a.areaId);
            const turno = a.shiftIds?.[0] ? String(a.shiftIds[0]) : "";
            if (String(f.areaId || "") === area && String(f.shiftId || "") === turno)
                continue;
            viejos++;
            if (APLICAR)
                await Project.updateOne({ _id: p._id }, { $set: { "teamConfig.$[f].areaId": oid(area), "teamConfig.$[f].shiftId": turno ? oid(turno) : null } }, { arrayFilters: [{ "f.userId": oid(f.userId) }] });
        }
        if (lineas.length) {
            console.log(`${p.name} (${p._id}): ${lineas.length}`);
            lineas.slice(0, 15).forEach((l) => console.log(l));
            if (lineas.length > 15)
                console.log(`  … y ${lineas.length - 15} más`);
        }
        if (APLICAR && cambios.length)
            await registrarCambiosDelEquipo({ tenantId: p.tenantId, projectId: p._id, origen: "script:equipo-completar-areas", cambios });
    }
    console.log(`\nSin fila: ${sinFila} · fila vacía: ${vacias} · sin área en el contrato tampoco (quedan sin área): ${sinDatos} · campos viejos desalineados: ${viejos}`);
    console.log(APLICAR ? "Aplicado." : "Nada escrito. Para aplicar: APLICAR=1");
}
main()
    .catch((e) => {
    console.error(e);
    process.exitCode = 1;
})
    .finally(() => mongoose.disconnect());
