import { Router } from "express";
import { ProjectPdfConfig } from "../models/ProjectPdfConfig.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
const router = Router();
router.get("/", authenticateToken, requireTenant, async (req, res) => {
    try {
        const configs = await ProjectPdfConfig.find({ tenantId: req.tenantObjectId });
        res.json(configs);
    }
    catch (error) {
        console.error("Get Project PDF Config error:", error);
        res.status(500).json({ error: "Error al obtener la configuración por proyecto" });
    }
});
router.post("/", authenticateToken, requireTenant, async (req, res) => {
    try {
        const { name, razonSocial, cuit, ciudad, direccion, logoUrl, signatureUrl, signerName, signerRole, projects } = req.body;
        const newConfig = new ProjectPdfConfig({
            tenantId: req.tenantObjectId,
            name,
            razonSocial,
            cuit,
            ciudad,
            direccion,
            logoUrl,
            signatureUrl,
            signerName,
            signerRole,
            projects: projects || [],
        });
        // Validar asignaciones exclusivas:
        // Si la nueva configuración está asignando proyectos, quitarlos de otras configuraciones
        if (projects && projects.length > 0) {
            await ProjectPdfConfig.updateMany({ tenantId: req.tenantObjectId, _id: { $ne: newConfig._id } }, { $pull: { projects: { $in: projects } } });
        }
        await newConfig.save();
        res.status(201).json(newConfig);
    }
    catch (error) {
        console.error("Create Project PDF Config error:", error);
        res.status(500).json({ error: "Error al crear configuración" });
    }
});
router.put("/:id", authenticateToken, requireTenant, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, razonSocial, cuit, ciudad, direccion, logoUrl, signatureUrl, signerName, signerRole, projects } = req.body;
        const config = await ProjectPdfConfig.findOne({ _id: id, tenantId: req.tenantObjectId });
        if (!config) {
            return res.status(404).json({ error: "Configuración no encontrada" });
        }
        if (name !== undefined)
            config.name = name;
        if (razonSocial !== undefined)
            config.razonSocial = razonSocial;
        if (cuit !== undefined)
            config.cuit = cuit;
        if (ciudad !== undefined)
            config.ciudad = ciudad;
        if (direccion !== undefined)
            config.direccion = direccion;
        if (logoUrl !== undefined)
            config.logoUrl = logoUrl;
        if (signatureUrl !== undefined)
            config.signatureUrl = signatureUrl;
        if (signerName !== undefined)
            config.signerName = signerName;
        if (signerRole !== undefined)
            config.signerRole = signerRole;
        if (projects !== undefined) {
            config.projects = projects;
        }
        // Si la configuración actualizada está asignando proyectos, quitarlos de otras configuraciones
        if (projects && projects.length > 0) {
            await ProjectPdfConfig.updateMany({ tenantId: req.tenantObjectId, _id: { $ne: config._id } }, { $pull: { projects: { $in: projects } } });
        }
        await config.save();
        res.json(config);
    }
    catch (error) {
        console.error("Update Project PDF Config error:", error);
        res.status(500).json({ error: "Error al actualizar configuración" });
    }
});
router.delete("/:id", authenticateToken, requireTenant, async (req, res) => {
    try {
        const { id } = req.params;
        await ProjectPdfConfig.findOneAndDelete({ _id: id, tenantId: req.tenantObjectId });
        res.json({ success: true });
    }
    catch (error) {
        console.error("Delete Project PDF Config error:", error);
        res.status(500).json({ error: "Error al eliminar configuración" });
    }
});
export { router as ProjectPdfConfigRoutes };
