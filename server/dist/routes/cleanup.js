import { Router } from "express";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
const router = Router();
/**
 * GET /api/v1/roles/cleanup-duplicates
 * Identifies duplicate Mobile roles and cleans them up.
 * Strategy:
 * 1. Find roles matching "Mobile*Coordinador" and "Mobile*Colaborador" (case insensitive).
 * 2. Group by "meaning" (Coordinador vs Colaborador).
 * 3. In each group, if count > 1, determine the "good" one (e.g., the one created most recently, or the one with hyphens if we prefer that, or spaces).
 *    Let's prefer "Mobile - Coordinador" (with spaces) as the standard if user provided screenshot shows spaces.
 *    Actually, let's just pick the one with the most permissions or most recent update as "good".
 * 4. Move all users from "bad" roles to "good" role.
 * 5. Delete "bad" roles.
 */
router.post("/cleanup-duplicates", requireTenant, authenticateToken, requirePermission("admin_roles:view"), async (req, res) => {
    try {
        const tenantId = req.tenantObjectId;
        const { dryRun } = req.body;
        const log = [];
        const report = { movedUsers: 0, deletedRoles: 0, details: [] };
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
            log.push(`Checking ${p.type} roles...`);
            const roles = await Role.find({ tenantId, name: { $regex: p.regex } }).sort({ createdAt: 1 }); // Oldest first
            if (roles.length <= 1) {
                log.push(`  - No duplicates found for ${p.type} (count: ${roles.length}).`);
                continue;
            }
            log.push(`  - Found ${roles.length} roles for ${p.type}: ${roles.map((r) => `"${r.name}" (${r._id})`).join(", ")}`);
            // Strategy: Keep the one that matches 'preferredName' exactly. If none, keep the last one.
            let keeperCandidate = roles.find((r) => r.name === p.preferredName);
            if (!keeperCandidate) {
                // If preferred name not found, keep the one with most permissions, or just the last one created
                keeperCandidate = roles[roles.length - 1]; // Keep newest
            }
            const keeper = keeperCandidate;
            const others = roles.filter((r) => r._id.toString() !== keeper._id.toString());
            log.push(`  - KEEPING: "${keeper.name}" (${keeper._id})`);
            log.push(`  - REMOVING: ${others.map((r) => `"${r.name}" (${r._id})`).join(", ")}`);
            for (const badRole of others) {
                // Find users with badRole
                const users = await User.find({ tenantId, roles: badRole._id });
                const userIds = users.map((u) => u._id);
                if (userIds.length > 0) {
                    log.push(`    - Found ${userIds.length} users with role "${badRole.name}". Moving them to "${keeper.name}"...`);
                    if (!dryRun) {
                        // Add keeper role to these users
                        await User.updateMany({ _id: { $in: userIds } }, { $addToSet: { roles: keeper._id } });
                        // Remove bad role from these users
                        await User.updateMany({ _id: { $in: userIds } }, { $pull: { roles: badRole._id } });
                    }
                    report.movedUsers += userIds.length;
                }
                if (!dryRun) {
                    await Role.findByIdAndDelete(badRole._id);
                    log.push(`    - Deleted role "${badRole.name}"`);
                    report.deletedRoles++;
                }
            }
        }
        res.json({ success: true, log, report, dryRun });
    }
    catch (error) {
        console.error("Cleanup error:", error);
        res.status(500).json({ error: "Cleanup failed", details: error });
    }
});
export const cleanupRoutes = router;
