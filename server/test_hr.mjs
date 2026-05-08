import mongoose from "mongoose";
import { Order } from "./dist/models/Order.js";
import UserProject from "./dist/models/UserProject.js";
import { User } from "./dist/models/User.js";
import { OrderConfig } from "./dist/models/OrderConfig.js";
import { Tenant } from "./dist/models/Tenant.js";

async function test() {
  await mongoose.connect("mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/", { dbName: "weprodu_production_integration" });
  try {
    const orders = await Order.find().limit(1)
      .populate({
        path: "userId",
        select: "firstName lastName email metadata clientIds projectIds turnos",
        populate: [
          { path: "turnos", select: "name startTime endTime days", model: "Shift" },
          { path: "clientIds", select: "name", model: "Client" },
          {
            path: "projectIds",
            model: "Project",
            select: "clientId name",
            populate: { path: "clientId", select: "name", model: "Client" },
          },
          {
            path: "metadata.projects",
            model: "UserProject",
            select: "nombre_rol_frame nombre_proyecto projectId",
            populate: {
              path: "projectId",
              model: "Project",
              select: "clientId",
              populate: { path: "clientId", select: "name", model: "Client" },
            },
          },
        ],
      })
      .populate("approvedBy", "firstName lastName email")
      .populate("categoryId");
    console.log("Success! HR orders fetched:", orders.length);
  } catch(e) {
    console.error("FAILED TO POPULATE HR:", e.message);
  }
  process.exit(0);
}
test();
