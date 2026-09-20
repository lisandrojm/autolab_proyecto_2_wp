/**
 * ═══════════════════════════════════════════════════════════════════════
 * DEVOLVER EL MOTIVO "OTROS PRESENTES" QUE SE BORRÓ DEL ABM
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   npx tsx src/scripts/restaurarOtrosPresentes.ts <tenantId>            # dice qué haría
 *   npx tsx src/scripts/restaurarOtrosPresentes.ts <tenantId> --aplicar  # lo restaura
 *
 * El 20/09/2026 se borró "Otros Presentes" desde el ABM. El borrado es real —`findOneAndDelete`, sin
 * rastro—, y los 208 renglones que lo nombran guardan el TEXTO, no el id: de un momento a otro
 * dejaron de emparejar con ningún motivo. En la liquidación de agosto eso significó 44 avisos y,
 * sobre todo, que los 122 reemplazantes que cubrieron esas ausencias se quedaran sin su jornal.
 *
 * SE RESTAURA CON EL `_id` ORIGINAL. No hace falta que sea otro: ningún renglón lo referencia por id
 * todavía, así que un id nuevo también funcionaría, pero volver al mismo deja la base como estaba y
 * hace que cualquier referencia vieja que aparezca después siga cerrando.
 *
 * Y SE LE CARGA SU MAPEO CON VIGENCIA RETROACTIVA. Sin eso el motivo existe pero no liquida nada
 * antes de hoy, y agosto seguiría roto: la vigencia de un efecto se evalúa contra el día de la
 * novedad, no contra la fecha en que se configuró.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { RequestConfig } from "../models/RequestConfig.js";
import { Request } from "../models/Request.js";
import { MAPEO_SEMILLA } from "../utils/liquidacion/mapeoSemilla.js";
/**
 * El documento tal como estaba, según el relevamiento previo al borrado.
 *
 * `order: 9` es el lugar que tenía; el 8 quedó libre cuando se borró "Horas Extras y Feriados", que
 * ese sí estaba de más —nunca se usó en toda la historia—.
 */
const ORIGINAL = {
    _id: new Types.ObjectId("696e0afeee864e3d5ceec556"),
    name: "Otros Presentes",
    order: 9,
    requiresReplacement: true,
    isActive: true,
    visibility: "all",
    allowedProjectIds: [],
};
async function main() {
    const tenantIdArg = process.argv[2];
    const aplicar = process.argv.includes("--aplicar");
    if (!tenantIdArg || !Types.ObjectId.isValid(tenantIdArg)) {
        console.error("Falta el tenantId. Uso: npx tsx src/scripts/restaurarOtrosPresentes.ts <tenantId> [--aplicar]");
        process.exit(1);
    }
    const tenantId = new Types.ObjectId(tenantIdArg);
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    console.log(`Base: ${env.MONGO_DB_NAME}${aplicar ? "" : "   (simulación: no se escribe nada)"}\n`);
    /* ── Cuánto hay en juego ── */
    const uso = await Request.aggregate([
        { $match: { tenantId } },
        { $unwind: "$attendance" },
        { $match: { "attendance.absenceReason": ORIGINAL.name } },
        {
            $group: {
                _id: null,
                renglones: { $sum: 1 },
                conReemplazante: { $sum: { $cond: [{ $ifNull: ["$attendance.replacementId", false] }, 1, 0] } },
                primera: { $min: "$date" },
                ultima: { $max: "$date" },
            },
        },
    ]);
    const datos = uso[0];
    if (datos) {
        console.log(`Renglones que dicen "${ORIGINAL.name}": ${datos.renglones}   (${datos.conReemplazante} con reemplazante)`);
        console.log(`Desde ${datos.primera} hasta ${datos.ultima}\n`);
    }
    else {
        console.log(`No hay renglones que digan "${ORIGINAL.name}".\n`);
    }
    /*
      La vigencia del mapeo arranca el día del PRIMER renglón que lo nombra. Ponerla hoy dejaría agosto
      igual de roto: la vigencia se evalúa contra el día de la novedad.
    */
    const desde = String(datos?.primera || "2026-01-01").slice(0, 10);
    /* ── ¿Ya existe? ── */
    const porNombre = await RequestConfig.findOne({ tenantId, name: ORIGINAL.name }).lean();
    const porId = await RequestConfig.findById(ORIGINAL._id).lean();
    if (porNombre) {
        console.log(`=  Ya existe un motivo llamado "${ORIGINAL.name}" (${porNombre._id}). No se toca.`);
        await mongoose.disconnect();
        return;
    }
    if (porId) {
        console.log(`!  El id original está ocupado por "${porId.name}". Habría que decidir a mano: no se toca nada.`);
        await mongoose.disconnect();
        process.exit(1);
    }
    const efectos = (MAPEO_SEMILLA[ORIGINAL.name] || []).map((e) => ({
        ...e,
        soloRegimen: e.soloRegimen ?? null,
        empresaId: null,
        vigenteDesde: desde,
        vigenteHasta: null,
    }));
    console.log(`+  Se restauraría el motivo "${ORIGINAL.name}" con su id original (${ORIGINAL._id}), en la posición ${ORIGINAL.order}.`);
    efectos.forEach((e) => console.log(`      ${e.conceptoCodigo} → ${e.param} para el ${e.aplicaA}${e.soloRegimen ? ` (${e.soloRegimen})` : ""}, rigiendo desde ${desde}`));
    if (efectos.length === 0)
        console.log("      (sin efectos en la semilla)");
    if (!aplicar) {
        console.log("\nNada se escribió. Con --aplicar se restaura.");
        await mongoose.disconnect();
        return;
    }
    await RequestConfig.create({ ...ORIGINAL, tenantId, memosoftEffects: efectos, memosoftNoLiquida: false });
    console.log(`\nRestaurado. Para deshacerlo: borralo de nuevo desde el ABM.`);
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
