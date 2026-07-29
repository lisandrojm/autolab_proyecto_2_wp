import { Router } from "express";
import { Info } from "../models/Info.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
const router = Router();
/**
 * GET /api/v1/info
 * Query: ?type=sede
 */
router.get("/", requireTenant, authenticateToken, async (req, res) => {
    try {
        const { type } = req.query;
        const filter = {};
        if (type) {
            filter.type = type;
        }
        const items = await Info.find(filter).sort({ name: 1 }).lean();
        res.json(items);
    }
    catch (error) {
        console.error("Get info error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/* ------------------------------- ABM de Estados -------------------------------
 * Los estados del contrato son `infos` con type "estado-empleado" (los sincroniza FRAME).
 * El ABM de Configuración agrega los campos propios en `data`: color del badge, tipos de
 * contrato en los que se ofrece y el nombre que lleva dentro del contrato.
 * Los contratos guardan `estado_id` (data.id numérico), así que a los estados creados a mano
 * hay que darles un id que no colisione con los de FRAME.
 */
const ESTADO_TYPE = "estado-empleado";
// Los ids de FRAME son bajos; los locales arrancan bien arriba para no pisarlos nunca.
const LOCAL_ESTADO_ID_BASE = 100000;
const normalizarNombre = (s) => (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
/** "Activo"/"Inactivo" chocan con el estado del usuario: dentro del contrato deben llamarse distinto. */
const requiereNombreEnContrato = (name) => ["activo", "inactivo"].includes(normalizarNombre(name));
function parseEstadoBody(body) {
    const name = String(body?.name ?? "").trim();
    if (!name)
        return { error: "El nombre es obligatorio" };
    const nombreEnContrato = String(body?.nombreEnContrato ?? "").trim();
    if (requiereNombreEnContrato(name) && !nombreEnContrato) {
        return { error: `El estado "${name}" necesita un nombre distinto dentro del contrato para no confundirse con el estado del usuario` };
    }
    const color = String(body?.color ?? "").trim();
    if (color && !/^#[0-9a-f]{6}$/i.test(color))
        return { error: "El color debe ser hexadecimal, por ejemplo #16a34a" };
    const contratoFrameIds = Array.isArray(body?.contratoFrameIds) ? body.contratoFrameIds.map((id) => String(id)).filter(Boolean) : [];
    return { name, data: { nombre: name, color: color || undefined, nombreEnContrato: nombreEnContrato || undefined, contratoFrameIds } };
}
// POST /info/estados - crear estado
router.post("/estados", requireTenant, authenticateToken, async (req, res) => {
    try {
        const parsed = parseEstadoBody(req.body);
        if (parsed.error) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        const existente = await Info.findOne({ type: ESTADO_TYPE, name: parsed.name }).lean();
        if (existente) {
            res.status(409).json({ error: "Ya existe un estado con ese nombre" });
            return;
        }
        const ultimoLocal = await Info.findOne({ type: ESTADO_TYPE, "data.id": { $gte: LOCAL_ESTADO_ID_BASE } })
            .sort({ "data.id": -1 })
            .lean();
        const nuevoId = Math.max(LOCAL_ESTADO_ID_BASE, Number(ultimoLocal?.data?.id ?? 0) + 1);
        const creado = await Info.create({
            type: ESTADO_TYPE,
            externalId: `local-${nuevoId}`,
            name: parsed.name,
            data: { ...parsed.data, id: nuevoId },
        });
        res.status(201).json(creado.toObject());
    }
    catch (error) {
        console.error("Create estado error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /info/estados/:id - editar estado
router.patch("/estados/:id", requireTenant, authenticateToken, async (req, res) => {
    try {
        const parsed = parseEstadoBody(req.body);
        if (parsed.error) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        const estado = await Info.findOne({ _id: req.params.id, type: ESTADO_TYPE });
        if (!estado) {
            res.status(404).json({ error: "Estado no encontrado" });
            return;
        }
        const duplicado = await Info.findOne({ type: ESTADO_TYPE, name: parsed.name, _id: { $ne: estado._id } }).lean();
        if (duplicado) {
            res.status(409).json({ error: "Ya existe un estado con ese nombre" });
            return;
        }
        // Se preserva `data.id`: es lo que referencian los contratos ya guardados (estado_id).
        estado.name = parsed.name;
        estado.data = { ...(estado.data || {}), ...parsed.data, id: estado.data?.id };
        await estado.save();
        res.json(estado.toObject());
    }
    catch (error) {
        console.error("Update estado error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /info/estados/:id
router.delete("/estados/:id", requireTenant, authenticateToken, async (req, res) => {
    try {
        const borrado = await Info.findOneAndDelete({ _id: req.params.id, type: ESTADO_TYPE }).lean();
        if (!borrado) {
            res.status(404).json({ error: "Estado no encontrado" });
            return;
        }
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Delete estado error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as infoRoutes };
