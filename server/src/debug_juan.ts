import mongoose from "mongoose";
import { Schema, model } from "mongoose";

const MONGO_URI = "mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_mvp";

const UserSchema = new Schema({
  email: String,
  tenantId: Schema.Types.ObjectId,
  areaId: Schema.Types.ObjectId,
});
const User = model("User", UserSchema);

const AreaSchema = new Schema({
  name: String,
  tenantId: Schema.Types.ObjectId,
});
const Area = model("Area", AreaSchema);

const VacationOverlapSchema = new Schema({
  tenantId: Schema.Types.ObjectId,
  areaId: Schema.Types.ObjectId,
  maxSimultaneousUsers: Number,
  isActive: Boolean,
});
const VacationOverlap = model("VacationOverlap", VacationOverlapSchema);

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

const debugJuan = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    // 1. Find Juan
    const juan = await User.findOne({ email: "colaborador@mobile.com" });
    if (!juan) {
      console.log("❌ Juan not found");
      return;
    }
    console.log(`👤 Juan: ${juan._id}, Area: ${juan.areaId}`);

    // 2. Check Area
    const area = await Area.findById(juan.areaId);
    console.log(`✅ Area: ${area?.name} (${area?._id})`);

    // 3. Check Rule
    const rule = await VacationOverlap.findOne({ areaId: juan.areaId });
    console.log(`✅ Rule: Max ${rule?.maxSimultaneousUsers}`);

    // 4. Check Vacations in Area (Dec 2025)
    // Using the NEW logic: Start of Month
    const searchStart = new Date();
    searchStart.setDate(1);
    searchStart.setHours(0, 0, 0, 0);

    const searchEnd = new Date();
    searchEnd.setMonth(searchEnd.getMonth() + 18);

    console.log(`📅 Search Range: ${searchStart.toISOString()} to ${searchEnd.toISOString()}`);

    // Find all users in area
    const users = await User.find({ areaId: juan.areaId });
    const userIds = users.map((u) => u._id);

    const vacations = await Vacation.find({
      userId: { $in: userIds },
      status: { $nin: ["rejected", "cancelled"] },
      endDate: { $gte: searchStart },
      startDate: { $lte: searchEnd },
    });

    console.log(`📅 Found ${vacations.length} vacations in range:`);
    vacations.forEach((v) => {
      console.log(`   - ${v.vacationNumber}: ${v.startDate.toISOString()} to ${v.endDate.toISOString()} (${v.status})`);
    });

    // 5. Calculate Blocked
    const occupancyMap: Record<string, number> = {};
    for (const v of vacations) {
      let current = new Date(v.startDate < searchStart ? searchStart : v.startDate);
      const end = new Date(v.endDate > searchEnd ? searchEnd : v.endDate);

      while (current <= end) {
        const dateStr = current.toISOString().split("T")[0];
        occupancyMap[dateStr] = (occupancyMap[dateStr] || 0) + 1;
        current.setDate(current.getDate() + 1);
      }
    }

    const blockedDates = Object.entries(occupancyMap)
      .filter(([_, count]) => count >= (rule?.maxSimultaneousUsers || 99))
      .map(([date]) => date);

    console.log(`🚫 Blocked Dates Count: ${blockedDates.length}`);
    console.log(blockedDates);
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
};

debugJuan();
