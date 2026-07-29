/* Solo lectura: cuántos miembros cambian de NO VIGENTE a VIGENTE si el contrato activo se elige
   priorizando los vigentes (indeterminados incluidos) en vez de tomar siempre el último del array. */
import mongoose from "mongoose";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { ContratoFrame } from "../models/ContratoFrame.js";
function hoyAR() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}
const vig = (baja, hoy) => !baja || String(baja).substring(0, 10) >= hoy;
async function main() {
    await mongoose.connect(String(process.env.MONGO_URI), { dbName: String(process.env.MONGO_DB_NAME) });
    const frames = await ContratoFrame.find().lean();
    const indeterminadoPorNombre = new Map();
    for (const f of frames) {
        indeterminadoPorNombre.set(String(f.name || "").toLowerCase(), !!f.data?.esTiempoIndeterminado || /indetermin/i.test(String(f.name || "")));
    }
    const p = await Project.findOne({ name: { $regex: "426_LN", $options: "i" } }).select("_id name").lean();
    const projectId = String(p._id);
    const members = await User.find({ projectIds: projectId })
        .select("_id firstName lastName metadata.activo metadata.projects")
        .populate({ path: "metadata.projects", model: UserProject, select: "projectId contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.nombre_contrato" })
        .lean();
    const hoy = hoyAR();
    let vigAntes = 0;
    let vigDespues = 0;
    const cambian = [];
    let sinBajaPeroUltimoVencido = 0;
    for (const m of members) {
        const up = (m.metadata?.projects || []).find((x) => x && String(x.projectId) === String(projectId));
        const contracts = up?.contracts || [];
        if (contracts.length === 0)
            continue;
        // ANTES: siempre el último del array
        const ultimo = contracts[contracts.length - 1];
        const antes = vig(ultimo.fecha_baja_contrato, hoy);
        // DESPUÉS: el más reciente entre los vigentes; si no hay ninguno, el último
        const vigentes = contracts.filter((c) => vig(c.fecha_baja_contrato, hoy));
        const activo = vigentes.length > 0 ? vigentes[vigentes.length - 1] : ultimo;
        const despues = vig(activo.fecha_baja_contrato, hoy);
        if (antes)
            vigAntes++;
        if (despues)
            vigDespues++;
        if (!antes && despues) {
            const indet = indeterminadoPorNombre.get(String(activo.nombre_contrato || "").toLowerCase()) ?? false;
            if (!activo.fecha_baja_contrato)
                sinBajaPeroUltimoVencido++;
            if (cambian.length < 12) {
                cambian.push(`${m.firstName} ${m.lastName} — contratos=${contracts.length} | último="${ultimo.nombre_contrato}" baja=${String(ultimo.fecha_baja_contrato || "—").substring(0, 10)} → activo="${activo.nombre_contrato}" baja=${String(activo.fecha_baja_contrato || "—").substring(0, 10)}${indet ? " (tipo indeterminado)" : ""}`);
            }
        }
    }
    console.log(`Proyecto ${p.name}: miembros con contratos = ${members.length}`);
    console.log(`VIGENTES antes (último del array): ${vigAntes}`);
    console.log(`VIGENTES después (prioriza vigentes): ${vigDespues}`);
    console.log(`De los que cambian, con contrato SIN fecha de baja: ${sinBajaPeroUltimoVencido}`);
    console.log(`\nEjemplos:`);
    cambian.forEach((c) => console.log(`  - ${c}`));
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
