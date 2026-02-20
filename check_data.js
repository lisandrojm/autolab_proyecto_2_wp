const mongoose = require("mongoose");

async function main() {
  await mongoose.connect("mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_development_integration?retryWrites=true&w=majority");

  const Order = mongoose.connection.collection("orders");
  const User = mongoose.connection.collection("users");
  const UserProject = mongoose.connection.collection("users_&_projects");
  const Project = mongoose.connection.collection("projects");
  const Client = mongoose.connection.collection("clients");

  const sampleOrder = await Object.values(await Order.find().sort({ requestedAt: -1 }).limit(1).toArray())[0];
  if (!sampleOrder) {
    console.log("No order found");
    return process.exit(0);
  }

  console.log("Sample order user ID", sampleOrder.userId);

  const user = Object.values(await User.find({ _id: sampleOrder.userId }).limit(1).toArray())[0];
  console.log("User metadata projects:", user?.metadata?.projects);
  console.log("User clientIds:", user?.clientIds);

  if (user?.metadata?.projects?.length > 0) {
    const userProj = Object.values(await UserProject.find({ _id: user.metadata.projects[0] }).limit(1).toArray())[0];
    console.log("UserProject:", userProj);

    if (userProj && userProj.projectId) {
      const proj = Object.values(await Project.find({ _id: userProj.projectId }).limit(1).toArray())[0];
      console.log("Project info:", proj ? { id: proj._id, clientId: proj.clientId } : null);
    }
  }

  process.exit(0);
}

main().catch(console.error);
