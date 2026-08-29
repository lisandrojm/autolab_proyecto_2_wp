import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { auditarPunteros } from "../utils/auditoriaPunterosCategoria.js";

/**
 * Reescribe los `categoria_sat_id` de los contratos que apuntan a una categoría que no existe.
 *
 * EL CASO QUE LO MOTIVA
 *
 * La tabla de categorías vino de FRAME, donde «Director de Programas» tenía id 43. La migración a
 * WeProdu la recreó con id 1 y el mismo código ARCA `035283`, en vez de conservar el id original. Los
 * contratos nunca se enteraron: siguen guardando 43, que hoy no resuelve a nada, y por eso su TXT
 * sale sin las posiciones 101-106 y ARCA lo rechaza.
 *
 * La evidencia de que 43 y 1 son la MISMA categoría, y no un parecido de nombre:
 *
 *   · de las 109 categorías de FRAME, la única que no llegó con su id es la 43;
 *   · de las 106 de 0634/11 en WeProdu, la única con un id que FRAME no tenía es la 1;
 *   · las dos se llaman «Director de Programas» y las dos son `035283`;
 *   · los contratos rotos guardan `nombre_categoria_sat: "Director de Programas"`.
 *
 * SE REESCRIBE EL PUNTERO, NO SE CREA UN ALIAS
 *
 * Hay maquinaria de alias en `repararCategoriasHuerfanas.ts` y funciona, pero un alias mantiene vivo
 * un id fantasma que nadie va a recordar dentro de seis meses. Este trabajo entero empezó por cosas
 * que nadie recordaba. Reescribir deja el estado final que importa: ningún contrato referenciando una
 * categoría inexistente.
 *
 * Uso (desde server/):
 *   npm run punteros-categoria:reparar:dry
 *   npm run punteros-categoria:reparar
 *   npm run punteros-categoria:reparar:revertir -- <respaldo.json>
 */

const DRY_RUN = process.env.DRY_RUN === "true";
const COLECCION_CONTRATOS = "users_&_projects";

/**
 * Qué id fantasma se reasigna a qué categoría, y bajo qué función.
 *
 * `soloRol` NO sobra: el mismo id roto puede estar en contratos de funciones distintas, y eso no los
 * vuelve el mismo caso. Con el id 43 pasó exactamente: 163 contratos son de «Director de Programas»
 * —de donde vino ese id— y 1 es de «Jefe de Produccion», una función que ni siquiera propone esa
 * categoría. Reasignar los dos con la misma regla sería resolver a ciegas el que no se entiende.
 */
const REASIGNACIONES: Array<{ de: number; a: number; soloRol: number; porque: string }> = [
  {
    de: 43,
    a: 1,
    soloRol: 2,
    porque: "FRAME tenía «Director de Programas» con id 43; la migración la recreó con id 1, mismo código 035283",
  },
];

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No se pudo establecer la conexión");

  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  const categorias = await db.collection("categorias").find({}).toArray();
  const sat = await db.collection("categorias-sat").find({}).toArray();
  const grupos = await db.collection("convenio-grupos").find({}).toArray();
  const roles = await db.collection("roles_frame").find({}).project({ name: 1, "data.rol.id": 1 }).toArray();
  const nombrePorRolId = new Map<number, string>(roles.filter((r: any) => r.data?.rol?.id != null).map((r: any) => [Number(r.data.rol.id), String(r.name)]));
  const ups = await db.collection(COLECCION_CONTRATOS).find({}).project({ userId: 1, nombre_proyecto: 1, contracts: 1 }).toArray();

  const antes = auditarPunteros(ups as any[], [...categorias, ...sat] as any[], nombrePorRolId);

  console.log(`CONTRATOS con una categoría que no existe: ${antes.total}\n`);
  for (const g of antes.porCategoria) {
    console.log(`   categoria_sat_id ${g.categoriaSatId}  «${g.nombreGuardado || "sin nombre guardado"}»  ·  ${g.contratos} contrato(s)`);
    for (const r of g.roles) console.log(`      ${String(r.contratos).padStart(4)}  ${r.nombre}`);
  }
  console.log("");

  // ── El destino, verificado antes de tocar nada ──────────────────────────────
  const respaldo: Array<{ userProjectId: string; indice: number; de: number; a: number }> = [];
  let corregidos = 0;

  for (const r of REASIGNACIONES) {
    const destino: any = categorias.find((c: any) => Number(c.legacyId) === r.a);
    if (!destino) {
      console.log(`   ✗ ${r.de} → ${r.a}: la categoría destino NO existe. No se toca nada.`);
      continue;
    }
    if (destino.isActive === false) {
      console.log(`   ✗ ${r.de} → ${r.a}: «${destino.nombre}» está dada de baja. Reasignar a una baja sería repetir el bug.`);
      continue;
    }
    const grupo: any = grupos.find((g: any) => String(g._id) === String(destino.grupoId));
    /*
      La ESCALA se verifica antes de escribir, y es lo que distingue este arreglo del de los actores.
      Reasignar a una categoría sin escala dejaría los contratos igual de imposibles de generar: la
      retribución pactada (posiciones 58-72) saldría en cero y ARCA rechaza el alta.
    */
    const bruto = destino.sueldoBruto ?? grupo?.sueldoBruto ?? 0;
    console.log(`   ${r.de} → ${r.a}  «${destino.nombre}» · ${destino.codigoArca} · ${destino.convenio} · activa`);
    console.log(`      motivo: ${r.porque}`);
    console.log(`      escala: bruto ${bruto ? `$ ${Number(bruto).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "SIN ESCALA"} ${grupo ? `(del grupo, al ${grupo.fechaActualizacion ?? "?"})` : "(propia de la categoría)"}`);
    if (!bruto) {
      console.log(`      ✗ Sin escala no se corrige: el alta seguiría sin poder generarse. Cargá la escala primero.`);
      continue;
    }

    const alcanzados = antes.contratos.filter((c) => c.categoriaSatId === r.de && c.rolFrameId === r.soloRol);
    const excluidos = antes.contratos.filter((c) => c.categoriaSatId === r.de && c.rolFrameId !== r.soloRol);
    console.log(`      alcanza a ${alcanzados.length} contrato(s) de «${nombrePorRolId.get(r.soloRol) || `rol ${r.soloRol}`}»`);
    if (excluidos.length > 0) {
      console.log(`      NO alcanza a ${excluidos.length} contrato(s) del mismo id bajo otra función — se reportan abajo y se dejan como están.`);
    }

    for (const c of alcanzados) {
      respaldo.push({ userProjectId: c.userProjectId, indice: c.indice, de: r.de, a: r.a });
      if (!DRY_RUN) {
        await db.collection(COLECCION_CONTRATOS).updateOne({ _id: new mongoose.Types.ObjectId(c.userProjectId) }, { $set: { [`contracts.${c.indice}.categoria_sat_id`]: r.a } });
        corregidos++;
      }
    }
    console.log("");
  }

  if (respaldo.length > 0) {
    const carpeta = path.resolve("respaldos");
    fs.mkdirSync(carpeta, { recursive: true });
    const archivo = path.join(carpeta, `punteros-categoria-${dbName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 2), "utf8");
    console.log(`Respaldo: ${archivo}`);
    console.log(`Para volver atrás:  npm run punteros-categoria:reparar:revertir -- "${archivo}"\n`);
  }
  console.log(`${corregidos} contrato(s) corregido(s)${DRY_RUN ? " (0: es dry run)" : ""}.\n`);

  // ── Lo que queda, con nombre y apellido ─────────────────────────────────────
  const despues = DRY_RUN ? antes : auditarPunteros((await db.collection(COLECCION_CONTRATOS).find({}).project({ userId: 1, nombre_proyecto: 1, contracts: 1 }).toArray()) as any[], [...categorias, ...sat] as any[], nombrePorRolId);
  const pendientes = despues.contratos.filter((c) => !REASIGNACIONES.some((r) => r.de === c.categoriaSatId && r.soloRol === c.rolFrameId));

  console.log("SIN DESTINO EVIDENTE — se reportan y se frena. No se corrigen a ciegas:\n");
  if (pendientes.length === 0) console.log("   (ninguno)\n");
  const users = new Map((await db.collection("users").find({}).project({ firstName: 1, lastName: 1, metadata: 1 }).toArray()).map((u: any) => [String(u._id), u]));
  for (const c of pendientes) {
    const u: any = users.get(c.userId);
    console.log(`   · categoria_sat_id ${c.categoriaSatId} «${c.nombreGuardado || "sin nombre"}» · ${nombrePorRolId.get(Number(c.rolFrameId)) || `rol ${c.rolFrameId}`}`);
    console.log(`     ${u ? `${u.lastName || ""} ${u.firstName || ""}`.trim() : c.userId} · CUIL ${u?.metadata?.cuit || "—"} · proyecto «${c.proyecto}»`);
    console.log(`     ${COLECCION_CONTRATOS} ${c.userProjectId} [contrato ${c.indice}]`);
  }
  console.log("");

  await mongoose.disconnect();
}

/** Vuelve cada contrato al id que tenía. */
async function revertir(archivo: string) {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
  const respaldo = JSON.parse(fs.readFileSync(archivo, "utf8")) as Array<{ userProjectId: string; indice: number; de: number; a: number }>;

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db!;
  console.log(`\nDB: ${dbName}   |   REVIRTIENDO ${respaldo.length} contrato(s) desde ${archivo}\n`);
  for (const r of respaldo) {
    await db.collection(COLECCION_CONTRATOS).updateOne({ _id: new mongoose.Types.ObjectId(r.userProjectId) }, { $set: { [`contracts.${r.indice}.categoria_sat_id`]: r.de } });
  }
  console.log(`   ← ${respaldo.length} contrato(s) devuelto(s) a su id anterior.\n`);
  await mongoose.disconnect();
}

if (process.argv[1] && process.argv[1].includes("repararPunterosCategoria")) {
  const archivo = process.argv.find((a) => a.endsWith(".json"));
  (archivo ? revertir(archivo) : run()).catch((e) => {
    console.error("\nError:", e?.message || e, "\n");
    process.exit(1);
  });
}
