import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
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
    console.log("--- Checking User table ---");
    const users = await User.find({ areaId: areaId });
    users.forEach(u => console.log(`User: ${u.firstName} ${u.lastName} (${u.email})`));
    console.log("\n--- Checking UserProject assignments ---");
    const upAssignments = await UserProject.find({ areaId: areaId }).populate('userId');
    upAssignments.forEach(up => {
        const u = up.userId;
        console.log(`UserProject: ${u?.firstName} ${u?.lastName} in Project: ${up.nombre_proyecto}`);
    });
    console.log("\n--- Checking areaShiftAssignments in UserProject ---");
    const upAreaShift = await UserProject.find({ "contracts.areaShiftAssignments.areaId": areaId }).populate('userId');
    upAreaShift.forEach(up => {
        const u = up.userId;
        console.log(`Contract Assignment: ${u?.firstName} ${u?.lastName} in Project: ${up.nombre_proyecto}`);
    });
    process.exit(0);
}
run();
