import type { ItemCentroCosto } from "./centrosCostoImport.js";
/** Lo que devuelve la API alrededor del dato (`{ value, message, exceptionInfo, succeeded }`). */
export interface SobreTango<T = unknown> {
    value?: T;
    message?: string | null;
    exceptionInfo?: unknown;
    succeeded?: boolean;
}
export interface RegistroAuxiliaresLeido {
    ok: boolean;
    /** Los centros, listos para guardar. Vacío si `ok` es false. */
    items: ItemCentroCosto[];
    /** Cómo llama Tango a este tipo de auxiliar en esta empresa, para poder mostrarlo. */
    tipo: {
        codigo: string;
        descripcion: string;
    };
    /** Por qué no se puede usar esta respuesta. Vacío si `ok`. */
    errores: string[];
}
/**
 * ¿Este registro es el de CENTROS DE COSTO?
 *
 * Se aceptan las dos formas en que lo nombran las empresas: el código «CC» o una descripción que
 * hable de centros de costo. Es a propósito más ancha que una igualdad —«CENTRO DE COSTOS»,
 * «Centros de Costo», «CTRO COSTOS» pasan— y aun así rechaza cualquier otro tipo de auxiliar.
 */
export declare const esTipoCentrosDeCosto: (codigo: string, descripcion: string) => boolean;
/**
 * Convierte la respuesta del proceso 1656 en centros de costo.
 *
 * No escribe nada ni sabe de la base: devuelve los ítems o los motivos por los que esta respuesta no
 * se puede usar. Quien llama decide qué hacer —y con tres empresas, que una falle no tiene por qué
 * voltear a las otras dos—.
 */
export declare function leerRegistroAuxiliares(sobre: SobreTango<any>): RegistroAuxiliaresLeido;
