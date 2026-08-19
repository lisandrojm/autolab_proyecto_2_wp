import mongoose from "mongoose";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { Position } from "../models/Position.js";
import { Level } from "../models/Level.js";
import { Area } from "../models/Area.js";
import { Project } from "../models/Project.js";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.development") });
dotenv.config({ path: path.resolve(process.cwd(), "server/.env.development") });
const run = async () => {
    try {
        const uri = process.env.MONGO_URI;
        const dbName = process.env.MONGO_DB_NAME;
        await mongoose.connect(uri, { dbName });
        console.log("Project model registered:", Project.modelName);
        const tenantObjectId = new mongoose.Types.ObjectId("696e0afdee864e3d5ceec539");
        const filter = { tenantId: tenantObjectId, "metadata.activo": true };
        console.log("Running directory query...");
        const users = await User.find(filter)
            .select("firstName lastName email projectIds metadata")
            .populate("projectIds", "name")
            .populate({
            path: "metadata.projects",
            model: UserProject,
            select: "projectId positionId levelId areaId nombre_proyecto nombre_rol_frame contracts",
            populate: [
                { path: "positionId", select: "name", model: Position },
                { path: "levelId", select: "name", model: Level },
                { path: "areaId", select: "name", model: Area },
            ],
        })
            .sort({ firstName: 1, lastName: 1 })
            .lean();
        console.log("Success! Loaded users:", users.length);
    }
    catch (e) {
        console.error("ERROR IN DIRECTORY QUERY:", e);
    }
    finally {
        await mongoose.disconnect();
        process.exit();
    }
};
run();
