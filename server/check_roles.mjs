import mongoose from "mongoose";
import { Role } from "./dist/models/Role.js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.development" });

async function checkRoles() {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/autolab_proyecto_2";
    console.log("Connecting to", mongoUri);
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const roles = await Role.find({}).lean();
    console.log(`Found ${roles.length} roles:`);
    roles.forEach((r) => {
      console.log(`- Role: ${r.name}, Permissions: ${JSON.stringify(r.permissions)}`);
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

checkRoles();
