import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env.development") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/";
const MONGO_DB_NAME = "weprodu_production_integration";

import { Project } from "../models/Project.js";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";

async function check() {
  try {
    await mongoose.connect(MONGO_URI, { dbName: MONGO_DB_NAME });
    console.log("Connected to MongoDB");

    const allUPs = await UserProject.find({}).lean();
    const names = new Set(allUPs.map(up => up.nombre_proyecto));
    console.log("Unique project names in UserProject collection:");
    names.forEach(name => console.log(`- ${name}`));
    
    console.log("\nChecking for any UserProject with no valid Project reference:");
    for (const up of allUPs) {
      const p = await Project.findById(up.projectId).lean();
      if (!p) {
        console.log(`Ghost UserProject found! ID: ${up._id}, Name: ${up.nombre_proyecto}, ProjectId Ref: ${up.projectId}`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

check();
