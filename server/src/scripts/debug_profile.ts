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
      const users = await User.find({ tenantId: tenant._id });
      console.log(`Found ${users.length} users in tenant ${tenant.name}.`);

      for (const user of users) {
        // console.log(`Checking user: ${user.email} (${user._id})`);

        if (user.areaId) {
          const areaIdStr = String(user.areaId);
          const isValid = mongoose.Types.ObjectId.isValid(areaIdStr);
          if (!isValid) {
            console.error(`INVALID AREA ID for user ${user.email}: ${areaIdStr}`);
          }

          try {
            // console.log("Counting members...");
            const count = await User.countDocuments({
              tenantId: tenant._id,
              areaId: user.areaId,
              isActive: true,
            });
            // console.log("Member count:", count);
          } catch (e) {
            console.error(`Error counting members for user ${user.email} with areaId ${user.areaId}:`, e);
          }
        }
      }
    }
  } catch (error) {
    console.error("Script error:", error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
