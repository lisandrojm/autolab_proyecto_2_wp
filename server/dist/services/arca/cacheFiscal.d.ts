import { CondicionFiscal } from "./condicionFiscal.js";
export declare function leerCacheFiscal(tenantId: string, cuit: string): CondicionFiscal | null;
export declare function guardarCacheFiscal(tenantId: string, cuit: string, condicion: CondicionFiscal): void;
/** Saltea el cache para un CUIT: lo usa el botón «Actualizar» de la pantalla. */
export declare function olvidarCacheFiscal(tenantId: string, cuit: string): void;
