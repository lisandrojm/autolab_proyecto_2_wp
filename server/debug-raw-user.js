import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

async function run() {
  try {
    const uri = process.env.MONGO_URI + process.env.MONGO_DB_NAME;
    await mongoose.connect(uri);
    
    const rawUser = await mongoose.connection.db.collection('users').findOne({ 
        $or: [
            { firstName: /Veronica/i },
            { 'metadata.nombre': /Veronica/i }
        ]
    });
    
    console.log(JSON.stringify(rawUser, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
