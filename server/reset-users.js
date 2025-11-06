import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/marketing_campaigns';

mongoose.connect(MONGO_URI).then(async () => {
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  
  const tenantId = '68dfdf23ca311cb10d0df443';
  
  console.log('🗑️  Eliminando usuarios del tenant demo...');
  const result = await User.deleteMany({ tenantId });
  console.log(`✅ Eliminados ${result.deletedCount} usuarios`);
  
  await mongoose.disconnect();
  process.exit(0);
}).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
