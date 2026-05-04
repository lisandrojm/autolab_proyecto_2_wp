import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env.development") });
dotenv.config({ path: path.join(__dirname, "../../.env.production") });

// FORCE PRODUCTION DB FOR CLEANUP since that's where the ghosts are
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/";
const MONGO_DB_NAME = "weprodu_production_integration";

import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import UserProject from "../models/UserProject.js";

async function cleanup() {
  try {
    await mongoose.connect(MONGO_URI, { dbName: MONGO_DB_NAME });
    console.log(`Connected to MongoDB: ${MONGO_DB_NAME}`);

    // 1. Find all UserProjects and check if their projectId exists
    const allUserProjects = await UserProject.find({});
    console.log(`Checking ${allUserProjects.length} UserProject documents...`);

    let deletedUPCount = 0;
    const deletedUPIds = new Set();

    for (const up of allUserProjects) {
      const project = await Project.findById(up.projectId);
      if (!project) {
        console.log(`Deleting orphaned UserProject: ${up._id} (Name: ${up.nombre_proyecto}, ProjectId ${up.projectId} not found)`);
        await UserProject.deleteOne({ _id: up._id });
        deletedUPIds.add(up._id.toString());
        deletedUPCount++;
      }
    }
    console.log(`Deleted ${deletedUPCount} orphaned UserProject documents.`);

    // 2. Clean up User references
    const allUsers = await User.find({});
    console.log(`Checking ${allUsers.length} users for stale references...`);

    let updatedUsersCount = 0;
    for (const user of allUsers) {
      let modified = false;

      // Clean metadata.projects (UserProject IDs)
      if (user.metadata?.projects && Array.isArray(user.metadata.projects)) {
        const initialCount = user.metadata.projects.length;
        const filteredUPs = [];
        for (const upId of user.metadata.projects) {
          const upIdStr = upId.toString();
          // Check if it was deleted just now OR if it doesn't exist in DB anymore
          const upExists = !deletedUPIds.has(upIdStr) && (await UserProject.exists({ _id: upId }));
          if (upExists) {
            filteredUPs.push(upId);
          } else {
            console.log(`Removing stale UserProject ref ${upIdStr} from user ${user.email}`);
            modified = true;
          }
        }
        if (modified) {
          user.metadata.projects = filteredUPs;
        }
      }

      // Clean projectIds (Direct Project IDs)
      if (user.projectIds && Array.isArray(user.projectIds)) {
        const filteredPIds = [];
        for (const pId of user.projectIds) {
          const pExists = await Project.exists({ _id: pId });
          if (pExists) {
            filteredPIds.push(pId);
          } else {
            console.log(`Removing stale Project ref ${pId} from user ${user.email}`);
            modified = true;
          }
        }
        if (modified) {
          user.projectIds = filteredPIds;
        }
      }

      if (modified) {
        await User.updateOne({ _id: user._id }, { 
          $set: { 
            "metadata.projects": user.metadata?.projects,
            "projectIds": user.projectIds
          } 
        });
        updatedUsersCount++;
      }
    }
    console.log(`Updated ${updatedUsersCount} users with cleaned project references.`);

    process.exit(0);
  } catch (error) {
    console.error("Cleanup error:", error);
    process.exit(1);
  }
}

cleanup();
