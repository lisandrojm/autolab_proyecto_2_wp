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
  firstName: String,
  lastName: String,
});
const User = model("User", UserSchema);

const EmployeeProfileSchema = new Schema({
  userId: Schema.Types.ObjectId,
  department: String,
  tenantId: Schema.Types.ObjectId,
});
const EmployeeProfile = model("EmployeeProfile", EmployeeProfileSchema);

const VacationSchema = new Schema({
  userId: Schema.Types.ObjectId,
  tenantId: Schema.Types.ObjectId,
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

    // 1. Simulate for User "Ana Coordinadora" (coordinador2@mobile.com)
    const email = "coordinador2@mobile.com";
    const user = await User.findOne({ email });

    if (!user) {
      console.log(`❌ User ${email} not found`);
      return;
    }
    console.log(`\n👤 Checking availability for: ${user.firstName} ${user.lastName} (${user._id})`);
    console.log(`   User AreaID: ${user.areaId}`);

    // 2. Resolve Area
    let userAreaId = user.areaId;
    if (!userAreaId) {
      const profile = await EmployeeProfile.findOne({ userId: user._id });
      if (profile && profile.department) {
        const area = await Area.findOne({ name: profile.department });
        if (area) {
          userAreaId = area._id;
          console.log(`   Resolved Area via Profile: ${area.name} (${area._id})`);
        }
      }
    } else {
      const area = await Area.findById(userAreaId);
      console.log(`   Resolved Area via User: ${area?.name} (${area?._id})`);
    }

    if (!userAreaId) {
      console.log("❌ Could not resolve area for user");
      return;
    }

    // 3. Check Overlap Rule
    const overlapRule = await VacationOverlap.findOne({ areaId: userAreaId, isActive: true });
    if (!overlapRule) {
      console.log("❌ No active overlap rule found");
      return;
    }
    console.log(`✅ Overlap Rule: Max ${overlapRule.maxSimultaneousUsers} users`);

    // 4. Find Users in Area
    const usersInArea = await User.find({ areaId: userAreaId }).select("_id email");
    const userIdsInArea = usersInArea.map((u) => u._id);
    console.log(`👥 Users in Area (Direct): ${usersInArea.length}`);
    usersInArea.forEach((u) => console.log(`   - ${u.email}`));

    // Extra users via Profile
    const areaName = (await Area.findById(userAreaId))?.name;
    let extraUserIds: any[] = [];
    if (areaName) {
      const profilesInDept = await EmployeeProfile.find({ department: areaName }).select("userId");
      extraUserIds = profilesInDept.map((p) => p.userId);
    }
    const allUserIdsInArea = [...new Set([...userIdsInArea.map((id) => id.toString()), ...extraUserIds.map((id) => id.toString())])];
    console.log(`👥 Total Unique Users in Area: ${allUserIdsInArea.length}`);

    // 5. Find Vacations
    const searchStart = new Date();
    searchStart.setHours(0, 0, 0, 0);
    const searchEnd = new Date();
    searchEnd.setMonth(searchEnd.getMonth() + 18);

    const areaVacations = await Vacation.find({
      userId: { $in: allUserIdsInArea },
      status: { $nin: ["rejected", "cancelled"] },
      endDate: { $gte: searchStart },
      startDate: { $lte: searchEnd },
    });

    console.log(`\n📅 Found ${areaVacations.length} relevant vacations:`);
    areaVacations.forEach((v) => {
      console.log(`   - User: ${v.userId}, Status: ${v.status}, ${v.startDate.toISOString().split("T")[0]} to ${v.endDate.toISOString().split("T")[0]}`);
    });

    // 6. Calculate Occupancy
    const occupancyMap: Record<string, number> = {};
    for (const v of areaVacations) {
      let current = new Date(v.startDate < searchStart ? searchStart : v.startDate);
      const end = new Date(v.endDate > searchEnd ? searchEnd : v.endDate);

      while (current <= end) {
        const dateStr = current.toISOString().split("T")[0];
        occupancyMap[dateStr] = (occupancyMap[dateStr] || 0) + 1;
        current.setDate(current.getDate() + 1);
      }
    }

    // 7. Determine Blocked Dates
    const blockedDates = Object.entries(occupancyMap)
      .filter(([_, count]) => count >= overlapRule.maxSimultaneousUsers)
      .map(([date]) => date);

    console.log(`\n🚫 Blocked Dates (${blockedDates.length}):`);
    console.log(blockedDates);
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
};

debug();
