import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { Order } from "../models/Order.js";
import { OrderCategory } from "../models/OrderCategory.js";
import { PdfTemplate } from "../models/PdfTemplate.js";
import mongoose from "mongoose";

async function runDebug() {
  try {
    await connectDB();
    console.log("🔍 Starting Debug for Order...");

    // Search for a seeded order by category name
    const targetCategoryName = "Licencias y Permisos";
    console.log(`Searching for any order with populated category '${targetCategoryName}'...`);

    // First find the category to get its ID
    const cat = await OrderCategory.findOne({ name: targetCategoryName });
    if (!cat) {
      console.log(`❌ Category '${targetCategoryName}' not found in DB!`);
      return;
    }
    console.log(`✅ Category '${targetCategoryName}' found: ${cat._id}`);
    console.log(`   - pdfTemplateId in Category: ${cat.pdfTemplateId}`);

    const order = await Order.findOne({ categoryId: cat._id }).populate("categoryId");

    if (!order) {
      console.log(`❌ No order found for category '${targetCategoryName}'!`);
      return;
    }

    console.log(`✅ Order found: ${order._id}`);
    console.log("  - Status:", order.status);
    console.log("  - Title:", order.title);

    const category = order.categoryId as any;
    if (!category) {
      console.log("❌ Category is null/undefined on order!");
    } else {
      console.log("✅ Category found via populate:");
      console.log("  - ID:", category._id);
      console.log("  - Name:", category.name);
      console.log("  - pdfTemplateId (Value):", category.pdfTemplateId);
      console.log("  - pdfTemplateId (Type):", typeof category.pdfTemplateId);
      console.log("  - pdfTemplateId (Constructor):", category.pdfTemplateId?.constructor?.name);

      if (category.pdfTemplateId) {
        const template = await PdfTemplate.findById(category.pdfTemplateId);
        if (template) {
          console.log(`✅ Template found: ${template.name} (${template._id})`);
        } else {
          console.log(`❌ Template NOT found for ID: ${category.pdfTemplateId}`);
        }
      } else {
        console.log("❌ Category has NO pdfTemplateId!");
      }
    }
  } catch (err) {
    console.error("❌ Debug failed:", err);
  } finally {
    await disconnectDB();
    process.exit(0);
  }
}

runDebug();
