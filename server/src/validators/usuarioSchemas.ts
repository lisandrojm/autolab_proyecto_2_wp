import { z } from "zod";

/*
  El alta de un usuario (`POST /users`), compartido con el alta masiva de solicitudes de una plantilla
  de equipo (`services/plantillasEquipo.ts`): las dos pasan el payload por ACÁ, así una solicitud creada
  en lote tiene exactamente la forma de una creada de a una (fechas convertidas, defaults, etc.).
*/

export const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    roles: z.array(z.string()).default([]),
    // Puede quedar a cargo de un proyecto. Es de la persona, no de sus roles: ver GET /eligible-responsables.
    isProjectResponsible: z.boolean().optional(),
    hireDate: z
      .string()
      .or(z.date())
      .transform((val) => new Date(val)),
    extraVacationDays: z.number().default(0),
    clientIds: z.array(z.string()).default([]),
    projectIds: z.array(z.string()).default([]),
    name: z.string().optional(),
    metadata: z.any().optional(),
  });

/**
 * En el modelo el campo real es `metadata.roles_frame` y `rolesFrameIds` es un alias de Mongoose
 * (ver models/User.ts). Los alias NO se aplican en rutas anidadas: mandar
 * `metadata.rolesFrameIds` guardaba un array VACÍO y el rol frame se perdía en silencio (así se
 * creaban las solicitudes de alta, que después figuraban "Sin rol"). Se normaliza acá y no en cada
 * cliente para que valga también para los que ya están publicados.
 */
export const normalizarRolesFrame = (metadata: any): void => {
  if (!metadata || typeof metadata !== "object") return;
  const alias = metadata.rolesFrameIds;
  if (Array.isArray(alias) && alias.length > 0 && (!Array.isArray(metadata.roles_frame) || metadata.roles_frame.length === 0)) {
    metadata.roles_frame = alias;
  }
  delete metadata.rolesFrameIds;
};
