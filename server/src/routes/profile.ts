import { Router } from "express";
import { z } from "zod";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { VacationRequest } from "../models/VacationRequest.js";
import { User } from "../models/User.js";
import { Area } from "../models/Area.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.use(requireTenant, authenticateToken);

const updateProfileSchema = z.object({
  phone: z.string().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      zip: z.string().optional(),
    })
    .optional(),
});

const updatePhotoSchema = z.object({
  profilePhotoUrl: z.string().url(),
});

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    let profile: any = await EmployeeProfile.findOne({
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

    // Fetch user for Area info
    // Fetch user for Area info
    let user;
    try {
      user = await User.findById(userId);
    } catch (e) {
      console.error(`Error fetching user ${userId} for profile stats:`, e);
    }

    let areaName = profile.department || "";
    let areaMembers = 0;

    if (user && user.areaId) {
      try {
        // Validate if areaId is a valid ObjectId before querying
        if (mongoose.Types.ObjectId.isValid(user.areaId.toString())) {
          const area = await Area.findById(user.areaId);
          if (area) {
            areaName = area.name;
            // Count members in this area
            areaMembers = await User.countDocuments({
              tenantId: req.tenantObjectId,
              areaId: user.areaId,
              isActive: true,
            });
          }
        } else {
          console.warn(`Invalid areaId for user ${userId}: ${user.areaId}`);
        }
      } catch (areaError) {
        console.error("Error fetching area info:", areaError);
        // Continue without area info instead of failing the whole request
      }
    }

    res.json({ ...profile, areaName, areaMembers });
  } catch (error) {
    console.error("Get profile error:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.put("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = updateProfileSchema.parse(req.body);

    const profile = await EmployeeProfile.findOneAndUpdate({ tenantId: req.tenantObjectId, userId }, { $set: data }, { new: true, upsert: false });

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

    const profile = await EmployeeProfile.findOneAndUpdate({ tenantId: req.tenantObjectId, userId }, { $set: { profilePhotoUrl } }, { new: true });

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
    const tenantId = req.tenantObjectId;

    // 1. Get Profile for other stats (daysWorked) if needed, mostly we need hireDate
    const profile = await EmployeeProfile.findOne({
      tenantId,
      userId,
    }).lean();

    if (!profile) {
      // Fallback default
      res.json({
        daysWorked: 0,
        vacations: { total: 0, used: 0, available: 0 },
      });
      return;
    }

    const daysWorked = profile.hireDate ? Math.floor((Date.now() - new Date(profile.hireDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;

    // 2. Get Global Config (Base days)
    const GlobalVacationConfig = (await import("../models/GlobalVacationConfig.js")).GlobalVacationConfig;
    const globalConfig = await GlobalVacationConfig.findOne({ tenantId });
    const annualDays = globalConfig?.diasAnuales || 15; // Default 15 if not configured, or 0? Prompt says "Días anuales base" is sole source.

    // 3. Calculate Used and Pending from Vacation model
    const Vacation = (await import("../models/Vacation.js")).Vacation;
    const currentYear = new Date().getFullYear();

    // We consider all vacations that subtract from balance.
    // Usually strict logic filters by year. For MVP, we might simplify or assume all active requests count against current balance (simplification mentioned in prompt B1/F1).
    // Prompt says: "El saldo 'Acumulados' y 'Beneficio Extra' debe ser cero ... simplificando a Días Corridos = Base."
    // So Available = Base - AllActiveRequestsDays.

    // Find all active requests for this user (not rejected, not cancelled)
    // We might want to filter by year if "Base" refreshes yearly, but let's stick to simple "Active" for now or current year start.
    // Assuming policies reset or we just look at current year's allocation.
    // Let's filter by start date in current year or just take all for MVP simplicity if no year logic defined.
    // Actually B1 says "Base de Días Anuales".

    const activeVacations = await Vacation.find({
      tenantId,
      userId,
      status: { $nin: ["rejected", "cancelled"] },
    }).lean();

    let daysUsed = 0; // Gozados (Delivered / Signed)
    let daysPending = 0; // Pendientes (Requested / Approved but not Signed)

    for (const v of activeVacations) {
      // Logic for "Gozados" vs "Pendientes"
      // Gozados: delivered OR (approved AND (signed OR not_required))
      // Actually prompt says: "Firma Enviada: ... Pendientes". "Firma Firmado: ... Gozados".

      const isSigned = v.signatureStatus === "signed";
      const isDelivered = v.status === "delivered";
      // If requiresSignature is true, it shouldn't be "Used" until Signed or Delivered.
      // If requiresSignature is false, Approved is enough to be "Used" (Gozado/Ready to take).

      if (isDelivered || isSigned || (v.status === "approved" && !v.requiresSignature)) {
        daysUsed += v.daysRequested;
      } else {
        daysPending += v.daysRequested;
      }
    }

    // Available = Base - (Used + Pending)
    // Because Pending also reserves days (F3: "restarse inmediatamente").
    const daysAvailable = Math.max(0, annualDays - daysUsed - daysPending);

    res.json({
      daysWorked,
      vacations: {
        total: annualDays,
        used: daysUsed, // Gozados
        pending: daysPending, // We can add this field if frontend expects it, current interface might not have it in "vacations" object but F2 requires it.
        available: daysAvailable,
        // We can return extra fields if permitted, but strictly matching interface:
        // Interface ProfileStats in frontend has { total, used, available }.
        // We should probably pass 'used' as 'daysUsed' (Gozados).
      },
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" });
  }
});

export { router as profileRoutes };
