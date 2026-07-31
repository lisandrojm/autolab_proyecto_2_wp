import { Router } from "express";
import { Info } from "../models/Info.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
const router = Router();
const ESTADO_TYPE = "estado-empleado";
const normalizarNombre = (s) => (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
/**
 * Semilla de `data.orden` para los Estados que ya existían antes de este campo (portada del mapa
 * `ESTADO_ORDER` que tenía hardcodeado el frontend en `EstadoSelect.tsx`). Un estado no reconocido
 * queda en 999 (al final) hasta que alguien lo reordene a mano desde el ABM.
 */
const ORDEN_SEMILLA = {
    "pedido de afip": 0,
    "falta pedido de afip": 0,
    "pedido servicios": 1,
    "envio de documentacion": 2,
    "firma pendiente": 3,
    disponible: 4,
};
const ORDEN_NO_RECONOCIDO = 999;
/**
 * Backfill idempotente: a todo Estado que todavía no tenga `data.orden` (documentos de antes de
 * este campo) le asigna un valor inicial, para no pisar en silencio el orden que el usuario ya
 * conocía por `ESTADO_ORDER`. Se dispara solo (no hace falta correr un script en el VPS), mismo
 * patrón que `ensureContratosBackfilled()` en `routes/contratos.ts`.
 */
async function ensureEstadosOrdenBackfilled() {
    const sinOrden = await Info.find({ type: ESTADO_TYPE, "data.orden": { $exists: false } });
    if (sinOrden.length === 0)
        return;
    const ops = sinOrden.map((estado) => ({
        updateOne: {
            filter: { _id: estado._id },
            update: { $set: { "data.orden": ORDEN_SEMILLA[normalizarNombre(estado.name)] ?? ORDEN_NO_RECONOCIDO } },
        },
    }));
    await Info.bulkWrite(ops);
}
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
        if (type === ESTADO_TYPE) {
            await ensureEstadosOrdenBackfilled();
            const items = await Info.find(filter)
                .sort({ "data.orden": 1, name: 1 })
                .lean();
            res.json(items);
            return;
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
// Los ids de FRAME son bajos; los locales arrancan bien arriba para no pisarlos nunca.
const LOCAL_ESTADO_ID_BASE = 100000;
function parseEstadoBody(body) {
    const name = String(body?.name ?? "").trim();
    if (!name)
        return { error: "El nombre es obligatorio" };
    const color = String(body?.color ?? "").trim();
    if (color && !/^#[0-9a-f]{6}$/i.test(color))
        return { error: "El color debe ser hexadecimal, por ejemplo #16a34a" };
    const contratoFrameIds = Array.isArray(body?.contratoFrameIds) ? body.contratoFrameIds.map((id) => String(id)).filter(Boolean) : [];
    const esImpositivo = body?.esImpositivo === true || body?.esImpositivo === "true";
    // Un estado impositivo sin tipos aplicaría a TODOS y chocaría con cualquier otro impositivo,
    // así que se le exige elegir a cuáles corresponde.
    if (esImpositivo && contratoFrameIds.length === 0) {
        return { error: "Un estado impositivo tiene que indicar a qué tipos de contrato corresponde" };
    }
    // El badge secundario (texto + color) solo tiene sentido para estados impositivos: si se destilda
    // "Estado impositivo" se descarta, para no dejar un badge secundario huérfano configurado.
    const colorEtiquetaSecundaria = String(body?.colorEtiquetaSecundaria ?? "").trim();
    if (colorEtiquetaSecundaria && !/^#[0-9a-f]{6}$/i.test(colorEtiquetaSecundaria))
        return { error: "El color del badge secundario debe ser hexadecimal, por ejemplo #16a34a" };
    const etiquetaSecundaria = esImpositivo ? String(body?.etiquetaSecundaria ?? "").trim() : "";
    return {
        name,
        data: {
            nombre: name,
            color: color || undefined,
            contratoFrameIds,
            esImpositivo,
            etiquetaSecundaria: etiquetaSecundaria || undefined,
            colorEtiquetaSecundaria: esImpositivo ? colorEtiquetaSecundaria || undefined : undefined,
        },
    };
}
/**
 * Cada tipo de contrato puede tener un solo estado impositivo: si otro ya lo tomó, no se puede
 * guardar. Devuelve el mensaje de error, o null si no hay conflicto.
 */
async function conflictoImpositivo(data, excluirId) {
    if (!data?.esImpositivo)
        return null;
    const otros = await Info.find({ type: ESTADO_TYPE, "data.esImpositivo": true, ...(excluirId ? { _id: { $ne: excluirId } } : {}) }).lean();
    const tomados = new Map();
    for (const otro of otros) {
        for (const id of otro.data?.contratoFrameIds || [])
            tomados.set(String(id), otro.name);
    }
    const chocan = (data.contratoFrameIds || []).filter((id) => tomados.has(String(id)));
    if (chocan.length === 0)
        return null;
    const porEstado = [...new Set(chocan.map((id) => tomados.get(String(id))))];
    return `Esos tipos de contrato ya tienen un estado impositivo: ${porEstado.join(", ")}`;
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
        const conflicto = await conflictoImpositivo(parsed.data);
        if (conflicto) {
            res.status(409).json({ error: conflicto });
            return;
        }
        const ultimoLocal = await Info.findOne({ type: ESTADO_TYPE, "data.id": { $gte: LOCAL_ESTADO_ID_BASE } })
            .sort({ "data.id": -1 })
            .lean();
        const nuevoId = Math.max(LOCAL_ESTADO_ID_BASE, Number(ultimoLocal?.data?.id ?? 0) + 1);
        // Nuevo estado al final del orden visual actual (arrastrarlo después es lo que lo reubica).
        const ultimoOrden = await Info.findOne({ type: ESTADO_TYPE }).sort({ "data.orden": -1 }).lean();
        const nuevoOrden = Number(ultimoOrden?.data?.orden ?? -1) + 1;
        const creado = await Info.create({
            type: ESTADO_TYPE,
            externalId: `local-${nuevoId}`,
            name: parsed.name,
            data: { ...parsed.data, id: nuevoId, orden: nuevoOrden },
        });
        res.status(201).json(creado.toObject());
    }
    catch (error) {
        console.error("Create estado error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /info/estados/reorder - guardar el orden visual tras arrastrar en el ABM.
// Tiene que registrarse ANTES de "/estados/:id": si no, Express matchea "reorder" como si fuera
// un :id y este endpoint nunca se alcanza (mismo cuidado que ya toma /shifts/reorder).
router.patch("/estados/reorder", requireTenant, authenticateToken, async (req, res) => {
    try {
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (items.length === 0) {
            res.status(400).json({ error: "Se requiere un array de items" });
            return;
        }
        // `Info` es una colección compartida por varios `type`: hay que confirmar que todos los ids
        // sean Estados de verdad antes de aplicar el bulk, para no corromper documentos de otro tipo.
        const ids = items.map((it) => String(it.id));
        const existentes = await Info.find({ _id: { $in: ids }, type: ESTADO_TYPE }).select("_id").lean();
        if (existentes.length !== ids.length) {
            res.status(400).json({ error: "Alguno de los estados no existe" });
            return;
        }
        const ops = items.map((it) => ({
            updateOne: { filter: { _id: it.id, type: ESTADO_TYPE }, update: { $set: { "data.orden": Number(it.orden) } } },
        }));
        await Info.bulkWrite(ops);
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Reorder estados error:", error);
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
        const conflicto = await conflictoImpositivo(parsed.data, String(estado._id));
        if (conflicto) {
            res.status(409).json({ error: conflicto });
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
