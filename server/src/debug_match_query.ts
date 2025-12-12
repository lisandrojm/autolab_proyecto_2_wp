import mongoose from "mongoose";
import { User } from "./models/User.js";
import { Area } from "./models/Area.js";
import { connectDB } from "./config/db.js";
import fs from "fs";

const LOG_FILE = "debug_output.txt";

function log(msg: string) {
  console.log(msg);
  fs.appendFileSync(LOG_FILE, msg + "\n");
}

async function debug() {
  fs.writeFileSync(LOG_FILE, "Starting Debug V3\n");

  await connectDB();

  const userCount = await User.countDocuments({});
  log(`Total Users in DB: ${userCount}`);

  const areaCount = await Area.countDocuments({});
  log(`Total Areas in DB: ${areaCount}`);

  if (userCount > 0) {
    const u = await User.findOne({});
    log(`Sample User Tenant: ${u?.tenantId}`);
  }

  process.exit();
}

debug();
