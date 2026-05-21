import { z } from "zod";
export declare const registerSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodOptional<z.ZodString>;
    role: z.ZodDefault<z.ZodEnum<["admin", "manager", "client", "superadmin", "user"]>>;
}, "strip", z.ZodTypeAny, {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    role?: "user" | "superadmin" | "admin" | "manager" | "client";
}, {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    role?: "user" | "superadmin" | "admin" | "manager" | "client";
}>;
export type RegisterInput = z.infer<typeof registerSchema>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email?: string;
    password?: string;
}, {
    email?: string;
    password?: string;
}>;
