import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './dist/models/User.js';
import { Role } from './dist/models/Role.js';

dotenv.config({ path: '.env.development' });

async function run() {
  try {
    const uri = process.env.MONGO_URI + process.env.MONGO_DB_NAME;
    console.log('Connecting to:', process.env.MONGO_DB_NAME);
    await mongoose.connect(uri);
    
    const andrea = await User.findOne({ 
      $or: [
        { firstName: /Andrea/i, lastName: /Quinteiro/i },
        { 'metadata.nombre': /Andrea/i, 'metadata.apellido': /Quinteiro/i }
      ]
    }).populate('roles');
    
    if (!andrea) {
      console.log('User Andrea not found');
    } else {
      console.log('--- User Andrea ---');
      console.log('ID:', andrea._id);
      console.log('TenantID:', andrea.tenantId);
      console.log('Roles:', andrea.roles.map(r => ({ id: r._id, name: r.name, permissions: r.permissions })));
      console.log('Active (metadata.activo):', andrea.metadata?.activo);
      console.log('Metadata ID:', andrea.metadata?.id);
    }

    const roles = await Role.find({ tenantId: andrea?.tenantId });
    console.log('--- Roles for Tenant ---');
    roles.forEach(r => {
        console.log(`- ${r.name} (${r._id}) - Permissions: ${r.permissions.join(', ')}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
