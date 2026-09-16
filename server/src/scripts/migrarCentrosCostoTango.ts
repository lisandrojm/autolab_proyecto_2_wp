import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { CentroCosto, sincronizarCamposDerivados } from "../models/CentroCosto.js";
import { CentroCostoRespaldo } from "../models/CentroCostoRespaldo.js";
import { Project } from "../models/Project.js";
import { construirRemapeo, decidirRemapeo, validarPayload, type FilaRemapeo } from "../services/centrosCostoImport.js";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CENTROS DE COSTO: REEMPLAZAR EL CATÁLOGO POR EL DE Tango Y MOVER LOS PROYECTOS
  ═══════════════════════════════════════════════════════════════════════════════

  Lo mismo que hace `POST /centros-costo/import-json` desde la pantalla, pero desde la consola y con
  la tabla antes → después a la vista. Existe porque este cambio se hace UNA vez sobre datos que ya
  están en producción: conviene poder mirarlo antes de escribir, y volver a correrlo sin miedo.

  MODO SEGURO POR DEFECTO: sin `--aplicar` no escribe nada. Sólo lee, arma el remapeo y lo imprime.

      # ver qué pasaría (no toca nada). La base sale del .env, igual que el servidor.
      cd server && npx dotenv -e .env.development -- npx tsx src/scripts/migrarCentrosCostoTango.ts

      # sólo la tabla de proyectos, sin reemplazar el catálogo
      npx dotenv -e .env.development -- npx tsx src/scripts/migrarCentrosCostoTango.ts --solo-proyectos

      # hacerlo de verdad (y en producción, con .env.production)
      npx dotenv -e .env.development -- npx tsx src/scripts/migrarCentrosCostoTango.ts --aplicar

  Opciones: `--archivo=<ruta>` (default `data/centros-costo/centros_costo_import.json`),
  `--tenant=<id>` (default: todos), `--solo-proyectos`, `--solo-catalogo`, `--aplicar`.

  POR QUÉ SE PUEDE CORRER DOS VECES: el proyecto migrado queda con `metadata.centroCostoOrigen =
  "frame"` y `decidirRemapeo` lo saltea por esa marca. Sin ella, la segunda corrida volvería a
  remapear —los ids viejos 1–46 también son `idAuxiliar` válidos— y dejaría 44 proyectos en centros
  que nadie eligió. Ver los casos en `services/centrosCostoImport.test.ts`.
*/

const args = process.argv.slice(2);
const tieneFlag = (f: string) => args.includes(f);
const valorFlag = (f: string) => args.find((a) => a.startsWith(`${f}=`))?.split("=").slice(1).join("=");

const APLICAR = tieneFlag("--aplicar");
const SOLO_PROYECTOS = tieneFlag("--solo-proyectos");
const SOLO_CATALOGO = tieneFlag("--solo-catalogo");
const TENANT = valorFlag("--tenant");
const ARCHIVO = valorFlag("--archivo") || path.resolve(process.cwd(), "..", "data", "centros-costo", "centros_costo_import.json");

const tabla = (filas: Array<Record<string, string | number>>) => {
  if (filas.length === 0) return "  (ninguno)";
  const cols = Object.keys(filas[0]);
  const ancho = cols.map((c) => Math.max(c.length, ...filas.map((f) => String(f[c] ?? "").length)));
  const linea = (vals: Array<string | number>) => "  " + vals.map((v, i) => String(v ?? "").padEnd(ancho[i])).join("  ");
  return [linea(cols), "  " + ancho.map((a) => "-".repeat(a)).join("  "), ...filas.map((f) => linea(cols.map((c) => f[c])))].join("\n");
};

async function main() {
  /*
    La misma base que el servidor: `MONGO_URI` + `MONGO_DB_NAME` (ver `config/db.ts`). El nombre de la
    base va explícito porque la URI de Atlas no lo trae, y conectarse sin él escribiría en `test`.
  */
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) {
    console.error("Faltan MONGO_URI / MONGO_DB_NAME. Corré con: npx dotenv -e .env.development -- npx tsx src/scripts/migrarCentrosCostoTango.ts");
    process.exit(1);
  }

  console.log(`\n${APLICAR ? "APLICANDO CAMBIOS" : "DRY-RUN (no se escribe nada)"} · base: ${dbName} · archivo: ${ARCHIVO}\n`);

  if (!fs.existsSync(ARCHIVO)) {
    console.error(`No encontré el archivo ${ARCHIVO}`);
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(ARCHIVO, "utf-8"));
  const validado = validarPayload({ ...payload, modo: "reemplazar" });
  if (!validado.ok) {
    console.error(`El archivo tiene ${validado.errores.length} errores. No se toca nada:\n`);
    validado.errores.slice(0, 20).forEach((e) => console.error("  · " + e));
    process.exit(1);
  }
  console.log(`Archivo válido: ${validado.items.length} centros de costo (${validado.items.filter((i) => i.habilitado === "N").length} inhabilitados).`);

  await mongoose.connect(uri, { dbName });

  // 1. El catálogo actual y el remapeo por código. Se lee SIEMPRE antes de escribir.
  const anteriores: any[] = await CentroCosto.find({}).lean();
  console.log(`Catálogo actual: ${anteriores.length} centros.`);
  const remapeo: FilaRemapeo[] = construirRemapeo(
    anteriores.map((c) => ({ idViejo: Number(c.idAuxiliar ?? c.data?.id ?? Number(c.externalId)), codigo: String(c.codAuxiliar ?? c.name ?? c.data?.nombre ?? "") })),
    validado.items,
  );
  const sinEquivalenteEnCatalogo = remapeo.filter((r) => r.idAuxiliarNuevo === null);

  console.log(`\n── REMAPEO DEL CATÁLOGO (por código) ──`);
  console.log(tabla(remapeo.map((r) => ({ "id viejo": r.idViejo, código: r.codigo, "id Tango": r.idAuxiliarNuevo ?? "— SIN EQUIVALENTE" }))));

  // 2. Los proyectos que se tocarían.
  const filtroProyectos: any = { "metadata.centroCostoId": { $gt: 0 } };
  if (TENANT) filtroProyectos.tenantId = new mongoose.Types.ObjectId(TENANT);
  const proyectos: any[] = await Project.find(filtroProyectos).select("name tenantId metadata.centroCostoId metadata.centroCostoOrigen").lean();
  const decision = decidirRemapeo(
    proyectos.map((p) => ({ _id: p._id, nombre: p.name, centroCostoId: p.metadata?.centroCostoId, centroCostoOrigen: p.metadata?.centroCostoOrigen })),
    remapeo,
  );

  console.log(`\n── PROYECTOS (${proyectos.length} con centro de costo) ──`);
  console.log(tabla(decision.cambios.map((c) => ({ proyecto: c.nombre.slice(0, 40), código: c.codigo, antes: c.antes, después: c.despues }))));
  if (decision.omitidos.length > 0) {
    console.log(`\n── SIN TOCAR (${decision.omitidos.length}) ──`);
    console.log(tabla(decision.omitidos.map((o) => ({ proyecto: o.nombre.slice(0, 40), "centro actual": o.centroCostoId, motivo: o.motivo }))));
  }
  if (sinEquivalenteEnCatalogo.length > 0) {
    console.log(`\nATENCIÓN · ${sinEquivalenteEnCatalogo.length} centros del catálogo actual no existen en Tango: ${sinEquivalenteEnCatalogo.map((r) => `${r.codigo} (id ${r.idViejo})`).join(", ")}`);
    console.log("Los proyectos que los usan quedan como están: hay que decidir a mano a qué centro van.");
  }

  console.log(`\nResumen: ${SOLO_PROYECTOS ? "catálogo sin tocar" : `${anteriores.length} centros a borrar y ${validado.items.length} a crear`} · ${decision.cambios.length} proyectos a remapear · ${decision.omitidos.length} sin tocar.`);

  if (!APLICAR) {
    console.log("\nDRY-RUN: no se escribió nada. Volvé a correrlo con --aplicar cuando esté revisado.\n");
    await mongoose.disconnect();
    return;
  }

  // 3. El respaldo, antes de escribir.
  await CentroCostoRespaldo.create({
    origen: "script",
    modo: SOLO_PROYECTOS ? "solo-proyectos" : "reemplazar",
    catalogoAnterior: anteriores,
    proyectos: decision.cambios.map((c) => ({ projectId: c.projectId, nombre: c.nombre, antes: c.antes, despues: c.despues })),
    sinEquivalente: decision.omitidos.filter((o) => o.motivo.includes("no existe en Tango")).map((o) => ({ projectId: o.projectId, nombre: o.nombre, centroCostoId: o.centroCostoId, motivo: o.motivo })),
  });
  console.log("Respaldo guardado en `centros_costo_respaldos`.");

  // 4. El catálogo.
  if (!SOLO_PROYECTOS) {
    const borrados = (await CentroCosto.deleteMany({})).deletedCount || 0;
    await CentroCosto.insertMany(validado.items.map((i) => sincronizarCamposDerivados({ ...i }) as any), { ordered: false });
    console.log(`Catálogo reemplazado: ${borrados} borrados, ${validado.items.length} creados.`);
  }

  // 5. Los proyectos, después del catálogo.
  if (!SOLO_CATALOGO && decision.cambios.length > 0) {
    const r: any = await Project.bulkWrite(
      decision.cambios.map((c) => ({
        updateOne: { filter: { _id: c.projectId }, update: { $set: { "metadata.centroCostoId": c.despues, "metadata.centroCostoOrigen": "tango" } } },
      })),
      { ordered: false },
    );
    console.log(`Proyectos remapeados: ${r.modifiedCount || 0}.`);
  }

  await mongoose.disconnect();
  console.log("\nListo.\n");
}

main().catch(async (e) => {
  console.error("Falló la migración:", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
