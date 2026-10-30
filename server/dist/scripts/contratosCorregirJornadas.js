import mongoose from "mongoose";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Contrato } from "../models/Contrato.js";
import { CAMPOS_DEL_TIPO_PARA_IMPORTES, jornadasQueFijaElTipo, sueldosConEscala } from "../services/importesDelContrato.js";
import { solicitudSegunElContrato } from "../services/revisionDeSolicitud.js";
/**
 * LOS CONTRATOS QUE QUEDARON CON LAS JORNADAS DEL TIPO ENTERAS, corregidos con la cuenta de hoy.
 *
 * Hasta el 30/10/2026, al guardar un contrato de un tipo que fija jornadas («Servicios»: 22; «Plazo
 * fijo»: 30) el server ponía esas jornadas enteras aunque el período fuera un tramo de mes, y rehacía
 * los sueldos con eso: un Servicios del 1 al 9 de octubre (7 jornadas, $510.000) quedó con 22 y el
 * sueldo en mano igual al mensual ($1.602.857). El formulario, desde el 19/10, cuenta los días que
 * trabaja en el tramo (`jornadasFijadasPorElTipo`); ahora el server también (`jornadasQueFijaElTipo`).
 *
 * Este script recorre los contratos de esos tipos, lista los que no coinciden con esa cuenta y, con
 * APLICAR=1, les corrige las jornadas y los sueldos (`sueldosConEscala`, la misma función que usa el
 * server al guardar). Si el contrato vino de una solicitud, la solicitud se alinea también
 * (`solicitudSegunElContrato`), como al aprobar.
 *
 * Sólo se corrigen los contratos con alta desde DESDE (por defecto 2026-10-19, cuando cambió la regla
 * en el formulario): los anteriores se guardaron con la regla de entonces y se liquidaron así; se
 * listan aparte, sin tocar. Los documentos ya generados no se rehacen solos: hay que volver a generarlos.
 *
 *   npm run contratos:corregir-jornadas                        (solo lectura)
 *   APLICAR=1 npm run contratos:corregir-jornadas              (escribe)
 *   DESDE=2026-10-01 npm run contratos:corregir-jornadas       (otro corte de alta)
 */
const APLICAR = process.env.APLICAR === "1";
const DESDE = process.env.DESDE || "2026-10-19";
const pesos = (n) => (Number(n) || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function main() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
    await mongoose.connect(uri, { dbName });
    console.log(`Base ${dbName} · ${APLICAR ? "APLICANDO" : "solo lectura"} · corrige altas desde ${DESDE}\n`);
    // Los tipos que fijan jornadas por período (los de días sueltos no: cada día marcado es un jornal).
    const tipos = await Contrato.find({ "data.cantidadJornadas": { $gt: 0 }, "data.modoFechas": { $ne: "dias" } })
        .select(`name ${CAMPOS_DEL_TIPO_PARA_IMPORTES}`)
        .lean();
    const tipoPorId = new Map(tipos.map((t) => [String(t._id), t]));
    console.log(`Tipos que fijan jornadas: ${tipos.map((t) => `${t.name} (${t.data?.cantidadJornadas})`).join(", ") || "ninguno"}\n`);
    const nombreDe = new Map();
    const nombrePersona = async (id) => {
        const k = `u:${id}`;
        if (!nombreDe.has(k)) {
            const u = await User.findById(id).select("firstName lastName").lean();
            nombreDe.set(k, u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : String(id));
        }
        return nombreDe.get(k);
    };
    const nombreProyecto = async (id) => {
        const k = `p:${id}`;
        if (!nombreDe.has(k)) {
            const p = await Project.findById(id).select("name").lean();
            nombreDe.set(k, p?.name || String(id));
        }
        return nombreDe.get(k);
    };
    let revisados = 0;
    let distintos = 0;
    let fueraDeRango = 0;
    let corregidos = 0;
    const cursor = UserProject.find({ "contracts.0": { $exists: true } }).select("userId projectId contracts").lean().cursor();
    for await (const up of cursor) {
        for (let i = 0; i < (up.contracts || []).length; i++) {
            const c = up.contracts[i];
            const tipo = tipoPorId.get(String(c?.contrato_id || ""));
            if (!tipo)
                continue;
            revisados++;
            const fijas = jornadasQueFijaElTipo(c, tipo);
            if (fijas === null)
                continue;
            const actuales = Number(c.cantidad_jornadas_laborales) || 0;
            if (actuales === fijas)
                continue;
            distintos++;
            const corregido = { ...c, cantidad_jornadas_laborales: fijas };
            const sueldos = Number(c.sueldo_jornada) > 0 || tipo.data?.importesEnCero ? await sueldosConEscala(corregido, tipo) : {};
            const enRango = String(c.fecha_alta_contrato || "") >= DESDE;
            if (!enRango)
                fueraDeRango++;
            console.log(`${enRango ? "·" : "  (anterior a DESDE, no se toca)"} ${await nombrePersona(up.userId)} · ${await nombreProyecto(up.projectId)} · ${tipo.name} · ${c.fecha_alta_contrato || "?"} → ${c.fecha_baja_contrato || "indeterminado"} · ` +
                `jornadas ${actuales} → ${fijas} · en mano ${pesos(c.sueldo_mano)} → ${pesos(sueldos.sueldo_mano ?? c.sueldo_mano)}`);
            if (!APLICAR || !enRango)
                continue;
            // El contrato no tiene _id: se escribe por su posición en el array, como hace el resto del server.
            const set = { [`contracts.${i}.cantidad_jornadas_laborales`]: fijas };
            for (const [campo, valor] of Object.entries(sueldos))
                set[`contracts.${i}.${campo}`] = valor;
            await UserProject.updateOne({ _id: up._id, [`contracts.${i}.contrato_id`]: c.contrato_id }, { $set: set });
            if (c.solicitudId) {
                const alineada = await solicitudSegunElContrato({ ...corregido, ...sueldos });
                await User.updateOne({ _id: c.solicitudId, "metadata.solicitudStatus": "aprobada" }, { $set: alineada });
            }
            corregidos++;
        }
    }
    console.log(`\nContratos de esos tipos: ${revisados} · con otras jornadas: ${distintos} (${fueraDeRango} anteriores a ${DESDE}, sin tocar)`);
    console.log(APLICAR ? `Corregidos: ${corregidos}. Los documentos ya generados hay que volver a generarlos.` : "Nada escrito. Para aplicar: APLICAR=1");
}
main()
    .catch((e) => {
    console.error(e);
    process.exitCode = 1;
})
    .finally(() => mongoose.disconnect());
