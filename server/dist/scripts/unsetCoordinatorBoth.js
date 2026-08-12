import { Area } from "../models/Area.js";
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
async function runForEnv(envFile) {
    console.log(`\n--- RUNNING FOR ${envFile} ---`);
    // Clear env vars to ensure we load the ones from the file
    delete process.env.MONGO_URI;
    delete process.env.MONGO_DB_NAME;
    dotenv.config({ path: path.resolve(process.cwd(), "server", envFile), override: true });
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName) {
        console.log(`Missing URI or DB Name for ${envFile}`);
        return;
    }
    // Close previous connection if any
    await mongoose.disconnect();
    console.log(`Connecting to ${dbName}...`);
    await mongoose.connect(uri, { dbName });
    console.log("Connected");
    const result = await Area.updateMany({
        name: { $regex: /coordinador|coordinacion|coordinación/i }
    }, {
        $set: { isSystem: false }
    });
    console.log(`Updated ${result.modifiedCount} areas.`);
    const updated = await Area.find({ name: { $regex: /coordinador|coordinacion|coordinación/i } });
    updated.forEach(u => console.log(`- ${u.name}: isSystem=${u.isSystem}`));
}
async function main() {
    try {
        await runForEnv(".env.development");
        await runForEnv(".env.production");
        process.exit(0);
    }
    catch (err) {
        console.error(err);
        process.exit(1);
    }
}
main();
