import mongoose from "mongoose";

async function main() {
  await mongoose.connect("mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_development_integration?retryWrites=true&w=majority");

  const Project = mongoose.connection.collection("projects");
  const Client = mongoose.connection.collection("clients");

  const proj = await Project.findOne({ name: "426_LN+" });
  if (proj) {
    console.log("Found project 426_LN+:");
    console.log("clientId:", proj.clientId);
    const client = await Client.findOne({ _id: proj.clientId });
    console.log("Client found:", client ? client.name : null);
  } else {
    console.log("Project 426_LN+ not found");
  }

  process.exit(0);
}

main().catch(console.error);
