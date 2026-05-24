const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_development_integration');
  console.log("Connected to MongoDB!");
  
  const ProjectSchema = new mongoose.Schema({}, { strict: false });
  const Project = mongoose.model('Project', ProjectSchema, 'projects');
  
  const project = await Project.findOne({ name: /99_PRODUCTORA/i });
  if (!project) {
    console.log("Project 99_PRODUCTORA not found!");
  } else {
    console.log("Project details:", JSON.stringify(project.toObject(), null, 2));
  }
  
  await mongoose.disconnect();
}

run().catch(console.error);
