import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
/**
 * Enforces that the "Coordinador" area is present in the project with all active shifts.
 */
export async function enforceCoordinatorArea(project) {
    const tenantId = project.tenantId;
    // 1. Find the "Coordinador" area for this tenant
    const coordinatorArea = await Area.findOne({
        tenantId,
        name: { $regex: /^Coordinador$/i },
    });
    if (!coordinatorArea) {
        console.warn(`[ProjectEnforcement] Coordinador area not found for tenant ${tenantId}`);
        return;
    }
    // 2. Find all active shifts for this tenant
    const shifts = await Shift.find({ tenantId });
    if (shifts.length === 0) {
        console.warn(`[ProjectEnforcement] No shifts found for tenant ${tenantId}`);
        return;
    }
    const allShiftIds = shifts.map((s) => s._id);
    // 3. Ensure all these shifts are in the project's 'turnos' array
    if (!project.turnos) {
        project.turnos = [];
    }
    const projectTurnosSet = new Set(project.turnos.map((t) => t.toString()));
    allShiftIds.forEach((id) => {
        if (!projectTurnosSet.has(id.toString())) {
            project.turnos.push(id);
        }
    });
    // 4. Update or add the "Coordinador" area in areasConfig
    if (!project.areasConfig) {
        project.areasConfig = [];
    }
    const existingIndex = project.areasConfig.findIndex((ac) => ac.areaId.toString() === coordinatorArea._id.toString());
    if (existingIndex > -1) {
        // Update existing area to have all shifts
        project.areasConfig[existingIndex].shiftIds = allShiftIds;
    }
    else {
        // Add the "Coordinador" area with all shifts
        project.areasConfig.push({
            areaId: coordinatorArea._id,
            shiftIds: allShiftIds,
        });
    }
}
