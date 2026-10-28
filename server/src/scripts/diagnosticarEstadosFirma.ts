import mongoose from "mongoose";
import { Info } from "../models/Info.js";
import { Contrato } from "../models/Contrato.js";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { ESTADO_TYPE } from "../utils/estadosImpositivosSistema.js";
import { pareceEstadoDeFirma, tipoEnviaAFirmar } from "../compartido/estadosFirma.js";

/**
 * ESTADOS VINCULADOS A FIRMA vs «ENVÍO A FIRMAR» DE LOS TIPOS. Solo lectura: no escribe nada.
 *
 * 1. Qué estados son de firma (o los marcaría la semilla `estadosFirmaSeed.ts` si todavía no corrió).
 * 2. Qué tipos de contrato NO mandan nada a firmar pero tienen, por sus plantillas, un estado de firma:
 *    hay que quitárselo desde Editar Contrato (o tildar algo en «Envío a firmar»).
 *
 *   npm run estados:diagnosticar-firma
 */
async function main() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
  await mongoose.connect(uri, { dbName });
  console.log(`Base ${dbName} · solo lectura\n`);

  const estados: any[] = await Info.find({ type: ESTADO_TYPE }).sort({ "data.orden": 1 }).lean();
  const deFirma = estados.filter((e) => {
    if (e.data?.esImpositivo) return false;
    if (typeof e.data?.vinculadoAFirma === "boolean") return e.data.vinculadoAFirma;
    return pareceEstadoDeFirma(e.name, e.data?.transicionAutomatica?.carpetas);
  });
  console.log("Estados de firma:");
  for (const e of deFirma) {
    const origen = typeof e.data?.vinculadoAFirma === "boolean" ? "marcado" : "lo marcaría la semilla";
    const alcance = (e.data?.contratoFrameIds || []).length ? `${e.data.contratoFrameIds.length} plantilla(s)` : "GLOBAL (se ofrece en todos los tipos)";
    console.log(`  ${e.name} · ${origen} · ${alcance}`);
  }
  if (!deFirma.length) console.log("  ninguno");

  const tipos: any[] = await Contrato.find().select("name data.requiereFirma data.requiereFirmaRelease data.requiereFirmaAlta data.generaAlta").lean();
  const sinFirma = tipos.filter((t) => !tipoEnviaAFirmar(t.data));
  console.log(`\nTipos de contrato que no mandan nada a firmar: ${sinFirma.length}`);

  const plantillas: any[] = await ContratoFrame.find().select("name contratoId contratoIds").lean();
  const tiposDe = (p: any): string[] => (Array.isArray(p.contratoIds) && p.contratoIds.length ? p.contratoIds : p.contratoId ? [p.contratoId] : []).map(String);
  for (const t of sinFirma) {
    const suyas = new Set(plantillas.filter((p) => tiposDe(p).includes(String(t._id))).map((p) => String(p._id)));
    const choca = deFirma.filter((e) => (e.data?.contratoFrameIds || []).some((id: any) => suyas.has(String(id))));
    const globales = deFirma.filter((e) => !(e.data?.contratoFrameIds || []).length);
    const linea = [choca.length ? `vinculados: ${choca.map((e) => e.name).join(", ")}` : "", globales.length ? `globales: ${globales.map((e) => e.name).join(", ")}` : ""].filter(Boolean).join(" · ");
    console.log(`  ${t.name}${linea ? ` → ${linea}` : " · OK"}`);
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e?.message || e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
