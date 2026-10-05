import { connectDB } from "../config/db.js";
import { Area } from "../models/Area.js";
import "../config/env.js";
async function run() {
    try {
        await connectDB();
        console.log("Connected to DB");
        // Aggressive update for anything related to coordination
        const result = await Area.updateMany({
            name: { $regex: /coordinador|coordinacion|coordinación/i }
        }, {
            $set: { isSystem: false }
        });
        console.log(`Updated ${result.modifiedCount} areas. They are no longer system areas.`);
        // Log them to see if they were updated
        const updated = await Area.find({ name: { $regex: /coordinador|coordinacion|coordinación/i } });
        updated.forEach(u => console.log(`- ${u.name}: isSystem=${u.isSystem}`));
        process.exit(0);
    }
    catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
