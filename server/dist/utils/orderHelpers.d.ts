import { Types } from "mongoose";
export declare function getPlainOrderNumber(orderNumber: string | undefined | null): string;
export declare function getFormattedOrderNumber(orderNumber: string | undefined | null): string;
export declare function getNextOrderNumber(tenantId: Types.ObjectId, prefix: string): Promise<string>;
