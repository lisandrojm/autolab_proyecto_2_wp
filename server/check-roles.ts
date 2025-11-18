import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const MONGO_URI = process.env.MONGO_URI!;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME!;
const MONGODB_URI = `${MONGO_URI}${MONGO_DB_NAME}`;

async function checkUsers() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const usersCollection = db.collection('users');
  const rolesCollection = db.collection('roles');

  const users = await usersCollection.find({}).sort({ email: 1 }).toArray();

  console.log('Found users:', users.length);

  for (const user of users) {
    console.log('Email:', user.email);
    console.log('Roles length:', user.roles?.length || 0);

    if (user.roles && user.roles.length > 0) {
      for (const roleId of user.roles) {
        const role = await rolesCollection.findOne({ _id: roleId });
        if (role) {
          console.log('  - Role:', role.name);
        }
      }
    } else {
      console.log('  NO ROLES!');
    }
    console.log('');
  }

  await mongoose.disconnect();
}

checkUsers().catch(console.error);
