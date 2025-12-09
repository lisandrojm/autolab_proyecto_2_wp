import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import mongoose from "mongoose";

async function cleanOrderCounters() {
  try {
    console.log("🧹 Iniciando limpieza de colección OrderCounter...");

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not established");
    }

    const collections = await db.listCollections({ name: "ordercounters" }).toArray();

    if (collections.length === 0) {
      console.log("✅ La colección 'ordercounters' no existe. No hay nada que limpiar.");
      return;
    }

    const result = await db.collection("ordercounters").drop();

    if (result) {
      console.log("✅ Colección 'ordercounters' eliminada exitosamente.");
      console.log("📊 La numeración de pedidos ahora se genera dinámicamente sin necesidad de contadores.");
    }
  } catch (error) {
    console.error("❌ Error limpiando colección OrderCounter:", error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  connectDB()
    .then(async () => {
      await cleanOrderCounters();
      await disconnectDB();
      console.log("✅ Limpieza completada");
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("❌ Limpieza fallida:", err);
      await disconnectDB().catch(() => {});
      process.exit(1);
    });
}

export { cleanOrderCounters };
