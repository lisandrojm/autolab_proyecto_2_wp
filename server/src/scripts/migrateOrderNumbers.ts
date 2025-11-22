import mongoose from "mongoose";
import { config } from "dotenv";
import { Tenant } from "../models/Tenant.js";
import { Order } from "../models/Order.js";
import { OrderCounter } from "../models/OrderCounter.js";

config();

async function migrateOrderNumbers() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI not defined in environment variables");
    }

    await mongoose.connect(mongoUri);
    console.log("✓ Connected to MongoDB");

    const tenants = await Tenant.find({});
    console.log(`\n📋 Found ${tenants.length} tenants to process\n`);

    let totalOrdersMigrated = 0;

    for (const tenant of tenants) {
      console.log(`\n🔄 Processing tenant: ${tenant.name} (${tenant.slug})`);

      const orders = await Order.find({ tenantId: tenant._id })
        .sort({ requestedAt: 1 })
        .exec();

      if (orders.length === 0) {
        console.log(`  ⚠️  No orders found for this tenant`);
        continue;
      }

      const prefix = tenant.slug.toUpperCase().slice(0, 3);
      console.log(`  📌 Prefix: ${prefix}`);

      for (let i = 0; i < orders.length; i++) {
        const sequence = i + 1;
        const paddedNumber = sequence.toString().padStart(6, "0");
        const orderNumber = `${prefix}-${paddedNumber}`;

        await Order.updateOne(
          { _id: orders[i]._id },
          { $set: { orderNumber } }
        );
      }

      await OrderCounter.findOneAndUpdate(
        { tenantId: tenant._id },
        { sequence: orders.length },
        { upsert: true }
      );

      totalOrdersMigrated += orders.length;
      console.log(`  ✓ Migrated ${orders.length} orders`);
      console.log(`  ✓ Counter set to: ${orders.length}`);
    }

    console.log(`\n\n🎉 Migration completed successfully!`);
    console.log(`📊 Total orders migrated: ${totalOrdersMigrated}`);
    console.log(`📊 Total tenants processed: ${tenants.length}\n`);

    await mongoose.connection.close();
    console.log("✓ Database connection closed");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }
}

migrateOrderNumbers();
