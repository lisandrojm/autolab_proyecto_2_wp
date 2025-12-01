import fs from "fs/promises";
import path from "path";

async function ensureDir(dir: string): Promise<void> {
  try {
    console.log("[PDF STORAGE] Creating directory:", dir);
    await fs.mkdir(dir, { recursive: true });
    console.log("[PDF STORAGE] Directory created successfully:", dir);
  } catch (err) {
    console.error("[PDF STORAGE ERROR] Error creating directory:", dir, err);
    throw err;
  }
}

export async function savePdfToStorage(
  tenantId: string,
  userId: string,
  orderNumber: string,
  pdfBuffer: Buffer
): Promise<string> {
  try {
    console.log("[PDF STORAGE] Starting PDF save process...");
    console.log("[PDF STORAGE] Tenant ID:", tenantId);
    console.log("[PDF STORAGE] User ID:", userId);
    console.log("[PDF STORAGE] Order Number:", orderNumber);
    console.log("[PDF STORAGE] Buffer size:", pdfBuffer.length, "bytes");

    const serverRoot = process.cwd();
    console.log("[PDF STORAGE] Server root (process.cwd()):", serverRoot);

    const storageDir = path.join(serverRoot, "storage", tenantId, userId, "orders", "pdfs");
    console.log("[PDF STORAGE] Storage directory path:", storageDir);

    await ensureDir(storageDir);

    const timestamp = Date.now();
    const sanitizedOrderNumber = orderNumber.replace(/[^a-zA-Z0-9-]/g, "_");
    const filename = `pedido_${sanitizedOrderNumber}_${timestamp}.pdf`;
    console.log("[PDF STORAGE] Filename:", filename);

    const filePath = path.join(storageDir, filename);
    console.log("[PDF STORAGE] Full file path:", filePath);

    await fs.writeFile(filePath, pdfBuffer);
    console.log("[PDF STORAGE] PDF file written successfully!");

    const fileStats = await fs.stat(filePath);
    console.log("[PDF STORAGE] File size on disk:", fileStats.size, "bytes");

    const publicUrl = `/storage/${tenantId}/${userId}/orders/pdfs/${filename}`;
    console.log("[PDF STORAGE] Public URL:", publicUrl);

    return publicUrl;
  } catch (error) {
    console.error("[PDF STORAGE ERROR] Error saving PDF to storage:", error);
    if (error instanceof Error) {
      console.error("[PDF STORAGE ERROR] Error message:", error.message);
      console.error("[PDF STORAGE ERROR] Error stack:", error.stack);
    }
    throw new Error("Failed to save PDF to storage");
  }
}

export async function deletePdfFromStorage(pdfUrl: string): Promise<void> {
  try {
    if (!pdfUrl) return;

    const serverRoot = process.cwd();
    const filePath = path.join(serverRoot, pdfUrl);

    console.log("[PDF STORAGE] Deleting PDF file:", filePath);
    await fs.unlink(filePath);
    console.log("[PDF STORAGE] PDF file deleted successfully");
  } catch (error) {
    console.error("[PDF STORAGE ERROR] Error deleting PDF from storage:", error);
  }
}
