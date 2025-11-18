import { Router } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { Campaign } from "../models/Campaign.js";
import { Client } from "../models/Client.js";
import { Post } from "../models/Post.js";
import { User } from "../models/User.js";
import mongoose from "mongoose";

const router = Router();

router.get(
  "/stats",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const tenantId = req.tenantId;

      if (!tenantId) {
        res.status(400).json({ error: "Tenant ID is required" });
        return;
      }

      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

      const [
        totalCampaigns,
        activeCampaigns,
        draftCampaigns,
        completedCampaigns,
        lastMonthCampaigns,
        totalClients,
        activeClients,
        onboardingClients,
        lastMonthClients,
        totalUsers,
        activeUsers,
        lastMonthUsers,
        topClients,
        platformStats,
      ] = await Promise.all([
        Campaign.countDocuments({ tenantId: tenantId }),
        Campaign.countDocuments({ tenantId: tenantId, status: "active" }),
        Campaign.countDocuments({ tenantId: tenantId, status: "draft" }),
        Campaign.countDocuments({ tenantId: tenantId, status: "completed" }),
        Campaign.countDocuments({ tenantId: tenantId, createdAt: { $gte: lastMonth } }),

        Client.countDocuments({ tenantId: tenantId }),
        Client.countDocuments({ tenantId: tenantId, status: "active" }),
        Client.countDocuments({ tenantId: tenantId, status: "onboarding" }),
        Client.countDocuments({ tenantId: tenantId, createdAt: { $gte: lastMonth } }),

        User.countDocuments({ tenantId: tenantId }),
        User.countDocuments({ tenantId: tenantId, isActive: true }),
        User.countDocuments({ tenantId: tenantId, createdAt: { $gte: lastMonth } }),

        Campaign.aggregate([
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
              campaignCount: { $sum: 1 },
            },
          },
          { $sort: { campaignCount: -1 } },
          { $limit: 5 },
        ]),

        Campaign.aggregate([
          { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
          { $unwind: "$platforms" },
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
          { $sort: { count: -1 } },
        ]),
      ]);

      const postsCollection = mongoose.connection.db?.collection("posts");
      let totalPosts = 0;
      let publishedPosts = 0;
      let scheduledPosts = 0;
      let draftPosts = 0;
      let lastMonthPosts = 0;

      if (postsCollection) {
        [totalPosts, publishedPosts, scheduledPosts, draftPosts, lastMonthPosts] = await Promise.all([
          postsCollection.countDocuments({ tenantId: new mongoose.Types.ObjectId(tenantId) }),
          postsCollection.countDocuments({ tenantId: new mongoose.Types.ObjectId(tenantId), status: "published" }),
          postsCollection.countDocuments({ tenantId: new mongoose.Types.ObjectId(tenantId), status: "scheduled" }),
          postsCollection.countDocuments({ tenantId: new mongoose.Types.ObjectId(tenantId), status: "draft" }),
          postsCollection.countDocuments({ tenantId: new mongoose.Types.ObjectId(tenantId), createdAt: { $gte: lastMonth } }),
        ]);
      }

      const campaignChange = totalCampaigns > 0 ? Math.round((lastMonthCampaigns / totalCampaigns) * 100) : 0;
      const clientChange = totalClients > 0 ? Math.round((lastMonthClients / totalClients) * 100) : 0;
      const postChange = totalPosts > 0 ? Math.round((lastMonthPosts / totalPosts) * 100) : 0;
      const userChange = totalUsers > 0 ? Math.round((lastMonthUsers / totalUsers) * 100) : 0;

      const recentCampaigns = await Campaign.find({ tenantId: tenantId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("createdBy", "firstName lastName email")
        .lean();

      const recentClients = await Client.find({ tenantId: tenantId })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      const recentActivity = [
        ...recentCampaigns.map((c: any) => ({
          type: "campaign" as const,
          description: `Nueva campaña creada: ${c.name}`,
          timestamp: c.createdAt,
          user: c.createdBy?.email || "Unknown",
        })),
        ...recentClients.map((c: any) => ({
          type: "client" as const,
          description: `Nuevo cliente registrado: ${c.name}`,
          timestamp: c.createdAt,
        })),
      ]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);

      const stats = {
        campaigns: {
          total: totalCampaigns,
          active: activeCampaigns,
          draft: draftCampaigns,
          completed: completedCampaigns,
          change: campaignChange,
        },
        clients: {
          total: totalClients,
          active: activeClients,
          onboarding: onboardingClients,
          change: clientChange,
        },
        posts: {
          total: totalPosts,
          published: publishedPosts,
          scheduled: scheduledPosts,
          draft: draftPosts,
          change: postChange,
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          change: userChange,
        },
        recentActivity,
        topClients: topClients.map((c: any) => ({
          _id: c._id,
          name: c.name,
          campaignCount: c.campaignCount,
          postCount: 0,
        })),
        platformDistribution: platformStats,
      };

      res.json(stats);
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export { router as dashboardRoutes };
