import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const MONGO_URI = process.env.MONGO_URI!;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME!;
const MONGODB_URI = `${MONGO_URI}${MONGO_DB_NAME}`;

async function checkPermissions() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const db = mongoose.connection.db;
  const rolesCollection = db.collection('roles');

  const roles = await rolesCollection.find({}).toArray();

  console.log('=== ROLES AND PERMISSIONS ===\n');
  
  for (const role of roles) {
    console.log(`Role: ${role.name}`);
    console.log(`Permissions (${role.permissions.length}):`);
    role.permissions.forEach((p: string) => console.log(`  - ${p}`));
    console.log('');
  }

  // Get unique permissions
  const allPermissions = new Set<string>();
  roles.forEach(role => {
    role.permissions.forEach((p: string) => allPermissions.add(p));
  });

  console.log('=== ALL UNIQUE PERMISSIONS ===');
  Array.from(allPermissions).sort().forEach(p => console.log(`  - ${p}`));

  await mongoose.disconnect();
}

checkPermissions().catch(console.error);
