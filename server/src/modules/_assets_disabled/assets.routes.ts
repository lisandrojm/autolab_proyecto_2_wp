import { Router } from "express";
import { AssetsController } from "./assets.controller.js";
import { authenticateToken } from "../../middleware/auth.js";
import { requireTenant } from "../../middleware/tenant.js";
// Compatibilidad CJS/ESM
import multerCjs from "multer";
const multer = (multerCjs as any).default ?? (multerCjs as any);
import { LocalStorageProvider } from "../../config/storage.js";
import { env } from "../../config/env.js";
import fs from "fs";

const router = Router();

// Apply middleware to all routes
router.use(requireTenant);
router.use(authenticateToken);

// Core asset routes
router.post("/upload-url", AssetsController.generateUploadUrl);
router.post("/complete", AssetsController.completeUpload);
router.get("/:id", AssetsController.getAsset);
router.get("/:id/url", AssetsController.getAssetUrl);
router.get("/", AssetsController.listAssets);
router.delete("/:id", AssetsController.deleteAsset);

// Local development upload endpoint
if (env.STORAGE_PROVIDER === "local") {
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
  });

  router.post("/upload-local/:key", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const key = decodeURIComponent(req.params.key);
      const storage = new LocalStorageProvider();
      
      await storage.uploadFile(key, req.file.buffer, req.file.mimetype);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Local upload error:", error);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // Serve files for local development
  router.get("/serve/:key", (req, res) => {
    try {
      const key = decodeURIComponent(req.params.key);
      const storage = new LocalStorageProvider();
      const filePath = storage.getFilePath(key);
      
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      res.sendFile(filePath, { root: "/" });
    } catch (error) {
      console.error("Serve file error:", error);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });
}

export { router as assetsRoutes };