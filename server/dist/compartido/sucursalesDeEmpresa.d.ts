/**
 * ═══════════════════════════════════════════════════════════════════════
 * CÓDIGO COMPARTIDO SERVER ↔ FRONTEND (`server/src/compartido/`)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Solo código puro: nada de Node, Mongoose ni del DOM, y sin imports (ver `jornadas.ts`).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SUCURSAL Y ACTIVIDAD: SON DE CADA EMPRESA, NO DEL DOMICILIO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * En ARCA (Simplificación Registral → Datos del Empleador → Domicilios de Explotación) tanto el
 * CÓDIGO de sucursal como las ACTIVIDADES habilitadas en ella son de cada CUIT. El mismo domicilio
 * tiene códigos distintos según quién lo declare: Ruiz Huidobro 4365 es la 00001 de 2030 S.R.L. y la
 * 00003 de FZERO y de GRINI.
 *
 * El catálogo (`ArcaSucursal`) guardaba UN código por domicilio, compartido. Con eso, un alta de 2030
 * salió con sucursal 00003: ARCA no la reconoció para ese CUIT, la cambió sola a la 00001 y dejó la
 * actividad vacía — sin error, y uno se enteraba recién mirando la grilla.
 *
 * Desde acá, el domicilio sigue siendo uno solo en el catálogo y lo que cambia por empresa vive en la
 * asociación empresa–domicilio (`Company.sucursalActividades`): su `codigo` y sus `actividades`.
 *
 * LO USAN LOS DOS LADOS: el generador de los registros de 130 y de 85 (frontend) y el cotejo del lote
 * (servidor). Si cada uno resolviera por su cuenta podrían discrepar, y el server rechazaría un
 * archivo que el navegador armó bien —o peor, dejaría pasar uno que armó mal—.
 */
/** Código canónico de sucursal: solo dígitos, 5 posiciones con ceros a la izquierda. "" si no hay. */
export declare const codigoSucursal: (v: unknown) => string;
/** Código canónico de actividad: solo dígitos, 6 posiciones. "" si no hay. */
export declare const codigoActividad: (v: unknown) => string;
export interface ActividadDeSucursal {
    codigo: string;
    descripcion?: string;
}
/** Una fila de `Company.sucursalActividades`: lo que ESTA empresa declaró en ESE domicilio. */
export interface SucursalDeEmpresa {
    sucursalId: unknown;
    /** El código con el que esta empresa tiene registrado el domicilio en ARCA. Vacío = sin cargar. */
    codigo?: string | null;
    actividades?: ActividadDeSucursal[] | null;
    /**
     * LA ACTIVIDAD HABITUAL de esta empresa en esta sucursal: la que se preselecciona en el contrato
     * cuando hay más de una habilitada. Es una elección de la empresa, no un dato de ARCA. Vacía = con
     * varias habilitadas se elige en cada contrato. Con una sola no hace falta marcar nada.
     */
    actividadHabitual?: string | null;
    /** De dónde salió la fila: leída de ARCA o cargada a mano. */
    origen?: "arca" | "manual" | null;
}
/** La fila de esa empresa para ese domicilio, o `undefined` si no declaró nada ahí. */
export declare const filaDeSucursal: (asociaciones: SucursalDeEmpresa[] | null | undefined, sucursalId: unknown) => SucursalDeEmpresa | undefined;
export type OrigenCodigoSucursal = "empresa" | "catalogo" | "ninguno";
/**
 * EL CÓDIGO DE SUCURSAL QUE VA AL ARCHIVO para un contrato de esta empresa en ese domicilio.
 *
 *   1. el de la EMPRESA (su fila en `sucursalActividades`), que es el de su padrón en ARCA;
 *   2. si la empresa todavía no tiene el suyo cargado, el del catálogo, como hasta ahora.
 *
 * El segundo escalón existe para no cambiar lo que ya salía bien: una empresa a la que nadie le cargó
 * su código sigue generando exactamente el mismo registro que antes. `origen` dice de cuál salió,
 * para que la pantalla pueda marcar el que todavía es el compartido.
 */
export declare function codigoDeSucursalParaEmpresa(asociaciones: SucursalDeEmpresa[] | null | undefined, sucursalId: unknown, codigoDelCatalogo?: unknown): {
    codigo: string;
    origen: OrigenCodigoSucursal;
};
/**
 * Las actividades que ESTA empresa tiene habilitadas en ese domicilio. Sin fila, ninguna: no se
 * hereda de otra empresa ni del domicilio (ARCA rechaza una que ese CUIT no declaró ahí).
 */
export declare function actividadesDeSucursalParaEmpresa(asociaciones: SucursalDeEmpresa[] | null | undefined, sucursalId: unknown): ActividadDeSucursal[];
/**
 * LA ACTIVIDAD QUE SE PRESELECCIONA cuando el contrato no eligió ninguna. "" = no hay: hay que elegir.
 *
 *   · con UNA sola habilitada, es esa: no hay nada que marcar ni que decidir;
 *   · con varias, la que la empresa marcó como habitual (la ★), siempre que siga habilitada ahí —una
 *     marca que quedó apuntando a una actividad que ya no tiene no se usa—;
 *   · con varias y sin marca, ninguna: se elige en cada contrato.
 *
 * Es el mismo mecanismo que la ★ del domicilio: se RESUELVE al leer y no se escribe en el contrato.
 * El contrato sigue diciendo la verdad —«no eligió»— y elegir otra en la fila la pisa.
 */
export declare function actividadHabitualDe(asociaciones: SucursalDeEmpresa[] | null | undefined, sucursalId: unknown): string;
export type ProblemaDeSucursal = 
/** El contrato apunta a un domicilio que su empresa no tiene. */
"sucursal_ajena"
/** El domicilio es de la empresa pero no hay código, ni propio ni en el catálogo. */
 | "sin_codigo"
/** La empresa no tiene ninguna actividad habilitada en ese domicilio. */
 | "sin_actividades"
/** Hay más de una habilitada y el contrato no eligió cuál declara. */
 | "actividad_sin_elegir"
/** La actividad del contrato no está habilitada en ese domicilio para esa empresa. */
 | "actividad_no_habilitada";
/**
 * ¿Qué tiene de malo la sucursal o la actividad de un contrato, mirado contra SU empresa? `null` = nada.
 *
 * Es la validación previa a generar el archivo: lo que ARCA hoy corrige o vacía en silencio.
 *
 *  · `sucursalId` es el domicilio YA RESUELTO (el del contrato, o el habitual de la empleadora).
 *    Vacío no es problema de acá: «todavía no eligió» lo dice el checklist.
 *  · `actividad` es la del contrato. Vacía y con una sola habilitada, se hereda: no hay problema.
 */
export declare function problemaDeSucursalYActividad(o: {
    /** Los domicilios que la empresa tiene asignados (`Company.sucursalIds`). */
    sucursalIdsDeLaEmpresa: unknown[] | null | undefined;
    asociaciones: SucursalDeEmpresa[] | null | undefined;
    sucursalId: unknown;
    codigoDelCatalogo?: unknown;
    actividad?: unknown;
}): ProblemaDeSucursal | null;
/** Cómo se le dice a una persona qué corregir y dónde, para cada problema. */
export declare const TEXTO_PROBLEMA_SUCURSAL: Record<ProblemaDeSucursal, string>;
