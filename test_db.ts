import mongoose from "mongoose";
import { Order } from "./server/src/models/Order.js";
import { User } from "./server/src/models/User.js";
import UserProject from "./server/src/models/UserProject.js";
import { OrderConfig } from "./server/src/models/OrderConfig.js";

async function test() {
  await mongoose.connect("mongodb://localhost:27017/autolab"); // guess DB
  try {
    console.log("Connected, running query...");
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
    console.log("Success:", orders.length);
  } catch(e) {
    console.error("FAILED:", e);
  }
  process.exit(0);
}
test();
