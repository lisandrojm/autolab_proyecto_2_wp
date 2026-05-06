import { Area } from "../models/Area.js";
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

async function checkEnv(envFile: string) {
  console.log(`\n--- CHECKING ${envFile} ---`);
  delete process.env.MONGO_URI;
  delete process.env.MONGO_DB_NAME;
  dotenv.config({ path: path.resolve(process.cwd(), "server", envFile), override: true });
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) return;
  await mongoose.disconnect();
  await mongoose.connect(uri, { dbName });
  const areas = await Area.find({ name: { $regex: /coord/i } });
  areas.forEach(a => {
    console.log(`- ID: ${a._id}, Name: "${a.name}", isSystem: ${a.isSystem}, tenant: ${a.tenantId}`);
  });
}

async function main() {
  await checkEnv(".env.development");
  await checkEnv(".env.production");
  process.exit(0);
}

main();
