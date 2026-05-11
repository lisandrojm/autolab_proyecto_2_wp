import mongoose from "mongoose";
import { Pdf } from "./server/src/models/Pdf.js";
import { Tenant } from "./server/src/models/Tenant.js";
import { connectDB, disconnectDB } from "./server/src/config/db.js";

async function checkPdfs() {
  await connectDB();
  try {
    const tenants = await Tenant.find({});
    console.log(`Found ${tenants.length} tenants`);
    
    for (const tenant of tenants) {
      const pdfs = await Pdf.find({ tenantId: tenant._id });
      console.log(`Tenant: ${tenant.slug} (${tenant._id}) - PDFs: ${pdfs.length}`);
      pdfs.forEach(p => {
        console.log(`  - [${p.code}] ${p.name} (ID: ${p._id}, Active: ${p.isActive})`);
      });
    }
  } catch (err) {
    console.error(err);
  } finally {
    await disconnectDB();
  }
}

checkPdfs();
