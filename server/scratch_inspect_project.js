import mongoose from "mongoose";
import { Project } from "./dist/models/Project.js";
import { Shift } from "./dist/models/Shift.js";
import { Area } from "./dist/models/Area.js";
import { User } from "./dist/models/User.js";

async function run() {
  try {
    const mongoUri = "mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/";
    await mongoose.connect(mongoUri, { dbName: "weprodu_production_integration" });
    console.log("Connected to DB...");
    
    const project = await Project.findById("695d5ef195be848a048e8f68")
      .populate("coordinatorAssignments.areaId")
      .populate("coordinatorAssignments.shiftId")
      .populate("coordinatorAssignments.userId")
      .lean();
      
    if (!project) {
      console.log("Project not found");
    } else {
      console.log("Project:", project.name);
      console.log("coordinatorAssignments:", JSON.stringify(project.coordinatorAssignments, null, 2));
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
