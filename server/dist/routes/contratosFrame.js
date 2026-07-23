import { Router } from "express";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Company } from "../models/Company.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { authenticateToken } from "../middleware/auth.js";
import { buildEmployeeDocData, buildDocFileName } from "../utils/employeeDocData.js";
import { buildDocPdf, getDummyDocVariables } from "../utils/documentPdf.js";
const router = Router();
const parseNum = (val) => {
    if (val === undefined || val === null || val === "")
        return 0;
    const n = Number(val);
    return isNaN(n) ? 0 : n;
};
const sendPdf = (res, buffer, baseName) => {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.pdf"`);
    res.send(buffer);
};
// GET / - listar
router.get("/", authenticateToken, async (_req, res) => {
    try {
        const items = await ContratoFrame.find().sort({ name: 1 }).lean();
        res.json(items);
    }
    catch (error) {
        console.error("Get contratos-frame error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /preview — genera un PDF de ejemplo con el contenido del editor (sin guardar).
router.post("/preview", authenticateToken, async (req, res) => {
    try {
        const content = String(req.body?.content ?? "");
        if (!content.trim()) {
            res.status(400).json({ error: "El contenido es obligatorio" });
            return;
        }
        const buffer = await buildDocPdf(content, getDummyDocVariables());
        sendPdf(res, buffer, "Preview_Contrato");
    }
    catch (error) {
        console.error("Preview contrato error:", error);
        res.status(500).json({ error: "No se pudo generar la previsualización" });
    }
});
// GET /:id/download - PDF del contrato con valores de ejemplo (sin persona asociada)
router.get("/:id/download", authenticateToken, async (req, res) => {
    try {
        const item = await ContratoFrame.findById(req.params.id);
        if (!item) {
            res.status(404).json({ error: "Contrato no encontrado" });
            return;
        }
        if (!item.content) {
            res.status(400).json({ error: "El contrato no tiene contenido redactado" });
            return;
        }
        const buffer = await buildDocPdf(item.content, getDummyDocVariables());
        sendPdf(res, buffer, `${item.name || "Contrato"}`);
    }
    catch (error) {
        console.error("Download ContratoFrame error:", error);
        res.status(500).json({ error: "Error al generar el archivo" });
    }
});
// GET /:id/download-filled?userId=&projectId=&contractIndex=
// Genera el PDF del contrato con las variables reemplazadas por los datos de la persona/contrato
// y de la empresa seteada en el proyecto (contratoEmpresa).
router.get("/:id/download-filled", authenticateToken, async (req, res) => {
    try {
        const item = await ContratoFrame.findById(req.params.id);
        if (!item) {
            res.status(404).json({ error: "Contrato no encontrado" });
            return;
        }
        if (!item.content) {
            res.status(400).json({ error: "El contrato no tiene contenido redactado" });
            return;
        }
        const { userId, projectId, contractIndex } = req.query;
        const user = await User.findOne({ _id: userId, tenantId: req.tenantObjectId }).populate({ path: "metadata.projects", model: UserProject }).lean();
        if (!user) {
            res.status(404).json({ error: "Empleado no encontrado" });
            return;
        }
        const projects = user.metadata?.projects || [];
        const up = projects.find((p) => {
            const pId = p?.projectId;
            const idToCheck = typeof pId === "object" && pId ? pId._id : pId;
            return String(idToCheck) === String(projectId);
        });
        const contracts = up?.contracts || [];
        let idx = Number(contractIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= contracts.length)
            idx = contracts.length - 1;
        const contract = contracts[idx] || {};
        // Empresa/Productora seteada en el PROYECTO (contratoEmpresa) → variables empresa* en la plantilla
        const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).lean();
        const empresaId = project?.contratoEmpresa;
        const empresa = empresaId ? await Company.findById(empresaId).lean() : null;
        const data = await buildEmployeeDocData(user, up, contract, empresa);
        const buffer = await buildDocPdf(item.content, data);
        const baseName = buildDocFileName({ tipo: "Contrato", user, up, contract });
        sendPdf(res, buffer, baseName);
    }
    catch (error) {
        console.error("Download filled ContratoFrame error:", error);
        res.status(500).json({ error: "No se pudo generar el contrato con los datos." });
    }
});
// POST / - crear
router.post("/", authenticateToken, async (req, res) => {
    try {
        const { nombre, externalId, content, cantidadJornadas, multiplicadorDiario, esTiempoIndeterminado } = req.body;
        if (!nombre || !String(nombre).trim()) {
            res.status(400).json({ error: "El nombre es obligatorio" });
            return;
        }
        const idNum = externalId ? Number(externalId) : undefined;
        const created = await ContratoFrame.create({
            name: String(nombre).trim(),
            externalId: externalId ? String(externalId).trim() : "",
            content: content ? String(content) : "",
            data: {
                id: idNum !== undefined && !isNaN(idNum) ? idNum : undefined,
                nombre: String(nombre).trim(),
                cantidadJornadas: parseNum(cantidadJornadas),
                multiplicadorDiario: parseNum(multiplicadorDiario),
                esTiempoIndeterminado: esTiempoIndeterminado === "true" || esTiempoIndeterminado === true,
            },
        });
        res.status(201).json(created);
    }
    catch (error) {
        console.error("Create ContratoFrame error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
// PUT /:id - actualizar
router.put("/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, externalId, content, cantidadJornadas, multiplicadorDiario, esTiempoIndeterminado } = req.body;
        const item = await ContratoFrame.findById(id);
        if (!item) {
            res.status(404).json({ error: "Contrato no encontrado" });
            return;
        }
        if (nombre !== undefined) {
            item.name = String(nombre).trim();
            item.data.nombre = String(nombre).trim();
        }
        if (externalId !== undefined) {
            item.externalId = String(externalId).trim();
            const idNum = Number(externalId);
            if (!isNaN(idNum))
                item.data.id = idNum;
        }
        if (content !== undefined)
            item.content = String(content);
        if (cantidadJornadas !== undefined)
            item.data.cantidadJornadas = parseNum(cantidadJornadas);
        if (multiplicadorDiario !== undefined)
            item.data.multiplicadorDiario = parseNum(multiplicadorDiario);
        if (esTiempoIndeterminado !== undefined)
            item.data.esTiempoIndeterminado = esTiempoIndeterminado === "true" || esTiempoIndeterminado === true;
        item.markModified("data");
        await item.save();
        res.json(item);
    }
    catch (error) {
        console.error("Update ContratoFrame error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
// DELETE /:id - eliminar
router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const item = await ContratoFrame.findById(req.params.id);
        if (!item) {
            res.status(404).json({ error: "Contrato no encontrado" });
            return;
        }
        await item.deleteOne();
        res.json({ message: "Contrato eliminado correctamente" });
    }
    catch (error) {
        console.error("Delete ContratoFrame error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
export { router as contratoFrameRoutes };
