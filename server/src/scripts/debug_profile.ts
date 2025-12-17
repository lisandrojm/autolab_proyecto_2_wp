import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Area } from "../models/Area.js";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { Tenant } from "../models/Tenant.js";

async function run() {
  try {
    console.log("Connecting to DB...");
    await mongoose.connect(process.env.MONGO_URI || "", {
      dbName: process.env.MONGO_DB_NAME,
    });
    console.log("Connected.");

    const tenants = await Tenant.find();
    console.log(`Found ${tenants.length} tenants.`);

    for (const tenant of tenants) {
      console.log(`Checking tenant: ${tenant.name} (${tenant._id})`);

      // Find a "seed" user (assuming early creation date or specific email pattern if known, or just take the first one)
      const seedUser = await User.findOne({ tenantId: tenant._id }).sort({ createdAt: 1 });
      // Find the "new" user
      const newUser = await User.findOne({ tenantId: tenant._id, email: "colaborador-frame@correo.com" });

      if (seedUser) {
        console.log(`SEED User: ${seedUser.email} (${seedUser._id})`);
        console.log(`SEED Area ID: ${seedUser.areaId} (Type: ${typeof seedUser.areaId})`);
        if (seedUser.areaId) {
          console.log(`SEED Constructor: ${seedUser.areaId.constructor.name}`);
        }
      } else {
        console.log("No SEED user found.");
      }

      if (newUser) {
        console.log(`NEW User: ${newUser.email} (${newUser._id})`);
        console.log(`NEW Area ID: ${newUser.areaId} (Type: ${typeof newUser.areaId})`);
        if (newUser.areaId) {
          console.log(`NEW Constructor: ${newUser.areaId.constructor.name}`);
        }
      } else {
        console.log("No NEW user found.");
      }

      if (newUser && newUser.areaId) {
        const Area = (await import("../models/Area.js")).Area;
        const area = await Area.findById(newUser.areaId);
        console.log(`NEW User Area found in DB: ${area ? area.name : "NO"}`);
      }
    }
  } catch (error) {
    console.error("Script error:", error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
