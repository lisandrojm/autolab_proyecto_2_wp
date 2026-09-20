/**
 * ═══════════════════════════════════════════════════════════════════════
 * ÍNDICES QUE FALTAN — script idempotente, para correr a mano
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   npx tsx src/scripts/indicesFaltantes.ts          # dice qué haría, NO escribe
 *   npx tsx src/scripts/indicesFaltantes.ts --crear  # los crea
 *
 * Por qué a mano y no al arrancar el server: crear un índice sobre una colección grande bloquea
 * escrituras un rato, y eso se decide cuando uno mira, no en medio de una jornada de trabajo.
 *
 * Es IDEMPOTENTE: `createIndex` sobre un índice que ya existe con la misma definición no hace nada.
 * Si existe con OTRAS opciones, Mongo devuelve un error de conflicto y el script lo reporta sin
 * tocar nada más: ahí hay que decidir a mano, porque borrar un índice en uso no es automatizable.
 *
 * QUÉ NO ESTÁ ACÁ Y POR QUÉ:
 *   · `User {tenantId, projectIds}` y `{tenantId, "metadata.projects.projectId"}` ya existen
 *     (models/User.ts).
 *   · `UserProject {projectId, userId}` único ya existe y cubre por prefijo las consultas por
 *     `projectId` solo, que son las de los contadores de área y turno.
 *   · `Project {tenantId, "metadata.responsableId"}` y `{tenantId, "coordinatorAssignments.userId"}`
 *     ya existen.
 *   Agregarlos de nuevo sería ruido; lo que sigue es lo que de verdad no está declarado en ningún schema.
 */
import mongoose from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";

interface IndicePorCrear {
  coleccion: string;
  claves: Record<string, 1 | -1>;
  opciones?: mongoose.mongo.CreateIndexesOptions;
  /** Qué consulta lo usa. Si nadie puede nombrar la consulta, el índice no va. */
  porque: string;
}

const INDICES: IndicePorCrear[] = [
  {
    coleccion: "requests",
    claves: { tenantId: 1, date: -1, createdAt: -1 },
    porque:
      "El listado de Novedades pagina ordenando por (date, createdAt) sobre todo el tenant. El índice que hay es {tenantId, userId, date}: sirve cuando alguien mira LAS SUYAS, no cuando un admin mira todas, que es la pantalla lenta.",
  },
  {
    coleccion: "centros-costo",
    claves: { codAuxiliar: 1 },
    porque: "El listado ordena por `codAuxiliar` y la búsqueda del selector filtra por él (routes/centrosCosto.ts).",
  },
  {
    coleccion: "companies",
    claves: { tenantId: 1, razonSocial: 1 },
    porque: "`Company` no declara NINGÚN índice y se lista entera en Proyectos y en la ficha del proyecto.",
  },
  {
    coleccion: "categorias-sat",
    claves: { "data.id": 1 },
    porque: "Los contratos apuntan a la categoría por su id numérico (`categoria_sat_id`); hoy es un recorrido completo.",
  },
  {
    coleccion: "roles_frame",
    claves: { "data.rol.id": 1 },
    porque: "`RoleFrame` no declara índices y se busca por el id de FRAME en contratos por vencer y en el alta.",
  },
  {
    coleccion: "contratos-frame",
    claves: { externalId: 1 },
    porque: "`ContratoFrame` no declara índices; el alta y el TXT de ARCA lo resuelven por `externalId`.",
  },
  {
    coleccion: "users_&_projects",
    claves: { userId: 1 },
    porque: "El índice que hay arranca por `projectId`, así que no sirve para «los proyectos de esta persona», que es el perfil y el móvil.",
  },
];

async function main(): Promise<void> {
  const crear = process.argv.includes("--crear");
  const uri = env.MONGO_URI;
  if (!uri) throw new Error("Falta MONGO_URI en el entorno.");

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error("No se pudo abrir la base.");
  console.log(`\nBase: ${db.databaseName}${crear ? "" : "   (simulación: no se escribe nada)"}\n`);

  for (const indice of INDICES) {
    const nombre = Object.entries(indice.claves)
      .map(([k, v]) => `${k}_${v}`)
      .join("_");
    const coleccion = db.collection(indice.coleccion);

    // `listIndexes` falla si la colección no existe: eso también es información.
    let existe = false;
    try {
      const actuales = await coleccion.listIndexes().toArray();
      existe = actuales.some((i) => i.name === nombre || JSON.stringify(i.key) === JSON.stringify(indice.claves));
    } catch {
      console.log(`⚠  ${indice.coleccion}: la colección no existe en esta base. Se saltea.`);
      continue;
    }

    if (existe) {
      console.log(`✓  ${indice.coleccion}.${nombre} ya está.`);
      continue;
    }
    if (!crear) {
      console.log(`+  ${indice.coleccion}.${nombre} — ${indice.porque}`);
      continue;
    }
    try {
      // `background` es el default desde Mongo 4.2; se deja explícito el nombre para poder borrarlo.
      await coleccion.createIndex(indice.claves, { name: nombre, ...indice.opciones });
      console.log(`✓  creado ${indice.coleccion}.${nombre}`);
    } catch (e: any) {
      console.error(`✗  ${indice.coleccion}.${nombre}: ${e?.message || e}`);
    }
  }

  console.log(crear ? "\nListo.\n" : "\nNada se escribió. Con --crear se aplican.\n");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
