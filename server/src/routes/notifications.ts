import { Router } from "express";
import { Types } from "mongoose";
import { Notification } from "../models/Notification.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.use(requireTenant, authenticateToken);

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const notifications = await Notification.find({
      tenantId: req.tenantObjectId,
      userId,
    }).sort({ createdAt: -1 });

    res.json(notifications);
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/unread", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const notifications = await Notification.find({
      tenantId: req.tenantObjectId,
      userId,
      isRead: false,
    }).sort({ createdAt: -1 });

    res.json(notifications);
  } catch (error) {
    console.error("Get unread notifications error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/count", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const count = await Notification.countDocuments({
      tenantId: req.tenantObjectId,
      userId,
      isRead: false,
    });

    res.json({ count });
  } catch (error) {
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
router.get("/counts", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const filas = await Notification.aggregate([
      { $match: { tenantId: req.tenantObjectId, userId: new Types.ObjectId(String(req.user!.userId)), isRead: false } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]);
    const porTipo: Record<string, number> = {};
    filas.forEach((f: any) => {
      porTipo[String(f._id)] = f.count;
    });
    res.json({ total: filas.reduce((a: number, f: any) => a + f.count, 0), porTipo });
  } catch (error) {
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
router.put("/:id/unread", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantObjectId, userId: req.user!.userId },
      { $set: { isRead: false }, $unset: { readAt: "" } },
      { new: true },
    );

    if (!notification) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json(notification);
  } catch (error) {
    console.error("Mark notification unread error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id/read", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        tenantId: req.tenantObjectId,
        userId,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
      { new: true }
    );

    if (!notification) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json(notification);
  } catch (error) {
    console.error("Mark notification read error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/read-all", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    /*
      Con `type` (o `types`) marca sólo esa familia: «leí los registros nuevos» no es «leí todo».
      Varios tipos en una sola llamada porque una tarjeta de la app puede juntar más de uno: en
      Contratación entran las solicitudes nuevas y las decisiones sobre las propias, y para quien
      mira son todas «lo nuevo de contratación»: marcarlas de a una dejaría el número a medio bajar.
    */
    const cuerpo: any = req.body || {};
    const tipos = [...new Set([cuerpo.type, ...(Array.isArray(cuerpo.types) ? cuerpo.types : [])].map((t) => String(t || "").trim()).filter(Boolean))];
    const result = await Notification.updateMany(
      {
        tenantId: req.tenantObjectId,
        userId,
        isRead: false,
        ...(tipos.length > 0 ? { type: { $in: tipos } } : {}),
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    res.json({ message: "All notifications marked as read", count: result.modifiedCount });
  } catch (error) {
    console.error("Mark all read error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

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
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as notificationRoutes };
