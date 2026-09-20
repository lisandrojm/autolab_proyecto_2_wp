/**
 * ═══════════════════════════════════════════════════════════════════════
 * LIQUIDACIÓN, FASE 1 — el mapeo semilla de motivo → concepto
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   npx tsx src/scripts/liquidacionFase1.ts <tenantId>              # dice qué haría, NO escribe
 *   npx tsx src/scripts/liquidacionFase1.ts <tenantId> --aplicar    # lo carga y deja respaldo
 *   npx tsx src/scripts/liquidacionFase1.ts --revertir <respaldo>   # lo deshace
 *
 * Carga el mapeo inicial que pasó RRHH. De acá en más se edita desde la pantalla: este script es
 * para no tener que cargar treinta líneas a mano la primera vez, no para ser la fuente de verdad.
 *
 * REQUIERE QUE LA FASE 0 ESTÉ APLICADA: sin el catálogo de conceptos cargado, cada efecto falla la
 * validación —el concepto no existe— y no se guarda ninguno.
 *
 * ── Tres cosas del mapeo que NO son las de la tabla, y por qué ──
 *
 * 1. VACACIONES NO SE MAPEA. La tabla dice "código a confirmar con Memosoft": los únicos códigos de
 *    vacaciones del catálogo son 0601 Plus Vacacional y 0701 Vacaciones No Gozadas, y ninguno es la
 *    licencia. Elegir uno de los dos porque son los que hay sería inventar un concepto.
 *
 * 2. "HORAS EXTRAS Y FERIADOS" TAMPOCO. Las horas extra se liquidan haya o no novedad, así que están
 *    como regla global en la configuración (`memosoftHorasExtra`). Mapear ADEMÁS el motivo haría que
 *    un parte con ese motivo emitiera el 0015 dos veces.
 *
 * 3. SIN GOCE DE SUELDO VA COMO `manual`. El catálogo dice que 0090 lleva un IMPORTE en par2, y de un
 *    parte de asistencia sale una cantidad de días, no pesos. Hasta que el estudio confirme si es
 *    importe o días, el efecto existe pero no calcula: cae en el anexo para que lo cargue una persona.
 */
import fs from "fs";
import path from "path";
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { RequestConfig } from "../models/RequestConfig.js";
import { MemosoftConcepto, CONCEPTOS_SEMILLA } from "../models/MemosoftConcepto.js";
import { ActivityLogGeneralConfig } from "../models/ActivityLogGeneralConfig.js";
import { reemplazarVigentes, validarEfecto } from "../utils/liquidacion/efectos.js";

const CARPETA_RESPALDOS = path.resolve(process.cwd(), "migraciones-respaldo");

type EfectoSemilla = {
  conceptoCodigo: string;
  param: "par1" | "par2";
  unidad: "cantidad" | "importe";
  fuente: "jornadas" | "horas50" | "horas100" | "fijo" | "manual";
  aplicaA: "titular" | "reemplazante";
  soloRegimen?: "mensual" | "jornalero" | null;
  nota?: string;
};

/** El jornal que cobra quien cubre a otro. Es el efecto que más se repite, así que se nombra una vez. */
const JORNAL_DEL_REEMPLAZANTE: EfectoSemilla = {
  conceptoCodigo: "0000",
  param: "par2",
  unidad: "cantidad",
  fuente: "jornadas",
  aplicaA: "reemplazante",
  soloRegimen: "jornalero",
  nota: "El que cubre cobra el jornal. Sólo jornaleros: al mensual ya se le paga el mes.",
};

/** El mapeo tal como lo pasó RRHH, con las tres salvedades del encabezado. */
const MAPEO_SEMILLA: Record<string, EfectoSemilla[]> = {
  Franco: [JORNAL_DEL_REEMPLAZANTE],
  "Cambios de Turno": [],
  Compensatorios: [JORNAL_DEL_REEMPLAZANTE],
  Enfermedad: [
    { conceptoCodigo: "0012", param: "par1", unidad: "cantidad", fuente: "jornadas", aplicaA: "titular", nota: "Licencia por enfermedad, en días." },
    JORNAL_DEL_REEMPLAZANTE,
  ],
  Vacaciones: [JORNAL_DEL_REEMPLAZANTE],
  "Sin Goce de Sueldo": [
    {
      conceptoCodigo: "0090",
      param: "par2",
      unidad: "importe",
      fuente: "manual",
      aplicaA: "titular",
      nota: "PENDIENTE: el catálogo dice importe en par2, pero de un parte salen días. Confirmar con el estudio.",
    },
    JORNAL_DEL_REEMPLAZANTE,
  ],
  Feriado: [
    { conceptoCodigo: "0017", param: "par1", unidad: "cantidad", fuente: "jornadas", aplicaA: "titular", nota: "Feriado, en días." },
    /*
      Al reemplazante mensual se le paga el feriado; al jornalero, el jornal. Es la lectura de
      "0017 o 0000 según régimen" de la tabla, y está marcada como supuesto a confirmar.
    */
    { conceptoCodigo: "0017", param: "par1", unidad: "cantidad", fuente: "jornadas", aplicaA: "reemplazante", soloRegimen: "mensual", nota: "SUPUESTO: al mensual que cubre un feriado se le liquida el feriado." },
    JORNAL_DEL_REEMPLAZANTE,
  ],
  "Horas Extras y Feriados": [],
  "Otros Presentes": [
    { conceptoCodigo: "0000", param: "par2", unidad: "cantidad", fuente: "jornadas", aplicaA: "reemplazante", nota: "Alguien que no es del proyecto vino a trabajar: cobra el jornal." },
  ],
  Renuncia: [],
};

/** La regla global de horas extra: los dos códigos de la tabla, con la unidad que dice el catálogo. */
const HORAS_EXTRA = { codigo50: "0015", codigo100: "0016", param: "par1" as const, unidad: "cantidad" as const };

interface Respaldo {
  fecha: string;
  tenantId: string;
  motivos: { motivoId: string; nombre: string; anterior: unknown }[];
  horasExtraAnterior: unknown;
}

async function main() {
  if (process.argv.includes("--revertir")) return deshacer(process.argv[process.argv.indexOf("--revertir") + 1]);

  const tenantIdArg = process.argv[2];
  const aplicar = process.argv.includes("--aplicar");
  const desde = (process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (!tenantIdArg || !Types.ObjectId.isValid(tenantIdArg)) {
    console.error("Falta el tenantId. Uso: npx tsx src/scripts/liquidacionFase1.ts <tenantId> [--aplicar] [AAAA-MM-DD]");
    process.exit(1);
  }
  const tenantId = new Types.ObjectId(tenantIdArg);

  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  console.log(`Base: ${env.MONGO_DB_NAME}   ·   rige desde: ${desde}${aplicar ? "" : "   (simulación: no se escribe nada)"}\n`);

  const conceptos: any[] = await MemosoftConcepto.find({ tenantId }).lean();
  if (conceptos.length === 0 && aplicar) {
    console.error("No hay conceptos cargados. Corré primero la fase 0 con --aplicar.");
    await mongoose.disconnect();
    process.exit(1);
  }

  /*
    EN SIMULACIÓN, SI EL CATÁLOGO TODAVÍA NO ESTÁ, SE VALIDA CONTRA LA SEMILLA.

    Así se puede ver el mapeo entero ANTES de aplicar la fase 0, que es justo cuando uno quiere
    mirarlo. Con --aplicar no: ahí se exige el catálogo real, porque es contra lo que se emite.
  */
  const deLaSemilla = CONCEPTOS_SEMILLA.map((c) => ({
    codigo: c.codigo,
    descripcion: c.descripcion,
    usaPar1: !!c.par1,
    usaPar2: !!c.par2,
    unidadPar1: c.par1 ?? null,
    unidadPar2: c.par2 ?? null,
    activo: true,
  }));
  const fuente = conceptos.length ? conceptos : deLaSemilla;

  const porCodigo = new Map<string, any>();
  fuente.forEach((c: any) => porCodigo.set(c.codigo, c));
  console.log(`Catálogo: ${fuente.length} conceptos${conceptos.length ? "" : " (de la semilla: todavía no se cargó en la base)"}`);
  console.log("");

  const motivos: any[] = await RequestConfig.find({ tenantId }).select("name memosoftEffects").sort({ order: 1 }).lean();
  const respaldo: Respaldo = { fecha: new Date().toISOString(), tenantId: String(tenantId), motivos: [], horasExtraAnterior: undefined };

  let problemas = 0;
  const aGuardar: { motivoId: string; nombre: string; anterior: unknown; lista: any[] }[] = [];

  for (const motivo of motivos) {
    const semilla = MAPEO_SEMILLA[motivo.name];
    if (!semilla) {
      console.log(`?  "${motivo.name}" no está en el mapeo semilla. Se deja como está.`);
      continue;
    }

    const yaTiene = (motivo.memosoftEffects || []).filter((e: any) => !e.vigenteHasta).length;
    if (yaTiene > 0) {
      console.log(`=  "${motivo.name}" ya tiene ${yaTiene} efecto(s) vigente(s). No se pisa.`);
      continue;
    }

    const nuevos = semilla.map((e) => ({ ...e, soloRegimen: e.soloRegimen ?? null, empresaId: null, vigenteDesde: desde, vigenteHasta: null }));
    const malos = nuevos.map((e) => validarEfecto(e as any, porCodigo.get(e.conceptoCodigo))).filter(Boolean);
    if (malos.length) {
      problemas += malos.length;
      console.log(`✗  "${motivo.name}": ${malos.join(" | ")}`);
      continue;
    }

    const detalle = nuevos.length === 0 ? "sin efectos (no genera nada)" : nuevos.map((e) => `${e.conceptoCodigo}→${e.param} ${e.aplicaA}${e.soloRegimen ? ` (${e.soloRegimen})` : ""}`).join(", ");
    console.log(`+  "${motivo.name}": ${detalle}`);
    aGuardar.push({ motivoId: String(motivo._id), nombre: motivo.name, anterior: motivo.memosoftEffects || [], lista: nuevos });
  }

  console.log(`\nHoras extra (regla global): ${HORAS_EXTRA.codigo50} al 50% y ${HORAS_EXTRA.codigo100} al 100%, en ${HORAS_EXTRA.param} como ${HORAS_EXTRA.unidad}.`);
  console.log(`Motivos a configurar: ${aGuardar.length}   ·   con problemas: ${problemas}`);

  if (!aplicar) {
    console.log("\nNada se escribió. Con --aplicar se guarda.");
    await mongoose.disconnect();
    return;
  }

  for (const x of aGuardar) {
    const doc = await RequestConfig.findById(x.motivoId);
    if (!doc) continue;
    respaldo.motivos.push({ motivoId: x.motivoId, nombre: x.nombre, anterior: x.anterior });
    doc.memosoftEffects = reemplazarVigentes((doc.memosoftEffects || []) as any, x.lista as any, desde) as any;
    await doc.save();
  }

  const config = await ActivityLogGeneralConfig.getOrCreateDefault(tenantId);
  respaldo.horasExtraAnterior = (config as any).memosoftHorasExtra ?? null;
  (config as any).memosoftHorasExtra = { ...HORAS_EXTRA, vigenteDesde: desde };
  await config.save();

  fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
  const archivo = path.join(CARPETA_RESPALDOS, `liquidacion-fase1-${respaldo.fecha.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 2));
  console.log(`\nGuardado. Respaldo: ${archivo}`);
  console.log(`Para deshacer:  npx tsx src/scripts/liquidacionFase1.ts --revertir "${archivo}"`);
  await mongoose.disconnect();
}

async function deshacer(archivo: string) {
  if (!archivo || !fs.existsSync(archivo)) {
    console.error("Falta el archivo de respaldo.");
    process.exit(1);
  }
  const respaldo: Respaldo = JSON.parse(fs.readFileSync(archivo, "utf8"));
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });

  for (const m of respaldo.motivos) {
    await RequestConfig.updateOne({ _id: new Types.ObjectId(m.motivoId) }, { $set: { memosoftEffects: m.anterior || [] } });
  }
  console.log(`Motivos revertidos: ${respaldo.motivos.length}`);

  await ActivityLogGeneralConfig.updateOne({ tenantId: new Types.ObjectId(respaldo.tenantId) }, { $set: { memosoftHorasExtra: respaldo.horasExtraAnterior ?? null } });
  console.log("Horas extra revertidas.");

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
