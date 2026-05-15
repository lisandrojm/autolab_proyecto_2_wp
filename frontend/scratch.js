const mongoose = require('mongoose');
const User = require('../../server/dist/models/User').User;
const UserProject = require('../../server/dist/models/UserProject').default;

mongoose.connect('mongodb+srv://autolab:B7D14j4Qp2yvA9w@cluster0.e8pjk.mongodb.net/autolab_proyecto_2_wp?retryWrites=true&w=majority', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const users = await User.find({ "email": "admin@example.com" })
      .select("metadata")
      .populate({
        path: "metadata.projects",
        model: UserProject,
        select: "projectId contracts.fecha_baja_contrato"
      })
      .lean();
    console.log(JSON.stringify(users, null, 2));
    process.exit(0);
  });
