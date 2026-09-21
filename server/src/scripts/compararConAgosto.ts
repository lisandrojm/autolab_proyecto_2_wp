/**
 * Compara lo que produce el motor contra el ARCHIVO REAL de agosto 2026. SÓLO LECTURA.
 *
 *   npx tsx src/scripts/compararConAgosto.ts <tenantId>
 *
 * Es el test de regresión que pedía el prompt original, con el patrón de oro que apareció después.
 * No busca que dé igual: busca que CADA diferencia esté explicada. Un motor que reproduce el 80%
 * y no sabe decir qué le falta del 20% no sirve para liquidar.
 *
 * Empareja por LEGAJO, que es lo único que las dos puntas comparten.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { correrLiquidacion } from "../services/liquidacion/corrida.js";
import { JORNALEROS_AGOSTO, CENSO_DE_CONCEPTOS, CONCEPTOS_AUSENTES } from "../fixtures/agosto2026Memosoft.js";

const titulo = (t: string) => console.log(`\n${"═".repeat(86)}\n${t}\n${"═".repeat(86)}`);

async function main() {
  const tenantId = new Types.ObjectId(process.argv[2]);
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });

  const corrida: any = await correrLiquidacion(tenantId, "2026-08", new Types.ObjectId(), { persistir: false });

  /* ── 1. Qué conceptos emite cada lado ── */
  titulo("QUÉ CONCEPTOS EMITE CADA LADO");
  const mios = new Map<string, { filas: number; par1: number; par2: number }>();
  corrida.lineas.forEach((l: any) => {
    const a = mios.get(l.conceptoCodigo) || { filas: 0, par1: 0, par2: 0 };
    mios.set(l.conceptoCodigo, { filas: a.filas + 1, par1: a.par1 + l.par1, par2: a.par2 + l.par2 });
  });

  const enElReal = new Set(CENSO_DE_CONCEPTOS.map((c) => c.codigo));
  const todos = [...new Set([...enElReal, ...mios.keys()])].sort();

  console.log("código  descripción                        ¿real?  ¿motor?   lo que emite el motor");
  for (const codigo of todos) {
    const real = CENSO_DE_CONCEPTOS.find((c) => c.codigo === codigo);
    const mio = mios.get(codigo);
    const marca = (b: boolean) => (b ? "  sí  " : "  --  ");
    const detalle = mio ? `${mio.filas} filas, par1=${Math.round(mio.par1 * 100) / 100}, par2=${Math.round(mio.par2 * 100) / 100}` : "";
    console.log(`${codigo}    ${(real?.descripcion || "—").padEnd(34)} ${marca(!!real)} ${marca(!!mio)}   ${detalle}`);
  }

  console.log("\nLo que el archivo real dice de cada uno:");
  CENSO_DE_CONCEPTOS.forEach((c) => console.log(`   ${c.codigo}  ${c.nota}`));
  console.log(`\nConceptos del catálogo que el archivo real NO usa en agosto: ${CONCEPTOS_AUSENTES.join(", ")}`);

  /* ── 2. Los jornaleros, uno por uno ── */
  titulo("JORNAL DE LOS JORNALEROS — 0000, día por día");
  const porLegajo = new Map<string, number>();
  corrida.lineas
    .filter((l: any) => l.conceptoCodigo === "0000" && l.legajo)
    .forEach((l: any) => porLegajo.set(String(l.legajo), (porLegajo.get(String(l.legajo)) || 0) + l.par2));

  let iguales = 0;
  let deMenos = 0;
  let faltantes = 0;
  let diferenciaTotal = 0;
  const detalle: string[] = [];

  for (const real of JORNALEROS_AGOSTO) {
    const mio = porLegajo.get(real.legajo);
    if (mio === undefined) {
      faltantes++;
      detalle.push(`   ${real.legajo}  ${real.nombre.padEnd(38).slice(0, 38)}  real=${String(real.dias).padStart(3)}   motor=  —   NO LO EMITE`);
      diferenciaTotal += real.dias;
      continue;
    }
    if (mio === real.dias) {
      iguales++;
      continue;
    }
    deMenos++;
    diferenciaTotal += real.dias - mio;
    detalle.push(`   ${real.legajo}  ${real.nombre.padEnd(38).slice(0, 38)}  real=${String(real.dias).padStart(3)}   motor=${String(mio).padStart(3)}   ${mio < real.dias ? "faltan" : "sobran"} ${Math.abs(real.dias - mio)}`);
  }

  const totalReal = JORNALEROS_AGOSTO.reduce((a, b) => a + b.dias, 0);
  console.log(`Personas en el archivo real: ${JORNALEROS_AGOSTO.length}   ·   días de jornal: ${totalReal}`);
  console.log(`Coinciden exacto: ${iguales}   ·   con diferencia: ${deMenos}   ·   que el motor no emite: ${faltantes}`);
  console.log(`Días de diferencia en total: ${diferenciaTotal} de ${totalReal}  (${Math.round((diferenciaTotal / totalReal) * 100)}%)\n`);
  detalle.slice(0, 40).forEach((d) => console.log(d));
  if (detalle.length > 40) console.log(`   … y ${detalle.length - 40} más`);

  /* ── 3. Legajos que el motor emite y el archivo real no tiene en esa hoja ── */
  const soloMios = [...porLegajo.keys()].filter((l) => !JORNALEROS_AGOSTO.some((r) => r.legajo === l));
  console.log(`\nLegajos con 0000 en el motor que NO están en las hojas de jornaleros del archivo: ${soloMios.length}`);
  if (soloMios.length) console.log(`   ${soloMios.join(", ")}`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
