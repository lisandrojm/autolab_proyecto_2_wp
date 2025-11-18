import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const MONGO_URI = process.env.MONGO_URI!;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME!;
const MONGODB_URI = `${MONGO_URI}${MONGO_DB_NAME}`;

async function countRoles() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const rolesCollection = db.collection('roles');

  const roles = await rolesCollection.find({}).toArray();

  console.log('Total roles in DB:', roles.length);
  console.log('');

  for (const role of roles) {
    console.log('-', role.name);
  }

  await mongoose.disconnect();
}

countRoles().catch(console.error);
