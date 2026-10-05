import "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
async function runCleanUp() {
    await connectDB();
    console.log("------------------------------------------------------------------");
    console.log("🚀 Starting cleanup of orphaned UserProjects (assignments)...");
    console.log("------------------------------------------------------------------");
    const allProjects = await Project.find({}).lean();
    let totalDeleted = 0;
    let totalLinksCleaned = 0;
    for (const project of allProjects) {
        const projectId = project._id;
        const assignedUsers = (project.assignedUsers || []).map(id => String(id));
        // Find all UserProjects for this project
        const upAssignments = await UserProject.find({ projectId }).lean();
        for (const assignment of upAssignments) {
            const userIdRaw = assignment.userId;
            const userId = userIdRaw ? String(userIdRaw) : null;
            // If the userId is missing or not in the assignedUsers list
            if (!userId || !assignedUsers.includes(userId)) {
                console.log(`[ORPHAN] User ${userId || 'MISSING'} found in Project "${project.name}" (${projectId}) but is NOT assigned.`);
                // 1. Delete the UserProject document
                await UserProject.deleteOne({ _id: assignment._id });
                console.log(`   ✅ Deleted UserProject document: ${assignment._id}`);
                // 2. Clean up User links if userId exists
                if (userId) {
                    const userUpdate = await User.findByIdAndUpdate(userId, {
                        $pull: {
                            projectIds: projectId,
                            "metadata.projects": projectId
                        }
                    });
                    await User.findByIdAndUpdate(userId, {
                        $pull: {
                            "metadata.projects": assignment._id
                        }
                    });
                    if (userUpdate) {
                        console.log(`   ✨ Cleaned up User links for: ${userUpdate.email}`);
                        totalLinksCleaned++;
                    }
                }
                totalDeleted++;
            }
        }
    }
    console.log("------------------------------------------------------------------");
    console.log(`🏁 Cleanup finished.`);
    console.log(`📦 Orphaned UserProjects deleted: ${totalDeleted}`);
    console.log(`👤 User metadata links cleaned: ${totalLinksCleaned}`);
    console.log("------------------------------------------------------------------");
    await disconnectDB();
}
runCleanUp().catch(err => {
    console.error("❌ Error in cleanup script:", err);
    process.exit(1);
});
