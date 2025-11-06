import mongoose from 'mongoose';
import 'dotenv/config';

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

async function checkDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME,
    });
    console.log('✅ Connected to MongoDB');

    // Check tenants
    const Tenant = mongoose.model('Tenant', new mongoose.Schema({
      name: String,
      slug: String,
    }), 'tenants');

    const tenants = await Tenant.find({}).limit(10);
    console.log('\n📊 Tenants in database:', tenants.length);
    tenants.forEach(t => {
      console.log(`  - ${t.slug} (${t._id})`);
    });

    // Check users
    const User = mongoose.model('User', new mongoose.Schema({
      email: String,
      tenantId: String,
      role: String,
      isActive: Boolean,
    }), 'users');

    const users = await User.find({}).limit(20);
    console.log('\n👥 Users in database:', users.length);
    users.forEach(u => {
      console.log(`  - ${u.email} | tenant: ${u.tenantId} | role: ${u.role} | active: ${u.isActive}`);
    });

    // Check for specific user
    const adminUser = await User.findOne({ email: 'admin@example.com' });
    if (adminUser) {
      console.log('\n✅ Admin user found:');
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   TenantId: ${adminUser.tenantId}`);
      console.log(`   Role: ${adminUser.role}`);
      console.log(`   Active: ${adminUser.isActive}`);
    } else {
      console.log('\n❌ Admin user NOT found');
    }

    // Check for demo-tenant
    const demoTenant = await Tenant.findOne({ slug: 'demo-tenant' });
    if (demoTenant) {
      console.log('\n✅ Demo tenant found:');
      console.log(`   Slug: ${demoTenant.slug}`);
      console.log(`   ID: ${demoTenant._id}`);

      // Check users for this tenant
      const tenantUsers = await User.find({ tenantId: String(demoTenant._id) });
      console.log(`   Users in this tenant: ${tenantUsers.length}`);
    } else {
      console.log('\n❌ Demo tenant NOT found');
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDatabase();
