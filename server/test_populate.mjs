import mongoose from "mongoose";

async function main() {
  await mongoose.connect("mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_development_integration?retryWrites=true&w=majority");

  const Order = mongoose.model("Order", new mongoose.Schema({}, { strict: false, collection: "orders" }));
  const User = mongoose.model(
    "User",
    new mongoose.Schema(
      {
        metadata: {
          projects: [{ type: mongoose.Schema.Types.ObjectId, ref: "UserProject" }],
        },
      },
      { strict: false, collection: "users" },
    ),
  );
  const UserProject = mongoose.model(
    "UserProject",
    new mongoose.Schema(
      {
        projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
      },
      { strict: false, collection: "users_&_projects" },
    ),
  );
  const Project = mongoose.model(
    "Project",
    new mongoose.Schema(
      {
        clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
      },
      { strict: false, collection: "projects" },
    ),
  );
  const Client = mongoose.model(
    "Client",
    new mongoose.Schema(
      {
        name: String,
      },
      { strict: false, collection: "clients" },
    ),
  );

  const sampleOrder = await Order.findOne().sort({ requestedAt: -1 });

  const populatedOrderUser = await User.findById(sampleOrder.userId).populate({
    path: "metadata.projects",
    select: "nombre_rol_frame nombre_proyecto projectId",
    populate: {
      path: "projectId",
      select: "clientId",
      populate: { path: "clientId", select: "name" },
    },
  });

  console.dir(populatedOrderUser?.metadata?.projects[0]?.projectId?.clientId?.name, { depth: null });
  process.exit(0);
}

main().catch(console.error);
