/**
 * ═══════════════════════════════════════════════════════════════════════
 * PONERLE EMPRESA A LOS CONTRATOS QUE QUEDARON SIN RESOLVER
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   npx tsx src/scripts/asignarEmpresaPorDefecto.ts <razón social>            # dice qué haría
 *   npx tsx src/scripts/asignarEmpresaPorDefecto.ts "2030 S.R.L." --aplicar   # lo hace
 *   npx tsx src/scripts/asignarEmpresaPorDefecto.ts --revertir <respaldo>     # lo deshace
 *
 * La fase 0 completa `empresaContratoId` sólo donde el nombre del contrato lo dice sin ambigüedad.
 * Lo demás queda a propósito sin tocar: son contratos cuyo nombre no menciona ninguna empresa
 * ("Tiempo Indeterminado", "Eventual Crew Reelshort") o menciona dos ("Plazo fijo 5x10 2030 SRL +
 * Release JSA FZERO"), y elegir por ellos es una decisión de RRHH, no una deducción.
 *
 * ESTE SCRIPT ES ESA DECISIÓN, TOMADA Y EJECUTADA. No deduce nada: le pone a TODOS los que quedaron
 * la empresa que se le indique. Queda separado de la fase 0 justamente para que se vea que es una
 * decisión y no parte del algoritmo, y para que el respaldo permita deshacerla sola.
 *
 * SÓLO TOCA LOS QUE NO TIENEN EMPRESA. Lo que ya está resuelto no se pisa nunca.
 */
import fs from "fs";
import path from "path";
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import UserProject from "../models/UserProject.js";
import { Company } from "../models/Company.js";

const CARPETA_RESPALDOS = path.resolve(process.cwd(), "migraciones-respaldo");

interface Respaldo {
  fecha: string;
  empresaId: string;
  razonSocial: string;
  /** Un registro por contrato tocado. Todos tenían el campo vacío: revertir es volver a vaciarlo. */
  contratos: { userProjectId: string; indice: number }[];
}

async function main() {
  if (process.argv.includes("--revertir")) return deshacer(process.argv[process.argv.indexOf("--revertir") + 1]);

  const razonPedida = process.argv[2];
  const aplicar = process.argv.includes("--aplicar");
  if (!razonPedida) {
    console.error('Falta la empresa. Uso: npx tsx src/scripts/asignarEmpresaPorDefecto.ts "2030 S.R.L." [--aplicar]');
    process.exit(1);
  }

  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  console.log(`Base: ${env.MONGO_DB_NAME}${aplicar ? "" : "   (simulación: no se escribe nada)"}\n`);

  const empresas: any[] = await Company.find({}).select("razonSocial").lean();
  const buscada = empresas.find((e: any) => String(e.razonSocial).toLowerCase().includes(razonPedida.toLowerCase()));
  if (!buscada) {
    console.error(`No hay ninguna empresa que coincida con "${razonPedida}". Las que hay: ${empresas.map((e: any) => e.razonSocial).join(", ")}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`Empresa elegida: ${buscada.razonSocial}   (${buscada._id})\n`);

  const vinculos: any[] = await UserProject.find({}).select("contracts.nombre_contrato contracts.empresaContratoId").lean();

  const porNombre = new Map<string, number>();
  const cambios: { userProjectId: string; indice: number }[] = [];

  for (const v of vinculos) {
    (v.contracts || []).forEach((c: any, i: number) => {
      if (c.empresaContratoId) return; // Ya resuelto: no se toca.
      const nombre = String(c.nombre_contrato || "(sin nombre)");
      porNombre.set(nombre, (porNombre.get(nombre) || 0) + 1);
      cambios.push({ userProjectId: String(v._id), indice: i });
    });
  }

  console.log(`Contratos sin empresa: ${cambios.length}\n`);
  [...porNombre.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([nombre, n]) => {
      /* Se marca cuándo el propio nombre menciona OTRA empresa: es lo que hay que poder ver después. */
      const menciona = empresas
        .filter((e: any) => nombre.toUpperCase().includes(String(e.razonSocial).split(" ")[0].toUpperCase()) && String(e._id) !== String(buscada._id))
        .map((e: any) => e.razonSocial);
      console.log(`   ${String(n).padStart(5)}   "${nombre}"${menciona.length ? `   ⚠ el nombre menciona ${menciona.join(" y ")}` : ""}`);
    });

  console.log(`\nTodos pasarían a ${buscada.razonSocial}.`);

  if (!aplicar) {
    console.log("\nNada se escribió. Con --aplicar se guarda.");
    await mongoose.disconnect();
    return;
  }

  const respaldo: Respaldo = {
    fecha: new Date().toISOString(),
    empresaId: String(buscada._id),
    razonSocial: buscada.razonSocial,
    contratos: cambios,
  };

  for (let i = 0; i < cambios.length; i += 200) {
    const lote = cambios.slice(i, i + 200);
    await UserProject.bulkWrite(
      lote.map((c) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(c.userProjectId) },
          update: { $set: { [`contracts.${c.indice}.empresaContratoId`]: buscada._id } },
        },
      })) as any,
    );
  }

  fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
  const archivo = path.join(CARPETA_RESPALDOS, `empresa-por-defecto-${respaldo.fecha.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 2));

  console.log(`\nListo: ${cambios.length} contratos pasaron a ${buscada.razonSocial}.`);
  console.log(`Respaldo: ${archivo}`);
  console.log(`Para deshacer:  npx tsx src/scripts/asignarEmpresaPorDefecto.ts --revertir "${archivo}"`);
  await mongoose.disconnect();
}

/** Vuelve a vaciar el campo en los contratos que tocó esta corrida, y sólo en esos. */
async function deshacer(archivo: string) {
  if (!archivo || !fs.existsSync(archivo)) {
    console.error("Falta el archivo de respaldo.");
    process.exit(1);
  }
  const respaldo: Respaldo = JSON.parse(fs.readFileSync(archivo, "utf8"));
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });

  for (let i = 0; i < respaldo.contratos.length; i += 200) {
    const lote = respaldo.contratos.slice(i, i + 200);
    await UserProject.bulkWrite(
      lote.map((c) => ({
        updateOne: { filter: { _id: new Types.ObjectId(c.userProjectId) }, update: { $unset: { [`contracts.${c.indice}.empresaContratoId`]: "" } } },
      })) as any,
    );
  }

  console.log(`Revertidos: ${respaldo.contratos.length} contratos vuelven a quedar sin empresa.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
