import { Router } from "express";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Contrato } from "../models/Contrato.js";
import { Company } from "../models/Company.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { authenticateToken } from "../middleware/auth.js";
import { buildEmployeeDocData } from "../utils/employeeDocData.js";
import { nombreArchivoDocumento } from "../services/nomenclaturaService.js";
import { buildDocPdf, getDummyDocVariables, htmlHasText, empresaToMembrete } from "../utils/documentPdf.js";
import { ensureContratosBackfilled } from "./contratos.js";
const router = Router();
const parseNum = (val) => {
    if (val === undefined || val === null || val === "")
        return 0;
    const n = Number(val);
    return isNaN(n) ? 0 : n;
};
/**
 * Cabecera de descarga con el nombre canónico del archivo (`buildDocFileName`).
 *
 * Se emiten las DOS formas del nombre a propósito:
 *  - `filename*=UTF-8''…` (RFC 5987) es la que vale: los nombres llevan acentos y las cabeceras HTTP
 *    no son UTF-8, así que sin esto un apellido con tilde llega mal.
 *  - `filename="…"` queda como respaldo ASCII para cualquier cliente que no entienda `filename*`.
 *
 * El frontend NO arma el nombre por su cuenta: lo lee de acá (ver `fileNameFromDisposition`). Es el
 * único lugar donde se decide cómo se llama un documento.
 */
const contentDisposition = (baseName) => {
    const conExtension = `${baseName}.pdf`;
    const ascii = conExtension.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(conExtension)}`;
};
const sendPdf = (res, buffer, baseName) => {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", contentDisposition(baseName));
    res.send(buffer);
};
// GET / - listar
router.get("/", authenticateToken, async (_req, res) => {
    try {
        await ensureContratosBackfilled();
        const items = await ContratoFrame.find().sort({ name: 1 }).populate({ path: "contratoId", select: "name isActive data.requiereFirma", model: Contrato }).lean();
        res.json(items);
    }
    catch (error) {
        console.error("Get contratos-frame error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// Membrete de EJEMPLO para previews/descargas sin persona: usa una empresa real con membrete
// cargado (logo/firma) si existe; si no, datos de ejemplo. Solo cuando la plantilla lleva membrete.
async function getExampleMembrete(usaMembrete) {
    if (!usaMembrete)
        return undefined;
    const empresa = (await Company.findOne({ $or: [{ logoUrl: { $nin: [null, ""] } }, { signatureUrl: { $nin: [null, ""] } }] }).lean()) ||
        (await Company.findOne().lean());
    if (empresa)
        return empresaToMembrete(empresa);
    return { razonSocial: "2030 S.R.L.", cuit: "30-71234567-9", domicilio: "Av. Corrientes 1234, Piso 5, CABA, Buenos Aires", firmanteNombre: "María González", firmanteCargo: "Apoderada" };
}
// POST /preview — genera un PDF de ejemplo con el contenido del editor (sin guardar).
router.post("/preview", authenticateToken, async (req, res) => {
    try {
        const content = String(req.body?.content ?? "");
        if (!content.trim()) {
            res.status(400).json({ error: "El contenido es obligatorio" });
            return;
        }
        const membrete = await getExampleMembrete(req.body?.usaMembrete === true || req.body?.usaMembrete === "true");
        const buffer = await buildDocPdf(content, getDummyDocVariables(), membrete, { resaltarVariables: true });
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
        if (!htmlHasText(item.content)) {
            res.status(400).json({ error: "El contrato no tiene contenido redactado" });
            return;
        }
        const membrete = await getExampleMembrete(!!item.usaMembrete);
        const buffer = await buildDocPdf(item.content, getDummyDocVariables(), membrete, { resaltarVariables: true });
        sendPdf(res, buffer, `${item.name || "Contrato"}`);
    }
    catch (error) {
        console.error("Download ContratoFrame error:", error);
        res.status(500).json({ error: "Error al generar el archivo" });
    }
});
/**
 * Arma el PDF del Contrato con las variables reemplazadas por los datos de la persona/contrato y de
 * la empresa elegida (contratoEmpresas del proyecto) — la misma lógica que usaba `/download-filled`
 * directo en el handler, ahora reutilizable desde otros routers (p. ej. "Generar" de Firma Digital)
 * sin pasar por un round-trip HTTP.
 */
export async function generarContratoPdf(opts) {
    const { tenantId, templateId, userId, projectId, contractIndex, empresaId } = opts;
    const item = await ContratoFrame.findById(templateId);
    if (!item)
        throw new Error("Contrato no encontrado");
    if (!htmlHasText(item.content))
        throw new Error("El contrato no tiene contenido redactado");
    const user = await User.findOne({ _id: userId, tenantId }).populate({ path: "metadata.projects", model: UserProject }).lean();
    if (!user)
        throw new Error("Empleado no encontrado");
    const projects = user.metadata?.projects || [];
    const up = projects.find((p) => {
        const pId = p?.projectId;
        const idToCheck = typeof pId === "object" && pId ? pId._id : pId;
        return String(idToCheck) === String(projectId);
    });
    const contracts = up?.contracts || [];
    let idx = contractIndex;
    if (!Number.isInteger(idx) || idx < 0 || idx >= contracts.length)
        idx = contracts.length - 1;
    const contract = contracts[idx] || {};
    const project = await Project.findOne({ _id: projectId, tenantId }).lean();
    const empresas = project?.contratoEmpresas || [];
    const empresasIds = empresas.map((e) => String(e));
    const empresaIdValida = !!empresaId && (empresasIds.length === 0 || empresasIds.includes(String(empresaId)));
    const chosenId = empresaIdValida ? String(empresaId) : empresasIds[0];
    const empresa = chosenId ? await Company.findById(chosenId).lean() : null;
    const data = await buildEmployeeDocData(user, up, contract, empresa);
    const membrete = item.usaMembrete && empresa ? empresaToMembrete(empresa) : undefined;
    const buffer = await buildDocPdf(item.content, data, membrete);
    // El nombre sale del patrón que el tenant tenga configurado (Plantillas → Nomenclatura de
    // archivos). Sin configurar, rige el de fábrica, que es exactamente el de antes.
    const filename = await nombreArchivoDocumento({ tenantId: opts.tenantId, tipo: "Contrato", user, up, contract, empresa, extra: opts.extra });
    return { buffer, filename, empresaIdUsado: chosenId || "" };
}
// GET /:id/download-filled?userId=&projectId=&contractIndex=
// Genera el PDF del contrato con las variables reemplazadas por los datos de la persona/contrato
// y de la empresa seteada en el proyecto (contratoEmpresas).
router.get("/:id/download-filled", authenticateToken, async (req, res) => {
    try {
        const { userId, projectId, contractIndex, empresaId } = req.query;
        const { buffer, filename } = await generarContratoPdf({
            tenantId: String(req.tenantObjectId),
            templateId: req.params.id,
            userId: String(userId),
            projectId: String(projectId),
            contractIndex: Number(contractIndex),
            empresaId,
        });
        sendPdf(res, buffer, filename);
    }
    catch (error) {
        console.error("Download filled ContratoFrame error:", error);
        const msg = String(error?.message || "");
        const status = /no encontrado/i.test(msg) ? 404 : /no tiene contenido redactado/i.test(msg) ? 400 : 500;
        res.status(status).json({ error: msg || "No se pudo generar el contrato con los datos." });
    }
});
// POST / - crear
router.post("/", authenticateToken, async (req, res) => {
    try {
        const { nombre, externalId, content, contratoId, usaMembrete, isActive } = req.body;
        if (!nombre || !String(nombre).trim()) {
            res.status(400).json({ error: "El nombre es obligatorio" });
            return;
        }
        if (!contratoId) {
            res.status(400).json({ error: "Elegí a qué Contrato pertenece esta plantilla" });
            return;
        }
        const contrato = await Contrato.findById(contratoId).lean();
        if (!contrato) {
            res.status(400).json({ error: "El Contrato elegido no existe" });
            return;
        }
        const idNum = externalId ? Number(externalId) : undefined;
        const created = await ContratoFrame.create({
            name: String(nombre).trim(),
            externalId: externalId ? String(externalId).trim() : "",
            content: htmlHasText(content) ? String(content) : "",
            contratoId: contrato._id,
            usaMembrete: usaMembrete === "true" || usaMembrete === true,
            isActive: isActive === undefined ? true : isActive === "true" || isActive === true,
            // Se copian del Contrato: son la fuente de verdad. Se mantienen acá porque todo el resto del
            // código (wizard, PDF, filtros) lee estos campos directamente de la Plantilla.
            data: {
                id: idNum !== undefined && !isNaN(idNum) ? idNum : undefined,
                nombre: String(nombre).trim(),
                cantidadJornadas: contrato.data?.cantidadJornadas || 0,
                multiplicadorDiario: contrato.data?.multiplicadorDiario || 0,
                esTiempoIndeterminado: !!contrato.data?.esTiempoIndeterminado,
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
        const { nombre, externalId, content, contratoId, usaMembrete, isActive } = req.body;
        const item = await ContratoFrame.findById(id);
        if (!item) {
            res.status(404).json({ error: "Contrato no encontrado" });
            return;
        }
        if (usaMembrete !== undefined)
            item.usaMembrete = usaMembrete === "true" || usaMembrete === true;
        if (isActive !== undefined)
            item.isActive = isActive === "true" || isActive === true;
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
            item.content = htmlHasText(content) ? String(content) : "";
        if (contratoId !== undefined) {
            if (!contratoId) {
                res.status(400).json({ error: "Elegí a qué Contrato pertenece esta plantilla" });
                return;
            }
            const contrato = await Contrato.findById(contratoId).lean();
            if (!contrato) {
                res.status(400).json({ error: "El Contrato elegido no existe" });
                return;
            }
            item.contratoId = contrato._id;
            // Se sincronizan con el Contrato elegido (fuente de verdad de estos tres campos).
            item.data.cantidadJornadas = contrato.data?.cantidadJornadas || 0;
            item.data.multiplicadorDiario = contrato.data?.multiplicadorDiario || 0;
            item.data.esTiempoIndeterminado = !!contrato.data?.esTiempoIndeterminado;
        }
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
