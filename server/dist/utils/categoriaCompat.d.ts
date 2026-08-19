/** La forma plana que esperan los consumidores viejos. */
export interface CategoriaCompat {
    _id: any;
    externalId: string;
    name: string;
    /**
     * `false` = la categoría RESUELVE pero no se ELIGE. Son alias que existen para que los contratos
     * históricos sigan encontrando su sueldo y su código ARCA, pero que no deben ofrecerse al cargar
     * un contrato nuevo (ver el alias del `legacyId 43` en `scripts/repararCategoriasHuerfanas.ts`).
     * Por eso el listado NUNCA filtra por este campo: filtran los selectores, no la resolución.
     */
    isActive: boolean;
    data: {
        id?: number;
        numeroCategoria?: number;
        nombre: string;
        codigoAfip: number;
        codigoArca?: string;
        convenio?: string;
        grupoId?: any;
        sueldoBasico: number;
        sueldoAdicional: number;
        presentismo: number;
        sueldoBruto: number;
        sueldoBrutoLetras: string;
        neto: number;
        sueldoNetoLetras: string;
        fechaActualizacion?: Date | string;
    };
}
/** ¿Ya se corrió la migración en esta base? Mientras `categorias` esté vacía se sirve la tabla vieja. */
export declare const migracionCategoriasCorrida: () => Promise<boolean>;
/**
 * Todas las categorías en la forma vieja. Si la migración todavía no corrió, devuelve `categorias-sat`
 * tal cual.
 */
export declare const listarCategoriasCompat: () => Promise<CategoriaCompat[]>;
/**
 * Resuelve categorías por `_id` en la forma vieja, mirando las DOS colecciones.
 *
 * Acepta ids de cualquiera de los dos modelos a propósito: hay datos guardados de antes de la
 * migración que todavía referencian `categorias-sat`, y perderlos en silencio es peor que servirlos
 * con la escala vieja. Lo que NO puede pasar es devolver vacío porque el id era del otro modelo.
 */
export declare const resolverCategoriasCompatPorId: (ids: any[]) => Promise<CategoriaCompat[]>;
/** Una categoría por su id numérico legacy (`categoria_sat_id` de los contratos). */
export declare const buscarCategoriaCompatPorLegacyId: (legacyId: number) => Promise<CategoriaCompat | null>;
