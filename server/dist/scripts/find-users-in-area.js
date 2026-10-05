import { User } from "../models/User.js";
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
async function run() {
    dotenv.config({ path: path.resolve(process.cwd(), "server", ".env.production"), override: true });
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        return;
    await mongoose.connect(uri, { dbName });
    const areaId = "69dc4639cf970e9e39e0e461";
    // Search in User directly
    const users = await User.find({ areaId: areaId });
    console.log(`Users with areaId ${areaId} (Direct):`, users.length);
    users.forEach(u => console.log(`- ${u.firstName} ${u.lastName} (${u.email})`));
    // Search in metadata.projectIds or similar? 
    // The error message from backend uses User.countDocuments({ areaId: areaId })
    process.exit(0);
}
run();
