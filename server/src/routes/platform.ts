import { Router } from "express";
import { Tenant } from "../models/Tenant.js";
import { User } from "../models/User.js";
import { Client } from "../models/Client.js";
import { Project } from "../models/Project.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requirePlatform } from "../middleware/requirePlatform.js";

const router = Router();

router.get("/metrics", authenticateToken, requirePlatform(), async (req: AuthenticatedRequest, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalTenants, activeTenants, suspendedTenants, newTenants, totalUsers, totalClients, totalProjects, tenantsWithPlans, tenantsData] = await Promise.all([
      Tenant.countDocuments({ isSystem: false }),
      Tenant.countDocuments({ isSystem: false, isActive: true }),
      Tenant.countDocuments({ isSystem: false, isActive: false }),
      Tenant.countDocuments({ isSystem: false, createdAt: { $gte: thirtyDaysAgo } }),
      User.countDocuments(),
      Client.countDocuments(),
      Project.countDocuments(),
      Tenant.aggregate([
        { $match: { isSystem: false } },
        {
          $group: {
            _id: "$subscription.plan",
            count: { $sum: 1 },
          },
        },
      ]),
      Tenant.find({ isSystem: false }).select("name slug usage subscription isActive createdAt").sort({ "usage.storage.usedMB": -1 }).limit(10),
    ]);

    const totalStorage = tenantsData.reduce((acc, t) => acc + (t.usage?.storage?.usedMB || 0), 0);
    const totalStorageLimit = tenantsData.reduce((acc, t) => acc + (t.usage?.storage?.limitMB || 0), 0);

    const planDistribution = tenantsWithPlans.reduce((acc: any, item: any) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const topConsumers = tenantsData.map((t) => ({
      _id: t._id,
      name: t.name,
      slug: t.slug,
      storageUsedMB: t.usage?.storage?.usedMB || 0,
      storageLimitMB: t.usage?.storage?.limitMB || 0,
      users: t.usage?.users?.current || 0,
      clients: t.usage?.clients?.current || 0,
      plan: t.subscription?.plan || "free",
      isActive: t.isActive,
    }));

    const alerts = [];

    tenantsData.forEach((t) => {
      const storagePercent = t.usage?.storage?.limitMB ? (t.usage.storage.usedMB / t.usage.storage.limitMB) * 100 : 0;

      if (storagePercent > 90) {
        alerts.push({
          type: "storage",
          severity: "high",
          tenant: t.name,
          tenantId: t._id,
          message: `Almacenamiento al ${storagePercent.toFixed(0)}% (${t.usage.storage.usedMB}MB de ${t.usage.storage.limitMB}MB)`,
        });
      }

      const usersPercent = t.usage?.users?.limit ? (t.usage.users.current / t.usage.users.limit) * 100 : 0;

      if (usersPercent > 90) {
        alerts.push({
          type: "users",
          severity: "medium",
          tenant: t.name,
          tenantId: t._id,
          message: `Usuarios al ${usersPercent.toFixed(0)}% (${t.usage.users.current} de ${t.usage.users.limit})`,
        });
      }
    });

    const metrics = {
      tenants: {
        total: totalTenants,
        active: activeTenants,
        suspended: suspendedTenants,
        new: newTenants,
      },
      resources: {
        totalUsers,
        totalClients,
        totalProjects,
        storageUsedMB: Math.round(totalStorage),
        storageLimitMB: Math.round(totalStorageLimit),
        storagePercent: totalStorageLimit > 0 ? Math.round((totalStorage / totalStorageLimit) * 100) : 0,
      },
      plans: {
        distribution: planDistribution,
        free: planDistribution.free || 0,
        basic: planDistribution.basic || 0,
        pro: planDistribution.pro || 0,
        enterprise: planDistribution.enterprise || 0,
      },
      topConsumers,
      alerts,
    };

    res.json(metrics);
  } catch (error: any) {
    console.error("Error fetching platform metrics:", error);
    res.status(500).json({ error: "Error fetching platform metrics" });
  }
});

router.get("/activity", authenticateToken, requirePlatform(), async (req: AuthenticatedRequest, res) => {
  try {
    const { days = 7 } = req.query;
    const daysNum = Number(days);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    const [tenantsCreated, usersCreated, clientsCreated, projectsCreated] = await Promise.all([
      Tenant.aggregate([
        {
          $match: {
            isSystem: false,
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Client.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Project.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      tenants: tenantsCreated,
      users: usersCreated,
      clients: clientsCreated,
      projects: projectsCreated,
    });
  } catch (error: any) {
    console.error("Error fetching platform activity:", error);
    res.status(500).json({ error: "Error fetching platform activity" });
  }
});

export default router;
