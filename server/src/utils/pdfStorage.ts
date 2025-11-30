import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    console.error("Error creating directory:", dir, err);
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
    const storageDir = path.join(__dirname, "../../storage", tenantId, userId, "orders", "pdfs");

    await ensureDir(storageDir);

    const timestamp = Date.now();
    const sanitizedOrderNumber = orderNumber.replace(/[^a-zA-Z0-9-]/g, "_");
    const filename = `pedido_${sanitizedOrderNumber}_${timestamp}.pdf`;

    const filePath = path.join(storageDir, filename);

    await fs.writeFile(filePath, pdfBuffer);

    const publicUrl = `/storage/${tenantId}/${userId}/orders/pdfs/${filename}`;

    return publicUrl;
  } catch (error) {
    console.error("Error saving PDF to storage:", error);
    throw new Error("Failed to save PDF to storage");
  }
}

export async function deletePdfFromStorage(pdfUrl: string): Promise<void> {
  try {
    if (!pdfUrl) return;

    const filePath = path.join(__dirname, "../../", pdfUrl);

    await fs.unlink(filePath);
  } catch (error) {
    console.error("Error deleting PDF from storage:", error);
  }
}
