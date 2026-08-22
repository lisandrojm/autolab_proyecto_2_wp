import { Router } from "express";
import { z } from "zod";
import { Release } from "../models/Release.js";
import { ReleaseTipo } from "../models/ReleaseTipo.js";
import { Company } from "../models/Company.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { buildEmployeeDocData } from "../utils/employeeDocData.js";
import { nombreArchivoDocumento } from "../services/nomenclaturaService.js";
import { buildDocPdf, getDummyDocVariables, htmlHasText, empresaToMembrete } from "../utils/documentPdf.js";
const router = Router();
// El release se redacta en la plataforma (editor con formato) y se guarda como HTML en `content`.
// El PDF se genera al descargar, reemplazando las variables `{{variable}}`.
const ReleaseSchema = z.object({
    name: z.string().min(1).max(150),
    version: z.string().min(1).max(50),
    description: z.string().max(2000).optional(),
    content: z.string().max(200000).optional(),
    releaseTipoId: z.string().optional(),
    isActive: z
        .union([z.boolean(), z.string()])
        .optional()
        .transform((v) => (typeof v === "string" ? v === "true" : v)),
    usaMembrete: z
        .union([z.boolean(), z.string()])
        .optional()
        .transform((v) => (typeof v === "string" ? v === "true" : v)),
});
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
router.get("/", authenticateToken, requireTenant, async (req, res) => {
    try {
        const releases = await Release.find({
            tenantId: req.tenantObjectId,
        })
            .sort({ createdAt: -1 })
            .populate({ path: "releaseTipoId", select: "name isActive requiereFirma", model: ReleaseTipo });
        res.json(releases);
    }
    catch (error) {
        console.error("Get releases error:", error);
        res.status(500).json({ error: "Error al obtener releases" });
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
// POST /releases/preview — genera un PDF de ejemplo con el contenido del editor (sin guardar).
router.post("/preview", authenticateToken, requireTenant, async (req, res) => {
    try {
        const { content, usaMembrete } = z
            .object({ content: z.string().max(200000), usaMembrete: z.union([z.boolean(), z.string()]).optional() })
            .parse(req.body);
        const membrete = await getExampleMembrete(usaMembrete === true || usaMembrete === "true");
        const buffer = await buildDocPdf(content, getDummyDocVariables(), membrete);
        sendPdf(res, buffer, "Preview_Release");
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Datos inválidos", details: error.errors });
            return;
        }
        console.error("Preview release error:", error);
        res.status(500).json({ error: "No se pudo generar la previsualización" });
    }
});
router.get("/:id", authenticateToken, requireTenant, async (req, res) => {
    try {
        const release = await Release.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
        });
        if (!release) {
            res.status(404).json({ error: "Release no encontrado" });
            return;
        }
        res.json(release);
    }
    catch (error) {
        console.error("Get release error:", error);
        res.status(500).json({ error: "Error al obtener release" });
    }
});
// GET /releases/:id/download — PDF del release con valores de ejemplo (sin persona asociada).
router.get("/:id/download", authenticateToken, requireTenant, async (req, res) => {
    try {
        const release = await Release.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
        if (!release) {
            res.status(404).json({ error: "Release no encontrado" });
            return;
        }
        if (!htmlHasText(release.content)) {
            res.status(400).json({ error: "El release no tiene contenido redactado" });
            return;
        }
        const membrete = await getExampleMembrete(!!release.usaMembrete);
        const buffer = await buildDocPdf(release.content, getDummyDocVariables(), membrete);
        sendPdf(res, buffer, `${release.name || "Release"}`);
    }
    catch (error) {
        console.error("Download release error:", error);
        res.status(500).json({ error: "Error al generar el archivo" });
    }
});
/**
 * Arma el PDF del Release con las variables reemplazadas por los datos de la persona/contrato y de
 * la empresa elegida (releaseEmpresas del proyecto) — misma lógica que usaba `/download-filled`
 * directo en el handler, reutilizable desde otros routers (p. ej. "Generar" de Firma Digital) sin
 * pasar por un round-trip HTTP.
 */
export async function generarReleasePdf(opts) {
    const { tenantId, releaseId, userId, projectId, contractIndex, empresaId } = opts;
    const release = await Release.findOne({ _id: releaseId, tenantId });
    if (!release)
        throw new Error("Release no encontrado");
    if (!htmlHasText(release.content))
        throw new Error("El release no tiene contenido redactado");
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
    const empresas = project?.releaseEmpresas || [];
    const empresasIds = empresas.map((e) => String(e));
    const empresaIdValida = !!empresaId && (empresasIds.length === 0 || empresasIds.includes(String(empresaId)));
    const chosenId = empresaIdValida ? String(empresaId) : empresasIds[0];
    const empresa = chosenId ? await Company.findById(chosenId).lean() : null;
    const data = await buildEmployeeDocData(user, up, contract, empresa);
    const membrete = release.usaMembrete && empresa ? empresaToMembrete(empresa) : undefined;
    const buffer = await buildDocPdf(release.content, data, membrete);
    // Ver `nomenclaturaService`: el patrón es configurable y el default reproduce el nombre de antes.
    const filename = await nombreArchivoDocumento({ tenantId: opts.tenantId, tipo: "Release", user, up, contract, empresa, docName: release.name, extra: opts.extra });
    return { buffer, filename, empresaIdUsado: chosenId || "" };
}
// GET /releases/:id/download-filled?userId=&projectId=&contractIndex=
// Genera el PDF del release con las variables reemplazadas por los datos de la persona/contrato
// y de la empresa seteada en el proyecto (releaseEmpresas).
router.get("/:id/download-filled", authenticateToken, requireTenant, async (req, res) => {
    try {
        const { userId, projectId, contractIndex, empresaId } = req.query;
        const { buffer, filename } = await generarReleasePdf({
            tenantId: String(req.tenantObjectId),
            releaseId: req.params.id,
            userId: String(userId),
            projectId: String(projectId),
            contractIndex: Number(contractIndex),
            empresaId,
        });
        sendPdf(res, buffer, filename);
    }
    catch (error) {
        console.error("Download filled release error:", error);
        const msg = String(error?.message || "");
        const status = /no encontrado/i.test(msg) ? 404 : /no tiene contenido redactado/i.test(msg) ? 400 : 500;
        res.status(status).json({ error: msg || "No se pudo generar el release con los datos." });
    }
});
router.post("/", authenticateToken, requireTenant, async (req, res) => {
    try {
        const validatedData = ReleaseSchema.parse(req.body);
        if (!validatedData.releaseTipoId) {
            res.status(400).json({ error: "El tipo de release es obligatorio" });
            return;
        }
        const tipo = await ReleaseTipo.findOne({ _id: validatedData.releaseTipoId, tenantId: req.tenantObjectId }).lean();
        if (!tipo) {
            res.status(400).json({ error: "El tipo de release seleccionado no existe" });
            return;
        }
        const release = new Release({
            ...validatedData,
            content: htmlHasText(validatedData.content) ? validatedData.content : "",
            tenantId: req.tenantObjectId,
        });
        await release.save();
        res.status(201).json(release);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Datos inválidos", details: error.errors });
            return;
        }
        console.error("Create release error:", error);
        res.status(500).json({ error: "Error al crear release" });
    }
});
router.put("/:id", authenticateToken, requireTenant, async (req, res) => {
    try {
        const validatedData = ReleaseSchema.parse(req.body);
        const release = await Release.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
        });
        if (!release) {
            res.status(404).json({ error: "Release no encontrado" });
            return;
        }
        if (validatedData.releaseTipoId !== undefined) {
            if (!validatedData.releaseTipoId) {
                res.status(400).json({ error: "El tipo de release es obligatorio" });
                return;
            }
            const tipo = await ReleaseTipo.findOne({ _id: validatedData.releaseTipoId, tenantId: req.tenantObjectId }).lean();
            if (!tipo) {
                res.status(400).json({ error: "El tipo de release seleccionado no existe" });
                return;
            }
            release.releaseTipoId = tipo._id;
        }
        release.name = validatedData.name;
        release.version = validatedData.version;
        if (validatedData.description !== undefined)
            release.description = validatedData.description;
        if (validatedData.content !== undefined)
            release.content = htmlHasText(validatedData.content) ? validatedData.content : "";
        if (validatedData.isActive !== undefined)
            release.isActive = validatedData.isActive;
        if (validatedData.usaMembrete !== undefined)
            release.usaMembrete = validatedData.usaMembrete;
        await release.save();
        res.json(release);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Datos inválidos", details: error.errors });
            return;
        }
        console.error("Update release error:", error);
        res.status(500).json({ error: "Error al actualizar release" });
    }
});
router.delete("/:id", authenticateToken, requireTenant, async (req, res) => {
    try {
        const release = await Release.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
        });
        if (!release) {
            res.status(404).json({ error: "Release no encontrado" });
            return;
        }
        await release.deleteOne();
        res.json({ message: "Release eliminado correctamente" });
    }
    catch (error) {
        console.error("Delete release error:", error);
        res.status(500).json({ error: "Error al eliminar release" });
    }
});
export { router as ReleaseRoutes };
