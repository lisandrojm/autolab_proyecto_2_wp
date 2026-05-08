import mongoose from "mongoose";
import { Order } from "./dist/models/Order.js";
import UserProject from "./dist/models/UserProject.js";
import { User } from "./dist/models/User.js";
import { OrderConfig } from "./dist/models/OrderConfig.js";

async function test() {
  await mongoose.connect("mongodb://localhost:27017/autolab");
  try {
    console.log("Connected to DB...");
    const orders = await Order.find().limit(1)
      .populate({
        path: "userId",
        select: "firstName lastName email positionId metadata",
        populate: [
          { path: "positionId", select: "name" },
          { path: "metadata.projects", model: "UserProject" },
        ],
      })
      .populate("approvedBy", "firstName lastName email")
      .populate("categoryId");
    console.log("Success! Found order count:", orders.length);
  } catch(e) {
    console.error("FAILED TO POPULATE:", e);
  }
  process.exit(0);
}
test();
