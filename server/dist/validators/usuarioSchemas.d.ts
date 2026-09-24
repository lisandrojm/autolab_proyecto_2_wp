import { z } from "zod";
export declare const createUserSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    roles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    isProjectResponsible: z.ZodOptional<z.ZodBoolean>;
    hireDate: z.ZodEffects<z.ZodUnion<[z.ZodString, z.ZodDate]>, Date, string | Date>;
    extraVacationDays: z.ZodDefault<z.ZodNumber>;
    clientIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    projectIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    name: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    name?: string;
    email?: string;
    password?: string;
    roles?: string[];
    clientIds?: string[];
    projectIds?: string[];
    firstName?: string;
    lastName?: string;
    hireDate?: Date;
    extraVacationDays?: number;
    isProjectResponsible?: boolean;
    metadata?: any;
}, {
    name?: string;
    email?: string;
    password?: string;
    roles?: string[];
    clientIds?: string[];
    projectIds?: string[];
    firstName?: string;
    lastName?: string;
    hireDate?: string | Date;
    extraVacationDays?: number;
    isProjectResponsible?: boolean;
    metadata?: any;
}>;
/**
 * En el modelo el campo real es `metadata.roles_frame` y `rolesFrameIds` es un alias de Mongoose
 * (ver models/User.ts). Los alias NO se aplican en rutas anidadas: mandar
 * `metadata.rolesFrameIds` guardaba un array VACÍO y el rol frame se perdía en silencio (así se
 * creaban las solicitudes de alta, que después figuraban "Sin rol"). Se normaliza acá y no en cada
 * cliente para que valga también para los que ya están publicados.
 */
export declare const normalizarRolesFrame: (metadata: any) => void;
