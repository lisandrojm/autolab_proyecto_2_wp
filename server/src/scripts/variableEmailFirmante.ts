import mongoose from "mongoose";
import { writeFileSync } from "node:fs";
import { Company } from "../models/Company.js";
import { ContratoFrame } from "../models/ContratoFrame.js";

/**
 * Saca el mail del firmante de las plantillas y lo pasa a `{{empresaFirmanteEmail}}`.
 *
 * ORDEN OBLIGATORIO: primero el dato, después la plantilla. Una variable que el resolutor no conoce
 * sale impresa tal cual en el PDF de un contrato firmado, y una que resuelve a vacío deja el bloque
 * de partes sin el mail que hoy sí tiene. Por eso el script hace las dos cosas y en este orden, y se
 * niega a tocar las plantillas si alguna empleadora quedaría sin email.
 *
 *   npm run firmante-email:dry
 *   npm run firmante-email
 *
 * `FORZAR=true` reemplaza igual, aun con empleadoras sin email cargado.
 */

const DRY_RUN = process.env.DRY_RUN === "true";
const FORZAR = process.env.FORZAR === "true";

/** El literal que quedó escrito en las plantillas. */
const LITERAL = /hernan\.pellegrini@frame\.com\.ar/gi;
const VARIABLE = "{{empresaFirmanteEmail}}";

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  await mongoose.connect(uri, { dbName });
  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  // ── 1. El dato: sembrar `firmanteEmail` donde el firmante ES el representante legal.
  //       Solo ahí, y comparando el nombre: son campos distintos porque son personas distintas, y
  //       copiar el mail sin verificar que coincidan es justo el error que este campo vino a evitar.
  const empresas: any[] = await Company.find({}).select("razonSocial firmanteNombre firmanteEmail representanteLegalNombre representanteLegalEmail").lean();
  const norm = (s: string) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toUpperCase();

  console.log("── 1. Email del firmante por empleadora ──");
  const aSembrar: Array<{ _id: any; razonSocial: string; email: string }> = [];
  const sinEmail: string[] = [];
  for (const e of empresas) {
    if (e.firmanteEmail) {
      console.log(`   ✔ ${e.razonSocial}: ya tiene «${e.firmanteEmail}»`);
      continue;
    }
    const mismaPersona = !!e.firmanteNombre && norm(e.firmanteNombre) === norm(e.representanteLegalNombre);
    if (mismaPersona && e.representanteLegalEmail) {
      aSembrar.push({ _id: e._id, razonSocial: e.razonSocial, email: e.representanteLegalEmail });
      console.log(`   → ${e.razonSocial}: firmante y representante son la misma persona (${e.firmanteNombre}); se copia «${e.representanteLegalEmail}»`);
    } else {
      sinEmail.push(`${e.razonSocial} — firma ${e.firmanteNombre || "(sin firmante)"}${e.representanteLegalNombre && !mismaPersona ? `, distinto del representante legal ${e.representanteLegalNombre}` : ""}`);
      console.log(`   ✖ ${e.razonSocial}: SIN email de firmante. ${mismaPersona ? "El representante legal tampoco tiene." : `Firma ${e.firmanteNombre || "(nadie)"}, que no es el representante legal: hay que cargarlo a mano.`}`);
    }
  }

  // ── 2. Las plantillas.
  const plantillas: any[] = await ContratoFrame.find({}).select("name content").lean();
  const conLiteral = plantillas.filter((p) => LITERAL.test(String(p.content || "")) && (LITERAL.lastIndex = 0) === 0);
  const ocurrencias = conLiteral.reduce((a, p) => a + (String(p.content).match(LITERAL) || []).length, 0);
  console.log(`\n── 2. Plantillas ──`);
  console.log(`   ${plantillas.length} plantillas · ${conLiteral.length} con el literal · ${ocurrencias} ocurrencia(s)`);
  for (const p of conLiteral) console.log(`      ${String((String(p.content).match(LITERAL) || []).length).padStart(2)} × ${p.name}`);

  if (sinEmail.length > 0 && !FORZAR) {
    console.log(`\n✖ NO SE TOCAN LAS PLANTILLAS: ${sinEmail.length} empleadora(s) quedarían con el bloque de partes sin mail.\n`);
    for (const s of sinEmail) console.log(`   · ${s}`);
    console.log(`\n   Cargá el email en Empresas → Firmante → Email y volvé a correr.`);
    console.log(`   Con FORZAR=true se reemplaza igual: el contrato de esas empleadoras sale sin mail,`);
    console.log(`   que sigue siendo mejor que imprimir el de otra persona al lado de su DNI.\n`);
    if (!DRY_RUN && aSembrar.length > 0) {
      for (const e of aSembrar) await Company.updateOne({ _id: e._id }, { $set: { firmanteEmail: e.email } });
      console.log(`   (se sembró igual el email de ${aSembrar.length} empleadora(s): es dato que faltaba, no depende de las plantillas.)\n`);
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log(`\nDRY RUN: se sembrarían ${aSembrar.length} email(s) y se reemplazarían ${ocurrencias} literal(es). No se escribió nada.\n`);
    await mongoose.disconnect();
    return;
  }

  for (const e of aSembrar) await Company.updateOne({ _id: e._id }, { $set: { firmanteEmail: e.email } });
  console.log(`\n${aSembrar.length} email(s) de firmante sembrado(s).`);

  // Log reversible con el contenido anterior: una plantilla es texto legal, no un dato derivable.
  const log: any[] = [];
  let cambiadas = 0;
  for (const p of conLiteral) {
    const antes = String(p.content || "");
    const ahora = antes.replace(LITERAL, VARIABLE);
    log.push({ _id: String(p._id), name: p.name, antes });
    await ContratoFrame.updateOne({ _id: p._id }, { $set: { content: ahora } });
    cambiadas++;
  }
  const archivo = `logs/plantillas-email-firmante-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(archivo, JSON.stringify(log, null, 2));
  console.log(`${cambiadas} plantilla(s) actualizada(s) · ${ocurrencias} literal(es) → ${VARIABLE}`);
  console.log(`Log con el contenido anterior: ${archivo}\n`);

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
