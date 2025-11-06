import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGO_URI = 'mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/marketing_campaigns';

mongoose.connect(MONGO_URI).then(async () => {
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  
  const admin = await User.findOne({ email: 'admin@example.com' });
  
  if (!admin) {
    console.log('❌ Usuario admin NO encontrado');
    await mongoose.disconnect();
    process.exit(1);
  }
  
  console.log('✅ Usuario admin encontrado:');
  console.log('   Email:', admin.email);
  console.log('   TenantId:', admin.tenantId);
  console.log('   Role:', admin.role);
  console.log('   IsActive:', admin.isActive);
  console.log('   Password hash:', admin.password.substring(0, 30) + '...');
  
  // Probar password
  const testPassword = 'admin123';
  const isMatch = await bcrypt.compare(testPassword, admin.password);
  
  console.log('\n🔐 Prueba de password:');
  console.log('   Password esperado:', testPassword);
  console.log('   ¿Coincide?:', isMatch ? '✅ SÍ' : '❌ NO');
  
  if (!isMatch) {
    console.log('\n⚠️  El password NO coincide. Probando otros passwords comunes...');
    const common = ['Admin123', 'admin', '123456', 'password'];
    for (const pwd of common) {
      const match = await bcrypt.compare(pwd, admin.password);
      if (match) {
        console.log(`   ✅ Encontrado: "${pwd}"`);
        break;
      }
    }
  }
  
  await mongoose.disconnect();
  process.exit(0);
}).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
