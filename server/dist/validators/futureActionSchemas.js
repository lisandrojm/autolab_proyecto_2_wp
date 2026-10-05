import { z } from "zod";
export const createFutureActionSchema = z
    .object({
    orderId: z.string().min(1, "Order ID is required"),
    tipoAccionFutura: z.enum([
        "plazoDias",
        "fechaEspecifica",
        "presentacionDocumento",
        "sinVencimiento",
    ]),
    descripcionAccion: z.string().min(1, "Description is required").max(1000),
    responsableAccion: z.enum(["usuario", "cliente", "area_interna"]),
    documentoRequerido: z.string().max(500).optional(),
    plazoDias: z.number().int().min(1).max(365).optional(),
    fechaLimite: z.coerce.date().optional(),
    quienDefineVencimiento: z.enum(["cliente", "sistema", "area_interna"]).optional(),
    metadata: z.record(z.any()).optional(),
})
    .refine((data) => {
    if (data.tipoAccionFutura === "plazoDias" && !data.plazoDias) {
        return false;
    }
    return true;
}, {
    message: "plazoDias is required when tipoAccionFutura is 'plazoDias'",
    path: ["plazoDias"],
})
    .refine((data) => {
    if (data.tipoAccionFutura === "fechaEspecifica" && !data.fechaLimite) {
        return false;
    }
    return true;
}, {
    message: "fechaLimite is required when tipoAccionFutura is 'fechaEspecifica'",
    path: ["fechaLimite"],
})
    .refine((data) => {
    if (data.tipoAccionFutura === "presentacionDocumento" && !data.documentoRequerido) {
        return false;
    }
    return true;
}, {
    message: "documentoRequerido is required when tipoAccionFutura is 'presentacionDocumento'",
    path: ["documentoRequerido"],
});
export const updateFutureActionSchema = z.object({
    estadoAccion: z.enum(["pendiente", "cumplida", "vencida", "en_revision"]).optional(),
    fechaCumplimiento: z.coerce.date().optional(),
    fechaLimite: z.coerce.date().optional(),
    descripcionAccion: z.string().min(1).max(1000).optional(),
    metadata: z.record(z.any()).optional(),
});
export const queryFutureActionsSchema = z.object({
    estadoAccion: z.enum(["pendiente", "cumplida", "vencida", "en_revision"]).optional(),
    tipoAccionFutura: z
        .enum([
        "plazoDias",
        "fechaEspecifica",
        "presentacionDocumento",
        "sinVencimiento",
    ])
        .optional(),
    responsableAccion: z.enum(["usuario", "cliente", "area_interna"]).optional(),
    orderId: z.string().optional(),
    fechaDesde: z.coerce.date().optional(),
    fechaHasta: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});
