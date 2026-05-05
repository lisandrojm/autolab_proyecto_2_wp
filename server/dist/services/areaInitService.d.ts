import { Types } from "mongoose";
/**
 * Asegura que un tenant tenga el área Coordinador configurada correctamente
 */
export declare function ensureDefaultAreas(tenantId: Types.ObjectId | string): Promise<void>;
/**
 * Verifica que todos los tenants existentes tengan las áreas correctas
 */
export declare function ensureAllTenantsHaveDefaultAreas(): Promise<void>;
