import mongoose from "mongoose";
import { writeFileSync } from "node:fs";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Company } from "../models/Company.js";
import { analizarPlantilla } from "../utils/variablesPlantilla.js";

/**
 * Reemplaza en las plantillas los literales que ya tienen variable.
 *
 * VA POR SCRIPT SOBRE EL CONTENIDO ALMACENADO, NO POR EL EDITOR. Los literales están adentro de
 * tablas, y editarlos desde el editor parte la variable por el borde de la celda: ya pasó, y dejó
 * diez variables en la forma `{` … `{nombre}}`, que no imprime el dato sino las llaves. Un
 * `replace` sobre el HTML guardado no puede partir nada porque no toca la estructura.
 *
 *   npm run plantillas:parametrizar:dry
 *   npm run plantillas:parametrizar
 *
 * `FORZAR=true` avanza aunque alguna empleadora no tenga cargado el email del firmante.
 */

const DRY_RUN = process.env.DRY_RUN === "true";
const FORZAR = process.env.FORZAR === "true";

/**
 * Los reemplazos. Cada uno con la variable que ya tiene que existir en el resolutor.
 *
 * `nombreCliente` y NO `nombreProyecto` para el título: `nombreProyecto` es la obra —«Surrender»— y
 * ya se usa 5 a 8 veces dentro de cada plantilla; REELSHORT es el cliente. Ponerlo mal titularía el
 * contrato con el nombre de la película, y saldría un documento válido y equivocado.
 */
const REEMPLAZOS: Array<{ patron: RegExp; variable: string; que: string }> = [
  /*
    DOS MAILS, UNA VARIABLE, Y ES LA PRUEBA DE QUE LA VARIABLE ES LA CORRECTA.

    `hernan.pellegrini@` está en las 9 plantillas de Eventual y Servicios; `norma.olivo@` en las 4 de
    Jornada y Plazo fijo. Norma Olivo es la firmante de 2030 S.R.L. y Hernán el de FZERO: los
    literales seguían al FIRMANTE, no al representante legal. Por eso las dos se reemplazan por
    `{{empresaFirmanteEmail}}` y no por `{{empresaRepresentanteLegalEmail}}`.

    Y explica el bug de fondo: las plantillas de Eventual llevan el mail de Hernán, pero también las
    usa 2030 S.R.L. — cuyo firmante es Norma. Hoy esos contratos imprimen el mail de una persona al
    lado del nombre y el DNI de otra.
  */
  { patron: /hernan\.pellegrini@frame\.com\.ar/gi, variable: "{{empresaFirmanteEmail}}", que: "mail del firmante (Hernán)" },
  { patron: /norma\.olivo@frame\.com\.ar/gi, variable: "{{empresaFirmanteEmail}}", que: "mail del firmante (Norma)" },
  // Comillas tipográficas o rectas, y con o sin la palabra PROJECT pegada.
  { patron: /[“"']?\s*PROJECT\s+REELSHORT\s*[”"']?/gi, variable: "{{nombreCliente}}", que: "título «PROJECT REELSHORT»" },
];

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  await mongoose.connect(uri, { dbName });
  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}${FORZAR ? " · FORZADO" : ""}\n`);

  // ── El dato tiene que estar antes que la variable: si no, el contrato sale sin el mail.
  const empresas: any[] = await Company.find({}).select("razonSocial firmanteNombre firmanteEmail").lean();
  const sinEmail = empresas.filter((e) => !e.firmanteEmail);
  console.log("── Email del firmante ──");
  for (const e of empresas) console.log(`   ${e.firmanteEmail ? "✔" : "✖"} ${String(e.razonSocial).padEnd(16)} ${e.firmanteNombre || "(sin firmante)"} → ${e.firmanteEmail || "FALTA"}`);
  if (sinEmail.length > 0 && !FORZAR) {
    console.log(`\n✖ NO SE TOCA NINGUNA PLANTILLA: ${sinEmail.map((e) => e.razonSocial).join(", ")} quedaría(n) con el bloque de partes sin mail.`);
    console.log(`   Cargalo en Empresas → Firmante → Email y volvé a correr. Con FORZAR=true se avanza igual.\n`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const plantillas: any[] = await ContratoFrame.find({}).select("name content").sort({ name: 1 }).lean();
  const log: any[] = [];
  let tocadas = 0;
  let rechazadas = 0;

  console.log(`\n── Plantillas (${plantillas.length}) ──`);
  for (const p of plantillas) {
    const antes = String(p.content || "");
    let ahora = antes;
    const hechos: string[] = [];
    for (const r of REEMPLAZOS) {
      const n = (ahora.match(r.patron) || []).length;
      if (n === 0) continue;
      ahora = ahora.replace(r.patron, r.variable);
      hechos.push(`${n} × ${r.que}`);
    }
    if (hechos.length === 0) continue;

    /*
      SE VALIDA EL RESULTADO, NO EL PROCEDIMIENTO. Se recorre cada llave del documento resultante y se
      exige que pertenezca a un `{{...}}` bien formado — contar variables válidas no sirve: `{x}}` no
      es ni `{{x}}` ni `{x}`, y un conteo así lo deja pasar. Es lo que dejó pasar el destrozo anterior.
    */
    const antesAnalisis = analizarPlantilla(antes);
    const despues = analizarPlantilla(ahora);
    const nuevos = despues.problemas.length - antesAnalisis.problemas.length;
    if (nuevos > 0) {
      rechazadas++;
      console.log(`✖ ${p.name}\n     NO se aplica: el reemplazo dejaría ${nuevos} llave(s) sin par.`);
      for (const x of despues.problemas.slice(0, 3)) console.log(`        ${x.motivo}\n           …${x.fragmento}…`);
      continue;
    }

    console.log(`✔ ${p.name}\n     ${hechos.join(" · ")}${antesAnalisis.problemas.length > 0 ? `  (ojo: ya tenía ${antesAnalisis.problemas.length} problema(s) previo(s), no se arreglan acá)` : ""}`);
    log.push({ _id: String(p._id), name: p.name, hechos, antes });
    tocadas++;
    if (!DRY_RUN) await ContratoFrame.updateOne({ _id: p._id }, { $set: { content: ahora } });
  }

  console.log(`\n── Resultado ──`);
  console.log(`   plantillas modificadas: ${tocadas}   ·   rechazadas por dejar llaves sin par: ${rechazadas}`);

  if (DRY_RUN) {
    console.log(`\nDRY RUN terminado. No se escribió nada.\n`);
    await mongoose.disconnect();
    return;
  }

  const archivo = `logs/plantillas-parametrizadas-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(archivo, JSON.stringify(log, null, 2));
  console.log(`\nLog con el contenido anterior completo: ${archivo}`);
  console.log(`Es texto legal: no se puede recalcular, solo restaurar desde acá.\n`);

  // Verificación final sobre lo escrito, no sobre lo que se creyó escribir.
  const fin: any[] = await ContratoFrame.find({}).select("name content").lean();
  const conLlaves = fin.filter((f) => analizarPlantilla(String(f.content || "")).problemas.length > 0);
  const conMail = fin.filter((f) => /[\w.+-]+@[\w-]+\.[\w.]+/.test(String(f.content || "")));
  const conTitulo = fin.filter((f) => /PROJECT\s+REELSHORT/i.test(String(f.content || "")));
  console.log(`── Verificación ──`);
  console.log(`   con llaves sin par: ${conLlaves.length}${conLlaves.length ? ` → ${conLlaves.map((f) => f.name).join(", ")}` : ""}`);
  console.log(`   con mail literal: ${conMail.length}${conMail.length ? ` → ${conMail.map((f) => f.name).join(", ")}` : ""}`);
  console.log(`   con «PROJECT REELSHORT»: ${conTitulo.length}\n`);

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
