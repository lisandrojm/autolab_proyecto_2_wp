const mongoose = require('mongoose');
const mongoUri = "mongodb+srv://autolab:B7D14j4Qp2yvA9w@cluster0.e8pjk.mongodb.net/autolab_proyecto_2_wp?retryWrites=true&w=majority";

const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db('autolab_proyecto_2_wp');
    const UserProject = db.collection('users_&_projects');
    
    const doc = await UserProject.findOne({ "contracts.fecha_baja_contrato": { $exists: true, $ne: "" } });
    console.log(JSON.stringify(doc ? doc.contracts[0].fecha_baja_contrato : "none", null, 2));
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
