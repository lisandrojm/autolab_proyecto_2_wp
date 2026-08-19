import { Router } from "express";
import multer from "multer";
import PizZip from "pizzip";
import { Tenant } from "../models/Tenant.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { encryptSecret } from "../utils/secretCrypto.js";
import { getTenantDropboxConfig, verifyAccount, listFolder, getTemporaryLink, downloadFileContent, uploadFile, deleteEntry, moveEntry, createFolder, clearTenantToken, isWithinRoot, } from "../services/dropboxService.js";
import { escanearTenantAhora, getEscaneoConfig, setEscaneoIntervalo, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES } from "../services/estadoDropboxCronService.js";
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
// Límites de la descarga masiva (ZIP): evitan saturar la memoria del server.
const ZIP_MAX_FILES = 50;
const ZIP_MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200 MB descomprimidos
router.use(requireTenant, authenticateToken);
const isAdmin = (req) => (req.user?.roles || []).some((r) => ["admin", "superadmin"].includes(r.toLowerCase()));
// Traduce errores de Dropbox a algo legible (cubre errores RPC y de OAuth).
function dropboxError(res, error) {
    const dbx = error?.response?.data;
    const oauth = dbx?.error_description || (typeof dbx?.error === "string" ? dbx.error : "");
    const summary = dbx?.error_summary || oauth || (typeof dbx === "string" ? dbx : "") || error?.message || "Error de Dropbox";
    // Pista para el error más común: pegar un access token en vez de un refresh token.
    const hint = oauth === "invalid_grant" ? " (¿el refresh token es válido y de tipo offline? no un access token)" : oauth === "invalid_client" ? " (revisá App key / App secret)" : "";
    console.error("[Dropbox]", summary, JSON.stringify(dbx || {}));
    res.status(400).json({ error: `Dropbox: ${summary}${hint}` });
}
// GET /dropbox/status - ¿está conectado este tenant?
router.get("/status", async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.tenantObjectId).lean();
        const d = tenant?.integrations?.dropbox;
        const connected = !!(d?.appKey && d?.appSecretEnc && d?.refreshTokenEnc);
        res.json({
            connected,
            rootPath: d?.rootPath || "/HelloSign",
            accountEmail: d?.accountEmail || null,
            connectedAt: d?.connectedAt || null,
            canManageConnection: isAdmin(req),
        });
    }
    catch (error) {
        console.error("Dropbox status error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /dropbox/connect - guarda credenciales (solo admin), validándolas contra Dropbox
router.post("/connect", async (req, res) => {
    try {
        if (!isAdmin(req)) {
            res.status(403).json({ error: "Solo un administrador puede conectar Dropbox." });
            return;
        }
        const { appKey, appSecret, refreshToken, rootPath } = req.body || {};
        if (!appKey || !appSecret || !refreshToken) {
            res.status(400).json({ error: "Faltan credenciales: appKey, appSecret y refreshToken son obligatorios." });
            return;
        }
        let root = String(rootPath || "/HelloSign").trim();
        if (!root.startsWith("/"))
            root = "/" + root;
        if (root.length > 1 && root.endsWith("/"))
            root = root.slice(0, -1);
        // Validar contra Dropbox antes de guardar.
        const cfg = { appKey: String(appKey), appSecret: String(appSecret), refreshToken: String(refreshToken), rootPath: root };
        let account;
        try {
            account = await verifyAccount(String(req.tenantObjectId), cfg);
        }
        catch (e) {
            dropboxError(res, e);
            return;
        }
        await Tenant.updateOne({ _id: req.tenantObjectId }, {
            $set: {
                "integrations.dropbox.appKey": String(appKey),
                "integrations.dropbox.appSecretEnc": encryptSecret(String(appSecret)),
                "integrations.dropbox.refreshTokenEnc": encryptSecret(String(refreshToken)),
                "integrations.dropbox.rootPath": root,
                "integrations.dropbox.accountEmail": account.email || null,
                "integrations.dropbox.connectedAt": new Date(),
            },
        });
        clearTenantToken(String(req.tenantObjectId));
        res.json({ connected: true, rootPath: root, accountEmail: account.email || null, connectedAt: new Date() });
    }
    catch (error) {
        console.error("Dropbox connect error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /dropbox/disconnect - borra las credenciales del tenant (solo admin)
router.post("/disconnect", async (req, res) => {
    try {
        if (!isAdmin(req)) {
            res.status(403).json({ error: "Solo un administrador puede desconectar Dropbox." });
            return;
        }
        await Tenant.updateOne({ _id: req.tenantObjectId }, { $unset: { "integrations.dropbox": "" } });
        clearTenantToken(String(req.tenantObjectId));
        res.json({ connected: false });
    }
    catch (error) {
        console.error("Dropbox disconnect error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// Helper: carga tenant + config (o responde 400 si no está conectado).
async function requireConfig(req, res) {
    const tenant = await Tenant.findById(req.tenantObjectId).lean();
    const cfg = getTenantDropboxConfig(tenant);
    if (!cfg) {
        res.status(400).json({ error: "Dropbox no está conectado para esta organización." });
        return null;
    }
    return cfg;
}
// GET /dropbox/list?path=&full= - lista una carpeta (por defecto, el rootPath). Con full=1, ignora el
// límite del rootPath y navega desde una raíz más amplia (p. ej. para elegir una carpeta de "Transición
// automática" que viva fuera del subárbol de rootPath, como una carpeta "AFIP" separada de "HelloSign").
router.get("/list", async (req, res) => {
    try {
        const cfg = await requireConfig(req, res);
        if (!cfg)
            return;
        const path = String(req.query.path || "");
        const full = req.query.full === "1" || req.query.full === "true";
        if (path && !full && !isWithinRoot(cfg, path)) {
            res.status(403).json({ error: "Ruta fuera de la carpeta permitida." });
            return;
        }
        const result = await listFolder(String(req.tenantObjectId), cfg, path, full);
        res.json({ ...result, rootPath: cfg.rootPath });
    }
    catch (error) {
        dropboxError(res, error);
    }
});
// GET /dropbox/temp-link?path=&full= - link temporal para descargar/previsualizar. Con full=1, permite
// una ruta fuera del rootPath (p. ej. la carpeta AFIP) — igual que /list, /upload, /create-folder, etc.
router.get("/temp-link", async (req, res) => {
    try {
        const cfg = await requireConfig(req, res);
        if (!cfg)
            return;
        const path = String(req.query.path || "");
        const full = req.query.full === "1" || req.query.full === "true";
        if (!path || (!full && !isWithinRoot(cfg, path))) {
            res.status(403).json({ error: "Ruta inválida." });
            return;
        }
        const link = await getTemporaryLink(String(req.tenantObjectId), cfg, path);
        res.json({ link });
    }
    catch (error) {
        dropboxError(res, error);
    }
});
// POST /dropbox/download-zip { paths: string[], full? } - baja varios archivos y los devuelve como un
// único ZIP. Con full=true, permite rutas fuera del rootPath (ver /temp-link).
router.post("/download-zip", async (req, res) => {
    try {
        const cfg = await requireConfig(req, res);
        if (!cfg)
            return;
        const full = !!req.body?.full;
        const raw = Array.isArray(req.body?.paths) ? req.body.paths : [];
        // Normaliza, deduplica y valida que todo esté dentro del rootPath permitido.
        const paths = Array.from(new Set(raw.map((p) => String(p || "")).filter(Boolean)));
        if (paths.length === 0) {
            res.status(400).json({ error: "No se seleccionó ningún archivo." });
            return;
        }
        if (paths.length > ZIP_MAX_FILES) {
            res.status(400).json({ error: `Demasiados archivos: máximo ${ZIP_MAX_FILES} por descarga.` });
            return;
        }
        if (!full && paths.some((p) => !isWithinRoot(cfg, p))) {
            res.status(403).json({ error: "Alguna ruta está fuera de la carpeta permitida." });
            return;
        }
        const zip = new PizZip();
        const used = new Map(); // evita colisiones de nombre en el ZIP
        let total = 0;
        for (const p of paths) {
            const buf = await downloadFileContent(String(req.tenantObjectId), cfg, p);
            total += buf.length;
            if (total > ZIP_MAX_TOTAL_BYTES) {
                res.status(400).json({ error: `La selección supera el máximo de ${Math.round(ZIP_MAX_TOTAL_BYTES / 1024 / 1024)} MB. Elegí menos archivos.` });
                return;
            }
            let name = p.split("/").pop() || "archivo";
            const seen = used.get(name) || 0;
            used.set(name, seen + 1);
            if (seen > 0) {
                const dot = name.lastIndexOf(".");
                name = dot > 0 ? `${name.slice(0, dot)} (${seen})${name.slice(dot)}` : `${name} (${seen})`;
            }
            zip.file(name, buf);
        }
        const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
        const stamp = new Date().toISOString().slice(0, 10);
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="documentos_${stamp}.zip"`);
        res.setHeader("Content-Length", out.length);
        res.end(out);
    }
    catch (error) {
        dropboxError(res, error);
    }
});
// POST /dropbox/upload (multipart: file + path=carpeta destino + full=)
router.post("/upload", upload.single("file"), async (req, res) => {
    try {
        const cfg = await requireConfig(req, res);
        if (!cfg)
            return;
        if (!req.file) {
            res.status(400).json({ error: "No se recibió ningún archivo." });
            return;
        }
        const full = req.body?.full === "1" || req.body?.full === "true";
        const folder = String(req.body?.path || cfg.rootPath);
        if (!full && !isWithinRoot(cfg, folder)) {
            res.status(403).json({ error: "Ruta fuera de la carpeta permitida." });
            return;
        }
        const dest = `${folder.replace(/\/$/, "")}/${req.file.originalname}`;
        const entry = await uploadFile(String(req.tenantObjectId), cfg, dest, req.file.buffer);
        res.json(entry);
    }
    catch (error) {
        dropboxError(res, error);
    }
});
// POST /dropbox/create-folder { path, full? }
router.post("/create-folder", async (req, res) => {
    try {
        const cfg = await requireConfig(req, res);
        if (!cfg)
            return;
        const full = !!req.body?.full;
        const path = String(req.body?.path || "");
        if (!path || (!full && !isWithinRoot(cfg, path))) {
            res.status(403).json({ error: "Ruta inválida." });
            return;
        }
        const entry = await createFolder(String(req.tenantObjectId), cfg, path);
        res.json(entry);
    }
    catch (error) {
        dropboxError(res, error);
    }
});
// POST /dropbox/move { fromPath, toPath, full? } (renombrar o mover)
router.post("/move", async (req, res) => {
    try {
        const cfg = await requireConfig(req, res);
        if (!cfg)
            return;
        const full = !!req.body?.full;
        const fromPath = String(req.body?.fromPath || "");
        const toPath = String(req.body?.toPath || "");
        if (!fromPath || !toPath || (!full && (!isWithinRoot(cfg, fromPath) || !isWithinRoot(cfg, toPath)))) {
            res.status(403).json({ error: "Ruta inválida." });
            return;
        }
        const entry = await moveEntry(String(req.tenantObjectId), cfg, fromPath, toPath);
        res.json(entry);
    }
    catch (error) {
        dropboxError(res, error);
    }
});
// DELETE /dropbox/delete { path, full? }
router.delete("/delete", async (req, res) => {
    try {
        const cfg = await requireConfig(req, res);
        if (!cfg)
            return;
        const full = !!req.body?.full;
        const path = String(req.body?.path || req.query?.path || "");
        if (!path || (!full && !isWithinRoot(cfg, path))) {
            res.status(403).json({ error: "Ruta inválida." });
            return;
        }
        await deleteEntry(String(req.tenantObjectId), cfg, path);
        res.json({ ok: true });
    }
    catch (error) {
        dropboxError(res, error);
    }
});
// POST /dropbox/estado-scan/trigger - fuerza ya mismo el escaneo de transición automática de ESTE
// tenant (solo admin), en vez de esperar la corrida periódica del cron (según su intervalo configurado).
router.post("/estado-scan/trigger", async (req, res) => {
    try {
        if (!isAdmin(req)) {
            res.status(403).json({ error: "Solo un administrador puede forzar el escaneo." });
            return;
        }
        const resultado = await escanearTenantAhora(String(req.tenantObjectId));
        if (resultado.enCurso) {
            res.status(409).json({ error: "Ya hay un escaneo en curso. Esperá a que termine e intentá de nuevo." });
            return;
        }
        if (resultado.error === "dropbox_no_conectado") {
            res.status(400).json({ error: "Dropbox no está conectado para esta organización." });
            return;
        }
        if (resultado.error === "sin_transiciones_configuradas") {
            res.status(400).json({ error: "No hay ninguna transición automática configurada todavía." });
            return;
        }
        res.json({ estadosEscaneados: resultado.estadosEscaneados, transicionesAplicadas: resultado.transicionesAplicadas });
    }
    catch (error) {
        dropboxError(res, error);
    }
});
// GET /dropbox/estado-scan/config - intervalo configurado + cuándo fue el último escaneo / cuándo es
// el próximo, para mostrar la cuenta regresiva en la UI.
router.get("/estado-scan/config", async (req, res) => {
    try {
        const config = await getEscaneoConfig(String(req.tenantObjectId));
        res.json(config);
    }
    catch (error) {
        dropboxError(res, error);
    }
});
// PATCH /dropbox/estado-scan/config { intervalMinutos } - cambia cada cuánto se revisan las carpetas
// vigiladas (solo admin).
router.patch("/estado-scan/config", async (req, res) => {
    try {
        if (!isAdmin(req)) {
            res.status(403).json({ error: "Solo un administrador puede cambiar el intervalo de escaneo." });
            return;
        }
        const intervalMinutos = Number(req.body?.intervalMinutos);
        if (!Number.isFinite(intervalMinutos)) {
            res.status(400).json({ error: "intervalMinutos inválido." });
            return;
        }
        if (intervalMinutos < MIN_INTERVAL_MINUTES || intervalMinutos > MAX_INTERVAL_MINUTES) {
            res.status(400).json({ error: `El intervalo tiene que estar entre ${MIN_INTERVAL_MINUTES} y ${MAX_INTERVAL_MINUTES} minutos.` });
            return;
        }
        const config = await setEscaneoIntervalo(String(req.tenantObjectId), intervalMinutos);
        res.json(config);
    }
    catch (error) {
        dropboxError(res, error);
    }
});
export { router as dropboxRoutes };
