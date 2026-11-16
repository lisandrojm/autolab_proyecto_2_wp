/**
 * LAS SECCIONES DE ADMIN GENERAL › VACACIONES (16/11/2026, pedido del usuario).
 *
 * Eran cuatro pestañas en `/vacations`. Ahora cada una es una ruta propia y en el menú cuelgan del
 * grupo «Vacaciones», como las bandejas de Contratación y las secciones de Configuración › Vacaciones
 * (`seccionesReglasVacaciones.ts`). Esta lista la leen el menú (`Navbar`), la tabla de permisos
 * (`accesoRutas`) y la pantalla (`VacationsPage`), así los tres dicen lo mismo.
 *
 * El orden es el del menú: no es alfabético, va de lo diario (las solicitudes) a lo de temporada.
 *
 * `tabViejo` es el `?tab=` con que se linkeaba antes: una URL vieja (un aviso, favoritos) se redirige
 * a su sección conservando el resto (`planId`, `campaniaId`).
 */
export const RUTA_VACACIONES = "/vacations";

export type ClaveSeccionAdminVacaciones = "solicitudes" | "gestion" | "plan" | "campania";

export interface SeccionAdminVacaciones {
  clave: ClaveSeccionAdminVacaciones;
  ruta: string;
  label: string;
  tabViejo: string;
}

export const SECCIONES_VACACIONES: SeccionAdminVacaciones[] = [
  // Solicitudes se queda en la ruta de siempre: es adonde llevan los avisos (`/vacations?id=…`).
  { clave: "solicitudes", ruta: RUTA_VACACIONES, label: "Solicitudes", tabViejo: "solicitudes" },
  { clave: "gestion", ruta: `${RUTA_VACACIONES}/gestion-por-usuario`, label: "Gestión por usuario", tabViejo: "gestion" },
  { clave: "plan", ruta: `${RUTA_VACACIONES}/plan-por-proyecto`, label: "Plan por proyecto", tabViejo: "plan" },
  { clave: "campania", ruta: `${RUTA_VACACIONES}/campania`, label: "Campaña", tabViejo: "campania" },
];

export const RUTAS_VACACIONES = SECCIONES_VACACIONES.map((s) => s.ruta);

export const seccionDeVacaciones = (pathname: string): SeccionAdminVacaciones | undefined => SECCIONES_VACACIONES.find((s) => s.ruta === pathname.replace(/\/+$/, ""));

/** La ruta nueva de un link viejo (`/vacations?tab=plan&planId=…` → `/vacations/plan-por-proyecto?planId=…`), o null si no es uno. */
export function rutaNuevaDeVacaciones(search: string): string | null {
  const q = new URLSearchParams(search);
  const seccion = SECCIONES_VACACIONES.find((s) => s.tabViejo === q.get("tab"));
  if (!seccion) return null;
  q.delete("tab");
  return `${seccion.ruta}${q.toString() ? `?${q.toString()}` : ""}`;
}
