import mongoose from "mongoose";
import { Schema, model } from "mongoose";

const MONGO_URI = "mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_mvp";

const VacationCounterSchema = new Schema({
  tenantId: Schema.Types.ObjectId,
  sequence: Number,
});
const VacationCounter = model("VacationCounter", VacationCounterSchema);

const VacationSchema = new Schema({
  tenantId: Schema.Types.ObjectId,
  vacationNumber: String,
});
const Vacation = model("Vacation", VacationSchema);

const fixCounter = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    // 1. Get all vacations
    const vacations = await Vacation.find({});
    console.log(`Found ${vacations.length} vacations.`);

    const tenantMaxMap: Record<string, number> = {};

    for (const v of vacations) {
      if (!v.vacationNumber) continue;

      // Format: PRE-VAC-000001
      const parts = v.vacationNumber.split("-");
      if (parts.length === 3) {
        const num = parseInt(parts[2], 10);
        if (!isNaN(num)) {
          const tenantId = v.tenantId.toString();
          if (!tenantMaxMap[tenantId] || num > tenantMaxMap[tenantId]) {
            tenantMaxMap[tenantId] = num;
          }
        }
      }
    }

    console.log("Max sequence per tenant:", tenantMaxMap);

    // 2. Update Counters
    for (const [tenantId, maxSeq] of Object.entries(tenantMaxMap)) {
      console.log(`Updating tenant ${tenantId} to sequence ${maxSeq}`);

      const counter = await VacationCounter.findOne({ tenantId });
      if (counter) {
        if (counter.sequence < maxSeq) {
          counter.sequence = maxSeq;
          await counter.save();
          console.log(`✅ Updated counter for ${tenantId} to ${maxSeq}`);
        } else {
          console.log(`✔️ Counter for ${tenantId} is already ${counter.sequence} (>= ${maxSeq})`);
        }
      } else {
        await VacationCounter.create({
          tenantId,
          sequence: maxSeq,
        });
        console.log(`✅ Created counter for ${tenantId} with ${maxSeq}`);
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
};

fixCounter();
