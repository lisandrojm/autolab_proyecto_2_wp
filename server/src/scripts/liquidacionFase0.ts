/**
 * ═══════════════════════════════════════════════════════════════════════
 * LIQUIDACIÓN, FASE 0 — cimientos de datos. Para correr a mano.
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   npx tsx src/scripts/liquidacionFase0.ts <tenantId>              # dice qué haría, NO escribe
 *   npx tsx src/scripts/liquidacionFase0.ts <tenantId> --aplicar    # lo hace y deja respaldo
 *   npx tsx src/scripts/liquidacionFase0.ts --revertir <respaldo>   # lo deshace
 *
 * Tres cosas, las tres idempotentes:
 *
 *   1. CATÁLOGO DE CONCEPTOS — los 29 códigos de Memosoft, uno por empresa.
 *   2. EMPRESA EN EL CONTRATO — completa `empresaContratoId` donde hoy está vacío, derivándolo del
 *      texto de `nombre_contrato`. Hoy lo tienen 24 contratos de 7.462; después de esto lo tienen
 *      todos los que se pueden resolver sin adivinar.
 *   3. LEGAJO POR EMPRESA — copia `metadata.numeroLegajoTango` a `metadata.legajosPorEmpresa` bajo
 *      la empresa de sus contratos, cuando es una sola. El campo viejo NO se toca: queda de respaldo.
 *
 * ANTES DE ESCRIBIR NADA muestra la tabla de resolución agrupada por nombre de contrato distinto:
 * son 26 nombres para 7.462 contratos, así que se revisa 26 veces y no 7.462. Lo que queda
 * ambiguo —los "2030 SRL + Release JSA FZERO"— NO se toca: se decide y se carga a mano.
 *
 * EL RESPALDO. `--aplicar` escribe un JSON con el estado previo de cada campo que modifica, y
 * `--revertir` lo usa para dejar todo como estaba. Sin eso, "migración con rollback" es una frase.
 */
import fs from "fs";
import path from "path";
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { Company } from "../models/Company.js";
import { MemosoftConcepto, CONCEPTOS_SEMILLA } from "../models/MemosoftConcepto.js";
import { EmpresaConocida, empresaDelContrato, resolvio } from "../utils/liquidacion/contratos.js";

const CARPETA_RESPALDOS = path.resolve(process.cwd(), "migraciones-respaldo");

interface Respaldo {
  fecha: string;
  tenantId: string;
  conceptosCreados: string[];
  /** Un registro por contrato tocado: dónde estaba y qué tenía antes. */
  empresasEnContratos: { userProjectId: string; indice: number; anterior: string | null }[];
  legajos: { userId: string; anterior: unknown }[];
}

const titulo = (t: string) => console.log(`\n${"─".repeat(78)}\n${t}\n${"─".repeat(78)}`);

async function main() {
  const revertir = process.argv.includes("--revertir");
  if (revertir) return deshacer(process.argv[process.argv.indexOf("--revertir") + 1]);

  const tenantIdArg = process.argv[2];
  const aplicar = process.argv.includes("--aplicar");
  if (!tenantIdArg || !Types.ObjectId.isValid(tenantIdArg)) {
    console.error("Falta el tenantId. Uso: npx tsx src/scripts/liquidacionFase0.ts <tenantId> [--aplicar]");
    process.exit(1);
  }
  const tenantId = new Types.ObjectId(tenantIdArg);

  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  console.log(`Base: ${env.MONGO_DB_NAME}${aplicar ? "" : "   (simulación: no se escribe nada)"}`);

  const respaldo: Respaldo = { fecha: new Date().toISOString(), tenantId: String(tenantId), conceptosCreados: [], empresasEnContratos: [], legajos: [] };

  const empresas: any[] = await Company.find({}).select("razonSocial").lean();
  const conocidas: EmpresaConocida[] = empresas.map((e: any) => ({ id: String(e._id), razonSocial: e.razonSocial }));
  const razonPorId = new Map(conocidas.map((e) => [e.id, e.razonSocial]));
  console.log(`Empresas: ${conocidas.map((e) => e.razonSocial).join(", ")}`);

  /* ─────────────── 1. Catálogo de conceptos ─────────────── */
  titulo("1. CATÁLOGO DE CONCEPTOS DE MEMOSOFT");
  const yaCargados = await MemosoftConcepto.find({ tenantId }).select("empresaId codigo").lean();
  const existe = new Set(yaCargados.map((c: any) => `${c.empresaId}|${c.codigo}`));

  let aCrear = 0;
  const nuevos: any[] = [];
  for (const empresa of conocidas) {
    for (const c of CONCEPTOS_SEMILLA) {
      if (existe.has(`${empresa.id}|${c.codigo}`)) continue;
      aCrear++;
      nuevos.push({
        tenantId,
        empresaId: new Types.ObjectId(empresa.id),
        codigo: c.codigo,
        descripcion: c.descripcion,
        usaPar1: !!c.par1,
        usaPar2: !!c.par2,
        unidadPar1: c.par1 ?? null,
        unidadPar2: c.par2 ?? null,
        activo: true,
      });
    }
  }
  console.log(`Ya cargados: ${yaCargados.length}   ·   a crear: ${aCrear} (${CONCEPTOS_SEMILLA.length} por cada una de las ${conocidas.length} empresas)`);

  if (aplicar && nuevos.length) {
    const creados = await MemosoftConcepto.insertMany(nuevos);
    respaldo.conceptosCreados = creados.map((c: any) => String(c._id));
    console.log(`Creados: ${creados.length}`);
  }

  /* ─────────────── 2. La empresa dentro del contrato ─────────────── */
  titulo("2. EMPRESA EN LOS CONTRATOS");
  const vinculos: any[] = await UserProject.find({}).select("userId contracts.nombre_contrato contracts.empresaContratoId contracts.fecha_alta_contrato contracts.fecha_baja_contrato").lean();

  /* Se agrupa por nombre distinto para poder revisar 16 decisiones en vez de 7.462. */
  const porNombre = new Map<string, { resueltos: number; empresa: string | null; motivo: string | null; detalle: string }>();
  const cambios: { userProjectId: string; indice: number; anterior: string | null; empresaId: string }[] = [];

  for (const v of vinculos) {
    (v.contracts || []).forEach((c: any, i: number) => {
      if (c.empresaContratoId) return; // Ya lo tiene: no se pisa nunca.
      const nombre = String(c.nombre_contrato || "(sin nombre)");
      const r = empresaDelContrato(c, conocidas);

      if (!porNombre.has(nombre)) {
        porNombre.set(nombre, {
          resueltos: 0,
          empresa: resolvio(r) ? razonPorId.get(r.valor) || r.valor : null,
          motivo: resolvio(r) ? null : r.motivo,
          detalle: resolvio(r) ? "" : r.detalle,
        });
      }
      porNombre.get(nombre)!.resueltos++;

      if (resolvio(r)) cambios.push({ userProjectId: String(v._id), indice: i, anterior: null, empresaId: r.valor });
    });
  }

  console.log("Por nombre de contrato distinto:\n");
  [...porNombre.entries()]
    .sort((a, b) => b[1].resueltos - a[1].resueltos)
    .forEach(([nombre, info]) => {
      const destino = info.empresa ? `→ ${info.empresa}` : `→ SIN RESOLVER (${info.motivo})`;
      console.log(`   ${String(info.resueltos).padStart(5)} contratos   "${nombre}"   ${destino}`);
    });

  const sinResolver = [...porNombre.values()].filter((i) => !i.empresa).reduce((n, i) => n + i.resueltos, 0);
  console.log(`\nSe completarían: ${cambios.length}   ·   quedan sin resolver: ${sinResolver} (se cargan a mano)`);

  if (aplicar && cambios.length) {
    respaldo.empresasEnContratos = cambios.map((c) => ({ userProjectId: c.userProjectId, indice: c.indice, anterior: c.anterior }));
    for (let i = 0; i < cambios.length; i += 200) {
      const lote = cambios.slice(i, i + 200);
      await UserProject.bulkWrite(
        lote.map((c) => ({
          updateOne: {
            filter: { _id: new Types.ObjectId(c.userProjectId) },
            update: { $set: { [`contracts.${c.indice}.empresaContratoId`]: new Types.ObjectId(c.empresaId) } },
          },
        })) as any,
      );
    }
    console.log(`Completados: ${cambios.length}`);
  }

  /* ─────────────── 3. El legajo, bajo su empresa ─────────────── */
  titulo("3. LEGAJO POR EMPRESA");
  /*
    LA EMPRESA SALE DE TODOS SUS CONTRATOS, NO DE LOS VIGENTES HOY.

    Con "vigente hoy" se migraban 140 de 960: los otros 815 tienen legajo pero ningún contrato
    abierto este mes —son eventuales y estacionales, que es la mitad de la gente de producción—, y
    quedarse sin migrarlos dejaría el dato nuevo vacío justo para ellos.

    La regla es estricta igual: si TODOS sus contratos son de la misma empresa, el legajo es de esa
    empresa. Si pasó por dos, no se copia: el legajo heredado es uno solo y no dice de cuál es, y
    ponerlo en las dos podría estar pisando el legajo de otra persona en la otra empresa.
  */
  const empresaPorUsuario = new Map<string, Set<string>>();
  for (const v of vinculos) {
    (v.contracts || []).forEach((c: any, i: number) => {
      const yaAsignada = cambios.find((x) => x.userProjectId === String(v._id) && x.indice === i)?.empresaId;
      const id = c.empresaContratoId ? String(c.empresaContratoId) : yaAsignada;
      if (!id) return;
      empresaPorUsuario.set(String(v.userId), (empresaPorUsuario.get(String(v.userId)) || new Set()).add(id));
    });
  }

  const usuarios: any[] = await User.find({ tenantId, isSystem: { $ne: true }, "metadata.numeroLegajoTango": { $nin: [null, ""] } })
    .select("firstName lastName metadata.numeroLegajoTango metadata.legajosPorEmpresa")
    .lean();

  let migrados = 0;
  let yaTenian = 0;
  let sinEmpresa = 0;
  let enVariasEmpresas = 0;
  const aEscribir: { userId: string; anterior: unknown; lista: any[] }[] = [];

  for (const u of usuarios) {
    if ((u.metadata?.legajosPorEmpresa || []).length > 0) {
      yaTenian++;
      continue;
    }
    const empresasDeLaPersona = [...(empresaPorUsuario.get(String(u._id)) || new Set<string>())];
    if (empresasDeLaPersona.length === 0) {
      sinEmpresa++;
      continue;
    }
    /*
      CON DOS EMPRESAS NO SE COPIA. El legajo heredado de Tango es UNO solo y no dice de cuál es;
      ponerlo en las dos inventaría un legajo que a lo mejor allá pertenece a otra persona.
    */
    if (empresasDeLaPersona.length > 1) {
      enVariasEmpresas++;
      continue;
    }
    migrados++;
    aEscribir.push({
      userId: String(u._id),
      anterior: u.metadata?.legajosPorEmpresa ?? null,
      lista: [{ empresaId: new Types.ObjectId(empresasDeLaPersona[0]), legajo: String(u.metadata.numeroLegajoTango).trim() }],
    });
  }

  console.log(`Con legajo heredado: ${usuarios.length}`);
  console.log(`   ya migrados:                 ${yaTenian}`);
  console.log(`   se copian:                   ${migrados}`);
  console.log(`   sin empresa en ningún contrato: ${sinEmpresa}`);
  console.log(`   pasaron por 2+ empresas:        ${enVariasEmpresas}  (hay que decir cuál legajo es de cuál)`);

  if (aplicar && aEscribir.length) {
    respaldo.legajos = aEscribir.map((x) => ({ userId: x.userId, anterior: x.anterior }));
    for (let i = 0; i < aEscribir.length; i += 200) {
      const lote = aEscribir.slice(i, i + 200);
      await User.bulkWrite(
        lote.map((x) => ({ updateOne: { filter: { _id: new Types.ObjectId(x.userId) }, update: { $set: { "metadata.legajosPorEmpresa": x.lista } } } })) as any,
      );
    }
    console.log(`Copiados: ${aEscribir.length}`);
  }

  /* ─────────────── Cierre ─────────────── */
  if (!aplicar) {
    console.log("\nNada se escribió. Con --aplicar se guarda y se deja el respaldo.");
    await mongoose.disconnect();
    return;
  }

  fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
  const archivo = path.join(CARPETA_RESPALDOS, `liquidacion-fase0-${respaldo.fecha.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 2));
  console.log(`\nRespaldo: ${archivo}`);
  console.log(`Para deshacer:  npx tsx src/scripts/liquidacionFase0.ts --revertir "${archivo}"`);
  await mongoose.disconnect();
}

/** Deja todo como estaba antes de la corrida que generó ese respaldo. */
async function deshacer(archivo: string) {
  if (!archivo || !fs.existsSync(archivo)) {
    console.error("Falta el archivo de respaldo. Uso: npx tsx src/scripts/liquidacionFase0.ts --revertir <archivo>");
    process.exit(1);
  }
  const respaldo: Respaldo = JSON.parse(fs.readFileSync(archivo, "utf8"));
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  console.log(`Revirtiendo la corrida del ${respaldo.fecha} sobre ${env.MONGO_DB_NAME}`);

  if (respaldo.conceptosCreados.length) {
    const r = await MemosoftConcepto.deleteMany({ _id: { $in: respaldo.conceptosCreados.map((id) => new Types.ObjectId(id)) } });
    console.log(`Conceptos borrados: ${r.deletedCount}`);
  }

  // `anterior` es null en todos: son campos que estaban vacíos. Se los vuelve a vaciar.
  for (let i = 0; i < respaldo.empresasEnContratos.length; i += 200) {
    const lote = respaldo.empresasEnContratos.slice(i, i + 200);
    await UserProject.bulkWrite(
      lote.map((c) => ({
        updateOne: { filter: { _id: new Types.ObjectId(c.userProjectId) }, update: { $unset: { [`contracts.${c.indice}.empresaContratoId`]: "" } } },
      })) as any,
    );
  }
  console.log(`Empresas quitadas de contratos: ${respaldo.empresasEnContratos.length}`);

  for (let i = 0; i < respaldo.legajos.length; i += 200) {
    const lote = respaldo.legajos.slice(i, i + 200);
    await User.bulkWrite(
      lote.map((x) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(x.userId) },
          update: x.anterior ? { $set: { "metadata.legajosPorEmpresa": x.anterior } } : { $unset: { "metadata.legajosPorEmpresa": "" } },
        },
      })) as any,
    );
  }
  console.log(`Legajos revertidos: ${respaldo.legajos.length}`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
