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

const createVacation = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    // 1. Find Pedro
    const pedro = await User.findOne({ email: "colaborador2@mobile.com" });
    if (!pedro) {
      console.log("❌ Pedro not found");
      return;
    }

    // 2. Create Pending Vacation for FUTURE Dec 2025
    const startDate = new Date("2025-12-20");
    const endDate = new Date("2025-12-25"); // 6 days

    const vacation = await Vacation.create({
      userId: pedro._id,
      tenantId: pedro.tenantId,
      status: "pending",
      startDate: startDate,
      endDate: endDate,
      daysRequested: 6,
      vacationNumber: "TEST-VAC-FUTURE",
    });

    console.log(`✅ Created Pending Vacation for Pedro: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
};

createVacation();
