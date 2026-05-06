import { User } from "../models/User.js";
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

async function run() {
  dotenv.config({ path: path.resolve(process.cwd(), "server", ".env.production"), override: true });
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) return;
  await mongoose.connect(uri, { dbName });
  
  const areaId = "69dc4639cf970e9e39e0e461";
  
  console.log("Checking all users in production...");
  const allUsers = await User.find({});
  console.log(`Total users: ${allUsers.length}`);
  
  let count = 0;
  for (const u of allUsers) {
    // Accessing raw object to see if areaId exists even if not in schema
    const raw = u.toObject() as any;
    if (String(raw.areaId) === areaId) {
      console.log(`- Found user: ${u.firstName} ${u.lastName} (${u.email}), areaId: ${raw.areaId}`);
      count++;
    }
  }
  
  console.log(`Total found: ${count}`);
  process.exit(0);
}

run();
