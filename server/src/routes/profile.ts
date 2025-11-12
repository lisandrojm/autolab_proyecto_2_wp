import { Router } from "express";
import { z } from "zod";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { VacationRequest } from "../models/VacationRequest.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.use(requireTenant, authenticateToken);

const updateProfileSchema = z.object({
  phone: z.string().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    zip: z.string().optional(),
  }).optional(),
});

const updatePhotoSchema = z.object({
  profilePhotoUrl: z.string().url(),
});

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    let profile = await EmployeeProfile.findOne({
      tenantId: req.tenantObjectId,
      userId,
    }).lean();

    if (!profile) {
      const newProfile = new EmployeeProfile({
        tenantId: req.tenantObjectId,
        userId,
        firstName: req.user!.email.split("@")[0],
        lastName: "",
        email: req.user!.email,
        vacationPolicy: {
          annualDays: 20,
          carryOverDays: 0,
        },
      });
      profile = (await newProfile.save()).toObject();
    }

    res.json(profile);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.put("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = updateProfileSchema.parse(req.body);

    const profile = await EmployeeProfile.findOneAndUpdate(
      { tenantId: req.tenantObjectId, userId },
      { $set: data },
      { new: true, upsert: false }
    );

    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    res.json(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/photo", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { profilePhotoUrl } = updatePhotoSchema.parse(req.body);

    const profile = await EmployeeProfile.findOneAndUpdate(
      { tenantId: req.tenantObjectId, userId },
      { $set: { profilePhotoUrl } },
      { new: true }
    );

    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    res.json({ profilePhotoUrl: profile.profilePhotoUrl });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update photo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const profile = await EmployeeProfile.findOne({
      tenantId: req.tenantObjectId,
      userId,
    }).lean();

    if (!profile) {
      res.json({
        daysWorked: 0,
        vacations: {
          total: 20,
          used: 0,
          available: 20,
        },
      });
      return;
    }

    const daysWorked = profile.hireDate
      ? Math.floor((Date.now() - new Date(profile.hireDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);

    const approvedVacations = await VacationRequest.find({
      tenantId: req.tenantObjectId,
      userId,
      status: "approved",
      startDate: { $gte: yearStart, $lte: yearEnd },
    }).lean();

    const daysUsed = approvedVacations.reduce((sum, vac) => sum + vac.daysRequested, 0);
    const annualDays = profile.vacationPolicy?.annualDays || 20;
    const daysAvailable = Math.max(0, annualDays - daysUsed);

    res.json({
      daysWorked,
      vacations: {
        total: annualDays,
        used: daysUsed,
        available: daysAvailable,
      },
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" });
  }
});

export { router as profileRoutes };
