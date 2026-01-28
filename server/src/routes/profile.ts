import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { UserProfile } from "../models/UserProfile.js";
import { Vacation } from "../models/Vacation.js";
import { User } from "../models/User.js";
import { Area } from "../models/Area.js";
import { Position } from "../models/Position.js";
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

    // Fetch user first to get details for profile creation if needed
    let user;
    try {
      user = await User.findById(userId).populate("metadata.projects");
    } catch (e) {
      console.error(`Error fetching user ${userId}:`, e);
    }

    let profile: any = await UserProfile.findOne({
      tenantId: req.tenantObjectId,
      userId,
    }).lean();

    if (!profile) {
      // Use user data if available, otherwise fallback to email parsing
      const firstName = user?.firstName || req.user!.email.split("@")[0];
      // lastName is required, so we need a fallback if user doesn't have one
      const lastName = user?.lastName || "-";

      const newProfile = new UserProfile({
        tenantId: req.tenantObjectId,
        userId,
        firstName,
        lastName,
        email: user?.email || req.user!.email,
        hireDate: user?.hireDate,
        vacationPolicy: {
          annualDays: 20,
          carryOverDays: 0,
        },
      });
      profile = (await newProfile.save()).toObject();
    }

    let areaName = profile.department || "";
    let areaMembers = 0;

    if (user && user.areaId) {
      try {
        const area = await Area.findById(user.areaId);
        if (area) {
          areaName = area.name;
          // Count members in this area
          areaMembers = await User.countDocuments({
            tenantId: req.tenantObjectId,
            areaId: user.areaId,
            isActive: true,
          });
        } else {
          console.warn(`Area not found for user ${userId} with areaId ${user.areaId}`);
        }
      } catch (areaError) {
        console.error("Error fetching area info:", areaError);
      }
    }

    let positionName = profile.position || "";
    if (user && user.positionId) {
      try {
        const position = await Position.findById(user.positionId);
        if (position) {
          positionName = position.name;
        }
      } catch (posError) {
        console.error("Error fetching position info:", posError);
      }
    }

    let levelName = "";
    if (user && user.levelId) {
      try {
        const Level = (await import("../models/Level.js")).Level;
        // user.levelId can be object or string based on population
        const lvlId = (user.levelId as any)._id || user.levelId;
        const level = await Level.findById(lvlId);
        if (level) {
          levelName = level.name;
        }
      } catch (lvlError) {
        console.error("Error fetching level info:", lvlError);
      }
    }

    // Ensure hireDate is present (fallback to user's hireDate if profile doesn't have it)
    // Ensure hireDate is present (fallback to user's hireDate if profile doesn't have it)
    if (!profile.hireDate && user?.hireDate) {
      profile.hireDate = user.hireDate;
    }

    // Populate roles
    let roleNames: string[] = [];
    if (user && user.roles && user.roles.length > 0) {
      try {
        const Role = (await import("../models/Role.js")).Role;
        const roles = await Role.find({ _id: { $in: user.roles } }).select("name");
        roleNames = roles.map((r) => r.name);
      } catch (roleError) {
        console.error("Error fetching roles:", roleError);
      }
    }

    const extraVacationDays = user?.extraVacationDays || 0;
    const carryOverVacationDays = user?.carryOverVacationDays || 0;

    // Explicitly send projectIds for frontend selectors
    const projectIds = user?.projectIds?.map((id) => id.toString()) || [];

    // ENRICHMENT LOGIC: Extract Sede and Rol Frame names from populated metadata.projects
    const userSedeNames = new Set<string>();
    const userRolFrameNames = new Set<string>();
    const userContractNames = new Set<string>();
    const userSchedules = new Set<string>();
    const userProjectDates = new Set<string>();

    if (user?.metadata?.projects && Array.isArray(user.metadata.projects)) {
      for (const up of user.metadata.projects) {
        if (!up || typeof up !== "object") continue;

        // Priority 1: Top level names
        if (up.nombre_rol_frame) userRolFrameNames.add(up.nombre_rol_frame);
        if (up.nombre_sede) userSedeNames.add(up.nombre_sede);

        // Priority 2: From contracts
        if (Array.isArray(up.contracts)) {
          for (const c of up.contracts) {
            if (c.nombre_sede) userSedeNames.add(c.nombre_sede);
            if (c.nombre_rol_frame) userRolFrameNames.add(c.nombre_rol_frame);
            if (c.nombre_contrato) userContractNames.add(c.nombre_contrato);
            if (c.hora_inicio && c.hora_fin) {
              userSchedules.add(`${c.hora_inicio} - ${c.hora_fin}`);
            }
            if (c.fecha_alta_contrato) {
              const start = c.fecha_alta_contrato; // Assuming "YYYY-MM-DD" or similar
              const end = c.fecha_baja_contrato || "Actualidad";
              userProjectDates.add(`${start} - ${end}`);
            }
          }
        }
      }
    }

    const externalInfo = {
      sedes: Array.from(userSedeNames),
      rolFrames: Array.from(userRolFrameNames),
      contracts: Array.from(userContractNames),
      schedules: Array.from(userSchedules),
      projectDates: Array.from(userProjectDates),
    };

    const metadata = user?.metadata;
    // -------------------------------------------------------------------------
    // Contract Check Logic: Disable Vacations button if contract type is blacklist
    // -------------------------------------------------------------------------
    let vacationsEnabled = true; // Default to enabled
    try {
      if (user?.metadata?.projects && Array.isArray(user.metadata.projects)) {
        // Collect all contract types from user metadata
        // We look for the "Active" contract or just all of them?
        // Let's assume we check against ANY active contract or generally if the user
        // holds a contract type that is disabled.
        // Usually a user has one main current contract per project.
        // Let's get the list of active contract IDs the user has.

        const userContractTypeIds = new Set<number>();

        for (const up of user.metadata.projects) {
          if (!up || typeof up !== "object") continue;
          if (Array.isArray(up.contracts)) {
            for (const c of up.contracts) {
              // Check if contract is active?
              // Logic: if fecha_baja_contrato is null or future?
              // Or just take all provided in metadata as they are usually the relevant history + current.
              // Let's check if it has a cancellation date.
              const isExpired = c.fecha_baja_contrato && new Date(c.fecha_baja_contrato) < new Date();
              if (!isExpired && c.tipo_contrato_id) {
                userContractTypeIds.add(c.tipo_contrato_id);
              }
            }
          }
        }

        if (userContractTypeIds.size > 0) {
          const VacationConfig = (await import("../models/VacationConfig.js")).VacationConfig;
          const config = await VacationConfig.findOne({ tenantId: req.tenantObjectId });

          if (config && config.contractRules && config.contractRules.length > 0) {
            // Check if ANY of the user's active contracts is explicitly disabled.
            // Or only if ALL are disabled? User said "si el usuario tiene ES contrato".
            // Suggests if the user is under a specific contract type, hide it.
            // If they have multiple, usually one is "main".
            // Let's go with: if ANY active contract type is disabled in rules, disable it.
            // This is safer to avoid showing it to contractors who shouldn't have it.

            for (const typeId of userContractTypeIds) {
              const rule = config.contractRules.find((r) => r.contractId === typeId);
              if (rule && rule.vacationsEnabled === false) {
                vacationsEnabled = false;
                break; // One disabled contract is enough to disable the button?
                // Or should we check if *all* are disabled?
                // 'Si el usuario tiene ESE contrato'.
                // If I am a full time employee AND a contractor (weird), I probably should have vacations.
                // But usually these don't overlap.
                // Let's stick to "If any active contract is disabled, disable".
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Error evaluating contract rules for user:", e);
    }

    res.json({ ...profile, areaName, areaMembers, positionName, levelName, roleNames, extraVacationDays, carryOverVacationDays, projectIds, externalInfo, metadata, vacationsEnabled });
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

    const profile = await UserProfile.findOneAndUpdate({ tenantId: req.tenantObjectId, userId }, { $set: data }, { new: true, upsert: false });

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

    const profile = await UserProfile.findOneAndUpdate({ tenantId: req.tenantObjectId, userId }, { $set: { profilePhotoUrl } }, { new: true });

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
    let positionName = "";
    let areaName = "";

    // 1. Get User for Vacation Days (calculated virtual) & Hire Date
    const User = (await import("../models/User.js")).User;
    const user = await User.findById(userId);

    // 2. Get Profile for other stats (daysWorked) if needed
    const profile = await UserProfile.findOne({
      tenantId,
      userId,
    }).lean();

    const hireDate = profile?.hireDate || user?.hireDate;
    const daysWorked = hireDate ? Math.floor((Date.now() - new Date(hireDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;

    const annualDays = user?.vacationDays?.totalDays || 14; // Default fallback to 14 (min law)

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

    // 4. Resolve Vacation Config (Position > Area > Project > Global)
    // 4. Resolve Vacation Config (Position > Area > Project > Global)
    let projectName = "Sin Proyecto";
    let effectiveVacationConfig: any = undefined;
    let vacationConfigSource = "Global";

    // A. Check Position (Highest Priority)
    if (user.positionId) {
      try {
        const Position = (await import("../models/Position.js")).Position;
        // User.positionId can be object or string depending on population, usually ID in raw find
        const posId = user.positionId._id || user.positionId;
        const position = await Position.findById(posId).select("name vacationConfig").lean();
        if (position) {
          positionName = position.name;
          if (position.vacationConfig && !position.vacationConfig.useGlobalConfig) {
            effectiveVacationConfig = position.vacationConfig;
            vacationConfigSource = "Cargo";
          }
        }
      } catch (err) {
        console.error("Error fetching position for stats:", err);
      }
    }

    // B. Check Area (Second Priority)
    if (!effectiveVacationConfig && user.areaId) {
      try {
        const Area = (await import("../models/Area.js")).Area;
        // User.areaId can be object or string
        const arId = user.areaId._id || user.areaId;
        const area = await Area.findById(arId).select("name vacationConfig").lean();
        if (area) {
          areaName = area.name;
          if (area.vacationConfig && !area.vacationConfig.useGlobalConfig) {
            effectiveVacationConfig = area.vacationConfig;
            vacationConfigSource = "Área";
          }
        }
      } catch (err) {
        console.error("Error fetching area for stats:", err);
      }
    }

    // C. Check Projects (Lowest Priority before Global)
    let minDiasSource = vacationConfigSource; // Default to current source (Global/Cargo/Area)
    let diasCorridosSource = vacationConfigSource; // Default to current source
    let fractionationSource = vacationConfigSource;

    if (!effectiveVacationConfig && user && user.projectIds && user.projectIds.length > 0) {
      try {
        const Project = (await import("../models/Project.js")).Project;
        const VacationConfig = (await import("../models/VacationConfig.js")).VacationConfig;

        const globalConfig = await VacationConfig.findOne({ tenantId });
        const defaultGlobal = {
          permiteFraccionadas: globalConfig?.permiteFraccionadas ?? true,
          minDiasFraccion: globalConfig?.minDiasFraccion ?? 7,
          diasCorridos: globalConfig?.diasCorridos ?? false,
        };

        const projects = await Project.find({
          _id: { $in: user.projectIds },
          tenantId,
        })
          .select("name vacationConfig clientId")
          .populate("clientId", "name")
          .lean();

        if (projects.length > 0) {
          projectName = projects
            .map((p: any) => {
              const c = p.clientId;
              return c?.name ? `${c.name} | ${p.name}` : p.name;
            })
            .join(", "); // List all projects

          // Resolution Logic
          // Map projects to their effective config (or global if they use global)
          const projectConfigs = projects.map((p) => {
            const usesCustom = p.vacationConfig && !p.vacationConfig.useGlobalConfig;
            return {
              name: p.name,
              permiteFraccionadas: usesCustom ? p.vacationConfig!.permiteFraccionadas : defaultGlobal.permiteFraccionadas,
              minDiasFraccion: usesCustom ? (p.vacationConfig!.minDiasFraccion ?? defaultGlobal.minDiasFraccion) : defaultGlobal.minDiasFraccion,
              diasCorridos: usesCustom ? (p.vacationConfig!.diasCorridos ?? defaultGlobal.diasCorridos) : defaultGlobal.diasCorridos,
              isCustom: usesCustom,
            };
          });

          // 1. Fraccionamiento: True if ANY allows it
          const anyAllowsFractionation = projectConfigs.some((c) => c.permiteFraccionadas);
          const resolvedPermiteFraccionadas = anyAllowsFractionation;

          if (anyAllowsFractionation) {
            const allowing = projectConfigs.filter((c) => c.permiteFraccionadas);
            fractionationSource = allowing.length === 1 ? allowing[0].name : "Múltiples Proyectos";
          } else {
            fractionationSource = projects.length === 1 ? projects[0].name : "Todos los Proyectos";
          }

          // 2. Min Dias: Minimum of those that allow it
          let resolvedMinDias = defaultGlobal.minDiasFraccion;
          if (resolvedPermiteFraccionadas) {
            const allowingConfigs = projectConfigs.filter((c) => c.permiteFraccionadas);
            if (allowingConfigs.length > 0) {
              const sortedByMin = allowingConfigs.sort((a, b) => (a.minDiasFraccion || 0) - (b.minDiasFraccion || 0));
              resolvedMinDias = sortedByMin[0].minDiasFraccion || 7;
              minDiasSource = sortedByMin[0].name;
            }
          }

          // 3. Dias Corridos vs Hábiles (False vs True). Prioritize Hábiles (False).
          // If ANY is False (Hábiles), result is False.
          const anyHabiles = projectConfigs.some((c) => c.diasCorridos === false);
          const resolvedDiasCorridos = !anyHabiles; // If any is Hábiles (false), result is Hábiles (false). Only Corridos (true) if ALL are true? No, wait.
          // Logic from user: "Si existe una discrepancia, prioridad a Días Hábiles".
          // Días Hábiles means diasCorridos = false.
          // So if Project A = Hábiles (false), Project B = Corridos (true) -> Result = Hábiles (false).
          // So if ANY is false, result is false.

          if (anyHabiles) {
            const habilesProjects = projectConfigs.filter((c) => c.diasCorridos === false);
            diasCorridosSource = habilesProjects.length === 1 ? habilesProjects[0].name : "Múltiples Proyectos (Hábiles)";
          } else {
            // All are Corridos
            diasCorridosSource = projects.length === 1 ? projects[0].name : "Todos los Proyectos";
          }

          effectiveVacationConfig = {
            useGlobalConfig: false, // It's a resolved config
            permiteFraccionadas: resolvedPermiteFraccionadas,
            minDiasFraccion: resolvedMinDias,
            diasCorridos: resolvedDiasCorridos,
          };
          vacationConfigSource = "Proyectos"; // Generic override, detailed sources in meta
        }
      } catch (err) {
        console.error("Error fetching projects for stats:", err);
      }
    } else {
      // If not projects, sources remain as "Global" or "Cargo" or "Area"
      if (vacationConfigSource === "Global") {
        minDiasSource = "Global";
        diasCorridosSource = "Global";
        fractionationSource = "Global";
      } else if (vacationConfigSource === "Cargo") {
        minDiasSource = positionName || "Cargo";
        diasCorridosSource = positionName || "Cargo";
        fractionationSource = positionName || "Cargo";
      } else if (vacationConfigSource === "Área") {
        minDiasSource = areaName || "Área";
        diasCorridosSource = areaName || "Área";
        fractionationSource = areaName || "Área";
      }
    }

    res.json({
      daysWorked,
      vacations: {
        total: annualDays,
        used: daysUsed, // Gozados
        pending: daysPending, // Pendientes
        available: daysAvailable,
      },
      project: projectName,
      projectVacationConfig: effectiveVacationConfig,
      vacationConfigSource,
      // New metadata fields
      vacationRulesMeta: {
        minDiasSource,
        diasCorridosSource,
        fractionationSource,
      },
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" });
  }
});

export { router as profileRoutes };
