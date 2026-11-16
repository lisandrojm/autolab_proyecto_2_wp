/**
 * LOS ÍNDICES DE LA CAMPAÑA DE GOCE (15/11/2026)
 *
 *   npm run campania:indices            # dice qué haría
 *   npm run campania:indices -- --aplicar
 *
 * Los índices no van en el schema (en esta base se crean a propósito, con script). La campaña consulta:
 *   · invitaciones de una campaña por estado (tablero, barrido, recordatorios);
 *   · la invitación de una persona (la app, en cada apertura de la tarjeta);
 *   · las campañas de un tenant por estado.
 * Y `vacations` por campaña, para enganchar aprobar / rechazar.
 */
import mongoose from "mongoose";

const INDICES: { coleccion: string; clave: Record<string, 1 | -1>; opciones?: Record<string, unknown> }[] = [
  { coleccion: "invitaciones_vacaciones", clave: { tenantId: 1, campaniaId: 1, estado: 1 } },
  { coleccion: "invitaciones_vacaciones", clave: { tenantId: 1, userId: 1, campaniaId: 1 }, opciones: { unique: true } },
  { coleccion: "campanias_vacaciones", clave: { tenantId: 1, estado: 1, anio: 1 } },
  { coleccion: "vacations", clave: { tenantId: 1, campaniaId: 1 }, opciones: { sparse: true } },
];

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  if (!process.env.MONGO_URI) throw new Error("Falta MONGO_URI (usar dotenv -e .env.production)");
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
  const db = mongoose.connection.db!;
  console.log(`Base: ${db.databaseName}${aplicar ? "" : "   (simulación: no se escribe nada)"}\n`);
  for (const i of INDICES) {
    const existe = (await db.listCollections({ name: i.coleccion }).toArray()).length > 0;
    const ya = existe ? (await db.collection(i.coleccion).indexes()).some((x) => JSON.stringify(x.key) === JSON.stringify(i.clave)) : false;
    console.log(`${i.coleccion} ${JSON.stringify(i.clave)}: ${ya ? "ya está" : aplicar ? "creando…" : "falta"}`);
    if (!ya && aplicar) await db.collection(i.coleccion).createIndex(i.clave, i.opciones || {});
  }
  console.log(aplicar ? "\nListo." : "\nNada se escribió. Con --aplicar se crean.");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
