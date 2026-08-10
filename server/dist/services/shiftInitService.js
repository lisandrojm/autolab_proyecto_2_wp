import { Types } from "mongoose";
import { Shift } from "../models/Shift.js";
/**
 * Asegura que un tenant tenga el turno Oficina configurado correctamente
 */
export async function ensureDefaultShifts(tenantId) {
    const tid = new Types.ObjectId(tenantId);
    // Skip for system/superadmin tenant
    const { Tenant } = await import("../models/Tenant.js");
    const tenant = await Tenant.findById(tid);
    if (tenant?.isSystem || tenant?.slug === "superadmin") {
        return;
    }
    const name = "Oficina";
    const oldName = "Mañana";
    // 1. Check if "Oficina" already exists
    let shift = await Shift.findOne({
        tenantId: tid,
        name: { $regex: new RegExp(`^${name}$`, "i") },
    });
    if (!shift) {
        // 2. If "Oficina" doesn't exist, check if there's a system "Mañana" we should rename
        const oldShift = await Shift.findOne({
            tenantId: tid,
            name: { $regex: new RegExp(`^${oldName}$`, "i") },
            isSystem: true
        });
        if (oldShift) {
            console.log(`[ShiftInit] Renaming ${oldName} to ${name} for tenant: ${tid}`);
            oldShift.name = name;
            await oldShift.save();
            shift = oldShift;
        }
        else {
            // 3. Create "Oficina" if neither exists
            console.log(`[ShiftInit] Creating ${name} shift for tenant: ${tid}`);
            shift = await Shift.create({
                tenantId: tid,
                name,
                startTime: "09:00",
                endTime: "17:00",
                days: [1, 2, 3, 4, 5],
                order: 1,
                isSystem: true,
            });
        }
    }
    else if (!shift.isSystem) {
        console.log(`[ShiftInit] Marking existing ${name} shift as system for tenant: ${tid}`);
        shift.isSystem = true;
        await shift.save();
    }
}
/**
 * Verifica que todos los tenants existentes tengan los turnos correctos
 */
export async function ensureAllTenantsHaveDefaultShifts() {
    try {
        const { Tenant } = await import("../models/Tenant.js");
        const tenants = await Tenant.find({});
        console.log(`[ShiftInit] Verifying ${tenants.length} tenants have default shifts...`);
        for (const tenant of tenants) {
            await ensureDefaultShifts(new Types.ObjectId(tenant._id));
        }
        console.log("[ShiftInit] Shift verification completed successfully");
    }
    catch (error) {
        console.error("[ShiftInit] Error ensuring shifts for all tenants:", error);
        throw error;
    }
}
