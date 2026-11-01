// SÓLO LECTURA: cómo están los contratos de TOMAS FACUNDO GARAVANO y sus corridas de altas.
import mongoose from "mongoose";
import { env } from "../config/env.js";
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const db = mongoose.connection.db;
    const users = await db.collection("users").find({ firstName: /tomas/i, lastName: /garavano/i }).project({ firstName: 1, lastName: 1, "metadata.cuit": 1, tenantId: 1 }).toArray();
    console.log("users", JSON.stringify(users));
    const estados = new Map((await db.collection("infos").find({ type: "estado-empleado" }).project({ name: 1, "data.id": 1 }).toArray()).map((e) => [Number(e.data?.id), e.name]));
    for (const u of users) {
        const ups = await db.collection("users_&_projects").find({ userId: u._id }).toArray();
        for (const up of ups) {
            (up.contracts || []).forEach((c, i) => {
                console.log(JSON.stringify({
                    up: String(up._id), i, alta: c.fecha_alta_contrato, baja: c.fecha_baja_contrato, estado: c.estado_empleado_id ?? c.estadoEmpleadoId, estadoNombre: estados.get(Number(c.estado_empleado_id ?? c.estadoEmpleadoId)) ?? c.nombre_estado_empleado,
                    altaArcaPresentada: c.altaArcaPresentada, altaDoc: c.documento_alta || c.altaDocumento || c.alta_documento || null, createdAt: c.fecha_carga,
                }));
            });
        }
        const cuit = String(u.metadata?.cuit || "").replace(/\D/g, "");
        const logs = await db.collection("arca_altas_logs").find({ "contratos.cuil": cuit }).project({ createdAt: 1, enSeco: 1, usuario: 1, "contratos.$": 1 }).sort({ createdAt: -1 }).limit(10).toArray();
        for (const l of logs)
            console.log("log", l.createdAt, l.enSeco ? "SECO" : "", l.usuario, JSON.stringify(l.contratos?.[0]?.resultado), l.contratos?.[0]?.motivo || "", JSON.stringify(l.contratos?.[0]?.contrato));
    }
    await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
