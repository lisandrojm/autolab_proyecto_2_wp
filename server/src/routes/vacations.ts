import express from "express";
import { Types } from "mongoose";
import { Vacation } from "../models/Vacation.js";
import { GlobalVacationConfig } from "../models/GlobalVacationConfig.js";
import { Notification } from "../models/Notification.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { Tenant } from "../models/Tenant.js";
import { PdfTemplate } from "../models/PdfTemplate.js";
import { authenticateToken } from "../middleware/auth.js";
import { generateVacationPDF } from "../utils/pdfGenerator.js";
import { User } from "../models/User.js";
import { VacationOverlap } from "../models/VacationOverlap.js";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { Level } from "../models/Level.js";
import { Position } from "../models/Position.js";
import { Area } from "../models/Area.js";

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

    // Fallback: If user has no areaId, try to find it via EmployeeProfile department
    if (!userAreaId) {
      const profile = await EmployeeProfile.findOne({ userId, tenantId });
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

    const overlapRule = await VacationOverlap.findOne({
      tenantId,
      areaId: userAreaId,
      isActive: true,
    });

    // If no rule exists, no dates are blocked by overlap
    if (!overlapRule) {
      return res.json([]);
    }

    // Optimización: Search vacations overlapping with next 18 months
    const now = new Date();
    const searchStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const searchEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 18, 1));

    const usersInArea = await User.find({ areaId: userAreaId, tenantId }).select("_id");
    const userIdsInArea = usersInArea.map((u) => u._id);

    // Also include users who might have this area resolved via Profile (if we want to be thorough),
    // but for now let's assume if we found the area, other users might have it set or we miss them.
    // Ideally we should find all users where (areaId == userAreaId OR profile.department == area.name).
    // But that's expensive. Let's stick to areaId for now, assuming if we fix one we fix others or they are set.
    // Wait, if THIS user didn't have areaId, others might not either.
    // We should find users by Profile Department too if we want to be correct.

    const areaName = (await Area.findById(userAreaId))?.name;
    let extraUserIds: any[] = [];
    if (areaName) {
      const profilesInDept = await EmployeeProfile.find({ tenantId, department: areaName }).select("userId");
      extraUserIds = profilesInDept.map((p) => p.userId);
    }

    const allUserIdsInArea = [...new Set([...userIdsInArea.map((id) => id.toString()), ...extraUserIds.map((id) => id.toString())])];

    const areaVacations = await Vacation.find({
      tenantId,
      userId: { $in: allUserIdsInArea }, // All users in area
      status: { $nin: ["rejected", "cancelled"] },
      endDate: { $gte: searchStart },
      startDate: { $lte: searchEnd },
    }).lean();

    // Calculate daily occupancy
    const occupancyMap: Record<string, number> = {};

    for (const v of areaVacations) {
      let current = new Date(v.startDate < searchStart ? searchStart : v.startDate);
      const end = new Date(v.endDate > searchEnd ? searchEnd : v.endDate);

      while (current <= end) {
        const dateStr = current.toISOString().split("T")[0];
        occupancyMap[dateStr] = (occupancyMap[dateStr] || 0) + 1;
        current.setDate(current.getDate() + 1);
      }
    }

    // Filter dates where occupancy >= limit
    const blockedDates = Object.entries(occupancyMap)
      .filter(([_, count]) => count >= overlapRule.maxSimultaneousUsers)
      .map(([date]) => date);

    console.log(`[Availability] User: ${userId}, Area: ${areaName}, Rule Max: ${overlapRule.maxSimultaneousUsers}`);
    console.log(`[Availability] Found ${areaVacations.length} vacations. Blocked Dates: ${blockedDates.length}`);

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

    const profile = await EmployeeProfile.findOne({ userId, tenantId });

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

    let userAreaId = user.areaId;
    if (!userAreaId) {
      if (profile && profile.department) {
        const area = await Area.findOne({ tenantId, name: profile.department });
        if (area) {
          userAreaId = area._id as any;
        }
      }
    }

    if (userAreaId) {
      const overlapRule = await VacationOverlap.findOne({
        tenantId,
        areaId: userAreaId,
        isActive: true,
      });

      if (overlapRule) {
        // Safe check for area name
        let areaName: string | undefined;
        try {
          const area = await Area.findById(userAreaId);
          areaName = area?.name;
        } catch (err) {
          console.warn("Could not find area for overlap check", err);
        }

        const usersInArea = await User.find({ areaId: userAreaId, tenantId }).select("_id");
        const userIdsInArea = usersInArea.map((u) => u._id);

        let extraUserIds: any[] = [];
        if (areaName) {
          const profilesInDept = await EmployeeProfile.find({ tenantId, department: areaName }).select("userId");
          extraUserIds = profilesInDept.map((p) => p.userId);
        }
        const allUserIdsInArea = [...new Set([...userIdsInArea.map((id) => id.toString()), ...extraUserIds.map((id) => id.toString())])];

        const concurrentUsers = await Vacation.find({
          tenantId,
          userId: { $in: allUserIdsInArea, $ne: userId },
          status: { $nin: ["rejected", "cancelled"] },
          $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
        }).distinct("userId");

        if (concurrentUsers.length >= overlapRule.maxSimultaneousUsers) {
          return res.status(400).json({
            error: `No es posible agendar vacaciones. Hay ${concurrentUsers.length} personas de tu área con vacaciones en ese periodo (Límite: ${overlapRule.maxSimultaneousUsers}). Fechas ocupadas: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}`,
          });
        }
      }
    }

    const globalConfig = await GlobalVacationConfig.findOne({ tenantId });

    if (!globalConfig) {
      return res.status(400).json({ error: "No se encontró configuración global de vacaciones para este tenant" });
    }

    // CONSTANTS CALCULATION
    const timeDiff = Math.abs(end.getTime() - start.getTime());
    const daysRequested = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // Inclusive days

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
      comments: reason, // Map 'reason' from body to 'comments' in db
      requiresSignature: globalConfig.requiereFirma,
      rules: {
        diasBeneficio: globalConfig.diasBeneficio,
        maxDiasGozados: globalConfig.maxDiasGozados,
        permiteArrastre: globalConfig.permiteArrastre,
        maxDiasArrastre: globalConfig.maxDiasArrastre,
        vencimientoArrastreDias: globalConfig.vencimientoArrastreDias,

        maxDiasHabiles: globalConfig.maxDiasHabiles,
        anticipacionMinimaDias: globalConfig.anticipacionMinimaDias,
        permiteFraccionadas: globalConfig.permiteFraccionadas,
        requiereFirma: globalConfig.requiereFirma,
        pdfTemplateId: globalConfig.pdfTemplateId,
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

    await ActivityLog.create({
      tenantId,
      userId: vacation.userId,
      action: "vacation_pre_approved",
      description: `Solicitud de vacaciones preaprobada`,
      entityType: "Vacation",
      entityId: vacation._id,
    });

    // Generate PDF
    let templateId = vacation.rules?.pdfTemplateId;

    // Fallback: Try to find default template if not specified in rules
    if (!templateId) {
      const defaultTemplate = await PdfTemplate.findOne({ tenantId, code: "vacaciones", isActive: true });
      if (defaultTemplate) {
        templateId = defaultTemplate._id.toString();
      }
    }

    if (templateId) {
      try {
        const template = await PdfTemplate.findOne({
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

    await ActivityLog.create({
      tenantId,
      userId: vacation.userId,
      action: "vacation_approved",
      description: `Solicitud de vacaciones aprobada`,
      entityType: "Vacation",
      entityId: vacation._id,
    });

    if (requiresSignature) {
      await Notification.create({
        tenantId,
        userId: vacation.userId,
        type: "vacation",
        title: "Documento enviado para firma",
        message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido aprobada. Revisá tu casilla de email para firmar el documento.`,
        linkUrl: `/hr/vacations`,
      });
    } else {
      await Notification.create({
        tenantId,
        userId: vacation.userId,
        type: "vacation",
        title: "Solicitud de vacaciones aprobada",
        message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido aprobada.`,
        linkUrl: `/hr/vacations`,
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

    await ActivityLog.create({
      tenantId,
      userId: vacation.userId,
      action: "vacation_rejected",
      description: `Solicitud de vacaciones rechazada`,
      entityType: "Vacation",
      entityId: vacation._id,
    });

    await Notification.create({
      tenantId,
      userId: vacation.userId,
      type: "vacation",
      title: "Solicitud de Vacaciones Rechazada",
      message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido rechazada.`,
      linkUrl: `/hr/vacations`,
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

    await ActivityLog.create({
      tenantId,
      userId: vacation.userId,
      action: "vacation_cancelled",
      description: `Solicitud de vacaciones cancelada`,
      entityType: "Vacation",
      entityId: vacation._id,
    });

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

    await ActivityLog.create({
      tenantId,
      userId: vacation.userId,
      action: "vacation_delivered",
      description: `Solicitud de vacaciones marcada como entregada`,
      entityType: "Vacation",
      entityId: vacation._id,
    });

    await Notification.create({
      tenantId,
      userId: vacation.userId,
      type: "vacation",
      title: "Vacaciones Confirmadas",
      message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido confirmada y entregada.`,
      linkUrl: `/hr/vacations`,
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

    await ActivityLog.create({
      tenantId,
      userId: vacation.userId,
      action: "vacation_signature_sent",
      description: `Solicitud de vacaciones enviada para firma`,
      entityType: "Vacation",
      entityId: vacation._id,
    });

    await Notification.create({
      tenantId,
      userId: vacation.userId,
      type: "vacation",
      title: "Documento enviado para firma",
      message: `El documento de tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido enviado para firma.`,
      linkUrl: `/hr/vacations`,
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

    await ActivityLog.create({
      tenantId,
      userId: vacation.userId,
      action: "vacation_signature_notified",
      description: `Usuario notificó firma completada`,
      entityType: "Vacation",
      entityId: vacation._id,
    });

    // Notify the approver (Supervisor/Admin)
    const approverId = vacation.approvedBy; // Assuming approvedBy is the admin/manager
    if (approverId) {
      await Notification.create({
        tenantId,
        userId: approverId,
        type: "vacation",
        title: "Firma completada por usuario",
        message: `El usuario ha notificado que completó la firma de la solicitud N°: ${vacation.vacationNumber}. Por favor verificá.`,
        linkUrl: `/hr/vacations?id=${vacation._id}`,
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

    await ActivityLog.create({
      tenantId,
      userId: vacation.userId,
      action: "vacation_signed",
      description: `Solicitud de vacaciones marcada como firmada`,
      entityType: "Vacation",
      entityId: vacation._id,
    });

    // Notify the approver (Supervisor/Admin)
    if (vacation.approvedBy) {
      await Notification.create({
        tenantId,
        userId: vacation.approvedBy,
        type: "vacation",
        title: "Documento firmado por colaborador",
        message: `El colaborador ha confirmado la firma de la solicitud N°: ${vacation.vacationNumber}. Verifique el documento.`,
        linkUrl: `/hr/vacations/${vacation._id}`,
      });
    }

    res.json(vacation);
  } catch (error: any) {
    console.error("Mark signed vacation error:", error);
    res.status(500).json({ error: "Error al marcar como firmada la solicitud de vacaciones" });
  }
});

export const vacationsRoutes = router;
