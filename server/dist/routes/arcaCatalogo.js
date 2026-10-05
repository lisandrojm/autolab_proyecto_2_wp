import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { ArcaCatalogoLectura } from "../models/ArcaCatalogo.js";
import { Company } from "../models/Company.js";
import { CandadoArcaOcupado } from "../services/arca/candadoArca.js";
import { aplicarLectura, arrancarLecturaCatalogo, descartarLectura, lecturaEnCursoDe, ultimaLecturaDe } from "../services/arca/catalogoArcaSync.js";
/**
 * EL CATÁLOGO DE ARCA (espejo `arca_catalogo`): leerlo de ARCA y aplicar lo leído con confirmación.
 *
 * Esta es la ÚNICA ruta que escribe en el espejo, y solo a través de `aplicarLectura` (una lectura de
 * ARCA que alguien confirmó). Ningún ABM lo hace: un test lo verifica.
 */
const router = Router();
const permiso = requirePermission("config_arca_tablas:view");
const errorDe = (res, e) => {
    if (e instanceof CandadoArcaOcupado)
        return res.status(409).json({ error: e.message, ocupadaPor: e.tipo });
    return res.status(e?.status || 500).json({ error: String(e?.message || e) });
};
/** POST /arca/catalogo/sincronizar { empresaId } — arranca la lectura y vuelve enseguida. */
router.post("/sincronizar", requireTenant, authenticateToken, permiso, async (req, res) => {
    try {
        res.json({ arrancada: true, ...(await arrancarLecturaCatalogo({ tenantId: String(req.tenantObjectId), empresaId: String(req.body?.empresaId || ""), usuarioId: req.user?.userId })) });
    }
    catch (e) {
        errorDe(res, e);
    }
});
/** GET /arca/catalogo/sincronizacion — la lectura en curso (o la última), con sus eventos. */
router.get("/sincronizacion", requireTenant, authenticateToken, permiso, async (req, res) => {
    const c = lecturaEnCursoDe(String(req.tenantObjectId));
    res.json(c ? { hay: true, corriendo: !c.terminada, ...c } : { hay: false, corriendo: false, eventos: [] });
});
/** GET /arca/catalogo/lecturas — las últimas 30, sin las filas (pesan). */
router.get("/lecturas", requireTenant, authenticateToken, permiso, async (_req, res) => {
    try {
        res.json(await ArcaCatalogoLectura.find().select("-filas").sort({ fecha: -1 }).limit(30).lean());
    }
    catch (e) {
        errorDe(res, e);
    }
});
/** GET /arca/catalogo/empleadoras — cada empleadora con CUIT y su última lectura desde ARCA. */
router.get("/empleadoras", requireTenant, authenticateToken, async (_req, res) => {
    try {
        const empresas = await Company.find({ cuit: { $exists: true, $ne: "" } }).select("razonSocial cuit").lean();
        res.json(await Promise.all(empresas.map(async (e) => ({ _id: e._id, razonSocial: e.razonSocial, cuit: String(e.cuit || "").replace(/\D/g, ""), ultimaLectura: await ultimaLecturaDe(e.cuit) }))));
    }
    catch (e) {
        errorDe(res, e);
    }
});
/** POST /arca/catalogo/lecturas/:id/aplicar { confirmar: true } */
router.post("/lecturas/:id/aplicar", requireTenant, authenticateToken, permiso, async (req, res) => {
    try {
        if (req.body?.confirmar !== true)
            return res.status(400).json({ error: "Falta la confirmación explícita (confirmar: true)." });
        res.json({ aplicada: true, ...(await aplicarLectura(String(req.params.id), req.user?.userId)) });
    }
    catch (e) {
        errorDe(res, e);
    }
});
/** POST /arca/catalogo/lecturas/:id/descartar */
router.post("/lecturas/:id/descartar", requireTenant, authenticateToken, permiso, async (req, res) => {
    try {
        await descartarLectura(String(req.params.id), req.user?.userId);
        res.json({ descartada: true });
    }
    catch (e) {
        errorDe(res, e);
    }
});
export { router as arcaCatalogoRoutes };
