import mongoose from "mongoose";
import { writeFileSync } from "node:fs";
import { Company } from "../models/Company.js";
import { ArcaSucursal } from "../models/ArcaSucursal.js";

/**
 * Mueve las actividades del domicilio a la empleadora.
 *
 * POR QUÉ SE MUEVEN. ARCA declara las actividades POR CUIT, no por dirección: dos empleadoras en el
 * mismo domicilio pueden tener declaradas distintas, y el organismo rechaza un alta con una que ESE
 * CUIT no declaró ahí. Mientras vivieron en `ArcaSucursal`, el formulario de contrato les ofrecía
 * las mismas a todas — un alta válida para una y rechazada para la otra, sin nada que lo anticipara.
 *
 * QUÉ HACE. Para cada empresa, copia a `sucursalActividades` las actividades de cada domicilio que
 * tiene asignado. Es un punto de partida, no la verdad: después cada empleadora ajusta las suyas en
 * su ficha. Sin este paso, mover el campo dejaría a todos los contratos sin actividad de un día para
 * el otro.
 *
 *     npm run actividades:a-empresa:dry
 *     npm run actividades:a-empresa
 *
 * NO BORRA `ArcaSucursal.actividades`. Queda como estaba: es de dónde salió esto y lo que usa el
 * import del padrón. Dejar de leerlo es una cosa; perder el dato, otra.
 */

const DRY_RUN = process.env.DRY_RUN === "true";
/** Rehace la copia aunque la empresa ya tenga actividades declaradas. Pisa lo ajustado a mano. */
const FORZAR = process.env.FORZAR === "true";

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  await mongoose.connect(uri, { dbName });
  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}${FORZAR ? " · FORZANDO" : ""}\n`);

  const sucursales: any[] = await ArcaSucursal.find({}).lean();
  const porId = new Map(sucursales.map((s) => [String(s._id), s]));
  const empresas: any[] = await Company.find({}).select("razonSocial sucursalIds sucursalActividades").sort({ razonSocial: 1 }).lean();

  const log: any[] = [];
  let tocadas = 0;

  for (const e of empresas) {
    const asignados = (e.sucursalIds || []).map(String);
    const yaTiene = (e.sucursalActividades || []).length > 0;
    console.log(`── ${e.razonSocial}   ${asignados.length} domicilio(s) asignado(s)`);

    if (yaTiene && !FORZAR) {
      console.log(`   ya tiene ${e.sucursalActividades.length} fila(s) declarada(s): no se toca. (FORZAR=true para rehacer)\n`);
      continue;
    }

    const filas = asignados
      .map((id) => {
        const suc = porId.get(id);
        if (!suc) return null;
        const actividades = (suc.actividades || []).filter((a: any) => a?.codigo).map((a: any) => ({ codigo: String(a.codigo), descripcion: String(a.descripcion || "") }));
        return { sucursalId: id, actividades, _nombre: `${suc.codigo} ${suc.domicilio}` };
      })
      .filter(Boolean) as any[];

    for (const f of filas) {
      const marca = f.actividades.length === 0 ? "✖" : "→";
      console.log(`   ${marca} ${f._nombre}: ${f.actividades.length} actividad(es)${f.actividades.length ? ` (${f.actividades.map((a: any) => a.codigo).join(", ")})` : " — el domicilio no tiene ninguna cargada"}`);
    }

    log.push({ empresa: String(e._id), razonSocial: e.razonSocial, antes: e.sucursalActividades || [], ahora: filas.map(({ _nombre, ...f }) => f) });
    if (!DRY_RUN) {
      await Company.updateOne({ _id: e._id }, { $set: { sucursalActividades: filas.map(({ _nombre, ...f }) => f) } });
    }
    tocadas++;
    console.log("");
  }

  console.log(`── Resultado ──\n   empresas actualizadas: ${tocadas} de ${empresas.length}`);
  if (DRY_RUN) {
    console.log("\nDRY RUN terminado. No se escribió nada.\n");
  } else {
    const archivo = `logs/actividades-a-empresa-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(archivo, JSON.stringify(log, null, 2));
    console.log(`\nLog con el estado anterior: ${archivo}\n`);
  }
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
