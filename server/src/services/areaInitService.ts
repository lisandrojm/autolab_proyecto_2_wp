import { Types } from "mongoose";

/**
 * No longer creates default areas. Logic removed as requested.
 */
export async function ensureDefaultAreas(tenantId: Types.ObjectId | string): Promise<void> {
  // Logic removed
}

/**
 * No longer verifies areas for all tenants.
 */
export async function ensureAllTenantsHaveDefaultAreas(): Promise<void> {
  // Logic removed
}
