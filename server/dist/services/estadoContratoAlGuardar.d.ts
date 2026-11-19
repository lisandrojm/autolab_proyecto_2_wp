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
 * Las escrituras por `updateOne` no pasan por acá; las que tocan fechas ya ponen el estado (las bajas de
 * ARCA) y lo que quede sin estado lo completa la tarea diaria y lo marca el reporte.
 */
import type { Schema } from "mongoose";
/** El catálogo de tipos (¿es de tiempo indeterminado?), cacheado unos minutos. */
export declare function catalogoDeTipos(): Promise<{
    porId: Map<string, boolean>;
    porNombre: Map<string, boolean>;
}>;
/** ¿Hay que (re)calcular el estado de este contrato? Puro. `previo` = como estaba al cargar (por clave). */
export declare function hayQueCalcularEstado(c: any, previo: any | undefined): boolean;
export declare function instalarEstadoAlGuardar(schema: Schema): void;
