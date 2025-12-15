import mongoose from "mongoose";
import { Schema, model } from "mongoose";

const MONGO_URI = "mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_mvp";

const UserSchema = new Schema({
  email: String,
  tenantId: Schema.Types.ObjectId,
});
const User = model("User", UserSchema);

const VacationSchema = new Schema({
  userId: Schema.Types.ObjectId,
  tenantId: Schema.Types.ObjectId,
  status: String,
  startDate: Date,
  endDate: Date,
  daysRequested: Number,
  vacationNumber: String,
});
const Vacation = model("Vacation", VacationSchema);

const testOverlap = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    // 1. Find Pedro
    const pedro = await User.findOne({ email: "colaborador2@mobile.com" });
    if (!pedro) {
      console.log("❌ Pedro not found");
      return;
    }

    // 2. Check overlap logic manually (simulating the route logic)
    const startDate = new Date("2025-12-22"); // Overlaps with existing Dec 20-25
    const endDate = new Date("2025-12-28");

    const existingVacation = await Vacation.findOne({
      tenantId: pedro.tenantId,
      userId: pedro._id,
      status: { $nin: ["rejected", "cancelled"] },
      $or: [{ startDate: { $lte: endDate }, endDate: { $gte: startDate } }],
    });

    if (existingVacation) {
      console.log(`✅ Correctly detected overlap with vacation: ${existingVacation.vacationNumber} (${existingVacation.startDate.toISOString()} - ${existingVacation.endDate.toISOString()})`);
    } else {
      console.log("❌ Failed to detect overlap!");
    }
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
};

testOverlap();
