/**
 * EL ESTADO SE PONE AL GUARDAR (etapa 3, 19/11/2026).
 *
 * Todo lo que crea o reemplaza un contrato con `save()` (el wizard, las solicitudes, el import…) lo deja
 * sin `estadoContrato`: el wizard arma el contrato entero de nuevo. En vez de que cada ruta se acuerde,
 * el modelo lo calcula antes de guardar con la misma regla de la migración (`estadoSegunDatosLocales`:
 * alta, baja y si el tipo es de tiempo indeterminado; lo indecidible queda SIN_DETERMINAR, nunca VIGENTE
 * por defecto).
 *
 * Cuándo lo calcula, por contrato (no anulado):
 *  - no tiene estado (nuevo, o reemplazado por el wizard);
 *  - cambió su alta, su baja o su tipo respecto de cómo se cargó (comparado por `contratoKey`).
 * Un contrato que no se tocó conserva su estado, aunque el calendario haya avanzado: eso lo hace la
 * transición diaria, en un solo sentido (`transicionEstadoContratos.ts`).
 *
 * Las escrituras por `updateOne` no pasan por el hook: las que crean contratos o les cambian alta, baja o
 * tipo ponen el estado ELLAS MISMAS con `estadoAlEscribir` / `conEstadoCalculado` (el mismo cálculo que el
 * hook). Lo exige `scripts/estadoEnEscrituras.test.ts`, que falla si aparece una escritura así sin estado.
 * La barrida de la tarea (cada 30 min) queda como red, y el reporte cuenta lo que completó: si ese
 * número sube, apareció un camino nuevo (pedido del usuario, 19/11).
 */
import { type Schema } from "mongoose";
/** El catálogo de tipos (¿es de tiempo indeterminado?), cacheado unos minutos. */
export declare function catalogoDeTipos(): Promise<{
    porId: Map<string, boolean>;
    porNombre: Map<string, boolean>;
}>;
/** ¿Hay que (re)calcular el estado de este contrato? Puro. `previo` = como estaba al cargar (por clave). */
export declare function hayQueCalcularEstado(c: any, previo: any | undefined): boolean;
/**
 * EL CÁLCULO COMPARTIDO (hook, escrituras por `updateOne`, scripts): el estado de un contrato según sus
 * datos locales. `null` = no se puede decidir ahora sin adivinar (necesita el tipo y no hay catálogo):
 * queda sin estado para la barrida. Nunca VIGENTE por defecto. Puro con el catálogo dado.
 */
export declare function estadoAlEscribir(c: any, catalogo: {
    porId: Map<string, boolean>;
    porNombre: Map<string, boolean>;
} | null, hoy?: string): {
    estadoContrato: string;
    estadoContratoMotivo?: string;
} | null;
/** Para un `$push` de contratos nuevos: les pone el estado (pide el catálogo sólo si hace falta). */
export declare function conEstadoCalculado<T extends Record<string, any>>(contratos: T[], hoy?: string): Promise<T[]>;
export declare function instalarEstadoAlGuardar(schema: Schema): void;
