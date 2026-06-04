import { Types } from "mongoose";
export declare function getPlainOrderNumber(orderNumber: string | undefined | null): string;
export declare function getFormattedOrderNumber(orderNumber: string | undefined | null): string;
export declare function getNextOrderNumber(tenantId: Types.ObjectId, prefix: string): Promise<string>;
export declare function recalculateUserOrderBalance(tenantId: any, userId: any, orderConfigId: any, year: number): Promise<void>;
