import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import 'dotenv/config';

const MONGO_URI = process.env.MONGO_URI!;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME!;

async function testPassword() {
  try {
    await mongoose.connect(MONGO_URI, { dbName: MONGO_DB_NAME });
    console.log('✅ Connected to MongoDB');

    const User = mongoose.model('User', new mongoose.Schema({
      email: String,
      password: String,
      tenantId: String,
      isActive: Boolean,
    }), 'users');

    const user = await User.findOne({ email: 'admin@example.com' });
    
    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }

    console.log('\n📋 User details:');
    console.log('  Email:', user.email);
    console.log('  TenantId:', user.tenantId);
    console.log('  Active:', user.isActive);
    console.log('  Password hash:', user.password);
    
    const testPassword = 'admin123';
    const matches = await bcrypt.compare(testPassword, user.password);
    
    console.log(`\n🔐 Password test:`);
    console.log(`  Testing password: "${testPassword}"`);
    console.log(`  Result: ${matches ? '✅ MATCH' : '❌ NO MATCH'}`);
    
    if (!matches) {
      console.log('\n⚠️  Password does not match!');
      console.log('   The user may have been created with a different password.');
      console.log('   Trying to update password...');
      
      const newHash = await bcrypt.hash(testPassword, 10);
      user.password = newHash;
      await user.save();
      
      console.log('   ✅ Password updated successfully');
      console.log('   Try logging in again with: admin123');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testPassword();
