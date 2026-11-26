export interface Rechazo {
    status: number;
    error: string;
}
interface TipoGuardado {
    isSystem?: boolean;
    categoryType?: string;
    systemKey?: string;
    config?: any;
}
/** POST: nadie crea un tipo de sistema a mano, ni usa el tipo de dato reservado. */
export declare function rechazoAlCrear(data: {
    categoryType?: string;
    isSystem?: unknown;
    systemKey?: unknown;
}): Rechazo | null;
/** PUT: en un tipo de sistema, el tipo de dato y la clave quedan como están. */
export declare function rechazoAlEditar(tipo: TipoGuardado, data: {
    categoryType?: string;
    isSystem?: unknown;
    systemKey?: unknown;
}): Rechazo | null;
/** DELETE: nunca. */
export declare function rechazoAlBorrar(tipo: TipoGuardado): Rechazo | null;
/**
 * Lo que se GUARDA de un PUT sobre un tipo de sistema: lo editable, nada más. `isSystem` y `systemKey` no
 * viajan nunca; para «Cambio de turno» la config son sólo sus reglas, normalizadas (sin subtipos ni reset).
 */
export declare function datosEditablesDeSistema(tipo: TipoGuardado, data: Record<string, any>): Record<string, any>;
export {};
