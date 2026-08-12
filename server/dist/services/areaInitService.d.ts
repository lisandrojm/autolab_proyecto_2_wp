import { Types } from "mongoose";
/**
 * No longer creates default areas. Logic removed as requested.
 */
export declare function ensureDefaultAreas(tenantId: Types.ObjectId | string): Promise<void>;
/**
 * No longer verifies areas for all tenants.
 */
export declare function ensureAllTenantsHaveDefaultAreas(): Promise<void>;
