import mongoose from "mongoose";

async function main() {
  await mongoose.connect("mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_development_integration?retryWrites=true&w=majority");

  const Project = mongoose.model(
    "Project",
    new mongoose.Schema(
      {
        clientId: mongoose.Schema.Types.ObjectId,
        metadata: { clienteId: Number },
      },
      { collection: "projects" },
    ),
  );

  const Client = mongoose.model(
    "Client",
    new mongoose.Schema(
      {
        externalId: String,
        name: String,
      },
      { collection: "clients" },
    ),
  );

  const projects = await Project.find({ clientId: { $exists: false } });
  let updated = 0;

  for (const p of projects) {
    if (p.metadata && p.metadata.clienteId) {
      const client = await Client.findOne({ externalId: p.metadata.clienteId.toString() });
      if (client) {
        p.clientId = client._id;
        await p.save();
        updated++;
      }
    }
  }

  console.log(`Updated ${updated} projects with clientId`);
  process.exit(0);
}

main().catch(console.error);
