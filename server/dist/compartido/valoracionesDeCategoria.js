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
export const valoracionesDeCategoria = (c) => {
    const lista = Array.isArray(c?.valoracionIds) ? c.valoracionIds.map((x) => String(x || "")).filter(Boolean) : [];
    if (lista.length > 0)
        return [...new Set(lista)];
    const uno = c?.valoracionId ? String(c.valoracionId) : "";
    return uno ? [uno] : [];
};
/** ¿La categoría vale para esta valoración? */
export const tieneValoracion = (c, valoracionId) => !!valoracionId && valoracionesDeCategoria(c).includes(String(valoracionId));
