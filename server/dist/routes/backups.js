import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { correrBackup, backupEnCurso, CARPETA_BACKUPS, INTERVALO_HORAS_DEFAULT, RETENER_DEFAULT, INTERVALOS_VALIDOS } from "../services/backupService.js";
import { Tenant } from "../models/Tenant.js";
/**
 * Forzar un backup a mano, sin esperar a la corrida de las 12 horas.
 *
 * Es para el momento de "voy a tocar algo grande y quiero una copia de AHORA": migrar datos, correr un
 * script de los que escriben, probar un import.
 */
const router = Router();
router.use(requireTenant, authenticateToken);
const isAdmin = (req) => (req.user?.roles || []).some((r) => ["admin", "superadmin"].includes(r.toLowerCase()));
/**
 * GET /backups/config — lo que muestra la pantalla «MongoDB» de DDBB: cada cuánto se copia, cuántas
 * se conservan, cuándo fue la última y si la última falló.
 *
 * La configuración es de la BASE, que es una sola, así que se lee del mismo tenant que usa el
 * scheduler: el primero con Dropbox conectado.
 */
router.get("/config", async (req, res) => {
    if (!isAdmin(req)) {
        res.status(403).json({ error: "Solo un administrador puede ver la configuración de los backups." });
        return;
    }
    const tenant = await Tenant.findOne({ "integrations.dropbox.refreshTokenEnc": { $exists: true } }).sort({ createdAt: 1 }).lean();
    const b = tenant?.integrations?.backup || {};
    res.json({
        enCurso: backupEnCurso(),
        carpeta: CARPETA_BACKUPS,
        intervaloHoras: Number(b.intervaloHoras) || INTERVALO_HORAS_DEFAULT,
        retener: Number(b.retener) || RETENER_DEFAULT,
        ultimoBackupAt: b.ultimoBackupAt || null,
        ultimoError: b.ultimoError || null,
        intervalosValidos: INTERVALOS_VALIDOS,
        dropboxConectado: !!tenant,
    });
});
/**
 * PUT /backups/config — cambia frecuencia y retención.
 *
 * El scheduler lee esto en cada vuelta (cada 15 minutos), así que el cambio toma efecto sin reiniciar
 * el server. Se valida acá y no solo en el front: un intervalo de 0 dejaría el job corriendo sin parar
 * y una retención de 0 borraría todas las copias apenas suba la próxima.
 */
router.put("/config", async (req, res) => {
    if (!isAdmin(req)) {
        res.status(403).json({ error: "Solo un administrador puede cambiar la configuración de los backups." });
        return;
    }
    const intervaloHoras = Number(req.body?.intervaloHoras);
    const retener = Number(req.body?.retener);
    if (!INTERVALOS_VALIDOS.includes(intervaloHoras)) {
        res.status(400).json({ error: `La frecuencia tiene que ser una de: ${INTERVALOS_VALIDOS.join(", ")} horas.` });
        return;
    }
    if (!Number.isInteger(retener) || retener < 1 || retener > 200) {
        res.status(400).json({ error: "La cantidad de copias a conservar tiene que ser un número entre 1 y 200." });
        return;
    }
    const tenant = await Tenant.findOne({ "integrations.dropbox.refreshTokenEnc": { $exists: true } }).sort({ createdAt: 1 });
    if (!tenant) {
        res.status(400).json({ error: "Dropbox no está conectado: no hay backups que configurar." });
        return;
    }
    await Tenant.updateOne({ _id: tenant._id }, { $set: { "integrations.backup.intervaloHoras": intervaloHoras, "integrations.backup.retener": retener } });
    res.json({ intervaloHoras, retener });
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
