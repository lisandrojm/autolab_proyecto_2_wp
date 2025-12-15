import mongoose from "mongoose";
import { Schema, model } from "mongoose";

const MONGO_URI = "mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_mvp";

const UserSchema = new Schema({
  firstName: String,
  lastName: String,
  email: String,
  areaId: Schema.Types.ObjectId,
});
const User = model("User", UserSchema);

const VacationSchema = new Schema({
  userId: Schema.Types.ObjectId,
  tenantId: Schema.Types.ObjectId,
  status: String,
  startDate: Date,
  endDate: Date,
  vacationNumber: String,
});
const Vacation = model("Vacation", VacationSchema);

const debugBlockers = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    // 1. Find all vacations in Editores area (or generally active ones)
    // We know the areaId from previous steps: 693fe901a8c1eb81e075b27e (Editores)
    // Or we can just list ALL active vacations.

    const vacations = await Vacation.find({
      status: { $nin: ["rejected", "cancelled"] },
    }).populate("userId");

    console.log(`Found ${vacations.length} ACTIVE vacations (blocking):`);

    for (const v of vacations) {
      const user = v.userId as any;
      const userName = user ? `${user.firstName} ${user.lastName}` : "Unknown";
      console.log(`- [${v.vacationNumber}] ${userName} (${v.status}): ${v.startDate?.toISOString().split("T")[0]} to ${v.endDate?.toISOString().split("T")[0]}`);
    }
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
};

debugBlockers();
