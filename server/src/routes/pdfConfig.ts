import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { PdfConfig } from "../models/PdfConfig.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

// Multer config
const storage = multer.diskStorage({
  destination: (req: any, file, cb) => {
    const tenantId = req.tenantObjectId.toString();
    const dest = path.join(process.cwd(), "storage", tenantId, "pdf_config");
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten imágenes JPG y PNG. No se admiten SVG."));
    }
  },
});

router.get("/", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const config = await PdfConfig.getOrCreateDefault(req.tenantObjectId);
    res.json(config);
  } catch (error) {
    console.error("Get PDF Global Config error:", error);
    res.status(500).json({ error: "Error al obtener configuración" });
  }
});

router.put(
  "/",
  authenticateToken,
  requireTenant,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "signature", maxCount: 1 },
  ]),
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      const { razonSocial, cuit, ciudad, direccion, logoUrl, signatureUrl, signerName, signerRole } = req.body;

      let config = await PdfConfig.findOne({ tenantId: req.tenantObjectId });
      if (!config) {
        config = new PdfConfig({ tenantId: req.tenantObjectId });
      }

      if (razonSocial !== undefined) config.razonSocial = razonSocial;
      if (cuit !== undefined) config.cuit = cuit;
      if (ciudad !== undefined) config.ciudad = ciudad;
      if (direccion !== undefined) config.direccion = direccion;
      if (logoUrl !== undefined) config.logoUrl = logoUrl;
      if (signatureUrl !== undefined) config.signatureUrl = signatureUrl;
      if (signerName !== undefined) config.signerName = signerName;
      if (signerRole !== undefined) config.signerRole = signerRole;

      const tenantIdStr = req.tenantObjectId.toString();

      if (files?.logo?.[0]) {
        config.logoUrl = `/storage/${tenantIdStr}/pdf_config/${files.logo[0].filename}`;
      }

      if (files?.signature?.[0]) {
        config.signatureUrl = `/storage/${tenantIdStr}/pdf_config/${files.signature[0].filename}`;
      }

      await config.save();
      res.json(config);
    } catch (error) {
      console.error("Update PDF Global Config error:", error);
      res.status(500).json({ error: "Error al actualizar configuración" });
    }
  },
);

export { router as PdfConfigRoutes };
