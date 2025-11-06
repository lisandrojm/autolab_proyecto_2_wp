import dotenv from "dotenv";
import mongoose from "mongoose";
import { Campaign } from "../models/Campaign.js";
import { Post } from "../models/Post.js";
import path from "path";
import { fileURLToPath } from "url";

// Cargar variables de entorno
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../.env.development");

dotenv.config({ path: envPath });

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

if (!MONGO_URI || !MONGO_DB_NAME) {
  console.error("❌ Missing required environment variables:");
  console.error("  MONGO_URI:", MONGO_URI ? "✅" : "❌");
  console.error("  MONGO_DB_NAME:", MONGO_DB_NAME ? "✅" : "❌");
  process.exit(1);
}

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI!, { dbName: MONGO_DB_NAME });
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error);
    throw error;
  }
}

async function syncCampaignPosts() {
  console.log("🔄 Starting campaign-posts synchronization...");

  try {
    // Obtener todas las campañas
    const campaigns = await Campaign.find({});
    console.log(`📊 Found ${campaigns.length} campaigns to process`);

    let updatedCount = 0;
    let totalPostsLinked = 0;

    for (const campaign of campaigns) {
      // Buscar posts que pertenecen a esta campaña
      const posts = await Post.find({ campaignId: campaign._id });
      
      if (posts.length > 0) {
        // Actualizar la campaña con los IDs de los posts
        const postIds = posts.map(post => post._id);
        
        await Campaign.findByIdAndUpdate(campaign._id, {
          $set: { posts: postIds }
        });
        
        console.log(`✅ Updated campaign "${campaign.name}" with ${posts.length} posts`);
        updatedCount++;
        totalPostsLinked += posts.length;
      } else {
        console.log(`ℹ️  Campaign "${campaign.name}" has no posts`);
      }
    }

    console.log("\n🎉 Synchronization completed!");
    console.log(`📈 Summary:`);
    console.log(`  - ${campaigns.length} campaigns processed`);
    console.log(`  - ${updatedCount} campaigns updated`);
    console.log(`  - ${totalPostsLinked} posts linked`);
    console.log(`  - ${campaigns.length - updatedCount} campaigns without posts`);

  } catch (error) {
    console.error("❌ Synchronization failed:", error);
    throw error;
  }
}

async function main() {
  try {
    await connectDB();
    await syncCampaignPosts();
  } catch (error) {
    console.error("❌ Script failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
    process.exit(0);
  }
}

main();