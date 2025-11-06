import mongoose from 'mongoose';
import { User } from './src/models/User.js';
import { Role } from './src/models/Role.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;
const MONGODB_URI = `${MONGO_URI}${MONGO_DB_NAME}`;

async function checkUsers() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const users = await User.find({})
    .populate('roles', 'name permissions')
    .select('email roles')
    .sort({ email: 1 });

  console.log(`Found ${users.length} users:\n`);
  
  for (const user of users) {
    console.log(`📧 ${user.email}`);
    console.log(`   Roles array length: ${user.roles.length}`);
    if (user.roles.length > 0) {
      user.roles.forEach((role) => {
        console.log(`   ✓ Role: ${role.name} (ID: ${role._id})`);
      });
    } else {
      console.log('   ⚠️  NO ROLES ASSIGNED!');
    }
    console.log('');
  }

  await mongoose.disconnect();
}

checkUsers().catch(console.error);
