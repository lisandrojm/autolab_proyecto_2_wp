import type { SobreTango } from "./centrosCostoTango.js";
export declare class TangoApi {
    private api;
    private token;
    constructor();
    /** ¿Está configurada? Sin esto, cada llamada fallaría con un 404 contra la nada. */
    static configurada(): boolean;
    /**
     * Abre sesión si hace falta. Con `TANGO_API_TOKEN` no hace nada: ya hay token.
     *
     * El token se guarda en memoria y se reusa; si caduca, la llamada que falle con 401 lo limpia y la
     * siguiente vuelve a entrar (ver `getRegistro`).
     */
    private asegurarSesion;
    /** Dónde meter el id de la empresa en este request. Ver el comentario de arriba. */
    private aplicarEmpresa;
    /**
     * `GET Registro/Api/GetById/{proceso}/{id}` para una empresa.
     *
     * Devuelve el sobre tal cual (`{ value, message, succeeded }`): interpretarlo es de quien sabe qué
     * pidió —para centros de costo, `leerRegistroAuxiliares`—. Acá sólo se resuelve el transporte.
     */
    getRegistro(proceso: number, id: number, empresaTangoId: string): Promise<SobreTango<any>>;
}
export declare const tangoApi: TangoApi;
