import mongoose from "mongoose";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import dotenv from "dotenv";
import path from "path";
// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
// Also try server level .env if running from root
dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/autolab_db"; // Fallback logic
        console.log("Connecting to DB..."); // Don't log URI with creds
        await mongoose.connect(uri);
        console.log("Connected.");
        // Find Joaquin
        const user = await User.findOne({ firstName: /Joaquin/i, lastName: /Navarro/i });
        if (!user) {
            console.log("User Joaquin not found.");
            process.exit(1);
        }
        console.log(`User: ${user.firstName} ${user.lastName} (${user._id})`);
        // Test Populate similar to Vacations route
        const populatedUser = await User.findById(user._id)
            .populate({
            path: "projectIds",
            populate: { path: "clientId" },
        })
            .populate({
            path: "metadata.projects",
            model: UserProject,
            populate: {
                path: "projectId",
                populate: { path: "clientId" },
            },
        })
            .lean();
        if (!populatedUser) {
            console.log("Populated user not found");
            process.exit(1);
        }
        console.log("\n--- Direct ProjectIds Analysis ---");
        if (populatedUser.projectIds && populatedUser.projectIds.length > 0) {
            populatedUser.projectIds.forEach((p, idx) => {
                console.log(`#${idx} Project: ${p.name} (ID: ${p._id})`);
                if (p.clientId) {
                    console.log(`   Client Found:`, JSON.stringify(p.clientId, null, 2));
                }
                else {
                    console.log(`   Client is NULL or Undefined`);
                }
            });
        }
        else {
            console.log("No projectIds array.");
        }
        console.log("\n--- Metadata Projects Analysis ---");
        // @ts-ignore
        if (populatedUser.metadata && populatedUser.metadata.projects) {
            // @ts-ignore
            populatedUser.metadata.projects.forEach((p, idx) => {
                console.log(`#${idx} Ext Project: ${p.nombre_proyecto}`);
                if (p.projectId) {
                    // Check if populated
                    if (p.projectId.name) {
                        console.log(`   Linked Internal Project: ${p.projectId.name}`);
                        if (p.projectId.clientId) {
                            console.log(`   Internal Client Found:`, JSON.stringify(p.projectId.clientId, null, 2));
                        }
                        else {
                            console.log(`   Internal Client is NULL`);
                        }
                    }
                    else {
                        console.log(`   Linked Internal Project ID (Not populated?): ${p.projectId}`);
                    }
                }
                else {
                    console.log(`   No internal link (projectId is null)`);
                }
            });
        }
    }
    catch (e) {
        console.error(e);
    }
    finally {
        await mongoose.disconnect();
        process.exit();
    }
};
run();
