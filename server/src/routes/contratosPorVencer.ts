import { Router } from "express";
import { Types } from "mongoose";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { User } from "../models/User.js";
import { RenovacionContrato } from "../models/RenovacionContrato.js";
import { listarContratosPorVencer } from "../services/contratosPorVencer.js";

/*
  «Por vencer» de Contratación (móvil). Qué contratos entran y quién los ve está en
  `services/contratosPorVencer.ts`; acá sólo se lista y se decide.

  La renovación NO pasa por acá: se pide creando la solicitud de contratación, y el alta anota la
  decisión (ver `POST /users` en `routes/users.ts`), así solicitud y decisión no pueden quedar a medias.
*/
const router = Router();

router.get("/", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const contratos = await listarContratosPorVencer(req.tenantObjectId!, req.user!.userId);
    res.json({ contratos });
  } catch (error) {
    console.error("Contratos por vencer error:", error);
    res.status(500).json({ error: "No se pudieron cargar los contratos por vencer." });
  }
});

// Sólo el número: es el aviso de la tarjeta Contratación del inicio.
router.get("/count", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const contratos = await listarContratosPorVencer(req.tenantObjectId!, req.user!.userId);
    res.json({ count: contratos.length });
  } catch (error) {
    console.error("Contratos por vencer (count) error:", error);
    res.status(500).json({ error: "No se pudieron contar los contratos por vencer." });
  }
});

// No se renueva: el contrato termina en su fecha y sale de la lista.
router.post("/dejar-vencer", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { userProjectId, fechaBajaContrato } = req.body || {};
    if (!userProjectId || !Types.ObjectId.isValid(String(userProjectId)) || !fechaBajaContrato) {
      res.status(400).json({ error: "Falta indicar qué contrato." });
      return;
    }
    // El permiso ES la lista: sólo se decide sobre un contrato que hoy le aparece a quien decide.
    const lista = await listarContratosPorVencer(req.tenantObjectId!, req.user!.userId);
    const contrato = lista.find((c) => c.userProjectId === String(userProjectId) && c.fechaBaja === String(fechaBajaContrato));
    if (!contrato) {
      res.status(404).json({ error: "Ese contrato ya no está por vencer o no está a tu cargo." });
      return;
    }

    const quien: any = await User.findById(req.user!.userId).select("firstName lastName").lean();
    await RenovacionContrato.updateOne(
      { tenantId: req.tenantObjectId, userProjectId: new Types.ObjectId(contrato.userProjectId), fechaBajaContrato: contrato.fechaBaja },
      {
        $set: {
          userId: new Types.ObjectId(contrato.userId),
          projectId: new Types.ObjectId(contrato.projectId),
          decision: "dejar_vencer",
          decididoPor: new Types.ObjectId(req.user!.userId),
          decididoPorNombre: `${quien?.firstName || ""} ${quien?.lastName || ""}`.trim(),
          decididoEl: new Date(),
        },
        $unset: { solicitudId: "" },
      },
      { upsert: true },
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Dejar vencer contrato error:", error);
    res.status(500).json({ error: "No se pudo guardar la decisión." });
  }
});

export { router as contratosPorVencerRoutes };
