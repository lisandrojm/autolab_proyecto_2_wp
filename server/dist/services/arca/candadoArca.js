/**
 * UNA SOLA CORRIDA DE ARCA POR TENANT, sea cual sea.
 *
 * Hay tres corridas que manejan la pantalla de ARCA desde el servidor: la validación de obras
 * sociales, la Carga Masiva y las Altas Masivas. Las tres entran con el MISMO usuario delegado y la
 * MISMA sesión guardada: dos a la vez se pisarían la pantalla —una cambia de empleadora en el
 * selector mientras la otra está por pegar altas—, y la que escribe podría terminar escribiendo bajo
 * el CUIT que eligió la otra.
 *
 * Antes cada corrida tenía su propio Map y el candado de obras sociales no veía a las demás. Ahora
 * las tres pasan por acá. Sigue siendo en memoria, por las mismas razones que la corrida (ver
 * `corridaServidor.ts`): un proceso, una corrida por vez, sin Redis.
 */
export const NOMBRE_CORRIDA = {
    obras_sociales: "la validación de obras sociales",
    nombres: "la lectura de nombres en ARCA",
    carga_masiva: "la Carga Masiva de altas",
    altas_masivas: "las Altas Masivas (URGENTE)",
};
const tomados = new Map();
/** Quién tiene la sesión de ARCA de este tenant ahora, o `null`. */
export const quienTiene = (tenantId) => tomados.get(tenantId) || null;
export class CandadoArcaOcupado extends Error {
    tipo;
    status = 409;
    constructor(tipo) {
        super(`Ya hay una corrida de ARCA en curso: ${NOMBRE_CORRIDA[tipo]}. Usan la misma sesión, así que esperá a que termine.`);
        this.tipo = tipo;
    }
}
/** Toma la sesión de ARCA del tenant. Tira `CandadoArcaOcupado` si otra corrida la tiene. */
export function tomarCandado(tenantId, tipo) {
    const actual = tomados.get(tenantId);
    if (actual)
        throw new CandadoArcaOcupado(actual.tipo);
    tomados.set(tenantId, { tipo, desde: new Date() });
}
/** La suelta, solo si la tiene ese tipo: soltar la de otro sería abrirle la puerta a una tercera. */
export function soltarCandado(tenantId, tipo) {
    if (tomados.get(tenantId)?.tipo === tipo)
        tomados.delete(tenantId);
}
