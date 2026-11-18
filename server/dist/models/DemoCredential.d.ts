import { Schema } from "mongoose";
export declare const DemoCredential: import("mongoose").Model<{
    email: string;
    userId: string;
    tenantId: string;
    label: string;
    passwordPlain: string;
} & import("mongoose").DefaultTimestampProps, {}, {}, {}, import("mongoose").Document<unknown, {}, {
    email: string;
    userId: string;
    tenantId: string;
    label: string;
    passwordPlain: string;
} & import("mongoose").DefaultTimestampProps, {}, {
    timestamps: true;
}> & {
    email: string;
    userId: string;
    tenantId: string;
    label: string;
    passwordPlain: string;
} & import("mongoose").DefaultTimestampProps & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, Schema<any, import("mongoose").Model<any, any, any, any, any, any>, {}, {}, {}, {}, {
    timestamps: true;
}, {
    email: string;
    userId: string;
    tenantId: string;
    label: string;
    passwordPlain: string;
} & import("mongoose").DefaultTimestampProps, import("mongoose").Document<unknown, {}, import("mongoose").FlatRecord<{
    email: string;
    userId: string;
    tenantId: string;
    label: string;
    passwordPlain: string;
} & import("mongoose").DefaultTimestampProps>, {}, import("mongoose").MergeType<import("mongoose").DefaultSchemaOptions, {
    timestamps: true;
}>> & import("mongoose").FlatRecord<{
    email: string;
    userId: string;
    tenantId: string;
    label: string;
    passwordPlain: string;
} & import("mongoose").DefaultTimestampProps> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>>;
