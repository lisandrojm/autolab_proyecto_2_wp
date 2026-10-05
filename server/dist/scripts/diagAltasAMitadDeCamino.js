/**
 * DIAGNÓSTICO, SÓLO LECTURA, previo a cambiar por dónde viaja el PDF del alta temprana:
 *
 *   1. Qué Estados avanzan solos por una carpeta de Dropbox, y qué carpetas mira cada uno.
 *   2. Los contratos con el alta en juego, agrupados por dónde están parados:
 *        A · alta cargada, contrato todavía SIN enviar a firmar
 *        B · alta cargada, contrato ENVIADO a firmar (el alta ya viajó con él, si el tipo la firma)
 *        C · presentada en ARCA y todavía sin el PDF del alta cargado
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagAltasAMitadDeCamino.ts <tenantId>
 *
 * No escribe nada.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Info } from "../models/Info.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
const [tenantId] = process.argv.slice(2);
if (!tenantId || !Types.ObjectId.isValid(tenantId)) {
    console.error("Uso: <tenantId>");
    process.exit(1);
}
const dia = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "—");
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const estados = await Info.find({ type: "estado-empleado" }).select("name data.id data.ordenDependencia data.esImpositivo data.tipoImpositivo data.transicionAutomatica").lean();
    const nombreEstado = new Map(estados.map((e) => [Number(e.data?.id), String(e.name)]));
    console.log("── Estados que avanzan solos por una carpeta de Dropbox ──");
    for (const e of estados.filter((x) => (x.data?.transicionAutomatica?.carpetas || []).length > 0).sort((a, b) => (a.data?.ordenDependencia ?? 0) - (b.data?.ordenDependencia ?? 0))) {
        const t = e.data.transicionAutomatica;
        console.log(`  paso ${e.data?.ordenDependencia} · «${e.name}» (id ${e.data?.id}) · evento ${t.evento || t.tipo || "?"}`);
        for (const c of t.carpetas)
            console.log(`       carpeta: ${c.dropboxCarpeta}${c.proposito ? `  [${[].concat(c.proposito).join(", ")}]` : ""}${c.detalle ? `  (${c.detalle})` : ""}`);
    }
    console.log("\n── Todos los estados, en orden ──");
    for (const e of [...estados].sort((a, b) => (a.data?.ordenDependencia ?? 0) - (b.data?.ordenDependencia ?? 0)))
        console.log(`  paso ${String(e.data?.ordenDependencia ?? "—").padStart(2)} · id ${String(e.data?.id).padStart(2)} · ${e.name}${e.data?.esImpositivo ? ` · impositivo (${e.data?.tipoImpositivo})` : ""}`);
    const proyectos = await Project.find({ tenantId: new Types.ObjectId(tenantId) }).select("_id name").lean();
    const nombreProyecto = new Map(proyectos.map((p) => [String(p._id), p.name]));
    const ups = await UserProject.find({
        projectId: { $in: proyectos.map((p) => p._id) },
        contracts: { $elemMatch: { $or: [{ altaDocumentoUrl: { $exists: true, $nin: [null, ""] } }, { "altaArcaPresentada.resultado": { $exists: true } }] } },
    })
        .select("userId projectId contracts.estado_id contracts.nombre_estado_empleado contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.altaDocumentoUrl contracts.altaDocumentoNombre contracts.altaArcaPresentada contracts.firmaEnviadaAt contracts.firmaGeneradoAt contracts.nombre_contrato")
        .lean();
    const users = await User.find({ _id: { $in: ups.map((u) => u.userId) } }).select("firstName lastName").lean();
    const nombre = new Map(users.map((u) => [String(u._id), `${u.firstName || ""} ${u.lastName || ""}`.trim()]));
    const grupos = { A: [], B: [], C: [] };
    for (const up of ups) {
        (up.contracts || []).forEach((c, i) => {
            const conAlta = !!c.altaDocumentoUrl;
            const presentada = c.altaArcaPresentada?.resultado;
            if (!conAlta && !presentada)
                return;
            const fila = `  ${String(nombre.get(String(up.userId)) || up.userId).padEnd(34)} ${String(nombreProyecto.get(String(up.projectId)) || "").padEnd(14)} ${String(c.fecha_alta_contrato || "").slice(0, 10)}→${String(c.fecha_baja_contrato || "").slice(0, 10)}  estado «${c.nombre_estado_empleado || nombreEstado.get(Number(c.estado_id)) || "sin estado"}»  ${c.nombre_contrato || ""}  enviado a firmar: ${dia(c.firmaEnviadaAt)}${presentada ? `  ARCA: ${presentada}` : ""}  ref=${up._id}:${i}`;
            if (conAlta && !c.firmaEnviadaAt)
                grupos.A.push(fila);
            else if (conAlta)
                grupos.B.push(fila);
            else
                grupos.C.push(fila);
        });
    }
    const TITULO = {
        A: "A · alta cargada, contrato SIN enviar a firmar",
        B: "B · alta cargada, contrato YA enviado a firmar",
        C: "C · presentada en ARCA, sin el PDF del alta cargado",
    };
    for (const g of ["A", "B", "C"]) {
        console.log(`\n── ${TITULO[g]}: ${grupos[g].length} ──`);
        for (const f of grupos[g].sort())
            console.log(f);
    }
    await mongoose.disconnect();
}
main().catch(async (e) => {
    console.error("Error:", e?.message || e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
