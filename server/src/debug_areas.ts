import mongoose from "mongoose";
import { Schema, model } from "mongoose";

const MONGO_URI = "mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_mvp";

const UserSchema = new Schema({
  firstName: String,
  lastName: String,
  email: String,
  areaId: Schema.Types.ObjectId,
});
const User = model("User", UserSchema);

const EmployeeProfileSchema = new Schema({
  userId: Schema.Types.ObjectId,
  department: String,
});
const EmployeeProfile = model("EmployeeProfile", EmployeeProfileSchema);

const AreaSchema = new Schema({
  name: String,
});
const Area = model("Area", AreaSchema);

const debug = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    const emails = ["colaborador@mobile.com", "coordinador@mobile.com", "colaborador2@mobile.com", "coordinador2@mobile.com"];

    for (const email of emails) {
      const user = await User.findOne({ email });
      if (user) {
        console.log(`\nUser: ${user.email}`);
        console.log(`User AreaID: ${user.areaId}`);

        if (user.areaId) {
          const area = await Area.findById(user.areaId);
          console.log(`Resolved Area Name: ${area?.name}`);
        }

        const profile = await EmployeeProfile.findOne({ userId: user._id });
        console.log(`Profile Department: ${profile?.department}`);
      } else {
        console.log(`\nUser not found: ${email}`);
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
};

debug();
