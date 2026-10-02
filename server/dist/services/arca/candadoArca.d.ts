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
export type TipoCorridaArca = "obras_sociales" | "nombres" | "carga_masiva" | "altas_masivas" | "catalogo";
export declare const NOMBRE_CORRIDA: Record<TipoCorridaArca, string>;
/** Quién tiene la sesión de ARCA de este tenant ahora, o `null`. */
export declare const quienTiene: (tenantId: string) => {
    tipo: TipoCorridaArca;
    desde: Date;
} | null;
export declare class CandadoArcaOcupado extends Error {
    tipo: TipoCorridaArca;
    status: number;
    constructor(tipo: TipoCorridaArca);
}
/** Toma la sesión de ARCA del tenant. Tira `CandadoArcaOcupado` si otra corrida la tiene. */
export declare function tomarCandado(tenantId: string, tipo: TipoCorridaArca): void;
/** La suelta, solo si la tiene ese tipo: soltar la de otro sería abrirle la puerta a una tercera. */
export declare function soltarCandado(tenantId: string, tipo: TipoCorridaArca): void;
