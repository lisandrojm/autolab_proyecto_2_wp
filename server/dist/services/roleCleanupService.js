import { Types } from "mongoose";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";
/**
 * Executes the cleanup of duplicate mobile roles.
 * Merges duplicates by moving users to the "preferred" role and deleting the others.
 */
export async function cleanupDuplicateMobileRoles(tenantId, dryRun = false) {
    const tid = new Types.ObjectId(tenantId);
    const log = [];
    const report = { movedUsers: 0, deletedRoles: 0 };
    // Define patterns to clean
    const patterns = [
        {
            type: "Coordinador",
            regex: /^mobile.*coordinador$/i,
            preferredName: "Mobile - Coordinador",
        },
        {
            type: "Colaborador",
            regex: /^mobile.*colaborador$/i,
            preferredName: "Mobile - Colaborador",
        },
    ];
    for (const p of patterns) {
        const roles = await Role.find({ tenantId: tid, name: { $regex: p.regex } }).sort({ createdAt: 1 }); // Oldest first
        if (roles.length <= 1) {
            continue;
        }
        console.log(`[RoleCleanup] Found ${roles.length} roles for ${p.type} in tenant ${tid}`);
        // Strategy: Keep the one that matches 'preferredName' exactly. If none, keep the newest one.
        let keeperCandidate = roles.find((r) => r.name === p.preferredName);
        if (!keeperCandidate) {
            // If preferred name not found, keep the last one (newest)
            keeperCandidate = roles[roles.length - 1];
        }
        const keeper = keeperCandidate;
        const others = roles.filter((r) => r._id.toString() !== keeper._id.toString());
        // Ensure keeper has the correct name (if we picked newest but it had wrong casing)
        if (keeper.name !== p.preferredName && !dryRun) {
            keeper.name = p.preferredName;
            await keeper.save();
        }
        for (const badRole of others) {
            // Find users with badRole
            const users = await User.find({ tenantId: tid, roles: badRole._id });
            const userIds = users.map((u) => u._id);
            if (userIds.length > 0) {
                console.log(`[RoleCleanup] Moving ${userIds.length} users from "${badRole.name}" to "${keeper.name}"`);
                if (!dryRun) {
                    // Add keeper role to these users
                    await User.updateMany({ _id: { $in: userIds } }, { $addToSet: { roles: keeper._id } });
                    // Remove bad role from these users
                    await User.updateMany({ _id: { $in: userIds } }, { $pull: { roles: badRole._id } });
                }
                report.movedUsers += userIds.length;
            }
            if (!dryRun) {
                console.log(`[RoleCleanup] Deleting duplicate role "${badRole.name}" (${badRole._id})`);
                await Role.findByIdAndDelete(badRole._id);
                report.deletedRoles++;
            }
        }
    }
    return report;
}
