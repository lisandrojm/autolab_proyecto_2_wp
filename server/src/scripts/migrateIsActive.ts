import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  try {
    const uri = process.env.MONGO_URI || "mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/";
    const dbName = process.env.MONGO_DB_NAME || "weprodu_development_integration";
    await mongoose.connect(uri, { dbName });
    console.log("Connected to MongoDB.");

    const db = mongoose.connection.db;
    if (!db) throw new Error("DB connection not established");

    const result = await db.collection("users").updateMany(
      {},
      [
        {
          $set: {
            "metadata.activo": {
              $cond: {
                if: { $eq: [{ $type: "$metadata.activo" }, "missing"] },
                then: { $ifNull: ["$isActive", true] },
                else: "$metadata.activo"
              }
            }
          }
        },
        {
          $unset: ["isActive"]
        }
      ]
    );

    console.log(`Migration complete. Modified ${result.modifiedCount} documents.`);
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

run();
