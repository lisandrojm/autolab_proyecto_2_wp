import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { Tenant } from "../models/Tenant.js";
import { encryptSecret } from "../utils/secretCrypto.js";
import { leerCasillaDropboxSign } from "../services/dropboxSignMailService.js";
/**
 * Configuración de "DropboxSign | Firmas": la casilla de correo que recibe las copias de
 * "documento enviado" de Dropbox Sign.
 *
 * Para qué sirve: Dropbox Sign no avisa por API (en el plan actual) qué contratos ya se enviaron a
 * firmar, pero sí manda una copia por mail de cada envío. Leyendo esa casilla se puede detectar el
 * envío y mover el archivo de "Outbox" a "Pendbox", que es lo que separa la bandeja "Para Firmar"
 * de "Pendiente de firma" y evita que un contrato se mande a firmar dos veces.
 *
 * Acá solo se guarda la configuración. La lectura de la casilla es un job aparte, que no corre
 * mientras `enabled` esté en false.
 */
const router = Router();
router.use(requireTenant, authenticateToken);
const isAdmin = (req) => !!req.user?.roles?.some((r) => ["admin", "superadmin"].includes(r.toLowerCase()));
const configSchema = z.object({
    email: z.string().email("El correo no es válido"),
    imapHost: z.string().min(1, "Falta el servidor IMAP"),
    imapPort: z.number().int().min(1).max(65535).optional(),
    imapSecure: z.boolean().optional(),
    imapUser: z.string().optional(),
    /** Solo se manda cuando se quiere cambiar: si viene vacía, se conserva la guardada. */
    imapPassword: z.string().optional(),
    enabled: z.boolean().optional(),
});
/** GET /dropbox-sign/config - configuración actual. La contraseña NUNCA se devuelve. */
router.get("/config", async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.tenantObjectId).select("integrations.dropboxSign").lean();
        const cfg = tenant?.integrations?.dropboxSign || {};
        res.json({
            email: cfg.email || "",
            imapHost: cfg.imapHost || "",
            imapPort: cfg.imapPort ?? 993,
            imapSecure: cfg.imapSecure ?? true,
            imapUser: cfg.imapUser || "",
            // No se devuelve la contraseña: solo si hay una guardada, para que la UI no la pida de nuevo.
            tienePassword: !!cfg.imapPasswordEnc,
            enabled: !!cfg.enabled,
            configuredAt: cfg.configuredAt || null,
            lastCheckAt: cfg.lastCheckAt || null,
            lastCheckOk: cfg.lastCheckOk ?? null,
            lastCheckDetalle: cfg.lastCheckDetalle || "",
        });
    }
    catch (error) {
        console.error("Dropbox Sign config error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/** PUT /dropbox-sign/config - guarda la configuración (solo admin). */
router.put("/config", async (req, res) => {
    try {
        if (!isAdmin(req)) {
            res.status(403).json({ error: "Solo un administrador puede configurar Dropbox Sign." });
            return;
        }
        const parsed = configSchema.safeParse(req.body || {});
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
            return;
        }
        const data = parsed.data;
        const set = {
            "integrations.dropboxSign.email": data.email.trim(),
            "integrations.dropboxSign.imapHost": data.imapHost.trim(),
            "integrations.dropboxSign.imapPort": data.imapPort ?? 993,
            "integrations.dropboxSign.imapSecure": data.imapSecure ?? true,
            "integrations.dropboxSign.imapUser": (data.imapUser || data.email).trim(),
            "integrations.dropboxSign.enabled": !!data.enabled,
            "integrations.dropboxSign.configuredAt": new Date(),
        };
        // La contraseña solo se pisa si mandaron una nueva (la UI no la trae de vuelta).
        if (data.imapPassword)
            set["integrations.dropboxSign.imapPasswordEnc"] = encryptSecret(data.imapPassword);
        const tenant = await Tenant.findByIdAndUpdate(req.tenantObjectId, { $set: set }, { new: true }).select("integrations.dropboxSign").lean();
        const cfg = tenant?.integrations?.dropboxSign || {};
        // No se puede habilitar la lectura sin contraseña: quedaría prendida sin poder conectarse.
        if (cfg.enabled && !cfg.imapPasswordEnc) {
            await Tenant.findByIdAndUpdate(req.tenantObjectId, { $set: { "integrations.dropboxSign.enabled": false } });
            res.status(400).json({ error: "Para activar la lectura hay que cargar la contraseña de la casilla." });
            return;
        }
        res.json({ ok: true, tienePassword: !!cfg.imapPasswordEnc, enabled: !!cfg.enabled });
    }
    catch (error) {
        console.error("Dropbox Sign save config error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * POST /dropbox-sign/leer - corre la lectura de la casilla ahora mismo (solo admin).
 * `prueba: true` solo verifica la conexión y cuenta los avisos, sin escribir nada en Dropbox.
 */
router.post("/leer", async (req, res) => {
    try {
        if (!isAdmin(req)) {
            res.status(403).json({ error: "Solo un administrador puede leer la casilla." });
            return;
        }
        const soloPrueba = req.body?.prueba === true;
        const r = await leerCasillaDropboxSign(String(req.tenantObjectId), soloPrueba);
        // El resultado queda registrado para poder verlo después desde la configuración.
        if (!soloPrueba) {
            await Tenant.findByIdAndUpdate(req.tenantObjectId, {
                $set: { "integrations.dropboxSign.lastCheckAt": new Date(), "integrations.dropboxSign.lastCheckOk": r.ok, "integrations.dropboxSign.lastCheckDetalle": r.detalle },
            });
        }
        res.json(r);
    }
    catch (error) {
        console.error("Dropbox Sign leer error:", error);
        res.status(500).json({ error: error?.message || "No se pudo leer la casilla." });
    }
});
export { router as dropboxSignRoutes };
