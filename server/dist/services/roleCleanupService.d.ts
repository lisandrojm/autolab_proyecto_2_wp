import { Types } from "mongoose";
/**
 * Executes the cleanup of duplicate mobile roles.
 * Merges duplicates by moving users to the "preferred" role and deleting the others.
 */
export declare function cleanupDuplicateMobileRoles(tenantId: Types.ObjectId | string, dryRun?: boolean): Promise<any>;
