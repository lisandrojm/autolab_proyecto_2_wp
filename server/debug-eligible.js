import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './dist/models/User.js';
import { Role } from './dist/models/Role.js';

dotenv.config({ path: '.env.development' });

async function run() {
  try {
    const uri = process.env.MONGO_URI + process.env.MONGO_DB_NAME;
    await mongoose.connect(uri);
    
    const tenantId = new mongoose.Types.ObjectId('696e0afdee864e3d5ceec539');

    const eligibleRoles = await Role.find({
      tenantId: tenantId,
      $or: [
        { permissions: "project_responsible:eligible" },
        { name: { $regex: /responsable/i } }
      ]
    }).select("_id name");

    console.log('--- Eligible Roles ---');
    eligibleRoles.forEach(r => console.log(`- ${r.name} (${r._id})`));

    const eligibleRoleIds = eligibleRoles.map(r => r._id);

    const users = await User.find({
      tenantId: tenantId,
      roles: { $in: eligibleRoleIds },
    }).select("firstName lastName metadata.activo roles").populate('roles', 'name');

    console.log('\n--- Users with Eligible Roles ---');
    users.forEach(u => {
        console.log(`- ${u.firstName} ${u.lastName} | Active: ${u.metadata?.activo} | Roles: ${u.roles.map(r => r.name).join(', ')}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
