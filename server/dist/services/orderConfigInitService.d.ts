import { Types } from "mongoose";
export declare function ensureDefaultOrderConfigs(tenantId: Types.ObjectId | string): Promise<void>;
/** Recorre todos los tenants. Se llama al arrancar (`server.ts`), junto a roles y turnos. */
export declare function ensureAllTenantsHaveDefaultOrderConfigs(): Promise<void>;
