import { z } from "zod";
export declare const createFutureActionSchema: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodObject<{
    orderId: z.ZodString;
    tipoAccionFutura: z.ZodEnum<["plazoDias", "fechaEspecifica", "presentacionDocumento", "sinVencimiento"]>;
    descripcionAccion: z.ZodString;
    responsableAccion: z.ZodEnum<["usuario", "cliente", "area_interna"]>;
    documentoRequerido: z.ZodOptional<z.ZodString>;
    plazoDias: z.ZodOptional<z.ZodNumber>;
    fechaLimite: z.ZodOptional<z.ZodDate>;
    quienDefineVencimiento: z.ZodOptional<z.ZodEnum<["cliente", "sistema", "area_interna"]>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    metadata?: Record<string, any>;
    plazoDias?: number;
    fechaLimite?: Date;
    documentoRequerido?: string;
    tipoAccionFutura?: "plazoDias" | "fechaEspecifica" | "sinVencimiento" | "presentacionDocumento";
    descripcionAccion?: string;
    responsableAccion?: "usuario" | "cliente" | "area_interna";
    quienDefineVencimiento?: "cliente" | "area_interna" | "sistema";
    orderId?: string;
}, {
    metadata?: Record<string, any>;
    plazoDias?: number;
    fechaLimite?: Date;
    documentoRequerido?: string;
    tipoAccionFutura?: "plazoDias" | "fechaEspecifica" | "sinVencimiento" | "presentacionDocumento";
    descripcionAccion?: string;
    responsableAccion?: "usuario" | "cliente" | "area_interna";
    quienDefineVencimiento?: "cliente" | "area_interna" | "sistema";
    orderId?: string;
}>, {
    metadata?: Record<string, any>;
    plazoDias?: number;
    fechaLimite?: Date;
    documentoRequerido?: string;
    tipoAccionFutura?: "plazoDias" | "fechaEspecifica" | "sinVencimiento" | "presentacionDocumento";
    descripcionAccion?: string;
    responsableAccion?: "usuario" | "cliente" | "area_interna";
    quienDefineVencimiento?: "cliente" | "area_interna" | "sistema";
    orderId?: string;
}, {
    metadata?: Record<string, any>;
    plazoDias?: number;
    fechaLimite?: Date;
    documentoRequerido?: string;
    tipoAccionFutura?: "plazoDias" | "fechaEspecifica" | "sinVencimiento" | "presentacionDocumento";
    descripcionAccion?: string;
    responsableAccion?: "usuario" | "cliente" | "area_interna";
    quienDefineVencimiento?: "cliente" | "area_interna" | "sistema";
    orderId?: string;
}>, {
    metadata?: Record<string, any>;
    plazoDias?: number;
    fechaLimite?: Date;
    documentoRequerido?: string;
    tipoAccionFutura?: "plazoDias" | "fechaEspecifica" | "sinVencimiento" | "presentacionDocumento";
    descripcionAccion?: string;
    responsableAccion?: "usuario" | "cliente" | "area_interna";
    quienDefineVencimiento?: "cliente" | "area_interna" | "sistema";
    orderId?: string;
}, {
    metadata?: Record<string, any>;
    plazoDias?: number;
    fechaLimite?: Date;
    documentoRequerido?: string;
    tipoAccionFutura?: "plazoDias" | "fechaEspecifica" | "sinVencimiento" | "presentacionDocumento";
    descripcionAccion?: string;
    responsableAccion?: "usuario" | "cliente" | "area_interna";
    quienDefineVencimiento?: "cliente" | "area_interna" | "sistema";
    orderId?: string;
}>, {
    metadata?: Record<string, any>;
    plazoDias?: number;
    fechaLimite?: Date;
    documentoRequerido?: string;
    tipoAccionFutura?: "plazoDias" | "fechaEspecifica" | "sinVencimiento" | "presentacionDocumento";
    descripcionAccion?: string;
    responsableAccion?: "usuario" | "cliente" | "area_interna";
    quienDefineVencimiento?: "cliente" | "area_interna" | "sistema";
    orderId?: string;
}, {
    metadata?: Record<string, any>;
    plazoDias?: number;
    fechaLimite?: Date;
    documentoRequerido?: string;
    tipoAccionFutura?: "plazoDias" | "fechaEspecifica" | "sinVencimiento" | "presentacionDocumento";
    descripcionAccion?: string;
    responsableAccion?: "usuario" | "cliente" | "area_interna";
    quienDefineVencimiento?: "cliente" | "area_interna" | "sistema";
    orderId?: string;
}>;
export declare const updateFutureActionSchema: z.ZodObject<{
    estadoAccion: z.ZodOptional<z.ZodEnum<["pendiente", "cumplida", "vencida", "en_revision"]>>;
    fechaCumplimiento: z.ZodOptional<z.ZodDate>;
    fechaLimite: z.ZodOptional<z.ZodDate>;
    descripcionAccion: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    metadata?: Record<string, any>;
    fechaLimite?: Date;
    descripcionAccion?: string;
    fechaCumplimiento?: Date;
    estadoAccion?: "pendiente" | "cumplida" | "vencida" | "en_revision";
}, {
    metadata?: Record<string, any>;
    fechaLimite?: Date;
    descripcionAccion?: string;
    fechaCumplimiento?: Date;
    estadoAccion?: "pendiente" | "cumplida" | "vencida" | "en_revision";
}>;
export declare const queryFutureActionsSchema: z.ZodObject<{
    estadoAccion: z.ZodOptional<z.ZodEnum<["pendiente", "cumplida", "vencida", "en_revision"]>>;
    tipoAccionFutura: z.ZodOptional<z.ZodEnum<["plazoDias", "fechaEspecifica", "presentacionDocumento", "sinVencimiento"]>>;
    responsableAccion: z.ZodOptional<z.ZodEnum<["usuario", "cliente", "area_interna"]>>;
    orderId: z.ZodOptional<z.ZodString>;
    fechaDesde: z.ZodOptional<z.ZodDate>;
    fechaHasta: z.ZodOptional<z.ZodDate>;
    page: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    limit: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit?: number;
    tipoAccionFutura?: "plazoDias" | "fechaEspecifica" | "sinVencimiento" | "presentacionDocumento";
    responsableAccion?: "usuario" | "cliente" | "area_interna";
    estadoAccion?: "pendiente" | "cumplida" | "vencida" | "en_revision";
    page?: number;
    fechaDesde?: Date;
    fechaHasta?: Date;
    orderId?: string;
}, {
    limit?: number;
    tipoAccionFutura?: "plazoDias" | "fechaEspecifica" | "sinVencimiento" | "presentacionDocumento";
    responsableAccion?: "usuario" | "cliente" | "area_interna";
    estadoAccion?: "pendiente" | "cumplida" | "vencida" | "en_revision";
    page?: number;
    fechaDesde?: Date;
    fechaHasta?: Date;
    orderId?: string;
}>;
