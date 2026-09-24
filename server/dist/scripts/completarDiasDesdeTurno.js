import fs from "fs";
import path from "path";
import mongoose, { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { Shift } from "../models/Shift.js";
import { fechaISO, hoyArgentina } from "../utils/contratoVigencia.js";
/**
 * LOS CONTRATOS SIN DÍAS DE LA SEMANA TOMAN LOS DE SU TURNO.
 *
 * Un contrato tiene que decir qué días trabaja la persona: sin eso no se sabe si se superpone con otro
 * (ver `utils/superposicionContratos.ts`) ni si un feriado le cae en día laborable. Desde la plataforma
 * ya no se puede guardar uno sin días (`assign-member`), pero los que vienen de FRAME no los traen.
 *
 * Los que tienen TURNO asignado sí dicen qué días trabaja: los del turno (`Shift.days`). A esos se les
 * escribe `dias_semana` (la unión de los días de sus turnos), `dias_por_semana` si faltaba, y
 * `dias_rotativos: false`. Los que no tienen turno NO se tocan: no hay de dónde sacar los días; el
 * resumen los cuenta para que se completen a mano.
 *
 * Uso (desde server/):
 *   npm run contratos-dias:dry
 *   npm run contratos-dias
 *   npm run contratos-dias:revertir -- logs/contratos-dias-<fecha>.json
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const idsDeTurno = (c) => [...new Set([...(c.areaShiftAssignments || []).flatMap((a) => (a?.shiftIds || []).map(String)), ...(c.shiftId ? [String(c.shiftId)] : [])])].filter((id) => Types.ObjectId.isValid(id));
async function conectar() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    return dbName;
}
async function run() {
    const dbName = await conectar();
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);
    const hoy = hoyArgentina();
    const ups = await UserProject.find({}).select("contracts").lean();
    const turnos = await Shift.find({}).select("days name").lean();
    const diasDe = new Map(turnos.map((t) => [String(t._id), (t.days || []).map(Number)]));
    const cambios = [];
    let sinDiasSinTurno = 0;
    let sinDiasSinTurnoVigentes = 0;
    let turnoSinDias = 0;
    for (const up of ups) {
        (up.contracts || []).forEach((c, indice) => {
            if (Array.isArray(c.dias_semana) && c.dias_semana.length > 0)
                return;
            const ids = idsDeTurno(c);
            const vigente = !fechaISO(c.fecha_baja_contrato) || fechaISO(c.fecha_baja_contrato) >= hoy;
            if (ids.length === 0) {
                sinDiasSinTurno++;
                if (vigente)
                    sinDiasSinTurnoVigentes++;
                return;
            }
            const dias = [...new Set(ids.flatMap((id) => diasDe.get(id) || []))].sort((a, b) => a - b);
            if (dias.length === 0) {
                turnoSinDias++;
                return;
            }
            cambios.push({
                userProjectId: String(up._id),
                indice,
                fechaAlta: fechaISO(c.fecha_alta_contrato),
                antes: { dias_semana: c.dias_semana ?? null, dias_por_semana: c.dias_por_semana ?? null, dias_rotativos: c.dias_rotativos ?? null },
                despues: dias,
            });
        });
    }
    if (!DRY_RUN) {
        for (const x of cambios) {
            await UserProject.updateOne({ _id: x.userProjectId }, {
                $set: {
                    [`contracts.${x.indice}.dias_semana`]: x.despues,
                    [`contracts.${x.indice}.dias_rotativos`]: false,
                    ...(x.antes.dias_por_semana ? {} : { [`contracts.${x.indice}.dias_por_semana`]: x.despues.length }),
                },
            });
        }
        if (cambios.length) {
            const dir = path.resolve(process.cwd(), "logs");
            fs.mkdirSync(dir, { recursive: true });
            const archivo = path.join(dir, `contratos-dias-${new Date().toISOString().replace(/[:.]/g, "")}.json`);
            fs.writeFileSync(archivo, JSON.stringify(cambios, null, 2));
            console.log(`Respaldo reversible: ${archivo}\n`);
        }
    }
    console.log(`${DRY_RUN ? "Se completarían" : "Se completaron"} ${cambios.length} contrato(s) con los días de su turno.`);
    console.log(`Sin días y sin turno (no se tocan, hay que completarlos a mano): ${sinDiasSinTurno}, de los cuales ${sinDiasSinTurnoVigentes} vigentes o futuros.`);
    if (turnoSinDias)
        console.log(`Con turno pero el turno no tiene días: ${turnoSinDias}.`);
    console.log("");
    await mongoose.disconnect();
}
/** Revertir = dejar cada contrato como estaba: sus tres campos de días de antes. */
async function revertir(archivo) {
    const dbName = await conectar();
    const ruta = path.resolve(process.cwd(), archivo);
    if (!fs.existsSync(ruta))
        throw new Error(`No existe el respaldo: ${ruta}`);
    const cambios = JSON.parse(fs.readFileSync(ruta, "utf8"));
    console.log(`\nDB: ${dbName}   |   revirtiendo ${cambios.length} contrato(s) desde ${path.basename(ruta)}\n`);
    for (const x of cambios) {
        const set = {};
        const unset = {};
        for (const campo of ["dias_semana", "dias_por_semana", "dias_rotativos"]) {
            const clave = `contracts.${x.indice}.${campo}`;
            if (x.antes[campo] === null)
                unset[clave] = "";
            else
                set[clave] = x.antes[campo];
        }
        await UserProject.updateOne({ _id: x.userProjectId }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) });
    }
    console.log("Listo: los contratos quedaron como antes.\n");
    await mongoose.disconnect();
}
const archivo = process.argv[2];
(archivo ? revertir(archivo) : run()).catch((e) => {
    console.error("\n❌", e?.message || e, "\n");
    process.exit(1);
});
