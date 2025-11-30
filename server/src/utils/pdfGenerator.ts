import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

interface PdfGeneratorOptions {
  templateContent: string;
  variables: Record<string, any>;
  outputPath: string;
  tenantInfo: {
    razonSocial: string;
    cuit?: string;
    ciudad?: string;
    logoPath?: string;
    firmaRRHHPath?: string;
  };
}

function formatDateToSpanish(date: Date): string {
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];

  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day} de ${month} de ${year}`;
}

function replaceVariables(template: string, variables: Record<string, any>): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, String(value || ''));
  }

  return result;
}

export async function generatePdfFromTemplate(options: PdfGeneratorOptions): Promise<string> {
  const { templateContent, variables, outputPath, tenantInfo } = options;

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  }

  const systemVariables = {
    razonSocial: tenantInfo.razonSocial,
    cuit: tenantInfo.cuit || 'N/A',
    ciudad: tenantInfo.ciudad || 'Ciudad Autónoma de Buenos Aires',
    fecha: formatDateToSpanish(new Date()),
  };

  const allVariables = { ...variables, ...systemVariables };

  const processedContent = replaceVariables(templateContent, allVariables);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50,
        },
        info: {
          Title: 'Autorización de Solicitud',
          Author: 'Sistema de RRHH',
          Subject: `Pedido ${variables.numeroOrden || ''}`,
          CreationDate: new Date(),
        },
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      let currentY = 50;

      if (tenantInfo.logoPath && fs.existsSync(tenantInfo.logoPath)) {
        try {
          doc.image(tenantInfo.logoPath, 50, currentY, {
            width: 80,
            height: 80,
            fit: [80, 80],
          });
          currentY += 100;
        } catch (error) {
          console.error('Error loading logo:', error);
          currentY += 20;
        }
      } else {
        currentY += 20;
      }

      doc.fontSize(14)
         .font('Helvetica-Bold')
         .text('AUTORIZACIÓN GENERAL DE SOLICITUDES DE RECURSOS HUMANOS', 50, currentY, {
           width: 495,
           align: 'center',
         });

      currentY += 40;

      doc.fontSize(12)
         .font('Helvetica')
         .text(systemVariables.razonSocial, 50, currentY, {
           width: 495,
           align: 'center',
         });

      currentY += 20;

      if (systemVariables.cuit && systemVariables.cuit !== 'N/A') {
        doc.text(`CUIT: ${systemVariables.cuit}`, 50, currentY, {
          width: 495,
          align: 'center',
        });
        currentY += 20;
      }

      currentY += 20;

      doc.fontSize(11)
         .text(`${systemVariables.ciudad}, ${systemVariables.fecha}`, 50, currentY, {
           width: 495,
           align: 'center',
         });

      currentY += 40;

      doc.fontSize(11)
         .font('Helvetica')
         .text(processedContent, 50, currentY, {
           width: 495,
           align: 'justify',
           lineGap: 4,
         });

      const contentHeight = doc.heightOfString(processedContent, {
        width: 495,
        align: 'justify',
        lineGap: 4,
      });

      currentY += contentHeight + 60;

      doc.fontSize(11)
         .font('Helvetica')
         .text('FIRMA: ____________________', 50, currentY);

      currentY += 30;

      doc.text('ACLARACIÓN: xxxxxxxxxxxxxxxxxxxx', 50, currentY);

      currentY += 50;

      doc.text('AUTORIZACIÓN DE RECURSOS HUMANOS:', 50, currentY);

      if (tenantInfo.firmaRRHHPath && fs.existsSync(tenantInfo.firmaRRHHPath)) {
        try {
          doc.image(tenantInfo.firmaRRHHPath, 350, currentY - 20, {
            width: 100,
            height: 50,
            fit: [100, 50],
          });
        } catch (error) {
          console.error('Error loading firma RRHH:', error);
        }
      }

      doc.end();

      stream.on('finish', () => {
        resolve(outputPath);
      });

      stream.on('error', (error) => {
        reject(error);
      });

    } catch (error) {
      reject(error);
    }
  });
}

export function getPublicPdfUrl(fullPath: string): string {
  const storageIndex = fullPath.indexOf('/storage/');
  if (storageIndex !== -1) {
    return fullPath.substring(storageIndex);
  }
  return fullPath;
}
