import { Types } from "mongoose";
import { Area } from "../models/Area.js";

/**
 * Asegura que un tenant tenga el área Coordinador configurada correctamente
 */
export async function ensureDefaultAreas(tenantId: Types.ObjectId | string): Promise<void> {
  const tid = new Types.ObjectId(tenantId);

  // Skip for system/superadmin tenant
  const { Tenant } = await import("../models/Tenant.js");
  const tenant = await Tenant.findById(tid);
  if (tenant?.isSystem || tenant?.slug === "superadmin") {
    return;
  }

  const name = "Coordinador";
  let area = await Area.findOne({
    tenantId: tid,
    name: { $regex: new RegExp(`^${name}$`, "i") },
  });

  if (!area) {
    console.log(`[AreaInit] Creating ${name} area for tenant: ${tid}`);
    await Area.create({
      tenantId: tid,
      name,
      description: "Área de coordinación",
      isSystem: true,
    });
  } else if (!area.isSystem) {
    console.log(`[AreaInit] Marking existing ${name} area as system for tenant: ${tid}`);
    area.isSystem = true;
    await area.save();
  }
}

/**
 * Verifica que todos los tenants existentes tengan las áreas correctas
 */
export async function ensureAllTenantsHaveDefaultAreas(): Promise<void> {
  try {
    const { Tenant } = await import("../models/Tenant.js");
    const tenants = await Tenant.find({});

    console.log(`[AreaInit] Verifying ${tenants.length} tenants have default areas...`);

    for (const tenant of tenants) {
      await ensureDefaultAreas(new Types.ObjectId(tenant._id as any));
    }
    
    console.log("[AreaInit] Area verification completed successfully");
  } catch (error) {
    console.error("[AreaInit] Error ensuring areas for all tenants:", error);
    throw error;
  }
}
