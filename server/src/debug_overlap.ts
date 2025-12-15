import mongoose from "mongoose";
import { Schema, model } from "mongoose";

const MONGO_URI = "mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_mvp";

// Minimal Schemas
const VacationOverlapSchema = new Schema({
  tenantId: Schema.Types.ObjectId,
  areaId: Schema.Types.ObjectId,
  maxSimultaneousUsers: Number,
  isActive: Boolean,
});
const VacationOverlap = model("VacationOverlap", VacationOverlapSchema);

const AreaSchema = new Schema({
  name: String,
  tenantId: Schema.Types.ObjectId,
});
const Area = model("Area", AreaSchema);

const UserSchema = new Schema({
  email: String,
  areaId: Schema.Types.ObjectId,
  tenantId: Schema.Types.ObjectId,
});
const User = model("User", UserSchema);

const VacationSchema = new Schema({
  userId: Schema.Types.ObjectId,
  areaId: Schema.Types.ObjectId,
  status: String,
  startDate: Date,
  endDate: Date,
});
const Vacation = model("Vacation", VacationSchema);

const debug = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    // 1. Find Area "Editores"
    const area = await Area.findOne({ name: "Editores" });
    if (!area) {
      console.log("❌ Area 'Editores' not found!");
      return;
    }
    console.log(`✅ Area found: ${area.name} (${area._id})`);

    // 2. Check Overlap Rule
    const rule = await VacationOverlap.findOne({ areaId: area._id });
    if (!rule) {
      console.log("❌ No VacationOverlap rule found for this area!");
    } else {
      console.log(`✅ Overlap Rule found: Max Simultaneous Users = ${rule.maxSimultaneousUsers}, Active = ${rule.isActive}`);
    }

    // 3. Check Users in Area
    const users = await User.find({ areaId: area._id });
    console.log(`\n👥 Users in Area (${users.length}):`);
    users.forEach((u) => console.log(` - ${u.email} (${u._id})`));

    // 4. Check Vacations for these users
    const userIds = users.map((u) => u._id);
    const vacations = await Vacation.find({
      userId: { $in: userIds },
      status: { $nin: ["rejected", "cancelled"] },
    });
    console.log(`\n📅 Active Vacations (${vacations.length}):`);
    vacations.forEach((v) => {
      console.log(` - User: ${v.userId}, Status: ${v.status}, Dates: ${v.startDate.toISOString().split("T")[0]} to ${v.endDate.toISOString().split("T")[0]}`);
    });
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
};

debug();
