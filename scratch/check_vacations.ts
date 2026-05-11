import mongoose from "mongoose";
import { connectDB, disconnectDB } from "./server/src/config/db.js";

async function checkVacations() {
  await connectDB();
  try {
    const Vacation = mongoose.model("Vacation");
    const count = await Vacation.countDocuments({});
    console.log(`Total vacations: ${count}`);
    
    const withoutNumber = await Vacation.find({ $or: [{ vacationNumber: { $exists: false } }, { vacationNumber: "" }] });
    console.log(`Vacations without number: ${withoutNumber.length}`);
    
    const samples = await Vacation.find({}).limit(5).lean();
    samples.forEach(v => {
      console.log(`ID: ${v._id}, Number: ${v.vacationNumber}, Status: ${v.status}, pdfUrl: ${v.pdfPreAprobacionUrl}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await disconnectDB();
  }
}

checkVacations();
