import mongoose from 'mongoose';
import { User } from './src/models/User.js';
import UserProject from './src/models/UserProject.js';
import { Project } from './src/models/Project.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });

const mongoUri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME;
console.log('Connecting to DB at:', mongoUri, 'dbName:', dbName);

mongoose.connect(mongoUri, { dbName })
  .then(async () => {
    console.log('Connected!');
    const user = await User.findOne({ email: 'micaela.stoltzing@frame.com.ar' })
      .populate({
        path: "metadata.projects",
        model: UserProject,
        populate: [
          { path: "projectId", select: "name status teamConfig coordinatorAssignments clientId", model: Project },
        ],
      });
    
    if (!user) {
      console.log('User not found');
    } else {
      console.log('User projects metadata:');
      const projs = user.metadata?.projects || [];
      for (const up of projs) {
        console.log(`- Project Name: ${up.nombre_proyecto}`);
        console.log(`  projectId type: ${typeof up.projectId}`);
        if (typeof up.projectId === 'object') {
          console.log(`  projectId keys: ${Object.keys(up.projectId.toJSON ? up.projectId.toJSON() : up.projectId)}`);
          console.log(`  teamConfig:`, JSON.stringify(up.projectId.teamConfig, null, 2));
          console.log(`  coordinatorAssignments:`, JSON.stringify(up.projectId.coordinatorAssignments, null, 2));
        }
      }
    }
    await mongoose.disconnect();
  })
  .catch(err => {
    console.error('Error:', err);
  });
