import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Types } from "mongoose";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { LoteRecibosSueldo } from "../models/LoteRecibosSueldo.js";
import { User } from "../models/User.js";
import { normalizarCuit } from "../utils/constanciaPdf.js";
import { ErrorRecibos, procesarVarios, asignarPersona, eliminarLote, enviarAFirmar, exportacionDelLote, procesarSabana, releerRecibo } from "../services/recibosSueldo.js";
/**
 * /api/v1/recibos-sueldo — el módulo Recibos de sueldo (ver `services/recibosSueldo.ts`).
 * Mismo permiso que Contratos: es una etapa más del circuito de firma.
 */
export const recibosSueldoRoutes = Router();
recibosSueldoRoutes.use(requireTenant, authenticateToken, requirePermission("admin_contracts:view"));
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    // La sábana PDF y, opcional, el TXT que MEMOSOFT exporta con ella.
    fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf" || /\.(pdf|txt)$/i.test(file.originalname) || file.mimetype === "text/plain"),
});
const SIN_TEXTO = "-recibos.textoCrudo";
const responderError = (res, e, contexto) => {
    if (e instanceof ErrorRecibos)
        return res.status(e.status).json({ error: e.message });
    if (e instanceof z.ZodError)
        return res.status(400).json({ error: "Datos inválidos", details: e.errors });
    console.error(`[RECIBOS-SUELDO] ${contexto}:`, e);
    return res.status(500).json({ error: "Internal server error" });
};
async function loteDe(req, conTexto = false) {
    if (!Types.ObjectId.isValid(req.params.id))
        throw new ErrorRecibos("Lote no encontrado.", 404);
    const q = LoteRecibosSueldo.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    const lote = await (conTexto ? q : q.select(SIN_TEXTO));
    if (!lote)
        throw new ErrorRecibos("Lote no encontrado.", 404);
    return lote;
}
// POST /lotes — subir la sábana (`archivo`) y, si se tiene, el TXT de MEMOSOFT (`txt`): con el TXT los datos salen de ahí, sin OCR.
// `paginasPorRecibo` (default 2) es la pista para partir la sábana por OCR cuando el texto no alcanza.
recibosSueldoRoutes.post("/lotes", upload.fields([{ name: "archivo", maxCount: 1 }, { name: "txt", maxCount: 1 }]), async (req, res) => {
    try {
        const archivos = (req.files || {});
        const pdf = archivos.archivo?.[0];
        const txt = archivos.txt?.[0];
        if (!pdf || !/\.pdf$/i.test(pdf.originalname))
            throw new ErrorRecibos("Subí el PDF con los recibos.");
        if (txt && !/\.txt$/i.test(txt.originalname))
            throw new ErrorRecibos("El segundo archivo tiene que ser el TXT de los recibos.");
        const paginasPorRecibo = Math.min(10, Math.max(1, Number(req.body?.paginasPorRecibo) || 2));
        const lote = await procesarSabana(req.tenantObjectId, req.user?.userId, pdf.originalname, pdf.buffer, paginasPorRecibo, txt ? { nombre: txt.originalname, buffer: txt.buffer } : undefined);
        res.status(201).json(await LoteRecibosSueldo.findById(lote._id).select(SIN_TEXTO).lean());
    }
    catch (e) {
        responderError(res, e, "subir");
    }
});
// POST /lotes/masivo — todas las sábanas PDF y sus TXT de una vez (`archivos`): un lote por cada PDF que tenga su TXT.
recibosSueldoRoutes.post("/lotes/masivo", upload.array("archivos", 60), async (req, res) => {
    try {
        // Multer entrega el nombre en Latin-1 (las tildes llegan rotas): se pasa a UTF-8 si eso da un texto válido.
        const nombreDe = (n) => {
            const utf8 = Buffer.from(n, "latin1").toString("utf8");
            return utf8.includes("\uFFFD") ? n : utf8;
        };
        const archivos = (req.files || []).map((f) => ({ nombre: nombreDe(f.originalname), buffer: f.buffer }));
        if (archivos.length === 0)
            throw new ErrorRecibos("Elegí las sábanas PDF y sus TXT.");
        const paginasPorRecibo = Math.min(10, Math.max(1, Number(req.body?.paginasPorRecibo) || 2));
        res.status(201).json(await procesarVarios(req.tenantObjectId, req.user?.userId, archivos, paginasPorRecibo));
    }
    catch (e) {
        responderError(res, e, "subir varios");
    }
});
// GET /lotes — los lotes del tenant, más nuevos primero, con el resumen de cada uno.
recibosSueldoRoutes.get("/lotes", async (req, res) => {
    try {
        const lotes = await LoteRecibosSueldo.find({ tenantId: req.tenantObjectId }).select("-recibos.textoCrudo").sort({ createdAt: -1 }).limit(50).lean();
        res.json(lotes.map((l) => ({
            ...l,
            resumen: {
                total: l.recibos.length,
                listos: l.recibos.filter((r) => r.estado === "listo").length,
                sinPersona: l.recibos.filter((r) => r.estado === "sin_persona").length,
                enviados: l.recibos.filter((r) => r.estado === "enviado").length,
                firmados: l.recibos.filter((r) => r.estado === "firmado").length,
            },
        })));
    }
    catch (e) {
        responderError(res, e, "listar");
    }
});
recibosSueldoRoutes.get("/lotes/:id", async (req, res) => {
    try {
        res.json(await loteDe(req));
    }
    catch (e) {
        responderError(res, e, "ver");
    }
});
// GET /lotes/:id/exportacion — todo lo leído (con el texto crudo), como JSON para descargar.
recibosSueldoRoutes.get("/lotes/:id/exportacion", async (req, res) => {
    try {
        const lote = await loteDe(req, true);
        res.setHeader("Content-Disposition", `attachment; filename="recibos-${lote.periodo || String(lote._id)}.json"`);
        res.json(exportacionDelLote(lote));
    }
    catch (e) {
        responderError(res, e, "exportar");
    }
});
// GET /lotes/:id/recibos/:rid/texto — el texto crudo de un recibo, para verlo en pantalla.
recibosSueldoRoutes.get("/lotes/:id/recibos/:rid/texto", async (req, res) => {
    try {
        const lote = await loteDe(req, true);
        const r = lote.recibos.id(req.params.rid);
        if (!r)
            throw new ErrorRecibos("Recibo no encontrado.", 404);
        res.json({ texto: r.textoCrudo || "" });
    }
    catch (e) {
        responderError(res, e, "texto");
    }
});
// POST /lotes/:id/recibos/:rid/releer — volver a pasar el PDF de ese recibo por OCR (a más resolución) y releer sus datos.
recibosSueldoRoutes.post("/lotes/:id/recibos/:rid/releer", async (req, res) => {
    try {
        const lote = await loteDe(req);
        await releerRecibo(lote, req.params.rid);
        res.json(await LoteRecibosSueldo.findById(lote._id).select(SIN_TEXTO).lean());
    }
    catch (e) {
        responderError(res, e, "releer");
    }
});
// PATCH /lotes/:id/recibos/:rid/persona { userId } — elegir a mano la persona de un recibo.
recibosSueldoRoutes.patch("/lotes/:id/recibos/:rid/persona", async (req, res) => {
    try {
        const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body);
        const lote = await loteDe(req);
        await asignarPersona(lote, req.params.rid, userId);
        res.json(lote);
    }
    catch (e) {
        responderError(res, e, "asignar persona");
    }
});
// POST /lotes/:id/enviar { reciboIds? } — manda al Outbox los recibos listos (los tildados, o todos).
recibosSueldoRoutes.post("/lotes/:id/enviar", async (req, res) => {
    try {
        const { reciboIds } = z.object({ reciboIds: z.array(z.string()).max(2000).optional() }).parse(req.body || {});
        const lote = await loteDe(req);
        const r = await enviarAFirmar(lote, reciboIds);
        res.json({ ...r, lote });
    }
    catch (e) {
        responderError(res, e, "enviar");
    }
});
recibosSueldoRoutes.delete("/lotes/:id", async (req, res) => {
    try {
        const lote = await loteDe(req);
        if (lote.estadoLote === "leyendo")
            throw new ErrorRecibos("El lote todavía se está leyendo: esperá a que termine.", 409);
        await eliminarLote(lote);
        res.json({ ok: true });
    }
    catch (e) {
        responderError(res, e, "eliminar");
    }
});
// GET /personas?q= — buscar a quién asignar un recibo: por nombre, email o CUIL.
recibosSueldoRoutes.get("/personas", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        if (q.length < 2)
            return res.json([]);
        const cuil = normalizarCuit(q);
        const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        const filtro = { tenantId: req.tenantObjectId, "metadata.isSolicitud": { $ne: true } };
        filtro.$or = cuil ? [{ "metadata.cuit": new RegExp(cuil.replace(/(\d{2})(\d{8})(\d)/, "$1-?$2-?$3")) }] : [{ firstName: re }, { lastName: re }, { email: re }, { "metadata.cuit": re }];
        const usuarios = await User.find(filtro).select("firstName lastName email metadata.cuit").limit(15).lean();
        res.json(usuarios.map((u) => ({ _id: String(u._id), nombre: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email, email: u.email, cuil: normalizarCuit(u.metadata?.cuit) })));
    }
    catch (e) {
        responderError(res, e, "buscar personas");
    }
});
