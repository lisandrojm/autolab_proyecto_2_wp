import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { Order } from "../models/Order.js";
import { recalculateUserOrderBalance } from "../utils/orderHelpers.js";
async function run() {
    dotenv.config({ path: path.resolve(process.cwd(), ".env.production"), override: true });
    const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/we_produ";
    const dbName = process.env.MONGO_DB_NAME || "weprodu_production_integration";
    await mongoose.connect(uri, { dbName });
    const order3 = await Order.findOne({ orderNumber: /00003/ });
    if (order3) {
        console.log("Found order 3. Current daysRequested:", order3.daysRequested);
        order3.daysRequested = 1;
        await order3.save();
        console.log("Updated order 3 daysRequested to 1 and saved!");
        const tenantId = order3.tenantId;
        const userId = order3.userId;
        const categoryId = order3.categoryId;
        const year = order3.requestedAt.getFullYear();
        const subtypeId = order3.subcategories && order3.subcategories.length > 0 ? order3.subcategories[0] : undefined;
        console.log("Recalculating balance with: ", { tenantId, userId, categoryId, year, subtypeId });
        if (subtypeId) {
            await recalculateUserOrderBalance(tenantId, userId, categoryId, year, subtypeId);
        }
        await recalculateUserOrderBalance(tenantId, userId, categoryId, year);
        console.log("Recalculation complete!");
    }
    else {
        console.log("Order 3 not found!");
    }
    process.exit(0);
}
run();
