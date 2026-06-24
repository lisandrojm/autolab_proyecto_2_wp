import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { Release } from "../models/Release.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
const router = Router();
// Multer config — almacenamiento en disco por tenant
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tenantId = req.tenantObjectId.toString();
        const dest = path.join(process.cwd(), "storage", tenantId, "releases");
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, "release-" + uniqueSuffix + ext);
    },
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});
const ReleaseSchema = z.object({
    name: z.string().min(1).max(150),
    version: z.string().min(1).max(50),
    description: z.string().max(2000).optional(),
    isActive: z
        .union([z.boolean(), z.string()])
        .optional()
        .transform((v) => (typeof v === "string" ? v === "true" : v)),
});
router.get("/", authenticateToken, requireTenant, async (req, res) => {
    try {
        const releases = await Release.find({
            tenantId: req.tenantObjectId,
        }).sort({ createdAt: -1 });
        res.json(releases);
    }
    catch (error) {
        console.error("Get releases error:", error);
        res.status(500).json({ error: "Error al obtener releases" });
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
router.get("/:id/download", authenticateToken, requireTenant, async (req, res) => {
    try {
        const release = await Release.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
        });
        if (!release || !release.fileUrl) {
            res.status(404).json({ error: "Archivo no encontrado" });
            return;
        }
        const diskPath = path.join(process.cwd(), release.fileUrl.replace(/^\//, ""));
        if (!fs.existsSync(diskPath)) {
            res.status(404).json({ error: "Archivo no encontrado en el almacenamiento" });
            return;
        }
        res.download(diskPath, release.fileName || path.basename(diskPath));
    }
    catch (error) {
        console.error("Download release error:", error);
        res.status(500).json({ error: "Error al descargar archivo" });
    }
});
router.post("/", authenticateToken, requireTenant, upload.single("file"), async (req, res) => {
    try {
        const validatedData = ReleaseSchema.parse(req.body);
        const tenantIdStr = req.tenantObjectId.toString();
        const release = new Release({
            ...validatedData,
            tenantId: req.tenantObjectId,
        });
        if (req.file) {
            release.fileUrl = `/storage/${tenantIdStr}/releases/${req.file.filename}`;
            release.fileName = req.file.originalname;
        }
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
router.put("/:id", authenticateToken, requireTenant, upload.single("file"), async (req, res) => {
    try {
        const validatedData = ReleaseSchema.parse(req.body);
        const tenantIdStr = req.tenantObjectId.toString();
        const release = await Release.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
        });
        if (!release) {
            res.status(404).json({ error: "Release no encontrado" });
            return;
        }
        release.name = validatedData.name;
        release.version = validatedData.version;
        if (validatedData.description !== undefined)
            release.description = validatedData.description;
        if (validatedData.isActive !== undefined)
            release.isActive = validatedData.isActive;
        if (req.file) {
            // Eliminar archivo anterior si existía
            if (release.fileUrl) {
                const oldPath = path.join(process.cwd(), release.fileUrl.replace(/^\//, ""));
                fs.promises.unlink(oldPath).catch(() => { });
            }
            release.fileUrl = `/storage/${tenantIdStr}/releases/${req.file.filename}`;
            release.fileName = req.file.originalname;
        }
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
        if (release.fileUrl) {
            const diskPath = path.join(process.cwd(), release.fileUrl.replace(/^\//, ""));
            fs.promises.unlink(diskPath).catch(() => { });
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
