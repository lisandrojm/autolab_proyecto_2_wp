export function ganaLaNueva(existente, nueva, modo) {
    if (modo === "sync")
        return true;
    if (existente.fechaFin === null)
        return true; // abierta: cualquier versión (cerrada o igual) la reemplaza
    if (nueva.fechaFin === null)
        return false; // la existente ya está cerrada; una abierta es anterior
    return nueva.fechaFin >= existente.fechaFin;
}
/** ¿La nueva versión aplica una baja? (la existente estaba abierta y la nueva tiene fin). */
export const aplicaBaja = (existente, nueva) => existente !== null && existente.fechaFin === null && nueva.fechaFin !== null;
/**
 * Reduce una lista de filas (de un mismo archivo o de una misma consulta) a una por clave natural,
 * quedándose con la versión ganadora según el modo. La clave la da quien llama.
 */
export function unaPorClave(filas, claveDe, modo) {
    const out = new Map();
    for (const f of filas) {
        const k = claveDe(f);
        const actual = out.get(k);
        if (!actual || ganaLaNueva(actual, f, modo))
            out.set(k, f);
    }
    return out;
}
