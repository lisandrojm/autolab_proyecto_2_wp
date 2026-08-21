import fs from "fs/promises";
import path from "path";
import { nombreArchivo } from "../services/nomenclaturaService.js";

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

function isValidObjectId(id: string): boolean {
  return /^[a-f0-9]{24}$/i.test(id);
}

/**
 * `identidadTag`: bloque `CUIL-...[_DNI-...]` de `buildIdentidadTag()` (employeeDocData.ts), el mismo
 * que llevan los PDF de Firma Digital. Va en el nombre del archivo para poder identificar de quién es
 * el documento sin abrirlo (desde el mail o al listar la carpeta). Si la persona no tiene los datos
 * cargados llega vacío y el nombre queda como antes.
 */
export async function savePdfToStorage(
  tenantId: string,
  userId: string,
  orderNumber: string,
  pdfBuffer: Buffer,
  identidadTag?: string
): Promise<string> {
  try {
    console.log("[PDF STORAGE] Starting PDF save process...");
    console.log("[PDF STORAGE] Tenant ID:", tenantId);
    console.log("[PDF STORAGE] User ID:", userId);
    console.log("[PDF STORAGE] Order Number:", orderNumber);
    console.log("[PDF STORAGE] Buffer size:", pdfBuffer.length, "bytes");

    console.log("[PDF STORAGE] Validating IDs...");
    if (!isValidObjectId(tenantId)) {
      const error = `Invalid tenantId format: ${tenantId}`;
      console.error("[PDF STORAGE ERROR]", error);
      throw new Error(error);
    }

    if (!isValidObjectId(userId)) {
      const error = `Invalid userId format. Length: ${userId.length}, Value: ${userId.substring(0, 50)}...`;
      console.error("[PDF STORAGE ERROR]", error);
      throw new Error(error);
    }

    console.log("[PDF STORAGE] IDs validated successfully");

    const serverRoot = process.cwd();
    console.log("[PDF STORAGE] Server root (process.cwd()):", serverRoot);

    const storageDir = path.join(serverRoot, "storage", tenantId, userId, "orders", "pdfs");
    console.log("[PDF STORAGE] Storage directory path:", storageDir);

    await ensureDir(storageDir);

    const timestamp = Date.now();
    const sanitizedOrderNumber = orderNumber.replace(/[^a-zA-Z0-9-]/g, "_");
    const identidad = (identidadTag || "").replace(/[^a-zA-Z0-9_-]/g, "");
    // El patrón lo define el ABM de Nomenclatura de archivos (Plantillas). Sin configurar, el default
    // reproduce exactamente este nombre: por eso esto se pudo soltar sin migrar ni renombrar nada.
    const filename = `${await nombreArchivo(tenantId, "Pedido", { numero: sanitizedOrderNumber, identidad, timestamp, fecha: String(timestamp).slice(0, 8) })}.pdf`;
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

/** `identidadTag`: ver `savePdfToStorage`. */
export async function savePdfVacationToStorage(
  tenantId: string,
  userId: string,
  vacationNumber: string,
  pdfBuffer: Buffer,
  identidadTag?: string
): Promise<string> {
  try {
    console.log("[PDF STORAGE] Starting vacation PDF save process...");
    console.log("[PDF STORAGE] Tenant ID:", tenantId);
    console.log("[PDF STORAGE] User ID:", userId);
    console.log("[PDF STORAGE] Vacation Number:", vacationNumber);
    console.log("[PDF STORAGE] Buffer size:", pdfBuffer.length, "bytes");

    console.log("[PDF STORAGE] Validating IDs...");
    if (!isValidObjectId(tenantId)) {
      const error = `Invalid tenantId format: ${tenantId}`;
      console.error("[PDF STORAGE ERROR]", error);
      throw new Error(error);
    }

    if (!isValidObjectId(userId)) {
      const error = `Invalid userId format. Length: ${userId.length}, Value: ${userId.substring(0, 50)}...`;
      console.error("[PDF STORAGE ERROR]", error);
      throw new Error(error);
    }

    console.log("[PDF STORAGE] IDs validated successfully");

    const serverRoot = process.cwd();
    console.log("[PDF STORAGE] Server root (process.cwd()):", serverRoot);

    const storageDir = path.join(serverRoot, "storage", tenantId, userId, "vacations", "pdfs");
    console.log("[PDF STORAGE] Storage directory path:", storageDir);

    await ensureDir(storageDir);

    const timestamp = Date.now();
    const sanitizedVacationNumber = vacationNumber.replace(/[^a-zA-Z0-9-]/g, "_");
    const identidad = (identidadTag || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const filename = `${await nombreArchivo(tenantId, "Vacacion", { numero: sanitizedVacationNumber, identidad, timestamp, fecha: String(timestamp).slice(0, 8) })}.pdf`;
    console.log("[PDF STORAGE] Filename:", filename);

    const filePath = path.join(storageDir, filename);
    console.log("[PDF STORAGE] Full file path:", filePath);

    await fs.writeFile(filePath, pdfBuffer);
    console.log("[PDF STORAGE] PDF file written successfully!");

    const fileStats = await fs.stat(filePath);
    console.log("[PDF STORAGE] File size on disk:", fileStats.size, "bytes");

    const publicUrl = `/storage/${tenantId}/${userId}/vacations/pdfs/${filename}`;
    console.log("[PDF STORAGE] Public URL:", publicUrl);

    return publicUrl;
  } catch (error) {
    console.error("[PDF STORAGE ERROR] Error saving vacation PDF to storage:", error);
    if (error instanceof Error) {
      console.error("[PDF STORAGE ERROR] Error message:", error.message);
      console.error("[PDF STORAGE ERROR] Error stack:", error.stack);
    }
    throw new Error("Failed to save vacation PDF to storage");
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
