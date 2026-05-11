import mongoose from "mongoose";
import { connectDB, disconnectDB } from "./server/src/config/db.js";

async function checkPdfs() {
  await connectDB();
  try {
    const Pdf = mongoose.model("Pdf");
    const pdfs = await Pdf.find({ code: "vacaciones" });
    console.log(`Found ${pdfs.length} vacation templates`);
    
    pdfs.forEach(p => {
      console.log(`ID: ${p._id}, Tenant: ${p.tenantId}, Active: ${p.isActive}`);
      console.log(`Content length: ${p.content?.length || 0}`);
      console.log(`Content starts with: ${p.content?.substring(0, 100)}...`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await disconnectDB();
  }
}

checkPdfs();
