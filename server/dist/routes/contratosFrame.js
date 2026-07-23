import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import xlsx from "xlsx";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Company } from "../models/Company.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { authenticateToken } from "../middleware/auth.js";
import { fillDocxTemplate } from "../utils/releaseFiller.js";
import { buildEmployeeDocData, buildDocFileName } from "../utils/employeeDocData.js";
const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
// Multer config — almacenamiento en disco para el archivo del contrato
const fileStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const dest = path.join(process.cwd(), "storage", "contratos");
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, "contrato-" + uniqueSuffix + ext);
    },
});
const fileUpload = multer({
    storage: fileStorage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});
const parseNum = (val) => {
    if (val === undefined || val === null || val === "")
        return 0;
    const n = Number(val);
    return isNaN(n) ? 0 : n;
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
// GET /template - plantilla Excel
router.get("/template", authenticateToken, async (_req, res) => {
    try {
        const wsData = [
            ["ID Externo (opcional)", "Nombre", "Cantidad Jornadas", "Multiplicador Diario", "Ruta Archivo"],
            ["", "Jornada 2030 SRL", 1, 1.0, ""],
            ["", "Contrato Mensual", 22, 1.0, ""],
        ];
        const ws = xlsx.utils.aoa_to_sheet(wsData);
        ws["!cols"] = [{ wch: 18 }, { wch: 40 }, { wch: 18 }, { wch: 20 }, { wch: 30 }];
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Contratos");
        const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=plantilla_contratos.xlsx");
        res.send(buffer);
    }
    catch (error) {
        console.error("Download contratos-frame template error:", error);
        res.status(500).json({ error: "No se pudo generar la plantilla" });
    }
});
// GET /:id/download - descargar/previsualizar el archivo del contrato
router.get("/:id/download", authenticateToken, async (req, res) => {
    try {
        const item = await ContratoFrame.findById(req.params.id);
        if (!item || !item.data?.fileUrl) {
            res.status(404).json({ error: "Archivo no encontrado" });
            return;
        }
        const diskPath = path.join(process.cwd(), item.data.fileUrl.replace(/^\//, ""));
        if (!fs.existsSync(diskPath)) {
            res.status(404).json({ error: "Archivo no encontrado en el almacenamiento" });
            return;
        }
        res.download(diskPath, item.data.fileName || path.basename(diskPath));
    }
    catch (error) {
        console.error("Download ContratoFrame file error:", error);
        res.status(500).json({ error: "Error al descargar archivo" });
    }
});
// GET /:id/download-filled?userId=&projectId=&contractIndex=
// Descarga la plantilla del contrato (.docx) con las variables reemplazadas por los datos del empleado/contrato.
router.get("/:id/download-filled", authenticateToken, async (req, res) => {
    try {
        const item = await ContratoFrame.findById(req.params.id);
        if (!item || !item.data?.fileUrl) {
            res.status(404).json({ error: "Archivo no encontrado" });
            return;
        }
        const diskPath = path.join(process.cwd(), item.data.fileUrl.replace(/^\//, ""));
        if (!fs.existsSync(diskPath)) {
            res.status(404).json({ error: "Archivo no encontrado en el almacenamiento" });
            return;
        }
        const ext = path.extname(item.data.fileName || diskPath).toLowerCase();
        if (ext !== ".docx") {
            res.download(diskPath, item.data.fileName || path.basename(diskPath));
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
        const buffer = fs.readFileSync(diskPath);
        const filled = fillDocxTemplate(buffer, data);
        const baseName = buildDocFileName({ tipo: "Contrato", user, up, contract });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="${baseName}.docx"`);
        res.send(filled);
    }
    catch (error) {
        console.error("Download filled ContratoFrame error:", error);
        res.status(500).json({ error: "No se pudo generar el contrato con los datos." });
    }
});
// POST /import - importar desde Excel
router.post("/import", authenticateToken, upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: "Debe subir un archivo de Excel" });
            return;
        }
        const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = xlsx.utils.sheet_to_json(worksheet);
        if (rawRows.length === 0) {
            res.status(400).json({ error: "El archivo de Excel está vacío" });
            return;
        }
        const errors = [];
        const parsed = [];
        for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            const rowNum = i + 2;
            const nombre = row["Nombre"] ?? row["nombre"];
            if (!nombre || String(nombre).trim() === "") {
                errors.push(`Fila ${rowNum}: La columna 'Nombre' es obligatoria.`);
                continue;
            }
            parsed.push({
                externalId: String(row["ID Externo (opcional)"] ?? row["ID Externo"] ?? row["externalId"] ?? "").trim(),
                nombre: String(nombre).trim(),
                cantidadJornadas: parseNum(row["Cantidad Jornadas"] ?? row["cantidadJornadas"] ?? row["Cantidad de Jornadas"]),
                multiplicadorDiario: parseNum(row["Multiplicador Diario"] ?? row["multiplicadorDiario"]),
                rutaArchivo: String(row["Ruta Archivo"] ?? row["rutaArchivo"] ?? "").trim(),
            });
        }
        if (errors.length > 0) {
            res.status(400).json({ error: "Errores de validación en el archivo Excel", details: errors });
            return;
        }
        const bulkOps = parsed.map((item) => {
            const idNum = item.externalId ? Number(item.externalId) : undefined;
            return {
                updateOne: {
                    filter: item.externalId ? { externalId: item.externalId } : { name: item.nombre },
                    update: {
                        $set: {
                            name: item.nombre,
                            externalId: item.externalId,
                            data: {
                                id: idNum !== undefined && !isNaN(idNum) ? idNum : undefined,
                                nombre: item.nombre,
                                rutaArchivo: item.rutaArchivo,
                                cantidadJornadas: item.cantidadJornadas,
                                multiplicadorDiario: item.multiplicadorDiario,
                            },
                        },
                    },
                    upsert: true,
                },
            };
        });
        let processed = 0;
        if (bulkOps.length > 0) {
            const result = await ContratoFrame.bulkWrite(bulkOps);
            processed = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
        }
        res.json({ message: "Importación masiva completada con éxito", count: processed });
    }
    catch (error) {
        console.error("Import contratos-frame error:", error);
        res.status(500).json({ error: "Error interno al procesar el archivo Excel" });
    }
});
// POST / - crear
router.post("/", authenticateToken, fileUpload.single("file"), async (req, res) => {
    try {
        const { nombre, externalId, cantidadJornadas, multiplicadorDiario, rutaArchivo, esTiempoIndeterminado } = req.body;
        if (!nombre || !nombre.trim()) {
            res.status(400).json({ error: "El nombre es obligatorio" });
            return;
        }
        const idNum = externalId ? Number(externalId) : undefined;
        const file = req.file;
        const created = await ContratoFrame.create({
            name: nombre.trim(),
            externalId: externalId ? String(externalId).trim() : "",
            data: {
                id: idNum !== undefined && !isNaN(idNum) ? idNum : undefined,
                nombre: nombre.trim(),
                rutaArchivo: String(rutaArchivo || "").trim(),
                cantidadJornadas: parseNum(cantidadJornadas),
                multiplicadorDiario: parseNum(multiplicadorDiario),
                fileUrl: file ? `/storage/contratos/${file.filename}` : "",
                fileName: file ? file.originalname : "",
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
router.put("/:id", authenticateToken, fileUpload.single("file"), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, externalId, cantidadJornadas, multiplicadorDiario, rutaArchivo, esTiempoIndeterminado } = req.body;
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
        if (cantidadJornadas !== undefined)
            item.data.cantidadJornadas = parseNum(cantidadJornadas);
        if (multiplicadorDiario !== undefined)
            item.data.multiplicadorDiario = parseNum(multiplicadorDiario);
        if (rutaArchivo !== undefined)
            item.data.rutaArchivo = String(rutaArchivo).trim();
        if (esTiempoIndeterminado !== undefined)
            item.data.esTiempoIndeterminado = esTiempoIndeterminado === "true" || esTiempoIndeterminado === true;
        const file = req.file;
        if (file) {
            // Eliminar archivo anterior si existía
            if (item.data.fileUrl) {
                const oldPath = path.join(process.cwd(), item.data.fileUrl.replace(/^\//, ""));
                fs.promises.unlink(oldPath).catch(() => { });
            }
            item.data.fileUrl = `/storage/contratos/${file.filename}`;
            item.data.fileName = file.originalname;
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
        if (item.data?.fileUrl) {
            const diskPath = path.join(process.cwd(), item.data.fileUrl.replace(/^\//, ""));
            fs.promises.unlink(diskPath).catch(() => { });
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
