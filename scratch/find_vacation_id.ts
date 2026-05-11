import mongoose from "mongoose";
import { connectDB, disconnectDB } from "./server/src/config/db.js";

async function findVacation() {
  await connectDB();
  try {
    const Vacation = mongoose.model("Vacation");
    const v = await Vacation.findOne({ vacationNumber: "DEM-VAC-000010" });
    if (v) {
      console.log(`ID: ${v._id}`);
    } else {
      console.log("Not found");
    }
  } finally {
    await disconnectDB();
  }
}

findVacation();
