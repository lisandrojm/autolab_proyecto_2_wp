import { IProject } from "../models/Project.js";
/**
 * Enforces that the "Coordinador" area is present in the project with all active shifts.
 */
export declare function enforceCoordinatorArea(project: IProject): Promise<void>;
