import { Types } from "mongoose";
export declare function sumarAlConteo(tenantId: Types.ObjectId | string, userId: Types.ObjectId | string): Promise<void>;
export declare function quitarDelConteo(tenantId: Types.ObjectId | string, userId: Types.ObjectId | string): Promise<void>;
