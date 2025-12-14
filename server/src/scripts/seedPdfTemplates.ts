import mongoose from "mongoose";
import { PdfTemplate } from "../models/PdfTemplate.js";
import { Tenant } from "../models/Tenant.js";

const templates = [
  {
    code: "dinero" as const,
    name: "Solicitud de Dinero",
    content: `Por la presente notifico que hemos aprobado su solicitud de {{categoria}}{{subcategoria}} por el monto de {{monto}} pesos que será descontado de sus haberes normales y habituales a partir de su próxima liquidación. En el supuesto caso de disolución del vínculo laboral, por cualquier causa, autorizo a la empresa a efectuar la retención total de las sumas que adeudare por los conceptos arriba indicados, de mi liquidación final.`,
    variablesHint: "Variables: categoria, subcategoria, monto, nombreUsuario, numeroOrden",
    isActive: true,
  },
  {
    code: "fechaRango" as const,
    name: "Solicitud con Rango de Fechas",
    content: `Por la presente notifico que hemos aprobado su solicitud de {{dias}} día(s) de {{categoria}}{{subcategoria}} desde el {{fechaDesde}} hasta el {{fechaHasta}}.

Esta autorización se encuentra sujeta a las políticas internas de la empresa y deberá ser coordinada con su supervisor directo.`,
    variablesHint: "Variables: categoria, subcategoria, dias, fechaDesde, fechaHasta, nombreUsuario, numeroOrden",
    isActive: true,
  },
  {
    code: "fechaUnica" as const,
    name: "Solicitud con Fecha Única",
    content: `Por la presente notifico que hemos aprobado su solicitud de {{categoria}}{{subcategoria}} para el día {{fechaUnica}}.

Esta aprobación es válida únicamente para la fecha indicada y se encuentra sujeta a las políticas internas de la empresa.`,
    variablesHint: "Variables: categoria, subcategoria, fechaUnica, nombreUsuario, numeroOrden",
    isActive: true,
  },
  {
    code: "vacaciones" as const,
    name: "Solicitud de Vacaciones",
    content: `Por la presente notifico que hemos aprobado su solicitud de vacaciones por {{dias}} día(s), desde el {{fechaDesde}} hasta el {{fechaHasta}}.

Esta autorización se encuentra sujeta a las políticas internas de la empresa y deberá ser coordinada con su supervisor directo.`,
    variablesHint: "Variables: dias, fechaDesde, fechaHasta, nombreUsuario",
    isActive: true,
  },
];

export async function seedPdfTemplates(tenantId: mongoose.Types.ObjectId) {
  try {
    console.log(`📄 Seeding PDF templates for tenant ${tenantId}...`);

    for (const templateData of templates) {
      const existingTemplate = await PdfTemplate.findOne({
        tenantId,
        code: templateData.code,
      });

      if (existingTemplate) {
        console.log(`  ✓ Template '${templateData.code}' already exists`);
        continue;
      }

      await PdfTemplate.create({
        ...templateData,
        tenantId,
      });

      console.log(`  ✓ Created template '${templateData.code}'`);
    }

    console.log(`✅ PDF templates seeded for tenant ${tenantId}`);
  } catch (error) {
    console.error(`❌ Error seeding PDF templates:`, error);
    throw error;
  }
}

export async function seedPdfTemplatesForAllTenants() {
  try {
    console.log("🌱 Starting PDF templates seed for all tenants...");

    const tenants = await Tenant.find({ isActive: true });

    for (const tenant of tenants) {
      await seedPdfTemplates(tenant._id as mongoose.Types.ObjectId);
    }

    console.log(`✅ PDF templates seeded for ${tenants.length} tenants`);
  } catch (error) {
    console.error("❌ Error seeding PDF templates:", error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { connectDB } = await import("../config/db.js");

  connectDB()
    .then(async () => {
      await seedPdfTemplatesForAllTenants();
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
