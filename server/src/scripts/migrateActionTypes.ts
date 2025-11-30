import mongoose from "mongoose";
import dotenv from "dotenv";
import { OrderCategory } from "../models/OrderCategory.js";
import { FutureAction } from "../models/FutureAction.js";

dotenv.config();

const MONGO_URI = process.env.DATABASE_URL;

if (!MONGO_URI) {
  console.error("❌ DATABASE_URL no está definida en .env");
  process.exit(1);
}

async function migrateActionTypes() {
  try {
    console.log("🔄 Conectando a MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado a MongoDB");

    console.log("\n📋 Migrando tipos de acción en OrderCategory...");

    const categoriesResult = await OrderCategory.updateMany(
      { futureActionType: { $in: ["accion", "condicion", "sinVencimiento"] } },
      [
        {
          $set: {
            futureActionType: "otra",
            tituloAccion: {
              $cond: {
                if: { $ne: ["$actionDescription", null] },
                then: "$actionDescription",
                else: "Acción requerida por el usuario"
              }
            }
          }
        }
      ]
    );

    console.log(`✅ OrderCategory: ${categoriesResult.modifiedCount} categorías migradas`);

    console.log("\n📋 Migrando tipos de acción en FutureAction...");

    const actionsResult = await FutureAction.updateMany(
      { tipoAccionFutura: { $in: ["accion", "condicion", "sinVencimiento"] } },
      { $set: { tipoAccionFutura: "otra" } }
    );

    console.log(`✅ FutureAction: ${actionsResult.modifiedCount} acciones migradas`);

    console.log("\n✅ Migración completada exitosamente!");

  } catch (error) {
    console.error("❌ Error durante la migración:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("\n🔌 Conexión cerrada");
  }
}

migrateActionTypes();
