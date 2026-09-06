import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { Project } from "../models/Project.js";
import { Client } from "../models/Client.js";
import { User } from "../models/User.js";
import mongoose from "mongoose";
const router = Router();
router.get("/stats", authenticateToken, async (req, res) => {
    try {
        const tenantId = req.tenantId;
        if (!tenantId) {
            res.status(400).json({ error: "Tenant ID is required" });
            return;
        }
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        const [totalProjects, activeProjects, draftProjects, completedProjects, lastMonthProjects, totalClients, activeClients, onboardingClients, lastMonthClients, totalUsers, activeUsers, lastMonthUsers, topClients, platformStats] = await Promise.all([
            Project.countDocuments({ tenantId: tenantId }),
            Project.countDocuments({ tenantId: tenantId, status: "active" }),
            Project.countDocuments({ tenantId: tenantId, status: "draft" }),
            Project.countDocuments({ tenantId: tenantId, status: "completed" }),
            Project.countDocuments({ tenantId: tenantId, createdAt: { $gte: lastMonth } }),
            Client.countDocuments({ tenantId: tenantId }),
            Client.countDocuments({ tenantId: tenantId, status: "active" }),
            Client.countDocuments({ tenantId: tenantId, status: "onboarding" }),
            Client.countDocuments({ tenantId: tenantId, createdAt: { $gte: lastMonth } }),
            User.countDocuments({ tenantId: tenantId }),
            User.countDocuments({ tenantId: tenantId, isActive: true }),
            User.countDocuments({ tenantId: tenantId, createdAt: { $gte: lastMonth } }),
            Project.aggregate([
                { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
                {
                    $lookup: {
                        from: "clients",
                        localField: "clientId",
                        foreignField: "_id",
                        as: "clientData",
                    },
                },
                { $unwind: "$clientData" },
                {
                    $group: {
                        _id: "$clientId",
                        name: { $first: "$clientData.name" },
                        projectCount: { $sum: 1 },
                    },
                },
                { $sort: { projectCount: -1 } },
                { $limit: 5 },
            ]),
            Project.aggregate([
                { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
                { $unwind: { path: "$platforms", preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: "$platforms",
                        count: { $sum: 1 },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        platform: "$_id",
                        count: 1,
                    },
                },
                { $match: { platform: { $ne: null } } },
                { $sort: { count: -1 } },
            ]),
        ]);
        const projectChange = totalProjects > 0 ? Math.round((lastMonthProjects / totalProjects) * 100) : 0;
        const clientChange = totalClients > 0 ? Math.round((lastMonthClients / totalClients) * 100) : 0;
        const userChange = totalUsers > 0 ? Math.round((lastMonthUsers / totalUsers) * 100) : 0;
        const recentProjects = await Project.find({ tenantId: tenantId }).sort({ createdAt: -1 }).limit(5).populate("createdBy", "firstName lastName email").lean();
        const recentClients = await Client.find({ tenantId: tenantId }).sort({ createdAt: -1 }).limit(5).lean();
        const recentActivity = [
            ...recentProjects.map((p) => ({
                type: "project",
                description: `Nuevo proyecto creado: ${p.name}`,
                timestamp: p.createdAt,
                user: p.createdBy?.email || "Unknown",
            })),
            ...recentClients.map((c) => ({
                type: "client",
                description: `Nuevo cliente registrado: ${c.name}`,
                timestamp: c.createdAt,
            })),
        ]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 10);
        const stats = {
            projects: {
                total: totalProjects,
                active: activeProjects,
                draft: draftProjects,
                completed: completedProjects,
                change: projectChange,
            },
            clients: {
                total: totalClients,
                active: activeClients,
                onboarding: onboardingClients,
                change: clientChange,
            },
            users: {
                total: totalUsers,
                active: activeUsers,
                change: userChange,
            },
            recentActivity,
            topClients: topClients.map((c) => ({
                _id: c._id,
                name: c.name,
                projectCount: c.projectCount,
            })),
            platformDistribution: platformStats,
        };
        res.json(stats);
    }
    catch (error) {
        console.error("Get dashboard stats error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as dashboardRoutes };
