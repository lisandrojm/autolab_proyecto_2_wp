import { Area } from "../models/Area.js";
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
    console.log(`Connected to ${dbName}`);
    const areas = await Area.find({});
    console.log(`Found ${areas.length} areas.`);
    for (const a of areas) {
        if (a.name.toLowerCase().includes("coord")) {
            console.log(`Updating area: ${a.name} (${a._id}) isSystem: ${a.isSystem} -> false`);
            a.isSystem = false;
            await a.save();
        }
    }
    console.log("Done");
    process.exit(0);
}
run();
