import type { EmpresaSegunArca } from "../../utils/planSucursalesPorEmpresa.js";
/**
 * LO QUE ARCA TIENE DECLARADO PARA CADA EMPLEADORA: sucursales, su código y sus actividades.
 *
 * Fuente: Simplificación Registral → Datos del Empleador → Domicilios de Explotación, leído a mano
 * con cada CUIT el 4/10/2026. Es la fuente de verdad: `scripts/cargarSucursalesPorEmpresa.ts` deja a
 * cada empresa exactamente así.
 *
 * ESTE ARCHIVO SON SÓLO DATOS, aparte del script a propósito: cuando una empleadora dé de alta un
 * domicilio o una actividad en ARCA, se actualiza acá y se vuelve a correr el script (es idempotente).
 * No se completa nada por inferencia: lo que no esté acá, no se carga.
 *
 * OJO: 900030 y 921430 tienen la misma descripción y son DOS códigos distintos. FZERO tiene los dos
 * en Tronador.
 *
 * `actividadHabitual` NO VIENE DE ARCA: es la decisión de la empresa sobre cuál se preselecciona en el
 * contrato cuando la sucursal tiene más de una (como la ★ del domicilio). Sin ese campo no se marca
 * ninguna y la actividad se elige en cada contrato. Las dos sucursales con más de una actividad
 * (FZERO en Tronador, 2030 en Ruiz Huidobro) tienen la suya: siempre hay una por defecto.
 */
export declare const LEIDO_EL = "2026-10-04";
export declare const SUCURSALES_POR_EMPRESA_ARCA: EmpresaSegunArca[];
