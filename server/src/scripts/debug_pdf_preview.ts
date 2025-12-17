import "dotenv/config";
import mongoose from "mongoose";
import { generatePreviewPDF } from "../utils/pdfGenerator.js";
import { Tenant } from "../models/Tenant.js";
import path from "path";

async function run() {
  try {
    console.log("Connecting to DB...");
    await mongoose.connect(process.env.MONGO_URI || "", {
      dbName: process.env.MONGO_DB_NAME,
    });
    console.log("Connected.");

    const tenant = await Tenant.findOne();
    if (!tenant) {
      console.error("No tenant found");
      return;
    }
    console.log("Using tenant:", tenant._id);

    const { PdfGlobalConfig } = await import("../models/PdfGlobalConfig.js");
    const config = await PdfGlobalConfig.findOne({ tenantId: tenant._id });
    console.log("PdfGlobalConfig:", config);

    console.log("Testing generatePreviewPDF with malformed handlebars...");
    const content = "<h1>Hello World</h1><p>{{#each items}} missing closing tag</p>";
    const code = "test_code";

    const buffer = await generatePreviewPDF(content, code, tenant._id.toString(), true);
    console.log("PDF Generated successfully. Buffer size:", buffer.length);
  } catch (error) {
    console.error("Error generating PDF:", error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
