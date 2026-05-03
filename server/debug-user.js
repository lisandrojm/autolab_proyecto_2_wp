import mongoose from 'mongoose';
import { User } from './dist/models/User.js';
import { Role } from './dist/models/Role.js';

async function run() {
  try {
    await mongoose.connect('mongodb://localhost:27017/autolab');
    const user = await User.findOne({ 
      $or: [
        { firstName: /Andrea/i, lastName: /Quinteiro/i },
        { 'metadata.nombre': /Andrea/i, 'metadata.apellido': /Quinteiro/i }
      ]
    }).populate('roles');
    
    if (!user) {
      console.log('User not found');
    } else {
      console.log(JSON.stringify(user, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
