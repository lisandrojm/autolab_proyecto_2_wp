import { Types } from "mongoose";
interface AddUserToClientParams {
    tenantId: Types.ObjectId;
    clientId: Types.ObjectId;
    userId: Types.ObjectId;
    permiso?: "ver" | "editar";
}
export declare function addUserToClientUsuarios({ tenantId, clientId, userId, permiso, }: AddUserToClientParams): Promise<void>;
export declare function removeUserFromClientUsuarios(tenantId: Types.ObjectId, clientId: Types.ObjectId, userId: Types.ObjectId): Promise<void>;
export {};
