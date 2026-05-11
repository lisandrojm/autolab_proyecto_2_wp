import mongoose from "mongoose";
import { connectDB, disconnectDB } from "./server/src/config/db.js";
import { Vacation } from "./server/src/models/Vacation.js";
import { User } from "./server/src/models/User.js";
import { Pdf } from "./server/src/models/Pdf.js";
import { Tenant } from "./server/src/models/Tenant.js";
import { generateVacationPDF } from "./server/src/utils/pdfGenerator.js";

async function testGeneration() {
  await connectDB();
  try {
    const vacationId = process.argv[2];
    if (!vacationId) {
      console.log("Usage: npx tsx test_gen.ts <vacationId>");
      return;
    }

    const vacation = await Vacation.findById(vacationId).populate("userId");
    if (!vacation) {
      console.error("Vacation not found");
      return;
    }

    const tenant = await Tenant.findById(vacation.tenantId);
    if (!tenant) {
      console.error("Tenant not found");
      return;
    }

    const template = await Pdf.findOne({ 
      tenantId: vacation.tenantId, 
      code: "vacaciones", 
      isActive: true 
    });

    if (!template) {
      console.error("Template not found");
      return;
    }

    const user = vacation.userId as any;
    const result = await generateVacationPDF(
      vacation as any, 
      template, 
      user, 
      vacation.tenantId.toString(), 
      tenant.name, 
      vacation.vacationNumber
    );

    console.log("Result:", result);
    
    if (result.success) {
      vacation.pdfPreAprobacionUrl = result.pdfUrl;
      await vacation.save();
      console.log("Saved URL to vacation record");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await disconnectDB();
  }
}

testGeneration();
