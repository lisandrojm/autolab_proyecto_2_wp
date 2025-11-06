import '../config/env.js';
import { connectDB } from '../config/db.js';
import { Asset } from '../models/Asset.js';

async function migrateAssetUrls() {
  try {
    console.log('🔄 Starting migration of asset URLs...');

    await connectDB();
    console.log('✅ Connected to database');

    const assets = await Asset.find({});
    console.log(`📊 Found ${assets.length} assets to process`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const asset of assets) {
      const originalUrl = asset.url;

      if (originalUrl.startsWith('/storage')) {
        console.log(`⏭️  Skipping asset ${asset._id}: URL already relative`);
        skippedCount++;
        continue;
      }

      if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
        const match = originalUrl.match(/\/storage\/.+$/);
        if (match) {
          const relativePath = match[0];
          asset.url = relativePath;
          await asset.save();
          console.log(`✅ Updated asset ${asset._id}:`);
          console.log(`   FROM: ${originalUrl}`);
          console.log(`   TO:   ${relativePath}`);
          updatedCount++;
        } else {
          console.log(`⚠️  Asset ${asset._id} has URL without /storage path: ${originalUrl}`);
          skippedCount++;
        }
      } else {
        console.log(`⚠️  Asset ${asset._id} has unexpected URL format: ${originalUrl}`);
        skippedCount++;
      }
    }

    console.log('\n📋 Migration Summary:');
    console.log(`   Total assets: ${assets.length}`);
    console.log(`   ✅ Updated: ${updatedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log('\n✨ Migration completed successfully!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateAssetUrls();
