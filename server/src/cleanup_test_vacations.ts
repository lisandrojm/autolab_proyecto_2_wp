import mongoose from "mongoose";
import { Schema, model } from "mongoose";

const MONGO_URI = "mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_mvp";

const VacationSchema = new Schema({
  vacationNumber: String,
});
const Vacation = model("Vacation", VacationSchema);

const cleanup = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    const res = await Vacation.deleteMany({
      vacationNumber: { $in: ["TEST-VAC-001", "TEST-VAC-FUTURE"] },
    });

    console.log(`Deleted ${res.deletedCount} test vacations.`);
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
};

cleanup();
