import { Router } from "express";
import { RegistroLink } from "../models/RegistroLink.js";
import { Client } from "../models/Client.js";
import { User } from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdOrNull } from "../utils/mongoIds.js";
const router = Router();
// GET /registro-links - Listar links de registro del tenant (activos y revocados)
router.get("/", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const tenantId = toObjectIdOrNull(req.tenantObjectId);
        if (!tenantId) {
            res.status(400).json({ error: "Invalid tenant ID" });
            return;
        }
        const links = await RegistroLink.find({ tenantId }).sort({ createdAt: -1 }).lean();
        // Etiquetas de cliente y creador
        const clientIds = [...new Set(links.filter((l) => l.clientId).map((l) => String(l.clientId)))];
        const createdByIds = [...new Set(links.filter((l) => l.createdBy).map((l) => String(l.createdBy)))];
        const [clients, users] = await Promise.all([
            clientIds.length ? Client.find({ _id: { $in: clientIds } }).select("name").lean() : Promise.resolve([]),
            createdByIds.length ? User.find({ _id: { $in: createdByIds } }).select("firstName lastName email").lean() : Promise.resolve([]),
        ]);
        const clientMap = new Map(clients.map((c) => [String(c._id), c.name]));
        const userMap = new Map(users.map((u) => [String(u._id), [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email]));
        const result = links.map((l) => ({
            _id: String(l._id),
            token: l.token,
            clientId: l.clientId ? String(l.clientId) : null,
            clientName: l.clientId ? clientMap.get(String(l.clientId)) || null : null,
            label: l.label || null,
            active: l.active,
            usageCount: l.usageCount,
            lastUsedAt: l.lastUsedAt || null,
            createdAt: l.createdAt,
            createdByName: l.createdBy ? userMap.get(String(l.createdBy)) || null : null,
        }));
        res.json({ links: result });
    }
    catch (error) {
        console.error("Get registro-links error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /registro-links/:id/revoke - Revocar (desactivar) un link
router.patch("/:id/revoke", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const tenantId = toObjectIdOrNull(req.tenantObjectId);
        if (!tenantId) {
            res.status(400).json({ error: "Invalid tenant ID" });
            return;
        }
        const link = await RegistroLink.findOneAndUpdate({ _id: req.params.id, tenantId }, { $set: { active: false } }, { new: true });
        if (!link) {
            res.status(404).json({ error: "Link no encontrado" });
            return;
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error("Revoke registro-link error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /registro-links/:id - Eliminar un link
router.delete("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const tenantId = toObjectIdOrNull(req.tenantObjectId);
        if (!tenantId) {
            res.status(400).json({ error: "Invalid tenant ID" });
            return;
        }
        const link = await RegistroLink.findOneAndDelete({ _id: req.params.id, tenantId });
        if (!link) {
            res.status(404).json({ error: "Link no encontrado" });
            return;
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error("Delete registro-link error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as registroLinkRoutes };
