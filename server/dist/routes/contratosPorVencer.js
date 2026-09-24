import { Router } from "express";
import { Types } from "mongoose";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { User } from "../models/User.js";
import { RenovacionContrato } from "../models/RenovacionContrato.js";
import { calificarFinDeContrato, leerCalificacion } from "../services/calificaciones.js";
import { DIAS_DE_AVISO, DIAS_DE_AVISO_MAX, listarContratosPorVencer, olvidarContratosPorVencer } from "../services/contratosPorVencer.js";
/*
  «Por vencer» de Contratación (móvil). Qué contratos entran y quién los ve está en
  `services/contratosPorVencer.ts`; acá sólo se lista y se decide.

  La renovación NO pasa por acá: se pide creando la solicitud de contratación, y el alta anota la
  decisión (ver `POST /users` en `routes/users.ts`), así solicitud y decisión no pueden quedar a medias.

  CALIFICACIÓN: al decidir, se califica la actuación de la persona en ese contrato (ver
  `models/Calificacion.ts`). «Dejar vencer» la trae en el mismo pedido; «Renovar» la manda antes de abrir
  el formulario, por `/calificar`.
*/
const router = Router();
router.get("/", requireTenant, authenticateToken, async (req, res) => {
    try {
        // `dias`: con cuánta anticipación se quieren ver (el filtro del móvil). Fuera de rango, la de siempre.
        const pedidos = Number(req.query.dias);
        const dias = Number.isInteger(pedidos) && pedidos >= 1 && pedidos <= DIAS_DE_AVISO_MAX ? pedidos : DIAS_DE_AVISO;
        const contratos = await listarContratosPorVencer(req.tenantObjectId, req.user.userId, undefined, dias);
        res.json({ contratos, dias });
    }
    catch (error) {
        console.error("Contratos por vencer error:", error);
        res.status(500).json({ error: "No se pudieron cargar los contratos por vencer." });
    }
});
// Sólo el número: es el aviso de la tarjeta Contratación del inicio.
router.get("/count", requireTenant, authenticateToken, async (req, res) => {
    try {
        const contratos = await listarContratosPorVencer(req.tenantObjectId, req.user.userId);
        res.json({ count: contratos.length });
    }
    catch (error) {
        console.error("Contratos por vencer (count) error:", error);
        res.status(500).json({ error: "No se pudieron contar los contratos por vencer." });
    }
});
// No se renueva: el contrato termina en su fecha y sale de la lista.
router.post("/dejar-vencer", requireTenant, authenticateToken, async (req, res) => {
    try {
        const { userProjectId, fechaBajaContrato } = req.body || {};
        if (!userProjectId || !Types.ObjectId.isValid(String(userProjectId)) || !fechaBajaContrato) {
            res.status(400).json({ error: "Falta indicar qué contrato." });
            return;
        }
        // La calificación es obligatoria: se decide Y se califica.
        const calificacion = leerCalificacion(req.body);
        if ("error" in calificacion) {
            res.status(400).json({ error: calificacion.error });
            return;
        }
        // El permiso ES la lista: sólo se decide sobre un contrato que hoy le aparece a quien decide.
        const lista = await listarContratosPorVencer(req.tenantObjectId, req.user.userId);
        const contrato = lista.find((c) => c.userProjectId === String(userProjectId) && c.fechaBaja === String(fechaBajaContrato));
        if (!contrato) {
            res.status(404).json({ error: "Ese contrato ya no está por vencer o no está a tu cargo." });
            return;
        }
        const quien = await User.findById(req.user.userId).select("firstName lastName").lean();
        await RenovacionContrato.updateOne({ tenantId: req.tenantObjectId, userProjectId: new Types.ObjectId(contrato.userProjectId), fechaBajaContrato: contrato.fechaBaja }, {
            $set: {
                userId: new Types.ObjectId(contrato.userId),
                projectId: new Types.ObjectId(contrato.projectId),
                decision: "dejar_vencer",
                decididoPor: new Types.ObjectId(req.user.userId),
                decididoPorNombre: `${quien?.firstName || ""} ${quien?.lastName || ""}`.trim(),
                decididoEl: new Date(),
            },
            $unset: { solicitudId: "" },
        }, { upsert: true });
        await calificarFinDeContrato({ tenantId: req.tenantObjectId, contrato, ...calificacion, decision: "dejar_vencer", calificadoPor: req.user.userId });
        // La decisión cambia la lista de todos los que ven ese contrato, no sólo la de quien decidió.
        olvidarContratosPorVencer();
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Dejar vencer contrato error:", error);
        res.status(500).json({ error: "No se pudo guardar la decisión." });
    }
});
/*
  Calificar al RENOVAR. Va antes de abrir el formulario de renovación, que es otro pedido (`POST /users`).
  Si el formulario se cierra sin mandar, el contrato sigue en la lista y la próxima vez se corrige esta
  misma calificación en lugar de sumar otra (una por contrato).
*/
router.post("/calificar", requireTenant, authenticateToken, async (req, res) => {
    try {
        const { userProjectId, fechaBajaContrato } = req.body || {};
        const calificacion = leerCalificacion(req.body);
        if ("error" in calificacion) {
            res.status(400).json({ error: calificacion.error });
            return;
        }
        // Mismo control que al dejar vencer: sólo sobre un contrato que hoy le aparece a quien califica.
        const lista = await listarContratosPorVencer(req.tenantObjectId, req.user.userId);
        const contrato = lista.find((c) => c.userProjectId === String(userProjectId) && c.fechaBaja === String(fechaBajaContrato));
        if (!contrato) {
            res.status(404).json({ error: "Ese contrato ya no está por vencer o no está a tu cargo." });
            return;
        }
        await calificarFinDeContrato({ tenantId: req.tenantObjectId, contrato, ...calificacion, decision: "renovar", calificadoPor: req.user.userId });
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Calificar contrato por vencer error:", error);
        res.status(500).json({ error: "No se pudo guardar la calificación." });
    }
});
export { router as contratosPorVencerRoutes };
