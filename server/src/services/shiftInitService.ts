import { Types } from "mongoose";
import { Shift } from "../models/Shift.js";

/**
 * Asegura que un tenant tenga el turno Mañana configurado correctamente
 */
export async function ensureDefaultShifts(tenantId: Types.ObjectId | string): Promise<void> {
  const tid = new Types.ObjectId(tenantId);

  // Skip for system/superadmin tenant
  const { Tenant } = await import("../models/Tenant.js");
  const tenant = await Tenant.findById(tid);
  if (tenant?.isSystem || tenant?.slug === "superadmin") {
    return;
  }

  const name = "Mañana";
  let shift = await Shift.findOne({
    tenantId: tid,
    name: { $regex: new RegExp(`^${name}$`, "i") },
  });

  if (!shift) {
    console.log(`[ShiftInit] Creating ${name} shift for tenant: ${tid}`);
    await Shift.create({
      tenantId: tid,
      name,
      type: "Mañana",
      startTime: "09:00",
      endTime: "17:00",
      days: [1, 2, 3, 4, 5],
      order: 1,
      isSystem: true,
    });
  } else if (!shift.isSystem) {
    console.log(`[ShiftInit] Marking existing ${name} shift as system for tenant: ${tid}`);
    shift.isSystem = true;
    await shift.save();
  }
}

/**
 * Verifica que todos los tenants existentes tengan los turnos correctos
 */
export async function ensureAllTenantsHaveDefaultShifts(): Promise<void> {
  try {
    const { Tenant } = await import("../models/Tenant.js");
    const tenants = await Tenant.find({});

    console.log(`[ShiftInit] Verifying ${tenants.length} tenants have default shifts...`);

    for (const tenant of tenants) {
      await ensureDefaultShifts(new Types.ObjectId(tenant._id as any));
    }
    
    console.log("[ShiftInit] Shift verification completed successfully");
  } catch (error) {
    console.error("[ShiftInit] Error ensuring shifts for all tenants:", error);
    throw error;
  }
}
