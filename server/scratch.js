import mongoose from 'mongoose';

async function run() {
  await mongoose.connect('mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_development_integration');
  console.log("Connected to MongoDB!");
  
  const RoleSchema = new mongoose.Schema({
    name: String,
    permissions: [String]
  }, { strict: false });
  
  const Role = mongoose.model('Role', RoleSchema, 'roles');
  
  // Buscar roles Admin
  const adminRoles = await Role.find({ name: { $regex: /^Admin$/i } });
  console.log(`Found ${adminRoles.length} Admin roles.`);
  
  for (const role of adminRoles) {
    if (!role.permissions.includes("config_holidays:view")) {
      role.permissions.push("config_holidays:view");
      await role.save();
      console.log(`Updated permissions for role in tenant ${role.tenantId || 'global'}: config_holidays:view added.`);
    } else {
      console.log(`Role in tenant ${role.tenantId || 'global'} already has config_holidays:view.`);
    }
  }
  
  await mongoose.disconnect();
  console.log("Disconnected.");
}

run().catch(console.error);
