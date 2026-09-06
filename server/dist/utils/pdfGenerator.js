import htmlPdf from "html-pdf-node";
import path from "path";
import fs from "fs";
import { User } from "../models/User.js";
import { savePdfToStorage, savePdfVacationToStorage } from "./pdfStorage.js";
import { buildIdentidadTag, emailNomenclatura } from "./employeeDocData.js";
import { Company } from "../models/Company.js";
import { resolveContractEmpresa } from "./contractEmpresa.js";
import { prepareVariables, prepareVacationVariables, replacePdfVariables, getDummyVariables, getSystemVariables, sanitizeHtml } from "./pdfVariableReplacer.js";
/**
 * Bloque `CUIL-...[_DNI-...]` para el nombre del archivo. Si el `user` que llegó no trae `metadata`
 * (según por qué ruta se generó el PDF, algún populate podría no incluirla), se recarga de la base:
 * el requisito es que TODOS los PDF salgan con el mismo bloque para poder identificarlos después
 * desde el mail o la carpeta. Si aun así no hay datos cargados, devuelve "" y el nombre queda como antes.
 */
async function resolverIdentidadTag(user) {
    const tag = buildIdentidadTag(user);
    if (tag)
        return tag;
    const userId = user?._id || user?.id;
    if (!userId)
        return "";
    try {
        const fresco = await User.findById(userId).select("metadata.cuit metadata.documento metadata.tipoDocumentoId").lean();
        return buildIdentidadTag(fresco);
    }
    catch (e) {
        console.warn("[PDF GENERATOR] No se pudo resolver CUIL/documento para el nombre del archivo:", e?.message || e);
        return "";
    }
}
/**
 * Los datos que el patrón de nomenclatura puede usar en un PDF de Pedido o de Vacación.
 *
 * Antes el nombre era `pedido_<nro>_<identidad>_<timestamp>` y no hacía falta nada más. Desde que el
 * patrón es configurable —y por pedido explícito, arranca con el proyecto y termina con la
 * empleadora— hay que juntar esos datos acá y pasarlos al guardado.
 */
function datosNombrePdf(user, company, resolucion) {
    const cuit = String(company?.cuit || "").replace(/\D/g, "");
    return {
        apellido: String(user?.lastName || ""),
        nombres: String(user?.firstName || ""),
        email: emailNomenclatura(user?.email),
        proyecto: String(resolucion?.externalProjectId || resolucion?.projectId || ""),
        empresa: String(company?.razonSocial || ""),
        // Pelado, como en los documentos de contrato: la etiqueta vive en el patrón (`EMPRESA-…`).
        empresaCuit: cuit,
    };
}
/**
 * Mapea la empresa (Company) al `config` que espera getSystemVariables / buildPdfHtml
 * (razón social, cuit, ciudad, dirección, firmante + logo/firma). El membrete de los PDF
 * de Pedidos/Vacaciones sale de la empresa marcada como default (Empresa/s | Membrete/s).
 */
function companyToPdfConfig(c) {
    const domicilio = [[c.domicilioCalle, c.domicilioNumero].filter(Boolean).join(" "), c.domicilioPisoDepto].filter(Boolean).join(", ");
    return {
        razonSocial: c.razonSocial || "",
        cuit: c.cuit || "",
        ciudad: c.localidad || "",
        direccion: domicilio,
        signerName: c.firmanteNombre || "",
        signerRole: c.firmanteCargo || "",
        logoUrl: c.logoUrl || "",
        signatureUrl: c.signatureUrl || "",
    };
}
// Helper function to build the full HTML with layout
async function buildPdfHtml(_tenantId, bodyContent, additionalVars = {}, title = "", _user, usaMembrete = true, companyOverride) {
    // El membrete (y las variables {{razonSocial}}/{{cuit}}/{{ciudad}}) para Pedidos/Vacaciones salen
    // de la empresa del último contrato activo del usuario (companyOverride). Si no se resolvió, se
    // usa la primera empresa con membrete cargado como respaldo.
    const company = companyOverride || (await Company.findOne({ $or: [{ logoUrl: { $nin: [null, ""] } }, { signatureUrl: { $nin: [null, ""] } }] }).lean());
    const config = company ? companyToPdfConfig(company) : {};
    const systemVars = getSystemVariables(config);
    const allVars = { ...additionalVars, ...systemVars };
    // Replace variables in the content (body)
    // `html-pdf-node` compila el HTML con Handlebars: si queda algún `{{...}}` sin reemplazar
    // (variable mal escrita o no soportada por el código), la generación del PDF falla.
    // Se convierten a entidades para que Handlebars no las interprete y queden visibles como texto.
    const processedBodyContent = replacePdfVariables(bodyContent, allVars)
        .replace(/\{\{/g, "&#123;&#123;")
        .replace(/\}\}/g, "&#125;&#125;");
    // El contenido puede venir del editor con formato (HTML) o ser texto plano de plantillas viejas.
    // El texto plano necesita `white-space: pre-wrap` para conservar los saltos de línea; el HTML no
    // (si no, los bloques quedan con doble espaciado).
    // Se evalúa sobre la plantilla ORIGINAL: algunos valores de variables inyectan HTML y no deben
    // cambiar el modo de renderizado de una plantilla de texto plano.
    const isHtmlContent = /<\/?(p|div|h[1-6]|ul|ol|li|table|tr|td|strong|em|u|br)\b/i.test(bodyContent || "");
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
    // El membrete (encabezado con logo/empresa) y la firma de la empresa se muestran solo si la
    // plantilla lo pide (usaMembrete). La firma del empleado (user-signature) va siempre.
    const headerHtml = usaMembrete
        ? `<div class="header">
          <div class="logo">${logoImgTag}</div>
          <div class="company-info">
            <strong>${systemVars.razonSocial}</strong><br>
            CUIT: ${systemVars.cuit}<br>
            ${systemVars.direccion ? `${systemVars.direccion}<br>` : ""}
            ${systemVars.ciudad}<br>
          </div>
        </div>`
        : "";
    const companySignatureHtml = usaMembrete
        ? `<div class="company-signature">
            ${signatureImgTag}
            <div class="signer-info" style="margin-top: 5px; font-size: 10pt; color: #555;">
              <strong>${systemVars.signerName}</strong><br>
              ${systemVars.signerRole}
            </div>
          </div>`
        : "";
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
          .content.html { white-space: normal; }
          .content.html p { margin: 0 0 10pt 0; }
          .content.html h1 { font-size: 14pt; margin: 0 0 10pt 0; }
          .content.html h2 { font-size: 13pt; margin: 0 0 10pt 0; }
          .content.html ul, .content.html ol { margin: 0 0 10pt 0; padding-left: 24pt; }
          .content.html table { border-collapse: collapse; width: 100%; margin: 0 0 10pt 0; }
          .content.html td, .content.html th { border: 1px solid #999; padding: 4pt; vertical-align: top; }
          .content.html hr { border: none; border-top: 1px solid #ccc; margin: 10pt 0; }
          .footer { margin-top: 50px; page-break-inside: avoid; display: flex; justify-content: space-between; align-items: flex-end; }
          .user-signature { text-align: left; }
          .company-signature { text-align: center; }
        </style>
      </head>
      <body>
        ${headerHtml}

        ${title ? `<div class="title">${title}</div>` : ""}

        <div class="date-line">
          ${systemVars.fechaCompleta}
        </div>

        <div class="content${isHtmlContent ? " html" : ""}">${processedBodyContent}</div>

        <div class="footer">
          <div class="user-signature">
            <div style="margin-bottom: 15px;">Firma: __________________________</div>
            <div>Aclaración: ${allVars.nombreUsuario || ""}</div>
          </div>
          ${companySignatureHtml}
        </div>
      </body>
      </html>
    `;
    return html;
}
export async function generatePreviewPDF(content, code, tenantId, isGlobalPreview = false, title = "", pdfText, usaMembrete = false) {
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
        else if (pdfText) {
            bodyContent += `\n\n<div style="margin-top: 20px; font-size: 11pt; white-space: pre-wrap; color: #333;">${sanitizeHtml(pdfText)}</div>`;
        }
        console.log("[PDF PREVIEW] Building HTML...");
        // La preview global (desde Configuración Global) siempre muestra el membrete; la preview de una
        // plantilla puntual respeta su toggle `usaMembrete`.
        const html = await buildPdfHtml(tenantId, bodyContent, dummyVars, title, undefined, isGlobalPreview ? true : usaMembrete);
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
export async function generateOrderPDF(order, category, template, user, tenantId, tenantName, empresaIdOverride) {
    try {
        console.log("[PDF GENERATOR] Starting PDF generation...");
        console.log("[PDF GENERATOR] Order ID:", order._id);
        console.log("[PDF GENERATOR] Order Number:", order.orderNumber);
        console.log("[PDF GENERATOR] Template ID:", template._id);
        console.log("[PDF GENERATOR] Template Name:", template.name);
        let bodyContent = template.content;
        if (category.pdfText) {
            bodyContent += `\n\n<div style="margin-top: 20px; font-size: 11pt; white-space: pre-wrap; color: #333;">${sanitizeHtml(category.pdfText)}</div>`;
        }
        if (order.customTextBlock && !bodyContent.includes("{{textoAdicional}}")) {
            bodyContent += `\n\n<div style="margin-top: 30px; padding-top: 15px; border-top: 1px dashed #ccc; font-style: italic; color: #555; font-size: 11pt; white-space: pre-wrap;">${order.customTextBlock}</div>`;
        }
        const variables = await prepareVariables(order, category, user, tenantName);
        console.log("[PDF GENERATOR] Variables prepared:", Object.keys(variables));
        // Empresa del membrete: sale del último contrato activo del usuario (o la elegida al descargar).
        let company = null;
        let resolucion = null;
        try {
            const uid = String(user?._id || order.userId || "");
            resolucion = await resolveContractEmpresa(uid, empresaIdOverride);
            company = resolucion.empresa;
        }
        catch (e) {
            console.error("[PDF GENERATOR] resolveContractEmpresa error:", e);
        }
        // Use buildPdfHtml to generate HTML with global layout
        const htmlContent = await buildPdfHtml(tenantId, bodyContent, variables, template.title, user, template.usaMembrete ?? false, company);
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
        const pdfUrl = await savePdfToStorage(tenantId, userId, order.orderNumber, pdfBuffer, await resolverIdentidadTag(user), datosNombrePdf(user, company, resolucion));
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
export async function generateVacationPDF(vacation, template, user, tenantId, tenantName, vacationNumber, empresaIdOverride) {
    try {
        console.log("[PDF GENERATOR] Starting vacation PDF generation...");
        console.log("[PDF GENERATOR] Vacation ID:", vacation._id);
        console.log("[PDF GENERATOR] Vacation Number:", vacationNumber);
        console.log("[PDF GENERATOR] Template ID:", template._id);
        console.log("[PDF GENERATOR] Template Name:", template.name);
        const variables = prepareVacationVariables(vacation, user, tenantName, vacationNumber);
        console.log("[PDF GENERATOR] Variables prepared:", Object.keys(variables));
        // Empresa del membrete: sale del último contrato activo del usuario (o la elegida al descargar).
        let company = null;
        let resolucion = null;
        try {
            const uid = String(user?._id || vacation.userId || "");
            resolucion = await resolveContractEmpresa(uid, empresaIdOverride);
            company = resolucion.empresa;
        }
        catch (e) {
            console.error("[PDF GENERATOR] resolveContractEmpresa error:", e);
        }
        // Use buildPdfHtml to generate HTML with global layout
        const htmlContent = await buildPdfHtml(tenantId, template.content, variables, template.title, user, template.usaMembrete ?? false, company);
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
        const pdfUrl = await savePdfVacationToStorage(tenantId, userId, vacationNumber, pdfBuffer, await resolverIdentidadTag(user), datosNombrePdf(user, company, resolucion));
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
