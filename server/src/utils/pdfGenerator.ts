import htmlPdf from "html-pdf-node";
import path from "path";
import fs from "fs";
import { IOrder } from "../models/Order.js";
import { IOrderCategory } from "../models/OrderCategory.js";
import { IPdfTemplate } from "../models/PdfTemplate.js";
import { IUser } from "../models/User.js";
import { IVacationRequest } from "../models/VacationRequest.js";
import { savePdfToStorage, savePdfVacationToStorage } from "./pdfStorage.js";
import { PdfGlobalConfig } from "../models/PdfGlobalConfig.js";
import { prepareVariables, prepareVacationVariables, replacePdfVariables, getDummyVariables, getSystemVariables } from "./pdfVariableReplacer.js";

// Helper function to build the full HTML with layout
async function buildPdfHtml(tenantId: string, bodyContent: string, additionalVars: Record<string, string> = {}): Promise<string> {
  const config = (await PdfGlobalConfig.findOne({ tenantId })) || {};
  const systemVars = getSystemVariables(config);
  const allVars = { ...additionalVars, ...systemVars };

  // Replace variables in the content (body)
  const processedBodyContent = replacePdfVariables(bodyContent, allVars as any);

  const logoUrl = (config as any).logoUrl;
  let logoImgTag = "";
  if (logoUrl) {
    try {
      const absolutePath = path.join(process.cwd(), logoUrl);
      if (fs.existsSync(absolutePath)) {
        const bitmap = fs.readFileSync(absolutePath);
        const base64 = bitmap.toString("base64");
        const ext = path.extname(absolutePath).substring(1).toLowerCase();
        const mime = ext === "jpg" ? "jpeg" : ext;
        logoImgTag = `<img src="data:image/${mime};base64,${base64}" style="max-height: 80px;" />`;
      }
    } catch (e) {
      console.error("Error loading logo for PDF:", e);
    }
  }
  if (!logoImgTag) {
    logoImgTag = `<div style="font-size: 24px; font-weight: bold; color: #333;">${systemVars.razonSocial}</div>`;
  }

  const signatureUrl = (config as any).signatureUrl;
  let signatureImgTag = "";
  if (signatureUrl) {
    try {
      const absolutePath = path.join(process.cwd(), signatureUrl);
      if (fs.existsSync(absolutePath)) {
        const bitmap = fs.readFileSync(absolutePath);
        const base64 = bitmap.toString("base64");
        const ext = path.extname(absolutePath).substring(1).toLowerCase();
        const mime = ext === "jpg" ? "jpeg" : ext;
        signatureImgTag = `<img src="data:image/${mime};base64,${base64}" style="max-height: 100px;" />`;
      }
    } catch (e) {
      console.error("Error loading signature for PDF:", e);
    }
  }
  if (!signatureImgTag) {
    signatureImgTag = `<div style="border-top: 1px solid #000; display: inline-block; padding-top: 5px; min-width: 200px;">Firma</div>`;
  }

  const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #333; margin: 0; padding: 0; }
          .header { display: flex; justify-content: space-between; align-items: top; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
          .company-info { text-align: right; font-size: 10pt; color: #555; }
          .content { min-height: 400px; padding: 0 10px; white-space: pre-wrap; } 
          .footer { margin-top: 50px; text-align: center; page-break-inside: avoid; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">
            ${logoImgTag}
          </div>
          <div class="company-info">
            <strong>${systemVars.razonSocial}</strong><br>
            CUIT: ${systemVars.cuit}<br>
            ${systemVars.ciudad}<br>
            ${systemVars.fecha}
          </div>
        </div>

        <div class="content">
          ${processedBodyContent}
        </div>

        <div class="footer">
          ${signatureImgTag}
        </div>
      </body>
      </html>
    `;
  return html;
}

export async function generatePreviewPDF(content: string, code: string, tenantId: string, isGlobalPreview: boolean = false): Promise<Buffer> {
  try {
    let dummyVars = {};
    if (!isGlobalPreview) {
      dummyVars = getDummyVariables(code);
    }

    let bodyContent = content;
    if (isGlobalPreview) {
      bodyContent = "<div style='text-align: center; color: #666; margin-top: 50px;'>Vista previa del membrete y firma.<br>El contenido de la plantilla iría aquí.</div>";
    }

    const html = await buildPdfHtml(tenantId, bodyContent, dummyVars as Record<string, string>);

    const options = {
      format: "A4",
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
    };

    const file = { content: html };
    const pdfBuffer = await htmlPdf.generatePdf(file, options);
    return pdfBuffer;
  } catch (error) {
    console.error("Preview generation error:", error);
    throw error;
  }
}

interface GeneratePdfResult {
  pdfUrl: string;
  success: boolean;
  error?: string;
}

export async function generateOrderPDF(order: IOrder, category: IOrderCategory, template: IPdfTemplate, user: IUser, tenantId: string, tenantName: string): Promise<GeneratePdfResult> {
  try {
    console.log("[PDF GENERATOR] Starting PDF generation...");
    console.log("[PDF GENERATOR] Order ID:", order._id);
    console.log("[PDF GENERATOR] Order Number:", order.orderNumber);
    console.log("[PDF GENERATOR] Template ID:", template._id);
    console.log("[PDF GENERATOR] Template Name:", template.name);

    const variables = prepareVariables(order, category, user, tenantName);
    console.log("[PDF GENERATOR] Variables prepared:", Object.keys(variables));

    // Use buildPdfHtml to generate HTML with global layout
    const htmlContent = await buildPdfHtml(tenantId, template.content, variables as Record<string, string>);
    console.log("[PDF GENERATOR] HTML content generated using global layout, length:", htmlContent.length, "characters");

    const options = {
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
    };

    const file = {
      content: htmlContent,
    };

    console.log("[PDF GENERATOR] Generating PDF buffer...");
    const pdfBuffer = await htmlPdf.generatePdf(file, options);
    console.log("[PDF GENERATOR] PDF buffer generated, size:", pdfBuffer.length, "bytes");

    console.log("[PDF GENERATOR] Extracting user ID...");
    console.log("[PDF GENERATOR] order.userId type:", typeof order.userId);
    console.log("[PDF GENERATOR] order.userId value:", order.userId);

    let userId: string;
    if (typeof order.userId === "object" && order.userId !== null && "_id" in order.userId) {
      userId = (order.userId as any)._id.toString();
      console.log("[PDF GENERATOR] Extracted userId from populated object:", userId);
    } else {
      userId = order.userId.toString();
      console.log("[PDF GENERATOR] Extracted userId from ObjectId:", userId);
    }

    console.log("[PDF GENERATOR] Final userId:", userId);
    console.log("[PDF GENERATOR] userId length:", userId.length);

    console.log("[PDF GENERATOR] Saving PDF to storage...");
    console.log("[PDF GENERATOR] Tenant ID:", tenantId);
    console.log("[PDF GENERATOR] User ID:", userId);

    const pdfUrl = await savePdfToStorage(tenantId, userId, order.orderNumber, pdfBuffer);
    console.log("[PDF GENERATOR] PDF saved successfully!");
    console.log("[PDF GENERATOR] PDF URL:", pdfUrl);

    return {
      pdfUrl,
      success: true,
    };
  } catch (error) {
    console.error("[PDF GENERATOR ERROR] Error generating PDF:", error);
    if (error instanceof Error) {
      console.error("[PDF GENERATOR ERROR] Error message:", error.message);
      console.error("[PDF GENERATOR ERROR] Error stack:", error.stack);
    }

    return {
      pdfUrl: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function generateVacationPDF(vacation: IVacationRequest, template: IPdfTemplate, user: IUser, tenantId: string, tenantName: string, vacationNumber: string): Promise<GeneratePdfResult> {
  try {
    console.log("[PDF GENERATOR] Starting vacation PDF generation...");
    console.log("[PDF GENERATOR] Vacation ID:", vacation._id);
    console.log("[PDF GENERATOR] Vacation Number:", vacationNumber);
    console.log("[PDF GENERATOR] Template ID:", template._id);
    console.log("[PDF GENERATOR] Template Name:", template.name);

    const variables = prepareVacationVariables(vacation, user, tenantName, vacationNumber);
    console.log("[PDF GENERATOR] Variables prepared:", Object.keys(variables));

    // Use buildPdfHtml to generate HTML with global layout
    const htmlContent = await buildPdfHtml(tenantId, template.content, variables as Record<string, string>);
    console.log("[PDF GENERATOR] HTML content generated using global layout, length:", htmlContent.length, "characters");

    const options = {
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
    };

    const file = {
      content: htmlContent,
    };

    console.log("[PDF GENERATOR] Generating PDF buffer...");
    const pdfBuffer = await htmlPdf.generatePdf(file, options);
    console.log("[PDF GENERATOR] PDF buffer generated, size:", pdfBuffer.length, "bytes");

    console.log("[PDF GENERATOR] Extracting user ID...");
    console.log("[PDF GENERATOR] vacation.userId type:", typeof vacation.userId);
    console.log("[PDF GENERATOR] vacation.userId value:", vacation.userId);

    let userId: string;
    if (typeof vacation.userId === "object" && vacation.userId !== null && "_id" in vacation.userId) {
      userId = (vacation.userId as any)._id.toString();
      console.log("[PDF GENERATOR] Extracted userId from populated object:", userId);
    } else {
      userId = vacation.userId.toString();
      console.log("[PDF GENERATOR] Extracted userId from ObjectId:", userId);
    }

    console.log("[PDF GENERATOR] Final userId:", userId);
    console.log("[PDF GENERATOR] userId length:", userId.length);

    console.log("[PDF GENERATOR] Saving vacation PDF to storage...");
    console.log("[PDF GENERATOR] Tenant ID:", tenantId);
    console.log("[PDF GENERATOR] User ID:", userId);

    const pdfUrl = await savePdfVacationToStorage(tenantId, userId, vacationNumber, pdfBuffer);
    console.log("[PDF GENERATOR] Vacation PDF saved successfully!");
    console.log("[PDF GENERATOR] PDF URL:", pdfUrl);

    return {
      pdfUrl,
      success: true,
    };
  } catch (error) {
    console.error("[PDF GENERATOR ERROR] Error generating vacation PDF:", error);
    if (error instanceof Error) {
      console.error("[PDF GENERATOR ERROR] Error message:", error.message);
      console.error("[PDF GENERATOR ERROR] Error stack:", error.stack);
    }

    return {
      pdfUrl: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
