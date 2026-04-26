import { Types } from "mongoose";
import { ShiftConfig } from "../models/ShiftConfig.js";

/**
 * Asegura que un tenant tenga el tipo de turno Mañana configurado
 */
export async function ensureDefaultShiftConfigs(tenantId: Types.ObjectId | string): Promise<void> {
  const tid = new Types.ObjectId(tenantId);

  // Skip for system/superadmin tenant
  const { Tenant } = await import("../models/Tenant.js");
  const tenant = await Tenant.findById(tid);
  if (tenant?.isSystem || tenant?.slug === "superadmin") {
    return;
  }

  const name = "Mañana";
  let config = await ShiftConfig.findOne({
    tenantId: tid,
    name: { $regex: new RegExp(`^${name}$`, "i") },
  });

  if (!config) {
    console.log(`[ShiftConfigInit] Creating ${name} category for tenant: ${tid}`);
    await ShiftConfig.create({
      tenantId: tid,
      name,
      sortOrder: 1,
      isSystem: true,
    });
  } else if (!config.isSystem) {
    console.log(`[ShiftConfigInit] Marking existing ${name} category as system for tenant: ${tid}`);
    config.isSystem = true;
    await config.save();
  }
}

/**
 * Verifica que todos los tenants existentes tengan las configuraciones correctas
 */
export async function ensureAllTenantsHaveDefaultShiftConfigs(): Promise<void> {
  try {
    const { Tenant } = await import("../models/Tenant.js");
    const tenants = await Tenant.find({});

    console.log(`[ShiftConfigInit] Verifying ${tenants.length} tenants have default shift configs...`);

    for (const tenant of tenants) {
      await ensureDefaultShiftConfigs(new Types.ObjectId(tenant._id as any));
    }
    
    console.log("[ShiftConfigInit] Shift config verification completed successfully");
  } catch (error) {
    console.error("[ShiftConfigInit] Error ensuring shift configs for all tenants:", error);
    throw error;
  }
}
