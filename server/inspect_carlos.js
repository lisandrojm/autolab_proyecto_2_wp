import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './dist/models/User.js';
import UserProject from './dist/models/UserProject.js';

dotenv.config({ path: '.env.development' });

async function run() {
  try {
    const uri = process.env.MONGO_URI + process.env.MONGO_DB_NAME;
    console.log('Connecting to:', uri);
    await mongoose.connect(uri);
    
    const carlos = await User.findOne({ 
      $or: [
        { firstName: /Carlos/i, lastName: /Henriquez/i },
        { 'metadata.nombre': /Carlos/i, 'metadata.apellido': /Henriquez/i }
      ]
    }).populate({
      path: 'metadata.projects',
      model: UserProject
    });
    
    if (!carlos) {
      console.log('User Carlos Henriquez not found');
    } else {
      console.log('--- User Carlos ---');
      console.log('ID:', carlos._id);
      console.log('Name:', carlos.firstName, carlos.lastName);
      console.log('Active (metadata.activo):', carlos.metadata?.activo);
      console.log('Metadata Projects:', JSON.stringify(carlos.metadata?.projects, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
