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
    const variables = prepareVariables(order, category, user, tenantName);

    const htmlContent = replacePdfVariables(template.content, variables);

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

    const pdfBuffer = await htmlPdf.generatePdf(file, options);

    const userId = order.userId.toString();
    const pdfUrl = await savePdfToStorage(tenantId, userId, order.orderNumber, pdfBuffer);

    return {
      pdfUrl,
      success: true,
    };
  } catch (error) {
    console.error("Error generating PDF:", error);

    return {
      pdfUrl: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
