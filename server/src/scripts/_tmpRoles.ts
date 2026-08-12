import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Tenant } from "../models/Tenant.js";
await mongoose.connect(`${process.env.MONGO_URI}`, { dbName: process.env.MONGO_DB_NAME });
const t: any = await Tenant.findOne({ slug: "demo-tenant" }).lean();
console.log("tenant:", t?._id);
const roles = await User.aggregate([{ $match: { tenantId: t._id } }, { $group: { _id: { r: "$role", p: "$primaryRole" }, n: { $sum: 1 } } }]);
console.log(JSON.stringify(roles));
await mongoose.disconnect();
