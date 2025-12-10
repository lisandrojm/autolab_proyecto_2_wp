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

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/vacations - Get all vacation requests
router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const vacations = await Vacation.find({ tenantId })
      .sort({ createdAt: -1 });
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

    const globalConfig = await GlobalVacationConfig.findOne({ tenantId });

    if (!globalConfig) {
      return res.status(400).json({ error: "No se encontró configuración global de vacaciones para este tenant" });
    }

    const vacationData = {
      ...req.body,
      tenantId,
      rules: {
        diasAnuales: globalConfig.diasAnuales,
        diasBeneficio: globalConfig.diasBeneficio,
        antiguedadTramos: globalConfig.antiguedadTramos,
        maxDiasGozados: globalConfig.maxDiasGozados,
        permiteArrastre: globalConfig.permiteArrastre,
        maxDiasArrastre: globalConfig.maxDiasArrastre,
        vencimientoArrastreDias: globalConfig.vencimientoArrastreDias,
        minDiasPorSolicitud: globalConfig.minDiasPorSolicitud,
        maxDiasCorridos: globalConfig.maxDiasCorridos,
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
    res.status(500).json({ error: "Error al crear la solicitud de vacaciones" });
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

    // Generate PDF if rules has template
    if (vacation.rules?.pdfTemplateId) {
      try {
        const template = await PdfTemplate.findOne({
          _id: vacation.rules.pdfTemplateId,
          tenantId,
          isActive: true,
        });

        if (template) {
          const user = vacation.userId as any;
          const tenant = await Tenant.findById(tenantId);
          const tenantName = tenant?.name || tenant?.slug || "Organización";

          const result = await generateVacationPDF(
            vacation as any,
            template,
            user,
            tenantId.toString(),
            tenantName,
            vacation.vacationNumber
          );

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
        linkUrl: `/hr/vacation-requests`,
      });
    } else {
      await Notification.create({
        tenantId,
        userId: vacation.userId,
        type: "vacation",
        title: "Solicitud de vacaciones aprobada",
        message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido aprobada.`,
        linkUrl: `/hr/vacation-requests`,
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
      linkUrl: `/hr/vacation-requests`,
    });

    res.json(vacation);
  } catch (error: any) {
    console.error("Reject vacation error:", error);
    res.status(500).json({ error: "Error al rechazar la solicitud de vacaciones" });
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
      linkUrl: `/hr/vacation-requests`,
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
      linkUrl: `/hr/vacation-requests`,
    });

    res.json(vacation);
  } catch (error: any) {
    console.error("Send signature vacation error:", error);
    res.status(500).json({ error: "Error al enviar para firma la solicitud de vacaciones" });
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

    await Notification.create({
      tenantId,
      userId: vacation.userId,
      type: "vacation",
      title: "Documento firmado confirmado",
      message: `La firma de tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido confirmada.`,
      linkUrl: `/hr/vacation-requests`,
    });

    res.json(vacation);
  } catch (error: any) {
    console.error("Mark signed vacation error:", error);
    res.status(500).json({ error: "Error al marcar como firmada la solicitud de vacaciones" });
  }
});

export const vacationsRoutes = router;
