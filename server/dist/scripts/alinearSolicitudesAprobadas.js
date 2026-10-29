import mongoose from "mongoose";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { cambiosAlAprobar, solicitudSegunElContrato } from "../services/revisionDeSolicitud.js";
/**
 * LAS SOLICITUDES YA APROBADAS, ALINEADAS CON SU CONTRATO.
 *
 * Desde el 29/10/2026 aprobar (o editar el contrato) deja en la solicitud lo que se contrató
 * (`solicitudSegunElContrato`). Las aprobadas antes siguen diciendo lo que se pidió: Pablo A. Perez
 * figura como «Jornada» aunque se aprobó como Servicios Intercambio. Este script lista las que difieren
 * y, con APLICAR=1, las alinea. Lo pedido no se pierde: si la solicitud no tiene `solicitudRevision`,
 * antes se guarda ahí la comparación pedido → aprobado.
 *
 *   npm run solicitudes:alinear-con-contrato            (solo lectura)
 *   APLICAR=1 npm run solicitudes:alinear-con-contrato  (escribe)
 */
const APLICAR = process.env.APLICAR === "1";
/** Arrays y objetos por su JSON (lista vacía = no cargada); el resto, como texto (un ObjectId y su id son lo mismo). */
const distinto = (a, b) => {
    const vacio = (v) => v == null || (Array.isArray(v) && v.length === 0);
    if (vacio(a) && vacio(b))
        return false;
    if (b && typeof b === "object" && !(b instanceof mongoose.Types.ObjectId))
        return JSON.stringify(a ?? null) !== JSON.stringify(b);
    return String(a ?? "") !== String(b ?? "");
};
const valor = (doc, ruta) => ruta.split(".").reduce((o, k) => (o == null ? o : o[k]), doc);
async function main() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
    await mongoose.connect(uri, { dbName });
    console.log(`Base ${dbName} · ${APLICAR ? "APLICANDO" : "solo lectura"}\n`);
    const ups = await UserProject.find({ "contracts.solicitudId": { $exists: true, $ne: null } }, { projectId: 1, contracts: 1 }).lean();
    let revisadas = 0;
    let distintas = 0;
    let tipoDistinto = 0;
    for (const up of ups) {
        for (const contrato of up.contracts || []) {
            if (!contrato.solicitudId)
                continue;
            const sol = await User.findOne({ _id: contrato.solicitudId, "metadata.solicitudStatus": "aprobada" }, { firstName: 1, lastName: 1, metadata: 1 }).lean();
            if (!sol)
                continue;
            revisadas++;
            const set = await solicitudSegunElContrato(contrato);
            const difieren = Object.entries(set).filter(([ruta, v]) => distinto(valor(sol, ruta), v));
            if (!difieren.length)
                continue;
            distintas++;
            const nombre = `${sol.firstName || ""} ${sol.lastName || ""}`.trim();
            const tipo = difieren.find(([r]) => r === "metadata.nombre_contrato");
            if (tipo)
                tipoDistinto++;
            console.log(`· ${nombre} (${sol._id})${tipo ? `  tipo: ${sol.metadata?.nombre_contrato} → ${tipo[1]}` : ""}  [${difieren.map(([r]) => r.replace("metadata.", "")).join(", ")}]`);
            if (!APLICAR)
                continue;
            if (!sol.metadata?.solicitudRevision) {
                const proyecto = await Project.findById(up.projectId).select("name").lean();
                const cambios = await cambiosAlAprobar(sol.metadata, contrato, proyecto || { _id: up.projectId });
                if (cambios.length)
                    await User.updateOne({ _id: sol._id }, { $set: { "metadata.solicitudRevision": { cambios, comentario: "", porNombre: "", el: new Date() } } });
            }
            await User.updateOne({ _id: sol._id }, { $set: Object.fromEntries(difieren) });
        }
    }
    console.log(`\nSolicitudes aprobadas con contrato: ${revisadas} · distintas de su contrato: ${distintas} (${tipoDistinto} con otro tipo de contrato)`);
    console.log(APLICAR ? "Alineadas." : "Nada escrito. Para aplicar: APLICAR=1");
}
main()
    .catch((e) => {
    console.error(e);
    process.exitCode = 1;
})
    .finally(() => mongoose.disconnect());
