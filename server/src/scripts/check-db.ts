import "dotenv/config";
import mongoose from 'mongoose';
import { env } from "../config/env.js";
import { Tenant } from "../models/Tenant.js";
import { User } from "../models/User.js";

async function checkDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(env.MONGO_URI, {
      dbName: env.MONGO_DB_NAME,
    });
    console.log('✅ Connected to MongoDB');

    const tenants = await Tenant.find({}).limit(10);
    console.log('\n📊 Tenants in database:', tenants.length);
    tenants.forEach(t => {
      console.log(`  - ${t.slug} (${t._id})`);
    });

    const users = await User.find({}).limit(20).select('email tenantId role isActive');
    console.log('\n👥 Users in database:', users.length);
    users.forEach(u => {
      console.log(`  - ${u.email} | tenant: ${u.tenantId} | roles: ${u.roles} | active: ${u.isActive}`);
    });

    const adminUser = await User.findOne({ email: 'admin@example.com' });
    if (adminUser) {
      console.log('\n✅ Admin user found:');
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   TenantId: ${adminUser.tenantId}`);
      console.log(`   Roles: ${adminUser.roles}`);
      console.log(`   Active: ${adminUser.isActive}`);
    } else {
      console.log('\n❌ Admin user NOT found');
    }

    const demoTenant = await Tenant.findOne({ slug: 'demo-tenant' });
    if (demoTenant) {
      console.log('\n✅ Demo tenant found:');
      console.log(`   Slug: ${demoTenant.slug}`);
      console.log(`   ID: ${demoTenant._id}`);

      const tenantUsers = await User.find({ tenantId: String(demoTenant._id) });
      console.log(`   Users in this tenant: ${tenantUsers.length}`);
    } else {
      console.log('\n❌ Demo tenant NOT found');
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDatabase();
