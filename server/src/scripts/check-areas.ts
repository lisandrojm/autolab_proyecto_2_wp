import { connectDB } from "../config/db.js";
import { Area } from "../models/Area.js";
import "../config/env.js";
import mongoose from "mongoose";

async function run() {
  try {
    await connectDB();
    console.log("Connected to DB");

    const systemAreas = await Area.find({ isSystem: true });
    console.log("SYSTEM AREAS FOUND:", systemAreas.length);
    systemAreas.forEach(a => {
      console.log(`- ID: ${a._id}, Name: "${a.name}", tenant: ${a.tenantId}`);
    });

    const allAreas = await Area.find({});
    console.log("\nALL AREAS COUNT:", allAreas.length);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
