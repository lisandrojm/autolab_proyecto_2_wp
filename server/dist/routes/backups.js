import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { correrBackup, backupEnCurso, CARPETA_BACKUPS } from "../services/backupService.js";
/**
 * Forzar un backup a mano, sin esperar a la corrida de las 12 horas.
 *
 * Es para el momento de "voy a tocar algo grande y quiero una copia de AHORA": migrar datos, correr un
 * script de los que escriben, probar un import.
 */
const router = Router();
router.use(requireTenant, authenticateToken);
const isAdmin = (req) => (req.user?.roles || []).some((r) => ["admin", "superadmin"].includes(r.toLowerCase()));
/** GET /backups/estado — para que el botón sepa si ya hay uno corriendo. */
router.get("/estado", async (req, res) => {
    if (!isAdmin(req)) {
        res.status(403).json({ error: "Solo un administrador puede ver el estado de los backups." });
        return;
    }
    res.json({ enCurso: backupEnCurso(), carpeta: CARPETA_BACKUPS });
});
/**
 * POST /backups/ejecutar — corre un backup ahora y contesta cuando terminó.
 *
 * SOLO ADMIN: el backup lee la base entera, así que dispararlo es caro y quien lo hace tiene que poder
 * ver esos datos.
 *
 * Contesta recién al terminar, y no un 202 con "arrancó": quien aprieta el botón quiere saber si el
 * archivo QUEDÓ. Con la base grande esto puede tardar, así que el cliente manda un timeout largo.
 *
 * El 409 cuando ya hay uno en curso es la misma guarda que usa el scheduler: dos corridas juntas
 * dejarían dos carpetas del mismo momento y el doble de tráfico contra Dropbox.
 */
router.post("/ejecutar", async (req, res) => {
    if (!isAdmin(req)) {
        res.status(403).json({ error: "Solo un administrador puede forzar un backup." });
        return;
    }
    if (backupEnCurso()) {
        res.status(409).json({ error: "Ya hay un backup en curso. Esperá a que termine." });
        return;
    }
    try {
        const resultado = await correrBackup("manual");
        if (!resultado) {
            res.status(400).json({ error: "Dropbox no está conectado: no hay dónde guardar el backup." });
            return;
        }
        res.json(resultado);
    }
    catch (error) {
        console.error("Backup manual falló:", error);
        res.status(500).json({ error: String(error?.message || "No se pudo generar el backup.") });
    }
});
export const backupRoutes = router;
