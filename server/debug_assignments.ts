import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.development') });

const UserProjectSchema = new mongoose.Schema({}, { strict: false, collection: 'users_&_projects' });
const UserProject = mongoose.model('UserProject', UserProjectSchema);

async function debug() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autolab_proyecto_2');
  console.log('Connected to DB');

  const userId = '660183060c1d10e8f7cf56d9'; // From your previous screenshot context if possible, but let's find Micaela
  
  // Find Micaela Sol Stoltzing
  const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
  const User = mongoose.model('User', UserSchema);
  const user = await User.findOne({ firstName: /Micaela/i, lastName: /Stoltzing/i });
  
  if (!user) {
    console.log('User not found');
    process.exit(1);
  }

  console.log('User ID:', user._id);

  // Check UserProject assignments
  const assignments = await UserProject.find({ userId: user._id });
  console.log('Found', assignments.length, 'assignments in UsersProjects collection');

  for (const a of assignments) {
    console.log('--- UserProject Assignment ---');
    console.log('Project ID:', a.projectId);
    console.log('Contracts count:', a.contracts?.length);
    if (a.contracts?.length > 0) {
        const last = a.contracts[a.contracts.length - 1];
        console.log('  Last Contract AreaShiftAssignments:', JSON.stringify(last.areaShiftAssignments, null, 2));
    }
  }

  // Check Project.teamConfig
  const ProjectSchema = new mongoose.Schema({}, { strict: false, collection: 'projects' });
  const ProjectModel = mongoose.model('Project', ProjectSchema);
  const project = await ProjectModel.findOne({ name: /426_LN/i });
  if (project) {
    console.log('--- Project Documents found for 426_LN ---');
    console.log('Project ID:', project._id);
    const config = (project.teamConfig || []).filter((c: any) => String(c.userId) === String(user._id));
    console.log('Config entries for this user in teamConfig:', config.length);
    console.log('teamConfig details:', JSON.stringify(config, null, 2));
  } else {
    console.log('Project 426_LN not found');
  }

  await mongoose.disconnect();
}

debug();
