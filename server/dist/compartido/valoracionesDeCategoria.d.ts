/**
 * LAS VALORACIONES DE UNA CATEGORÍA EN UNA FUNCIÓN (Rol Empresa → categoriasSat[]).
 *
 * Una categoría puede valer para MÁS DE UN NIVEL a la vez (pedido del 11/10/2026: «UNITARIO» como Oro
 * y Plata). Se guardan en `valoracionIds`; `valoracionId` sigue existiendo y es siempre la primera de
 * la lista, para que lo que todavía lee un solo valor (scripts, respaldos, pantallas viejas) siga
 * andando. Esta función es la ÚNICA lectura: devuelve la lista, venga de donde venga.
 *
 * Vacío = «sin valorar» (modo permisivo: el filtro de contratación no se aplica).
 */
export declare const valoracionesDeCategoria: (c: {
    valoracionId?: unknown;
    valoracionIds?: unknown;
} | null | undefined) => string[];
/** ¿La categoría vale para esta valoración? */
export declare const tieneValoracion: (c: {
    valoracionId?: unknown;
    valoracionIds?: unknown;
} | null | undefined, valoracionId: unknown) => boolean;
