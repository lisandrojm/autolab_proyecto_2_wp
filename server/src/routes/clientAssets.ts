import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { requireTenant } from "../middleware/tenant.js";
import { authenticateToken } from "../middleware/auth.js";
import { Asset } from "../models/Asset.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function ensureDir(dir: string) {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    console.log("Carpeta asegurada:", dir);
  } catch (err) {
    console.error("Error creando carpeta:", dir, err);
    throw err;
  }
}

function createStorage(scope: "brandkit" | "campaigns" | "assets" | "posts") {
  return multer.diskStorage({
    destination: async (req: any, _file, cb) => {
      try {
        const tenantId = req.tenantId || "unknown_tenant";
        const userId = req.user?.userId || "unknown_user";
        const isPersonalAsset = req.parsedIsPersonalAsset === true;

        let identifier: string;
        let dir: string;

        if (isPersonalAsset) {
          identifier = userId;
          dir = path.join(__dirname, "../../storage", tenantId, userId, scope);
          console.log(`[${scope}] Multer destination (PERSONAL) - tenantId: ${tenantId}, userId: ${userId}`);
        } else {
          identifier = req.parsedClientId || req.query.clientId || "default_client";
          dir = path.join(__dirname, "../../storage", tenantId, identifier, scope);
          console.log(`[${scope}] Multer destination (CLIENT) - tenantId: ${tenantId}, clientId: ${identifier}`);
        }

        await ensureDir(dir);
        cb(null, dir);
      } catch (err) {
        console.error(`[${scope}] Error en multer destination:`, err);
        cb(err as any, "");
      }
    },
    filename: (req: any, file, cb) => {
      const ext = path.extname(file.originalname);
      const assetId = req.assetId || new mongoose.Types.ObjectId();
      const filename = `asset_${assetId}${ext}`;
      console.log(`[${scope}] Multer filename: ${filename} para archivo: ${file.originalname}`);
      cb(null, filename);
    },
  });
}

// Middleware para capturar clientId e isPersonalAsset del query antes de multer
// IMPORTANTE: Debe ejecutarse ANTES de multer
const captureIdentifiers = (req: any, _res: any, next: any) => {
  // Capturar del query (disponible antes de multer)
  if (req.query.clientId) {
    req.parsedClientId = req.query.clientId;
    console.log("ClientId capturado del query:", req.query.clientId);
  }

  // Capturar flag de asset personal
  if (req.query.isPersonalAsset === 'true') {
    req.parsedIsPersonalAsset = true;
    console.log("Asset personal detectado:", true);
  } else {
    req.parsedIsPersonalAsset = false;
  }

  next();
};

// ---------------------------
// Middlewares multer por scope
// ---------------------------
const fileFilterImages = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/svg+xml", "image/bmp", "image/tiff", "image/x-icon"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Solo se permiten imágenes en formatos: PNG, JPG, GIF, WebP, SVG, BMP, TIFF"));
};

const fileFilterAllTypes = (_req: any, file: Express.Multer.File, cb: any) => {
  const prohibited = [
    "application/x-msdownload", // .exe
    "application/x-msdos-program",
    "application/x-sh", // .sh
    "application/x-bat", // .bat
    "application/x-executable",
    "application/x-apple-diskimage", // .dmg
    "application/vnd.microsoft.portable-executable",
    "application/x-java-archive", // .jar
    "application/x-msi", // .msi
  ];

  const prohibitedExtensions = ['.exe', '.bat', '.sh', '.app', '.dmg', '.com', '.scr', '.vbs', '.jar', '.msi', '.cmd'];
  const fileExt = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

  if (prohibited.includes(file.mimetype) || prohibitedExtensions.includes(fileExt)) {
    cb(new Error("Tipo de archivo no permitido por razones de seguridad"));
  } else {
    cb(null, true);
  }
};

const uploadBrandkit = multer({
  storage: createStorage("brandkit"),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilterImages,
});

const uploadBrandkitDocuments = multer({
  storage: createStorage("brandkit"),
  limits: { fileSize: 40 * 1024 * 1024 }, // 40MB for documents
  fileFilter: fileFilterAllTypes,
});

const uploadCampaigns = multer({
  storage: createStorage("campaigns"),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilterImages,
});

const uploadclientAssets = multer({
  storage: createStorage("assets"),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilterImages,
});

const uploadPosts = multer({
  storage: createStorage("posts"),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilterImages,
});

// ---------------------------
// Función que registra rutas por scope
// ---------------------------
function registerScopeRoutes(scope: "brandkit" | "campaigns" | "assets" | "posts", upload: multer.Multer) {
  // const base = scope === "client-assets" ? "assets" : scope;

  // GET lista
  router.get(`/${scope}`, requireTenant, authenticateToken, async (req, res) => {
    try {
      const assets = await Asset.find({ tenantId: req.tenantId, scope });
      return res.json(assets);
    } catch (err) {
      console.error(`GET list error [${scope}]:`, err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET detalle
  router.get(`/${scope}/:id`, requireTenant, authenticateToken, async (req, res) => {
    try {
      const asset = await Asset.findOne({ _id: req.params.id, tenantId: req.tenantId, scope });
      if (!asset) return res.status(404).json({ error: "Asset not found" });
      return res.json(asset);
    } catch (err) {
      console.error(`GET detail error [${scope}]:`, err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST upload con manejo robusto de errores
  router.post(
    `/${scope}/upload`,
    requireTenant,
    authenticateToken,
    captureIdentifiers,
    (req: any, res: any, next: any) => {
      console.log(`[${scope}] Antes de multer - Headers:`, {
        contentType: req.headers["content-type"],
        authorization: req.headers["authorization"] ? "presente" : "ausente",
        tenantId: req.headers["x-tenant-id"],
      });
      console.log(`[${scope}] Query params:`, req.query);
      console.log(`[${scope}] ParsedClientId:`, req.parsedClientId);
      console.log(`[${scope}] TenantId from req:`, req.tenantId);
      next();
    },
    upload.single("file"),
    (err: any, req: any, res: any, next: any) => {
      // Error handler para multer
      if (err) {
        console.error(`[${scope}] Multer error:`, err);
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: "El archivo supera el tamaño máximo de 5MB" });
          }
          return res.status(400).json({ error: `Error de multer: ${err.message}` });
        }
        return res.status(500).json({ error: err.message || "Error al procesar el archivo" });
      }
      next();
    },
    async (req: any, res: any) => {
      try {
        if (!req.file) {
          console.error("No file in request");
          return res.status(400).json({ error: "No se recibió ningún archivo" });
        }

        const tenantId = req.tenantId;
        const userId = req.user.userId;
        const isPersonalAsset = req.parsedIsPersonalAsset === true;
        const clientId = req.parsedClientId || req.query.clientId || req.body?.clientId;

        console.log(`Upload request [${scope}]:`, {
          hasFile: !!req.file,
          fileDetails: {
            filename: req.file.filename,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
          },
          clientId,
          tenantId,
          userId,
          isPersonalAsset,
        });

        if (!clientId && !isPersonalAsset) {
          console.error("Missing clientId for client asset");
          return res.status(400).json({ error: "Se requiere clientId para assets del cliente" });
        }

        const fileExt = path.extname(req.file.originalname);
        const assetId = new mongoose.Types.ObjectId();
        const newFilename = `asset_${assetId}${fileExt}`;
        const oldPath = req.file.path;
        const newPath = path.join(path.dirname(oldPath), newFilename);

        await fs.promises.rename(oldPath, newPath);

        // Generar URL relativa para evitar problemas de dominio
        const identifier = isPersonalAsset ? userId : clientId;
        const relativePath = `/storage/${tenantId}/${identifier}/${scope}/${newFilename}`;

        // Generar URL completa solo para respuesta (no para DB)
        const fullUrl = `${req.protocol}://${req.get("host")}${relativePath}`;
        console.log(`Archivo subido [${scope}] (${isPersonalAsset ? 'PERSONAL' : 'CLIENT'}):`, fullUrl);

        const asset = new Asset({
          _id: assetId,
          tenantId,
          clientId,
          creadoPor: userId,
          scope,
          tipo: "imagen",
          nombre: newFilename,
          url: relativePath,
          tags: [],
          permisos: { editores: [], visores: [] },
        });

        await asset.save();

        return res.status(201).json({
          assetId: asset._id,
          filename: newFilename,
          path: relativePath,
          url: fullUrl,
        });
      } catch (err: any) {
        console.error(`Upload error [${scope}]:`, err);
        return res.status(500).json({ error: err.message || "Error interno del servidor" });
      }
    }
  );

  // PATCH update
  router.patch(`/${scope}/:id`, requireTenant, authenticateToken, async (req, res) => {
    try {
      const asset = await Asset.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId, scope }, req.body, { new: true });
      if (!asset) return res.status(404).json({ error: "Asset not found" });
      return res.json(asset);
    } catch (err) {
      console.error(`PATCH error [${scope}]:`, err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE
  router.delete(`/${scope}/:id`, requireTenant, authenticateToken, async (req, res) => {
    try {
      const asset = await Asset.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId, scope });
      if (!asset) return res.status(404).json({ error: "Asset not found" });
      return res.json({ message: `${scope} asset deleted successfully` });
    } catch (err) {
      console.error(`DELETE error [${scope}]:`, err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}

// ---------------------------
// Registrar rutas para cada scope
// ---------------------------
registerScopeRoutes("brandkit", uploadBrandkit);
registerScopeRoutes("campaigns", uploadCampaigns);
registerScopeRoutes("assets", uploadclientAssets);
registerScopeRoutes("posts", uploadPosts);

// Ruta especial para documentos del brandkit con límite de 40MB
router.post(
  "/brandkit-documents/upload",
  requireTenant,
  authenticateToken,
  captureIdentifiers,
  (req: any, res: any, next: any) => {
    console.log("[brandkit-documents] Antes de multer - Headers:", {
      contentType: req.headers["content-type"],
      authorization: req.headers["authorization"] ? "presente" : "ausente",
      tenantId: req.headers["x-tenant-id"],
    });
    console.log("[brandkit-documents] Query params:", req.query);
    console.log("[brandkit-documents] ParsedClientId:", req.parsedClientId);
    console.log("[brandkit-documents] TenantId from req:", req.tenantId);
    next();
  },
  uploadBrandkitDocuments.single("file"),
  (err: any, req: any, res: any, next: any) => {
    if (err) {
      console.error("[brandkit-documents] Multer error:", err);
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "El archivo supera el tamaño máximo de 40MB" });
        }
        return res.status(400).json({ error: `Error de multer: ${err.message}` });
      }
      return res.status(500).json({ error: err.message || "Error al procesar el archivo" });
    }
    next();
  },
  async (req: any, res: any) => {
    try {
      if (!req.file) {
        console.error("No file in request");
        return res.status(400).json({ error: "No se recibió ningún archivo" });
      }

      const tenantId = req.tenantId;
      const userId = req.user.userId;
      const isPersonalAsset = req.parsedIsPersonalAsset === true;
      const clientId = req.parsedClientId || req.query.clientId || req.body?.clientId;

      console.log("Upload document request:", {
        hasFile: !!req.file,
        fileDetails: {
          filename: req.file.filename,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
        clientId,
        tenantId,
        userId,
        isPersonalAsset,
      });

      if (!clientId && !isPersonalAsset) {
        console.error("Missing clientId for client document");
        return res.status(400).json({ error: "Se requiere clientId para documentos del cliente" });
      }

      const fileExt = path.extname(req.file.originalname);
      const assetId = new mongoose.Types.ObjectId();
      const newFilename = `asset_${assetId}${fileExt}`;
      const oldPath = req.file.path;
      const newPath = path.join(path.dirname(oldPath), newFilename);

      await fs.promises.rename(oldPath, newPath);

      const identifier = isPersonalAsset ? userId : clientId;
      const relativePath = `/storage/${tenantId}/${identifier}/brandkit/${newFilename}`;
      const fullUrl = `${req.protocol}://${req.get("host")}${relativePath}`;

      console.log(`Documento subido [brandkit-documents] (${isPersonalAsset ? 'PERSONAL' : 'CLIENT'}):`, fullUrl);

      const asset = new Asset({
        _id: assetId,
        tenantId,
        clientId,
        creadoPor: userId,
        scope: "brandkit",
        tipo: "documento",
        nombre: newFilename,
        url: relativePath,
        tags: [],
        permisos: { editores: [], visores: [] },
      });

      await asset.save();

      return res.status(201).json({
        assetId: asset._id,
        filename: newFilename,
        path: relativePath,
        url: fullUrl,
        fileType: fileExt.replace('.', ''),
      });
    } catch (err: any) {
      console.error("Upload document error:", err);
      return res.status(500).json({ error: err.message || "Error interno del servidor" });
    }
  }
);

// ---------------------------
// Endpoint de query avanzado
// ---------------------------
router.get("/query", requireTenant, authenticateToken, async (req, res) => {
  try {
    const {
      clientId,
      includeUserAssets,
      userId,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      limit = 100,
      offset = 0
    } = req.query;

    const filter: any = { tenantId: req.tenantId };
    const includeUser = includeUserAssets === 'true';
    const tenantId = req.tenantId;
    const requestUserId = userId || req.user?.userId;

    // Lógica de filtrado:
    // - includeUserAssets=false: SOLO assets del cliente (compartidos con todos los usuarios)
    // - includeUserAssets=true: Assets del cliente + assets personales del usuario actual

    if (!clientId) {
      console.log('[Query Assets] ERROR: clientId requerido');
      return res.status(400).json({ error: 'clientId es requerido' });
    }

    if (!includeUser) {
      // Caso 1: SOLO assets del cliente (compartidos)
      // Identificados porque la URL contiene /storage/{tenantId}/client/{clientId}/
      console.log('[Query Assets] Solo assets del cliente:', { clientId, tenantId });
      filter.clientId = String(clientId);
      filter.url = { $regex: `/storage/${tenantId}/client/${clientId}/` };
    } else {
      // Caso 2: Assets del cliente + assets personales del usuario
      if (!requestUserId) {
        console.log('[Query Assets] WARN: userId no disponible, mostrando solo assets del cliente');
        filter.clientId = String(clientId);
        filter.url = { $regex: `/storage/${tenantId}/client/${clientId}/` };
      } else {
        console.log('[Query Assets] Assets del cliente + personales del usuario:', {
          clientId,
          userId: requestUserId,
          tenantId
        });
        filter.$or = [
          // Assets del cliente (compartidos)
          {
            clientId: String(clientId),
            url: { $regex: `/storage/${tenantId}/client/${clientId}/` }
          },
          // Assets personales del usuario
          {
            creadoPor: String(requestUserId),
            url: { $regex: `/storage/${tenantId}/${requestUserId}/` }
          }
        ];
      }
    }

    if (search) {
      const searchConditions = [
        { nombre: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
        { 'metadata.title': { $regex: search, $options: 'i' } },
        { 'metadata.description': { $regex: search, $options: 'i' } }
      ];

      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          { $or: searchConditions }
        ];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    const sortOptions: any = {};
    const sortField = sortBy === 'nombre' ? 'nombre' : 'createdAt';
    sortOptions[sortField] = sortOrder === 'asc' ? 1 : -1;

    const assets = await Asset.find(filter)
      .sort(sortOptions)
      .limit(Number(limit))
      .skip(Number(offset))
      .lean();

    const total = await Asset.countDocuments(filter);

    console.log('[Query Assets] Results:', {
      total,
      returned: assets.length,
      includeUserAssets: includeUser,
      filter: JSON.stringify(filter)
    });

    return res.json({
      assets,
      total,
      limit: Number(limit),
      offset: Number(offset),
      hasMore: total > Number(offset) + Number(limit)
    });
  } catch (err) {
    console.error('Query assets error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------
// Endpoint de estadísticas
// ---------------------------
router.get("/stats", requireTenant, authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.query;

    const filter: any = { tenantId: req.tenantId };
    if (clientId) filter.clientId = clientId;

    const stats = await Asset.aggregate([
      { $match: filter },
      {
        $facet: {
          byScope: [
            { $group: { _id: "$scope", count: { $sum: 1 } } }
          ],
          byType: [
            { $group: { _id: "$tipo", count: { $sum: 1 } } }
          ],
          totalUsed: [
            {
              $match: {
                usedInPosts: { $exists: true, $ne: [] }
              }
            },
            { $count: "count" }
          ],
          totalUnused: [
            {
              $match: {
                $or: [
                  { usedInPosts: { $exists: false } },
                  { usedInPosts: { $size: 0 } }
                ]
              }
            },
            { $count: "count" }
          ],
          recentlyAdded: [
            {
              $match: {
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
              }
            },
            { $count: "count" }
          ]
        }
      }
    ]);

    return res.json(stats[0]);
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as clientAssetsRoutes };
