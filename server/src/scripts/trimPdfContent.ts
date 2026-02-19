import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { Pdf } from "../models/Pdf.js";

async function trimPdfContent() {
  try {
    await connectDB();
    console.log("Starting PDF content trim migration...");

    const pdfs = await Pdf.find({});
    console.log(`Found ${pdfs.length} PDF templates.`);

    let updatedCount = 0;
    for (const pdf of pdfs) {
      const trimmedContent = pdf.content.trim();
      const trimmedName = pdf.name.trim();
      const trimmedTitle = pdf.title ? pdf.title.trim() : "";

      if (pdf.content !== trimmedContent || pdf.name !== trimmedName || (pdf.title && pdf.title !== trimmedTitle)) {
        pdf.content = trimmedContent;
        pdf.name = trimmedName;
        if (pdf.title) pdf.title = trimmedTitle;
        await pdf.save();
        updatedCount++;
        console.log(`Updated PDF: ${pdf.name} (${pdf.code})`);
      }
    }

    console.log(`Migration complete. Updated ${updatedCount} PDFs.`);
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await disconnectDB();
  }
}

trimPdfContent();
