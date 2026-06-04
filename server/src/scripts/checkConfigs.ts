import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { OrderConfig } from "../models/OrderConfig.js";

async function run() {
  dotenv.config({ path: path.resolve(process.cwd(), ".env.development"), override: true });
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/we_produ";
  const dbName = process.env.MONGO_DB_NAME || "we_produ";
  await mongoose.connect(uri, { dbName });
  
  // Find Licencia especial across all tenants
  const configs = await OrderConfig.find({ name: /Licencia especial/i });
  console.log("ALL LICENCIA ESPECIAL CONFIGS:");
  for (const c of configs) {
    console.log(`TenantId: ${c.tenantId}, ConfigId: ${c._id}, MaxDays: ${c.maxDays}`);
    console.log("Subtipos:", JSON.stringify(c.config?.subtipos, null, 2));
    console.log("-----------------------------------------");
  }

  process.exit(0);
}

run();
