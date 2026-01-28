import express from "express";
import { Types } from "mongoose";
import { Vacation } from "../models/Vacation.js";
import { VacationConfig } from "../models/VacationConfig.js";
import { Notification } from "../models/Notification.js";
import { Tenant } from "../models/Tenant.js";
import { Pdf } from "../models/Pdf.js";
import { authenticateToken } from "../middleware/auth.js";
import { generateVacationPDF } from "../utils/pdfGenerator.js";
import { User } from "../models/User.js";
import { UserProfile } from "../models/UserProfile.js";
import { Level } from "../models/Level.js";
import { Position } from "../models/Position.js";
import { Area } from "../models/Area.js";
import { Project } from "../models/Project.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/vacations/availability - Get dates that are fully booked for user's area
router.get("/availability", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user!.userId;
    const user = await User.findById(userId);

    let userAreaId = user.areaId;

    // Fallback: If user has no areaId, try to find it via UserProfile department
    if (!userAreaId) {
      const profile = await UserProfile.findOne({ userId, tenantId });
      if (profile && profile.department) {
        const area = await Area.findOne({ tenantId, name: profile.department });
        if (area) {
          userAreaId = area._id as any;
        }
      }
    }

    if (!userAreaId) {
      return res.json([]); // No area, no restrictions
    }

    // -------------------------------------------------------------------------
    // Helper: Check overlap rules
    // -------------------------------------------------------------------------
    const vacConfig = await VacationConfig.findOne({ tenantId });
    if (!vacConfig) return res.json([]);

    // Get RoleFrames to resolve IDs if needed
    const RoleFrame = (await import("../models/RoleFrame.js")).RoleFrame;

    // Find applicable rules for this user
    const applicableRules = [];

    // Fallback logic for userAreaId is handled above.
    // Ensure we use the userAreaId resolved at lines 29-40.

    for (const rule of vacConfig.overlaps) {
      if (!rule.isActive) continue;

      let matches = true;

      // 1. Area Check
      if (rule.areaId) {
        if (!userAreaId || userAreaId.toString() !== rule.areaId.toString()) {
          matches = false;
        }
      }

      // 2. Position Check
      if (matches && rule.positionId) {
        if (!user.positionId || user.positionId.toString() !== rule.positionId.toString()) {
          matches = false;
        }
      }

      // 3. Level Check
      if (matches && rule.levelId) {
        if (!user.levelId || user.levelId.toString() !== rule.levelId.toString()) {
          matches = false;
        }
      }

      // 4. Project Check
      if (matches && rule.projectId) {
        const userProjects = user.projectIds?.map((p) => p.toString()) || [];
        if (!userProjects.includes(rule.projectId.toString())) {
          matches = false;
        }
      }

      // 5. RoleFrame Check
      if (matches && rule.roleFrameId) {
        try {
          const rf = await RoleFrame.findById(rule.roleFrameId);
          if (rf) {
            const userMetaProjects = user.metadata?.projects || [];
            const hasRole = userMetaProjects.some((p: any) => p.rol_frame_id == rf.externalId || p.rol_frame_id == rf.data?.rol?.id);
            if (!hasRole) matches = false;
          } else {
            matches = false;
          }
        } catch (e) {
          matches = false;
        }
      }

      if (matches) {
        applicableRules.push(rule);
      }
    }

    if (applicableRules.length === 0) {
      return res.json([]);
    }

    // Process availability for ALL applicable rules
    const now = new Date();
    const searchStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const searchEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 18, 1));

    // We will aggregate blocked dates.
    // If a date is blocked by ANY rule, it is blocked.
    // However, the response format is list of dates with status.
    const blockedDatesMap = new Map<string, string>(); // date -> status ('pending' takes precedence?)

    for (const rule of applicableRules) {
      // Find ALL users who match this rule
      const query: any = { tenantId, isActive: true };

      if (rule.areaId) query.areaId = rule.areaId;
      if (rule.positionId) query.positionId = rule.positionId;
      if (rule.levelId) query.levelId = rule.levelId;
      if (rule.projectId) query.projectIds = rule.projectId;
      // RoleFrame query is complex on metadata, do we optimize?
      // For now, fetch candidates and filter in JS if roleFrameId is present,
      // OR try to use mongo query for metadata if possible.
      // User.metadata.projects is array. 'metadata.projects.rol_frame_id': ...
      if (rule.roleFrameId) {
        const rf = await RoleFrame.findById(rule.roleFrameId);
        if (rf) {
          // Construct values to query
          const values = [];
          if (rf.externalId) values.push(rf.externalId);
          if (rf.data?.rol?.id) values.push(rf.data.rol.id);
          if (values.length > 0) {
            // Cast to match types in DB (string vs number?)
            // metadata.projects can be mixed or specific. Usually numbers or strings.
            // Let's use $in with both string and number variants if needed, or regex?
            // Safer to start with base query and filter in memory if volume allows,
            // or purely loose mongo query.
            query["metadata.projects"] = {
              $elemMatch: { rol_frame_id: { $in: values } },
            };
          }
        }
      }

      const matchingUsers = await User.find(query).select("_id");
      const matchingUserIds = matchingUsers.map((u) => u._id);

      // Find vacations for these users
      const overlappingVacations = await Vacation.find({
        tenantId,
        userId: { $in: matchingUserIds },
        status: { $nin: ["rejected", "cancelled"] },
        endDate: { $gte: searchStart },
        startDate: { $lte: searchEnd },
      }).lean();

      // Count per day
      const occupancy: Record<string, { count: number; hasPending: boolean }> = {};
      for (const v of overlappingVacations) {
        let current = new Date(v.startDate < searchStart ? searchStart : v.startDate);
        const end = new Date(v.endDate > searchEnd ? searchEnd : v.endDate);
        const isPending = v.status === "pending";

        while (current <= end) {
          const dateStr = current.toISOString().split("T")[0];
          if (!occupancy[dateStr]) occupancy[dateStr] = { count: 0, hasPending: false };
          occupancy[dateStr].count++;
          if (isPending) occupancy[dateStr].hasPending = true;
          current.setDate(current.getDate() + 1);
        }
      }

      // Check violations
      Object.entries(occupancy).forEach(([date, data]) => {
        if (data.count >= rule.maxSimultaneousUsers) {
          // Block this date
          // If already blocked, pending takes precedence? No, approved blocks it "harder" but here status is about the CAUSE of block.
          // If I am blocked by pending requests, maybe I can request and hope?
          // But usually we just say "Blocked".
          // Let's preserve "pending" status if the block is caused by pending vacations?
          const existing = blockedDatesMap.get(date);
          const currentStatus = data.hasPending ? "pending" : "approved";

          if (!existing) {
            blockedDatesMap.set(date, currentStatus);
          } else {
            // If existing is approved and current is pending -> approved wins (confirmed block)
            // If existing is pending and current is approved -> approved wins
            if (existing === "pending" && currentStatus === "approved") {
              blockedDatesMap.set(date, "approved");
            }
          }
        }
      });
    }

    const blockedDates = Array.from(blockedDatesMap.entries()).map(([date, status]) => ({
      date,
      status,
    }));

    // console.log(`[Availability] User: ${userId}. Blocked Dates: ${blockedDates.length}`);

    res.json(blockedDates);
  } catch (error: any) {
    console.error("Error fetching availability:", error);
    res.status(500).json({ error: "Error al obtener disponibilidad de vacaciones" });
  }
});

// GET /api/vacations - Get all vacation requests
router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { mine } = req.query;

    const query: any = { tenantId };

    // If 'mine' param is present, filter by current user
    if (mine === "true") {
      query.userId = req.user!.userId;
    }

    const vacations = await Vacation.find(query).sort({ createdAt: -1 });
    res.json(vacations);
  } catch (error: any) {
    console.error("Error fetching vacations:", error);
    res.status(500).json({ error: "Error al obtener las solicitudes de vacaciones" });
  }
});

// GET /api/vacations/:id - Get a single vacation request
router.get("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const vacation = await Vacation.findOne({ _id: id, tenantId });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud no encontrada" });
    }

    res.json(vacation);
  } catch (error: any) {
    console.error("Error fetching vacation:", error);
    res.status(500).json({ error: "Error al obtener la solicitud de vacaciones" });
  }
});

// POST /api/vacations - Create a new vacation request
router.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user!.userId;

    // 0. Fetch User & Profile Data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const profile = await UserProfile.findOne({ userId, tenantId });

    // Fetch Position Name
    let positionName = "Sin Cargo";
    if (user.positionId) {
      const pos = await Position.findById(user.positionId);
      if (pos) positionName = pos.name;
    } else if (profile?.position) {
      positionName = profile.position;
    }

    // Fetch Level Name
    let levelName = "Sin Nivel";
    if (user.levelId) {
      const lvl = await Level.findById(user.levelId);
      if (lvl) levelName = lvl.name;
    }

    const userName = user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : profile ? `${profile.firstName} ${profile.lastName}` : "Usuario";

    // Check Overlap Rules
    const { startDate, endDate, reason } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Fechas requeridas" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Fechas inválidas" });
    }

    if (start > end) {
      return res.status(400).json({ error: "La fecha de inicio no puede ser posterior a la fecha de fin" });
    }

    // Check for user's own overlapping vacations
    const existingVacation = await Vacation.findOne({
      tenantId,
      userId,
      status: { $nin: ["rejected", "cancelled"] },
      $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
    });

    if (existingVacation) {
      return res.status(400).json({ error: "Ya tienes una solicitud de vacaciones activa en este rango de fechas." });
    }

    // New Multi-Criteria Overlap Check
    const vacConfig = await VacationConfig.findOne({ tenantId });
    if (vacConfig && vacConfig.overlaps && vacConfig.overlaps.length > 0) {
      // Determine explicit or fallback area
      let userAreaId = user.areaId;
      if (!userAreaId && profile?.department) {
        const area = await Area.findOne({ tenantId, name: profile.department });
        if (area) userAreaId = area._id as any;
      }

      const RoleFrame = (await import("../models/RoleFrame.js")).RoleFrame;

      // Iterate all active rules
      for (const rule of vacConfig.overlaps) {
        if (!rule.isActive) continue;

        let matches = true;

        if (rule.areaId) {
          if (!userAreaId || userAreaId.toString() !== rule.areaId.toString()) matches = false;
        }
        if (matches && rule.positionId) {
          if (!user.positionId || user.positionId.toString() !== rule.positionId.toString()) matches = false;
        }
        if (matches && rule.levelId) {
          if (!user.levelId || user.levelId.toString() !== rule.levelId.toString()) matches = false;
        }
        if (matches && rule.projectId) {
          const userProjects = user.projectIds?.map((p) => p.toString()) || [];
          if (!userProjects.includes(rule.projectId.toString())) matches = false;
        }
        if (matches && rule.roleFrameId) {
          try {
            const rf = await RoleFrame.findById(rule.roleFrameId);
            if (rf) {
              const userMetaProjects = user.metadata?.projects || [];
              const hasRole = userMetaProjects.some((p: any) => p.rol_frame_id == rf.externalId || p.rol_frame_id == rf.data?.rol?.id);
              if (!hasRole) matches = false;
            } else {
              matches = false;
            }
          } catch (e) {
            matches = false;
          }
        }

        // If user matches this rule, check occupancy
        if (matches) {
          // Build query for OTHER users matching this rule
          const otherUsersQuery: any = { tenantId, isActive: true, _id: { $ne: userId } };
          if (rule.areaId) otherUsersQuery.areaId = rule.areaId;
          if (rule.positionId) otherUsersQuery.positionId = rule.positionId;
          if (rule.levelId) otherUsersQuery.levelId = rule.levelId;
          if (rule.projectId) otherUsersQuery.projectIds = rule.projectId;

          if (rule.roleFrameId) {
            const rf = await RoleFrame.findById(rule.roleFrameId);
            if (rf) {
              const values = [];
              if (rf.externalId) values.push(rf.externalId);
              if (rf.data?.rol?.id) values.push(rf.data.rol.id);
              if (values.length > 0) {
                otherUsersQuery["metadata.projects"] = {
                  $elemMatch: { rol_frame_id: { $in: values } },
                };
              }
            }
          }

          const matchingUsers = await User.find(otherUsersQuery).select("_id");
          const matchingUserIds = matchingUsers.map((u) => u._id);

          // Check overlaps for these users in the requested range
          const concurrentConflictingVacations = await Vacation.find({
            tenantId,
            userId: { $in: matchingUserIds },
            status: { $nin: ["rejected", "cancelled"] },
            $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
          }).distinct("userId");

          if (concurrentConflictingVacations.length >= rule.maxSimultaneousUsers) {
            return res.status(400).json({
              error: `Conflicto de solapamiento. Hay ${concurrentConflictingVacations.length} personas con este perfil (Regla: ${rule.description || "Personalizada"}) de vacaciones en este periodo (Límite: ${rule.maxSimultaneousUsers}).`,
            });
          }
        }
      }
    }

    const globalConfig = await VacationConfig.findOne({ tenantId });

    if (!globalConfig) {
      return res.status(400).json({ error: "No se encontró configuración global de vacaciones para este tenant" });
    }

    // Determine effective rules based on Project assignment
    // Lógica de Resolución de Conflictos para Usuarios Multiproyecto
    // 1. Fraccionamiento: Prioridad al que permita (TRUE wins). Si ambos permiten, el de MENOR días mínimos.
    // 2. Tipo de Días: Prioridad a Días Hábiles (FALSE wins over TRUE for diasCorridos).

    let effectivePermiteFraccionadas = globalConfig.permiteFraccionadas;
    let effectiveMinDiasFraccion = globalConfig.minDiasFraccion || 7;
    let effectiveDiasCorridos = globalConfig.diasCorridos;

    if (user.projectIds && user.projectIds.length > 0) {
      const projects = await Project.find({
        _id: { $in: user.projectIds },
        tenantId,
      });

      // Map to effective config per project (if useGlobal, uses global values)
      const projectConfigs = projects.map((p) => {
        if (p.vacationConfig && !p.vacationConfig.useGlobalConfig) {
          return {
            permiteFraccionadas: p.vacationConfig.permiteFraccionadas,
            minDiasFraccion: p.vacationConfig.minDiasFraccion,
            diasCorridos: p.vacationConfig.diasCorridos,
          };
        }
        return {
          permiteFraccionadas: globalConfig.permiteFraccionadas,
          minDiasFraccion: globalConfig.minDiasFraccion,
          diasCorridos: globalConfig.diasCorridos,
        };
      });

      if (projectConfigs.length > 0) {
        // 1. Fraccionamiento: True if ANY allows it
        effectivePermiteFraccionadas = projectConfigs.some((c) => c.permiteFraccionadas);

        // 2. Min Dias: Minimum of those that allow it (or just min of all if forced to check)
        // Only relevant if allowed.
        if (effectivePermiteFraccionadas) {
          const allowedConfigs = projectConfigs.filter((c) => c.permiteFraccionadas);
          // Get min value, default to global or 1 if missing
          const mins = allowedConfigs.map((c) => c.minDiasFraccion ?? globalConfig.minDiasFraccion ?? 7);
          effectiveMinDiasFraccion = Math.min(...mins);
        }

        // 3. Dias Corridos (True) vs Dias Hábiles (False). Prioridad Hábiles (False).
        // If ANY is False (Hábiles), result is False.
        // Result is True ONLY if ALL are True.
        // Handle undefined as "use global" or "true" depending on safety?
        // We already mapped useGlobal so undefined in p.vacationConfig (if explicit custom but field missing)
        // should probably default to global. But let's assume mapped correctly.
        // Actually map returns undefined for optional fields if not set.
        // Let's safe guard the map above.

        // Refined map above handles standard cases. For diasCorridos, if missing in custom, it might be undefined.
        // If undefined, let's assume it inherits global for that project context or defaults to true?
        // Let's safeguard the reduction:
        const corridosValues = projectConfigs.map((c) => c.diasCorridos ?? globalConfig.diasCorridos ?? true);
        effectiveDiasCorridos = corridosValues.every((v) => v === true);
      }
    }

    // CONSTANTS CALCULATION
    let daysRequested = 0;

    if (effectiveDiasCorridos) {
      // Días Corridos (Calendar Days)
      const timeDiff = Math.abs(end.getTime() - start.getTime());
      daysRequested = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // Inclusive days
    } else {
      // Días Hábiles (Working Days: Mon-Fri)
      let count = 0;
      let cur = new Date(start);
      // Clone to avoid modifying start
      const loopEnd = new Date(end);

      while (cur <= loopEnd) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) {
          // 0=Sun, 6=Sat
          count++;
        }
        cur.setDate(cur.getDate() + 1);
      }
      daysRequested = count;
    }

    // BALANCE CALCULATION
    // Base = globalConfig.diasAnuales
    // Used = Gozados (Delivered/Signed)
    // Pending = Active (Pending/PreApproved/Approved)

    const activeVacations = await Vacation.find({
      tenantId,
      userId,
      status: { $nin: ["rejected", "cancelled"] },
    }).lean();

    let daysUsed = 0;
    let daysPending = 0;

    for (const v of activeVacations) {
      const isSigned = v.signatureStatus === "signed";
      const isDelivered = v.status === "delivered";
      const isNotRequired = v.signatureStatus === "not_required";
      const isApproved = v.status === "approved";

      if (isDelivered || isSigned || (isApproved && isNotRequired)) {
        daysUsed += v.daysRequested;
      } else {
        daysPending += v.daysRequested;
      }
    }

    // Balance available BEFORE this request
    const totalAnnualDays = user.vacationDays?.totalDays || 0;
    const currentAvailable = totalAnnualDays - daysUsed - daysPending;

    // New Balance (Remaining)
    const newBalance = currentAvailable - daysRequested;

    const vacationData = {
      ...req.body,
      tenantId,
      userId,
      userName,
      position: positionName,
      level: levelName,
      daysRequested,
      diasDeVacacionesAnuales: totalAnnualDays,
      balance: newBalance,
      reason: reason || "Solicitud de vacaciones",
      comments: reason, // Map 'reason' from body to 'comments' in db
      requiresSignature: globalConfig.requiereFirma,
      rules: {
        diasAnuales: totalAnnualDays,
        diasBeneficio: globalConfig.diasBeneficio,
        maxDiasGozados: globalConfig.maxDiasGozados,
        permiteArrastre: globalConfig.permiteArrastre,
        maxDiasArrastre: globalConfig.maxDiasArrastre,
        vencimientoArrastreDias: globalConfig.vencimientoArrastreDias,

        maxDiasHabiles: globalConfig.maxDiasHabiles,
        anticipacionMinimaDias: globalConfig.anticipacionMinimaDias,
        permiteFraccionadas: effectivePermiteFraccionadas,
        minDiasFraccion: effectiveMinDiasFraccion,
        diasCorridos: effectiveDiasCorridos,
        requiereFirma: globalConfig.requiereFirma,
        pdfId: globalConfig.pdfId,
      },
    };

    const newVacation = new Vacation(vacationData);
    await newVacation.save();

    res.status(201).json(newVacation);
  } catch (error: any) {
    console.error("Error creating vacation:", error);
    if (error.message === "Tenant not found") {
      return res.status(404).json({ error: "Tenant no encontrado" });
    }
    res.status(500).json({ error: "Error al crear la solicitud de vacaciones", details: error.message });
  }
});

// PATCH /api/vacations/:id - Update a vacation request
router.patch("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const updatedVacation = await Vacation.findOneAndUpdate({ _id: id, tenantId }, { $set: req.body }, { new: true, runValidators: true });

    if (!updatedVacation) {
      return res.status(404).json({ error: "Solicitud no encontrada" });
    }

    res.json(updatedVacation);
  } catch (error: any) {
    console.error("Error updating vacation:", error);
    res.status(500).json({ error: "Error al actualizar la solicitud de vacaciones" });
  }
});

// DELETE /api/vacations/:id - Delete a vacation request
router.delete("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const deletedVacation = await Vacation.findOneAndDelete({ _id: id, tenantId });

    if (!deletedVacation) {
      return res.status(404).json({ error: "Solicitud no encontrada" });
    }

    res.json({ message: "Solicitud eliminada correctamente" });
  } catch (error: any) {
    console.error("Error deleting vacation:", error);
    res.status(500).json({ error: "Error al eliminar la solicitud de vacaciones" });
  }
});

// PUT /api/vacations/:id/pre-approve - Pre-approve a vacation request
router.put("/:id/pre-approve", async (req: any, res) => {
  try {
    const preApproverId = req.user!.userId;
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    }).populate("userId");

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    if (vacation.status !== "pending") {
      return res.status(400).json({ error: "Solo las solicitudes pendientes pueden ser preaprobadas" });
    }

    vacation.status = "pre_approved";
    vacation.preApprovedBy = new Types.ObjectId(preApproverId);
    vacation.preApprovedAt = new Date();

    await vacation.save();

    // Generate PDF
    let templateId = vacation.rules?.pdfId;

    // Fallback: Try to find default template if not specified in rules
    if (!templateId) {
      const defaultTemplate = await Pdf.findOne({ tenantId, code: "vacaciones", isActive: true });
      if (defaultTemplate) {
        templateId = defaultTemplate._id.toString();
      }
    }

    if (templateId) {
      try {
        const template = await Pdf.findOne({
          _id: templateId,
          tenantId,
          isActive: true,
        });

        if (template) {
          const user = vacation.userId as any;
          const tenant = await Tenant.findById(tenantId);
          const tenantName = tenant?.name || tenant?.slug || "Organización";

          const result = await generateVacationPDF(vacation as any, template, user, tenantId.toString(), tenantName, vacation.vacationNumber);

          if (result.success && result.pdfUrl) {
            vacation.pdfPreAprobacionUrl = result.pdfUrl;
            await vacation.save();
          } else {
            console.error("Error generating PDF for vacation:", result.error);
          }
        }
      } catch (pdfError) {
        console.error("Error generating PDF for vacation:", pdfError);
      }
    }

    res.json(vacation);
  } catch (error: any) {
    console.error("Pre-approve vacation error:", error);
    res.status(500).json({ error: "Error al preAprobar la solicitud de vacaciones" });
  }
});

// PUT /api/vacations/:id/approve - Approve a vacation request
router.put("/:id/approve", async (req: any, res) => {
  try {
    const approverId = req.user!.userId;
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    if (vacation.status !== "pre_approved") {
      return res.status(400).json({ error: "Solo las solicitudes preaprobadas pueden ser aprobadas" });
    }

    vacation.status = "approved";
    vacation.approvedBy = new Types.ObjectId(approverId);
    vacation.approvedAt = new Date();

    // Check if rules requires signature
    const requiresSignature = vacation.rules?.requiereFirma || false;
    vacation.requiresSignature = requiresSignature;

    if (requiresSignature) {
      vacation.signatureStatus = "sent";
      vacation.signatureSentAt = new Date();
    }

    await vacation.save();

    if (requiresSignature) {
      await Notification.create({
        tenantId,
        userId: vacation.userId,
        type: "vacation",
        title: "Documento enviado para firma",
        message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido aprobada. Revisá tu casilla de email para firmar el documento.`,
        linkUrl: `/vacations`,
      });
    } else {
      await Notification.create({
        tenantId,
        userId: vacation.userId,
        type: "vacation",
        title: "Solicitud de vacaciones aprobada",
        message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido aprobada.`,
        linkUrl: `/vacations`,
      });
    }

    res.json(vacation);
  } catch (error: any) {
    console.error("Approve vacation error:", error);
    res.status(500).json({ error: "Error al aprobar la solicitud de vacaciones" });
  }
});

// PUT /api/vacations/:id/reject - Reject a vacation request
router.put("/:id/reject", async (req: any, res) => {
  try {
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    if (!["pending", "pre_approved", "approved"].includes(vacation.status)) {
      return res.status(400).json({ error: "Solo las solicitudes pendientes, preaprobadas o aprobadas pueden ser rechazadas" });
    }

    vacation.status = "rejected";
    await vacation.save();

    await Notification.create({
      tenantId,
      userId: vacation.userId,
      type: "vacation",
      title: "Solicitud de Vacaciones Rechazada",
      message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido rechazada.`,
      linkUrl: `/vacations`,
    });

    res.json(vacation);
  } catch (error: any) {
    console.error("Reject vacation error:", error);
    res.status(500).json({ error: "Error al rechazar la solicitud de vacaciones" });
  }
});

// PUT /api/vacations/:id/cancel - Cancel vacation request
router.put("/:id/cancel", async (req: any, res) => {
  try {
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    if (!["pending", "pre_approved", "approved", "delivered"].includes(vacation.status)) {
      return res.status(400).json({ error: "Esta solicitud no puede ser cancelada" });
    }

    vacation.status = "cancelled";
    vacation.cancelledAt = new Date();
    await vacation.save();

    res.json(vacation);
  } catch (error: any) {
    console.error("Cancel vacation error:", error);
    res.status(500).json({ error: "Error al cancelar la solicitud de vacaciones" });
  }
});

// PUT /api/vacations/:id/deliver - Mark vacation as delivered
router.put("/:id/deliver", async (req: any, res) => {
  try {
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    if (vacation.status !== "approved") {
      return res.status(400).json({ error: "Solo las solicitudes aprobadas pueden ser marcadas como entregadas" });
    }

    vacation.status = "delivered";
    vacation.deliveredAt = new Date();
    await vacation.save();

    await Notification.create({
      tenantId,
      userId: vacation.userId,
      type: "vacation",
      title: "Vacaciones Confirmadas",
      message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido confirmada y entregada.`,
      linkUrl: `/vacations`,
    });

    res.json(vacation);
  } catch (error: any) {
    console.error("Deliver vacation error:", error);
    res.status(500).json({ error: "Error al marcar como entregada la solicitud de vacaciones" });
  }
});

// PUT /api/vacations/:id/send-signature - Send vacation for signature
router.put("/:id/send-signature", async (req: any, res) => {
  try {
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    if (vacation.status !== "approved") {
      return res.status(400).json({ error: "Solo las solicitudes aprobadas pueden ser enviadas para firma" });
    }

    vacation.signatureStatus = "sent";
    vacation.signatureSentAt = new Date();
    await vacation.save();

    await Notification.create({
      tenantId,
      userId: vacation.userId,
      type: "vacation",
      title: "Documento enviado para firma",
      message: `El documento de tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido enviado para firma.`,
      linkUrl: `/vacations`,
    });

    res.json(vacation);
  } catch (error: any) {
    console.error("Send signature vacation error:", error);
    res.status(500).json({ error: "Error al enviar para firma la solicitud de vacaciones" });
  }
});

// PUT /api/vacations/:id/notify-signature - User notifies they have signed
router.put("/:id/notify-signature", async (req: any, res) => {
  try {
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    if (vacation.signatureStatus !== "sent") {
      // Allow re-notifying? Or fail? Better fail if not in sent state.
      return res.status(400).json({ error: "Solo las solicitudes enviadas para firma pueden ser notificadas" });
    }

    vacation.signatureNotifiedAt = new Date();
    await vacation.save();

    // Notify the approver (Supervisor/Admin)
    const approverId = vacation.approvedBy; // Assuming approvedBy is the admin/manager
    if (approverId) {
      await Notification.create({
        tenantId,
        userId: approverId,
        type: "vacation",
        title: "Firma completada por usuario",
        message: `El usuario ha notificado que completó la firma de la solicitud N°: ${vacation.vacationNumber}. Por favor verificá.`,
        linkUrl: `/vacations?id=${vacation._id}`,
      });
    }

    res.json(vacation);
  } catch (error: any) {
    console.error("Notify signature error:", error);
    res.status(500).json({ error: "Error al notificar la firma" });
  }
});

// PUT /api/vacations/:id/mark-signed - Mark vacation as signed
router.put("/:id/mark-signed", async (req: any, res) => {
  try {
    const signerId = req.user!.userId;
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    if (vacation.signatureStatus !== "sent") {
      return res.status(400).json({ error: "Solo las solicitudes enviadas para firma pueden ser marcadas como firmadas" });
    }

    vacation.signatureStatus = "signed";
    vacation.signedAt = new Date();
    vacation.signedBy = new Types.ObjectId(signerId);
    await vacation.save();

    // Notify the approver (Supervisor/Admin)
    if (vacation.approvedBy) {
      await Notification.create({
        tenantId,
        userId: vacation.approvedBy,
        type: "vacation",
        title: "Documento firmado por colaborador",
        message: `El colaborador ha confirmado la firma de la solicitud N°: ${vacation.vacationNumber}. Verifique el documento.`,
        linkUrl: `/vacations/${vacation._id}`,
      });
    }

    res.json(vacation);
  } catch (error: any) {
    console.error("Mark signed vacation error:", error);
    res.status(500).json({ error: "Error al marcar como firmada la solicitud de vacaciones" });
  }
});

export const vacationsRoutes = router;
