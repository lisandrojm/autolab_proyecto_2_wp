import { Worker, Job } from "bullmq";
import { redis, JOBS_ENABLED, AssetDeriveJob } from "../../config/queue.js";
import { Asset } from "./assets.model.js";
import { createStorageProvider, LocalStorageProvider } from "../../config/storage.js";
import { env } from "../../config/env.js";
import fs from "fs/promises";

const storage = createStorageProvider();

// Carga on-demand de sharp para evitar romper el boot si no está listo
async function getSharp() {
  const mod = await import("sharp");
  return (mod as any).default ?? (mod as any);
}

// Forzar rutas POSIX (útil en Windows)
function toPosix(p: string) {
  return p.replace(/\\/g, "/");
}

function mergeVariants(existing: Array<{ name: string; path: string; mimeType: string; bytes: number }>, incoming: Array<{ name: string; path: string; mimeType: string; bytes: number }>) {
  const byName = new Map(existing.map((v) => [v.name, v]));
  for (const v of incoming) byName.set(v.name, v);
  return Array.from(byName.values());
}

async function generateImageVariants(originalPath: string) {
  const variants: Array<{ name: string; path: string; mimeType: string; bytes: number }> = [];

  if (env.STORAGE_PROVIDER !== "local") {
    console.log("[assets-derive] Cloud image variants not implemented yet");
    return variants;
  }
  if (!env.FEATURE_TRANSCODE) return variants;

  try {
    const localStorage = storage as LocalStorageProvider;
    const filePath = localStorage.getFilePath(toPosix(originalPath));
    const imageBuffer = await fs.readFile(filePath);
    const sharp = await getSharp();

    // thumb (300x300)
    const thumbBuffer = await sharp(imageBuffer).resize(300, 300, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();

    const thumbPath = toPosix(originalPath)
      .replace("/originals/", "/derivatives/")
      .replace(/\.[^.]+$/, "_thumb.jpg");

    await storage.uploadFile(thumbPath, thumbBuffer, "image/jpeg");
    variants.push({ name: "thumb", path: thumbPath, mimeType: "image/jpeg", bytes: thumbBuffer.length });

    // web (1200 max width)
    const webBuffer = await sharp(imageBuffer).resize(1200, null, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();

    const webPath = toPosix(originalPath)
      .replace("/originals/", "/derivatives/")
      .replace(/\.[^.]+$/, "_web.jpg");

    await storage.uploadFile(webPath, webBuffer, "image/jpeg");
    variants.push({ name: "web", path: webPath, mimeType: "image/jpeg", bytes: webBuffer.length });
  } catch (error) {
    console.error("[assets-derive] generateImageVariants error:", error);
  }
  return variants;
}

async function generateVideoVariants(originalPath: string) {
  const variants: Array<{ name: string; path: string; mimeType: string; bytes: number }> = [];

  if (env.STORAGE_PROVIDER !== "local") {
    console.log("[assets-derive] Cloud video variants not implemented yet");
    return variants;
  }
  if (!env.FEATURE_TRANSCODE) return variants;

  // TODO: implementar con ffmpeg (snapshot + 720p)
  console.log("[assets-derive] Video processing not implemented yet");
  return variants;
}

// ✅ Declaramos la variable arriba…
let assetsWorker: Worker | undefined;

// …y la inicializamos condicionalmente sin usar `export` dentro del if
if (JOBS_ENABLED && redis) {
  assetsWorker = new Worker(
    "assets-derive",
    async (job: Job<AssetDeriveJob>) => {
      const { assetId, tenantId, kind, originalPath: rawOriginalPath } = job.data;
      const originalPath = toPosix(rawOriginalPath);

      try {
        if (!env.FEATURE_TRANSCODE) {
          console.log(`[assets-derive] FEATURE_TRANSCODE=false → skip ${assetId}`);
          return;
        }

        const asset = await Asset.findOne({ _id: assetId, tenantId });
        if (!asset) throw new Error("Asset not found");

        let newVariants: Array<{ name: string; path: string; mimeType: string; bytes: number }> = [];

        if (kind === "image") {
          newVariants = await generateImageVariants(originalPath);
        } else if (kind === "video") {
          newVariants = await generateVideoVariants(originalPath);
        } else {
          console.log(`[assets-derive] kind ${kind} no-op`);
        }

        const existing = Array.isArray(asset.variants) ? asset.variants : [];
        const merged = mergeVariants(existing, newVariants);

        asset.variants = merged;
        asset.status = "ready";
        await asset.save();

        console.log(`[assets-derive] ${assetId} OK (${newVariants.length} nuevas, ${merged.length} total)`);
      } catch (error) {
        console.error(`[assets-derive] FAIL ${assetId}:`, error);
        await Asset.updateOne({ _id: assetId, tenantId }, { status: "failed" });
        throw error;
      }
    },
    { connection: redis, concurrency: 2 }
  );

  console.log("Assets worker started");

  const shutdown = async () => {
    try {
      await assetsWorker?.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} else {
  console.warn("[assets-derive] Worker no iniciado (sin Redis o jobs deshabilitados)");
}

// ✅ …y recién acá la exportamos (si no se inició, exporta `undefined`)
export { assetsWorker };
