import htmlPdf from "html-pdf-node";
import { IOrder } from "../models/Order.js";
import { IOrderCategory } from "../models/OrderCategory.js";
import { IPdfTemplate } from "../models/PdfTemplate.js";
import { IUser } from "../models/User.js";
import { prepareVariables, replacePdfVariables } from "./pdfVariableReplacer.js";
import { savePdfToStorage } from "./pdfStorage.js";

interface GeneratePdfResult {
  pdfUrl: string;
  success: boolean;
  error?: string;
}

export async function generateOrderPDF(
  order: IOrder,
  category: IOrderCategory,
  template: IPdfTemplate,
  user: IUser,
  tenantId: string,
  tenantName: string
): Promise<GeneratePdfResult> {
  try {
    console.log("[PDF GENERATOR] Starting PDF generation...");
    console.log("[PDF GENERATOR] Order ID:", order._id);
    console.log("[PDF GENERATOR] Order Number:", order.orderNumber);
    console.log("[PDF GENERATOR] Template ID:", template._id);
    console.log("[PDF GENERATOR] Template Name:", template.name);

    const variables = prepareVariables(order, category, user, tenantName);
    console.log("[PDF GENERATOR] Variables prepared:", Object.keys(variables));

    const htmlContent = replacePdfVariables(template.content, variables);
    console.log("[PDF GENERATOR] HTML content generated, length:", htmlContent.length, "characters");

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

    const userId = order.userId.toString();
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
