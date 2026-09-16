import type { SobreTango } from "./centrosCostoTango.js";
export declare class TangoApi {
    private api;
    constructor();
    /** ¿Está configurada? Sin la URL del túnel, cada llamada terminaría en un error de red. */
    static configurada(): boolean;
    /**
     * `GET /GetById?process=&id=` para una empresa.
     *
     * Devuelve el sobre tal cual: interpretarlo es de quien sabe qué pidió (para centros de costo,
     * `leerRegistroAuxiliares`). Acá sólo se resuelve el transporte.
     */
    getRegistro(proceso: number, id: number, empresaTangoId: string, token?: string, baseUrl?: string): Promise<SobreTango<any>>;
    /** La base que se va a usar para una empresa, para poder mostrarla en el diagnóstico. */
    static baseDe(empresa?: {
        tangoApiUrl?: string;
    }): string;
}
export declare const tangoApi: TangoApi;
