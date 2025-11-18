import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const MONGO_URI = process.env.MONGO_URI!;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME!;
const MONGODB_URI = `${MONGO_URI}${MONGO_DB_NAME}`;

async function cleanRoles() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const rolesCollection = db.collection('roles');

  // Eliminar roles duplicados (los que tienen mayúsculas o español)
  const rolesToDelete = ['SuperAdmin', 'Administrador', 'Manager', 'Usuario', 'Cliente'];

  for (const roleName of rolesToDelete) {
    const result = await rolesCollection.deleteMany({ name: roleName });
    console.log(`Deleted ${result.deletedCount} role(s): ${roleName}`);
  }

  console.log('\nRoles restantes:');
  const roles = await rolesCollection.find({}).toArray();
  for (const role of roles) {
    console.log('-', role.name);
  }

  await mongoose.disconnect();
}

cleanRoles().catch(console.error);
