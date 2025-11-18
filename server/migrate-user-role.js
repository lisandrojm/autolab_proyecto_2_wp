import mongoose from "mongoose";

const MONGO_URI = "mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/";
const MONGO_DB_NAME = "brandme_development";

const userRolePermissions = [
  "dashboard:view",
  "clients:read", "clients:write", "clients:update", "clients:delete",
  "calendar:view",
  "creative:view",
  "campaigns:read", "campaigns:write", "campaigns:update", "campaigns:delete",
  "projects:read", "projects:write", "projects:update", "projects:delete",
  "briefs:read", "briefs:write", "briefs:update", "briefs:delete",
  "posts:read", "posts:write", "posts:update", "posts:delete",
  "tasks:read", "tasks:write", "tasks:update", "tasks:delete",
  "assets:read", "assets:write", "assets:update", "assets:delete",
  "analytics:view"
];

async function migrateAddUserRole() {
  try {
    console.log("[Migration] Connecting to database...");
    await mongoose.connect(`${MONGO_URI}${MONGO_DB_NAME}`);
    console.log("[Migration] Connected to database");

    const Tenant = mongoose.model('Tenant', new mongoose.Schema({}, { strict: false }));
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));

    const tenants = await Tenant.find({});
    console.log(`[Migration] Found ${tenants.length} tenants`);

    let tenantsProcessed = 0;
    let rolesCreated = 0;
    let rolesUpdated = 0;

    for (const tenant of tenants) {
      console.log(`\n[Migration] Processing tenant: ${tenant.name} (${tenant._id})`);

      const existingUserRole = await Role.findOne({
        tenantId: tenant._id,
        name: { $regex: /^user$/i }
      });

      if (existingUserRole) {
        console.log(`[Migration] User role already exists for tenant ${tenant.name}`);

        if (!existingUserRole.isDefault) {
          existingUserRole.isDefault = true;
          await existingUserRole.save();
          rolesUpdated++;
          console.log(`[Migration] Updated user role to be default for tenant ${tenant.name}`);
        }

        const adminRole = await Role.findOne({
          tenantId: tenant._id,
          name: { $regex: /^admin$/i }
        });

        if (adminRole && adminRole.isDefault) {
          adminRole.isDefault = false;
          await adminRole.save();
          rolesUpdated++;
          console.log(`[Migration] Updated admin role to NOT be default for tenant ${tenant.name}`);
        }
      } else {
        const adminRole = await Role.findOne({
          tenantId: tenant._id,
          name: { $regex: /^admin$/i }
        });

        if (adminRole && adminRole.isDefault) {
          adminRole.isDefault = false;
          await adminRole.save();
          console.log(`[Migration] Removed isDefault from admin role for tenant ${tenant.name}`);
        }

        const newUserRole = await Role.create({
          tenantId: tenant._id,
          name: "user",
          description: "Standard user role with basic access",
          permissions: userRolePermissions,
          isDefault: true,
        });

        rolesCreated++;
        console.log(`[Migration] Created user role for tenant ${tenant.name}: ${newUserRole._id}`);
      }

      tenantsProcessed++;
    }

    console.log("\n[Migration] Summary:");
    console.log(`  Tenants processed: ${tenantsProcessed}`);
    console.log(`  User roles created: ${rolesCreated}`);
    console.log(`  Roles updated: ${rolesUpdated}`);
    console.log("[Migration] Migration completed successfully!");

  } catch (error) {
    console.error("[Migration] Error during migration:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("[Migration] Database connection closed");
  }
}

migrateAddUserRole();
