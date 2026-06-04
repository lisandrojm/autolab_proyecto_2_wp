import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { UserOrderBalance } from "../models/UserOrderBalance.js";

async function run() {
  dotenv.config({ path: path.resolve(process.cwd(), ".env.production"), override: true });
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/we_produ";
  const dbName = process.env.MONGO_DB_NAME || "weprodu_production_integration";
  await mongoose.connect(uri, { dbName });
  
  const overrides = await UserOrderBalance.find({}).lean();
  console.log(`FOUND ${overrides.length} OVERRIDES IN PRODUCTION DB:`, JSON.stringify(overrides, null, 2));

  process.exit(0);
}

run();
