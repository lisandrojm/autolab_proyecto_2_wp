import { z } from "zod";

// === Registro de usuario dentro de un tenant existente ===
export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, "Nombre es requerido").max(50, "Nombre muy largo"),
    lastName: z.string().trim().min(1, "Apellido es requerido").max(50, "Apellido muy largo"),
    email: z.string().trim().email("Formato de email inválido"),
    tenantSlug: z
      .string()
      .trim()
      .min(1, "Organización es requerida")
      .max(50, "Organización muy larga")
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones (sin guiones al inicio/fin)"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(100, "Contraseña muy larga"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type RegisterForm = z.infer<typeof registerSchema>;

// === Registro de un nuevo tenant (empresa) + admin inicial ===
export const registerTenantSchema = z
  .object({
    companyName: z.string().trim().min(1, "Nombre de la empresa es requerido").max(100, "Nombre muy largo"),
    slug: z
      .string()
      .trim()
      .min(1, "Slug es requerido")
      .max(50, "Slug muy largo")
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug solo puede contener minúsculas, números y guiones (sin guiones al inicio/fin)"),
    firstName: z.string().trim().min(1, "Nombre es requerido").max(50, "Nombre muy largo"),
    lastName: z.string().trim().min(1, "Apellido es requerido").max(50, "Apellido muy largo"),
    email: z.string().trim().email("Formato de email inválido"),
    phone: z.string().optional().or(z.literal("")),

    // Nueva contraseña creada por quien se registra
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(100, "Contraseña muy larga"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type RegisterTenantForm = z.infer<typeof registerTenantSchema>;
