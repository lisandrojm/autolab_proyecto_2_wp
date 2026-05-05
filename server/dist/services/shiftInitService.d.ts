import { Types } from "mongoose";
/**
 * Asegura que un tenant tenga el turno Mañana configurado correctamente
 */
export declare function ensureDefaultShifts(tenantId: Types.ObjectId | string): Promise<void>;
/**
 * Verifica que todos los tenants existentes tengan los turnos correctos
 */
export declare function ensureAllTenantsHaveDefaultShifts(): Promise<void>;
