import { Router } from "express";
import { Types } from "mongoose";
import { Notification } from "../models/Notification.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
const router = Router();
router.use(requireTenant, authenticateToken);
router.get("/", async (req, res) => {
    try {
        const userId = req.user.userId;
        const notifications = await Notification.find({
            tenantId: req.tenantObjectId,
            userId,
        }).sort({ createdAt: -1 });
        res.json(notifications);
    }
    catch (error) {
        console.error("Get notifications error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get("/unread", async (req, res) => {
    try {
        const userId = req.user.userId;
        const notifications = await Notification.find({
            tenantId: req.tenantObjectId,
            userId,
            isRead: false,
        }).sort({ createdAt: -1 });
        res.json(notifications);
    }
    catch (error) {
        console.error("Get unread notifications error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get("/count", async (req, res) => {
    try {
        const userId = req.user.userId;
        const count = await Notification.countDocuments({
            tenantId: req.tenantObjectId,
            userId,
            isRead: false,
        });
        res.json({ count });
    }
    catch (error) {
        console.error("Get notification count error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/*
  LAS NO LEÍDAS, CONTADAS POR TIPO.

  El inicio de la app muestra un número en cada tarjeta —cuántos registros nuevos, cuántas solicitudes
  nuevas—: con `/count` habría que traer todas las notificaciones y contarlas en el teléfono, o pegarle
  una vez por tarjeta. Esto lo resuelve el server en una consulta.
*/
router.get("/counts", async (req, res) => {
    try {
        const filas = await Notification.aggregate([
            { $match: { tenantId: req.tenantObjectId, userId: new Types.ObjectId(String(req.user.userId)), isRead: false } },
            { $group: { _id: "$type", count: { $sum: 1 } } },
        ]);
        const porTipo = {};
        filas.forEach((f) => {
            porTipo[String(f._id)] = f.count;
        });
        res.json({ total: filas.reduce((a, f) => a + f.count, 0), porTipo });
    }
    catch (error) {
        console.error("Get notification counts error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/*
  VOLVER A DEJARLA NO LEÍDA.

  Es la contraparte de marcar leída, y hace falta por lo mismo que en el mail: se abre una notificación
  sin tiempo de resolverla y hay que poder dejarla marcada como pendiente. Borra también `readAt`: un
  "leída el..." sobre algo que figura como no leído es un dato que se contradice solo.
*/
router.put("/:id/unread", async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantObjectId, userId: req.user.userId }, { $set: { isRead: false }, $unset: { readAt: "" } }, { new: true });
        if (!notification) {
            res.status(404).json({ error: "Notification not found" });
            return;
        }
        res.json(notification);
    }
    catch (error) {
        console.error("Mark notification unread error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.put("/:id/read", async (req, res) => {
    try {
        const userId = req.user.userId;
        const notification = await Notification.findOneAndUpdate({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
            userId,
        }, {
            $set: {
                isRead: true,
                readAt: new Date(),
            },
        }, { new: true });
        if (!notification) {
            res.status(404).json({ error: "Notification not found" });
            return;
        }
        res.json(notification);
    }
    catch (error) {
        console.error("Mark notification read error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.put("/read-all", async (req, res) => {
    try {
        const userId = req.user.userId;
        /*
          MARCAR LEÍDO: TODO, UNA FAMILIA, O LO DE UNA FILA.
    
          `types` limita a una familia —«leí los registros nuevos» no es «leí todo»—, y varios tipos entran
          en una sola llamada porque una tarjeta de la app puede juntar más de uno: en Contratación van las
          solicitudes nuevas y las decisiones sobre las propias, y marcarlas de a una dejaría el número a
          medio bajar.
    
          `refIds` limita a de quién habla el aviso: es «marcar leído ESTE registro» desde su fila de la
          lista, sin tocar los demás. Los dos filtros se combinan; sin ninguno, marca todo lo no leído.
        */
        const cuerpo = req.body || {};
        const lista = (uno, varios) => [...new Set([uno, ...(Array.isArray(varios) ? varios : [])].map((x) => String(x || "").trim()).filter(Boolean))];
        const tipos = lista(cuerpo.type, cuerpo.types);
        const refs = lista(cuerpo.refId, cuerpo.refIds).filter((id) => Types.ObjectId.isValid(id));
        const result = await Notification.updateMany({
            tenantId: req.tenantObjectId,
            userId,
            isRead: false,
            ...(tipos.length > 0 ? { type: { $in: tipos } } : {}),
            ...(refs.length > 0 ? { refId: { $in: refs.map((id) => new Types.ObjectId(id)) } } : {}),
        }, {
            $set: {
                isRead: true,
                readAt: new Date(),
            },
        });
        res.json({ message: "All notifications marked as read", count: result.modifiedCount });
    }
    catch (error) {
        console.error("Mark all read error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.user.userId;
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
            userId,
        });
        if (!notification) {
            res.status(404).json({ error: "Notification not found" });
            return;
        }
        res.json({ message: "Notification deleted successfully" });
    }
    catch (error) {
        console.error("Delete notification error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as notificationRoutes };
