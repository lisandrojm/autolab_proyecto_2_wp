import htmlPdf from "html-pdf-node";
import path from "path";
import fs from "fs";
import { savePdfToStorage, savePdfVacationToStorage } from "./pdfStorage.js";
import { PdfConfig } from "../models/PdfConfig.js";
import { ProjectPdfConfig } from "../models/ProjectPdfConfig.js";
import { prepareVariables, prepareVacationVariables, replacePdfVariables, getDummyVariables, getSystemVariables } from "./pdfVariableReplacer.js";
// Helper function to build the full HTML with layout
async function buildPdfHtml(tenantId, bodyContent, additionalVars = {}, title = "", user) {
    let config = null;
    if (user && user.projectIds && user.projectIds.length > 0) {
        config = await ProjectPdfConfig.findOne({ tenantId, projects: { $in: user.projectIds } }).lean();
    }
    if (!config) {
        config = (await PdfConfig.findOne({ tenantId }).lean()) || {};
    }
    const systemVars = getSystemVariables(config);
    const allVars = { ...additionalVars, ...systemVars };
    // Replace variables in the content (body)
    const processedBodyContent = replacePdfVariables(bodyContent, allVars);
    const logoUrl = config.logoUrl;
    let logoImgTag = "";
    if (logoUrl) {
        try {
            let absolutePath = logoUrl;
            // Robustly handle URLs or paths containing /storage/
            if (logoUrl.includes("/storage/")) {
                const relativePath = logoUrl.substring(logoUrl.indexOf("/storage/"));
                absolutePath = path.join(process.cwd(), relativePath);
            }
            else if (logoUrl.startsWith("/")) {
                absolutePath = path.join(process.cwd(), logoUrl);
            }
            if (fs.existsSync(absolutePath)) {
                const bitmap = fs.readFileSync(absolutePath);
                const base64 = bitmap.toString("base64");
                const ext = path.extname(absolutePath).substring(1).toLowerCase();
                const mime = ext === "jpg" ? "jpeg" : ext;
                logoImgTag = `<img src="data:image/${mime};base64,${base64}" style="max-height: 80px;" />`;
            }
        }
        catch (e) {
            console.error("Error loading logo for PDF:", e);
        }
    }
    if (!logoImgTag) {
        logoImgTag = `<div style="font-size: 24px; font-weight: bold; color: #333;">${systemVars.razonSocial}</div>`;
    }
    const signatureUrl = config.signatureUrl;
    let signatureImgTag = "";
    if (signatureUrl) {
        try {
            let absolutePath = signatureUrl;
            // Robustly handle URLs or paths containing /storage/
            if (signatureUrl.includes("/storage/")) {
                const relativePath = signatureUrl.substring(signatureUrl.indexOf("/storage/"));
                absolutePath = path.join(process.cwd(), relativePath);
            }
            else if (signatureUrl.startsWith("/")) {
                absolutePath = path.join(process.cwd(), signatureUrl);
            }
            if (fs.existsSync(absolutePath)) {
                const bitmap = fs.readFileSync(absolutePath);
                const base64 = bitmap.toString("base64");
                const ext = path.extname(absolutePath).substring(1).toLowerCase();
                const mime = ext === "jpg" ? "jpeg" : ext;
                signatureImgTag = `<img src="data:image/${mime};base64,${base64}" style="max-height: 100px;" />`;
            }
        }
        catch (e) {
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
          .header { display: flex; justify-content: space-between; align-items: top; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 20px; }
          .company-info { text-align: right; font-size: 10pt; color: #555; }
          .date-line { text-align: right; margin-bottom: 20px; font-size: 11pt; }
          .title { text-align: center; font-size: 12pt; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; width: 100%; }
          .content { min-height: 400px; padding: 0; white-space: pre-wrap; width: 100%; } 
          .footer { margin-top: 50px; page-break-inside: avoid; display: flex; justify-content: space-between; align-items: flex-end; }
          .user-signature { text-align: left; }
          .company-signature { text-align: center; }
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
            ${systemVars.direccion ? `${systemVars.direccion}<br>` : ""}
            ${systemVars.ciudad}<br>
          </div>
        </div>

        ${title ? `<div class="title">${title}</div>` : ""}

        <div class="date-line">
          ${systemVars.fechaCompleta}
        </div>

        <div class="content">${processedBodyContent}</div>

        <div class="footer">
          <div class="user-signature">
            <div style="margin-bottom: 15px;">Firma: __________________________</div>
            <div>Aclaración: ${allVars.nombreUsuario || ""}</div>
          </div>
          <div class="company-signature">
            ${signatureImgTag}
            <div class="signer-info" style="margin-top: 5px; font-size: 10pt; color: #555;">
              <strong>${systemVars.signerName}</strong><br>
              ${systemVars.signerRole}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    return html;
}
export async function generatePreviewPDF(content, code, tenantId, isGlobalPreview = false, title = "") {
    try {
        console.log("[PDF PREVIEW] Starting generation...");
        console.log("[PDF PREVIEW] CWD:", process.cwd());
        let dummyVars = {};
        if (!isGlobalPreview) {
            dummyVars = getDummyVariables(code);
        }
        else {
            dummyVars = { nombreUsuario: "Nombre de usuario" };
        }
        let bodyContent = content;
        if (isGlobalPreview) {
            bodyContent = "<div style='text-align: center; color: #666; margin-top: 50px;'>Vista previa del membrete y firma.<br>El contenido de la plantilla iría aquí.</div>";
        }
        console.log("[PDF PREVIEW] Building HTML...");
        const html = await buildPdfHtml(tenantId, bodyContent, dummyVars, title);
        console.log("[PDF PREVIEW] HTML built successfully. Length:", html.length);
        const options = {
            format: "A4",
            margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        };
        const file = { content: html };
        console.log("[PDF PREVIEW] Generating PDF with html-pdf-node...");
        const pdfBuffer = await htmlPdf.generatePdf(file, options);
        console.log("[PDF PREVIEW] PDF generated successfully. Buffer size:", pdfBuffer.length);
        return pdfBuffer;
    }
    catch (error) {
        console.error("[PDF PREVIEW ERROR] Preview generation error:", error);
        if (error instanceof Error) {
            console.error("[PDF PREVIEW ERROR] Stack:", error.stack);
            if (error.message.includes("error while loading shared libraries")) {
                console.error("POTENTIAL FIX: You are missing required shared libraries for Puppeteer/Chromium on this Linux server.");
                console.error("Try installing them with: sudo apt-get install -y ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils");
            }
        }
        throw error;
    }
}
export async function generateOrderPDF(order, category, template, user, tenantId, tenantName) {
    try {
        console.log("[PDF GENERATOR] Starting PDF generation...");
        console.log("[PDF GENERATOR] Order ID:", order._id);
        console.log("[PDF GENERATOR] Order Number:", order.orderNumber);
        console.log("[PDF GENERATOR] Template ID:", template._id);
        console.log("[PDF GENERATOR] Template Name:", template.name);
        const variables = prepareVariables(order, category, user, tenantName);
        console.log("[PDF GENERATOR] Variables prepared:", Object.keys(variables));
        // Use buildPdfHtml to generate HTML with global layout
        const htmlContent = await buildPdfHtml(tenantId, template.content, variables, template.title, user);
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
        let userId;
        if (typeof order.userId === "object" && order.userId !== null && "_id" in order.userId) {
            userId = order.userId._id.toString();
            console.log("[PDF GENERATOR] Extracted userId from populated object:", userId);
        }
        else {
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
    }
    catch (error) {
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
export async function generateVacationPDF(vacation, template, user, tenantId, tenantName, vacationNumber) {
    try {
        console.log("[PDF GENERATOR] Starting vacation PDF generation...");
        console.log("[PDF GENERATOR] Vacation ID:", vacation._id);
        console.log("[PDF GENERATOR] Vacation Number:", vacationNumber);
        console.log("[PDF GENERATOR] Template ID:", template._id);
        console.log("[PDF GENERATOR] Template Name:", template.name);
        const variables = prepareVacationVariables(vacation, user, tenantName, vacationNumber);
        console.log("[PDF GENERATOR] Variables prepared:", Object.keys(variables));
        // Use buildPdfHtml to generate HTML with global layout
        const htmlContent = await buildPdfHtml(tenantId, template.content, variables, template.title, user);
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
        let userId;
        if (typeof vacation.userId === "object" && vacation.userId !== null && "_id" in vacation.userId) {
            userId = vacation.userId._id.toString();
            console.log("[PDF GENERATOR] Extracted userId from populated object:", userId);
        }
        else {
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
    }
    catch (error) {
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
