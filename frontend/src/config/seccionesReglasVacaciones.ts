/**
 * LAS SECCIONES DE CONFIGURACIÓN › VACACIONES (15/11/2026, pedido del usuario).
 *
 * Eran siete pestañas en una sola pantalla y ya no entraban a lo ancho. Ahora cada una es una ruta
 * propia y en el menú cuelgan del subgrupo «Vacaciones», como las de Plantillas. Esta lista la leen
 * el menú (`Navbar`), la tabla de permisos (`accesoRutas`) y la pantalla (`VacationsRulesPage`), así
 * los tres dicen lo mismo.
 *
 * `tabViejo` es el `?tab=` con que se linkeaba antes: una URL vieja (historial, favoritos) se
 * redirige a su sección en vez de caer en Configuración Global.
 */
export const RUTA_REGLAS_VACACIONES = "/vacations-rules";

export type ClaveSeccionVacaciones = "global" | "fraccionamiento" | "dias-corridos" | "ventana-anual" | "antiguedad-por-empresa" | "solapamiento" | "visibilidad-por-contrato" | "campania";

export interface SeccionReglasVacaciones {
  clave: ClaveSeccionVacaciones;
  ruta: string;
  label: string;
  tabViejo: string;
}

export const SECCIONES_REGLAS_VACACIONES: SeccionReglasVacaciones[] = [
  // Configuración Global se queda en la ruta de siempre: es la que abría la pantalla antes.
  { clave: "global", ruta: RUTA_REGLAS_VACACIONES, label: "Configuración Global", tabViejo: "global" },
  { clave: "fraccionamiento", ruta: `${RUTA_REGLAS_VACACIONES}/fraccionamiento`, label: "Fraccionamiento", tabViejo: "projects" },
  { clave: "dias-corridos", ruta: `${RUTA_REGLAS_VACACIONES}/dias-corridos`, label: "Días Corridos", tabViejo: "consecutive_days" },
  { clave: "ventana-anual", ruta: `${RUTA_REGLAS_VACACIONES}/ventana-anual`, label: "Ventana Anual", tabViejo: "annual_window" },
  { clave: "antiguedad-por-empresa", ruta: `${RUTA_REGLAS_VACACIONES}/antiguedad-por-empresa`, label: "Antigüedad por empresa", tabViejo: "company_seniority" },
  { clave: "solapamiento", ruta: `${RUTA_REGLAS_VACACIONES}/solapamiento`, label: "Solapamiento", tabViejo: "overlap" },
  { clave: "visibilidad-por-contrato", ruta: `${RUTA_REGLAS_VACACIONES}/visibilidad-por-contrato`, label: "Visibilidad por contrato", tabViejo: "contracts" }, // «…por tipo de Contrato» salía cortado en el sidebar
  // Campaña de goce (15/11/2026): plazos para elegir, aviso por escrito y tramo mínimo.
  { clave: "campania", ruta: `${RUTA_REGLAS_VACACIONES}/campania`, label: "Campaña de goce", tabViejo: "campania" },
];

export const RUTAS_REGLAS_VACACIONES = SECCIONES_REGLAS_VACACIONES.map((s) => s.ruta);

export const seccionDeRuta = (pathname: string): SeccionReglasVacaciones | undefined => SECCIONES_REGLAS_VACACIONES.find((s) => s.ruta === pathname.replace(/\/+$/, ""));

export const seccionDeTabViejo = (tab: string | null): SeccionReglasVacaciones | undefined => (tab ? SECCIONES_REGLAS_VACACIONES.find((s) => s.tabViejo === tab) : undefined);
