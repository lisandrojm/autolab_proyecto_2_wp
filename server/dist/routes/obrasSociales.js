import { Router } from "express";
import { ObraSocial } from "../models/ObraSocial.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
import { authenticateToken } from "../middleware/auth.js";
const router = Router();
/**
 * PATCH /:id/por-defecto - marca (o desmarca) la obra social que se usa cuando la persona no tiene
 * ninguna asignada. Solo una puede estar marcada, así que primero se limpian todas: si quedaran dos,
 * cuál se aplica dependería del orden del listado.
 */
router.patch("/:id/por-defecto", authenticateToken, async (req, res) => {
    try {
        const marcar = req.body?.porDefecto !== false;
        await ObraSocial.updateMany({ "data.porDefecto": true }, { $set: { "data.porDefecto": false } });
        if (marcar) {
            const actualizada = await ObraSocial.findByIdAndUpdate(req.params.id, { $set: { "data.porDefecto": true } }, { new: true }).lean();
            if (!actualizada) {
                res.status(404).json({ error: "Obra Social no encontrada" });
                return;
            }
        }
        res.json({ ok: true, porDefecto: marcar });
    }
    catch (error) {
        console.error("Obra Social por-defecto error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.use(createSimpleCatalogRouter(ObraSocial, {
    entityLabel: "Obra Social",
    sheetName: "ObrasSociales",
    templateFilename: "plantilla_obras_sociales.xlsx",
    sampleNames: ["OSDE", "Swiss Medical", "OSPLAD"],
    // Para Obras Sociales el "ID Externo" genérico de FRAME siempre fue el código RNOS (6 díg., para
    // el TXT de Alta masiva de AFIP): no hace falta un campo separado, solo tratarlo como tal.
    externalIdExcelHeader: "RNOS",
    externalIdExcelAliases: ["Código RNOS", "codigoRnos", "rnos"],
    sanitizeExternalId: (v) => v.replace(/\D/g, ""),
}));
export { router as obraSocialRoutes };
