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
    const areas = await Area.find({ name: { $regex: /coordinacion/i } });
    console.log('COORDINACION AREAS IN PRODUCTION:', JSON.stringify(areas, null, 2));
    process.exit(0);
}
run();
