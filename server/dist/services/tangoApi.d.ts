import type { SobreTango } from "./centrosCostoTango.js";
/** «Datos de la empresa»: de ahí sale el nombre de cada empresa de Tango. */
export declare const PROCESO_DATOS_EMPRESA = 1050;
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
    /**
     * Cómo se llama una empresa de Tango (proceso 1050, «Datos de la empresa»).
     *
     * Se le pregunta a Tango en vez de escribirlo en la configuración: el nombre es de allá, y copiarlo
     * a mano garantiza que algún día digan cosas distintas. `null` si no se pudo averiguar.
     */
    getNombreEmpresa(empresaTangoId: string, token?: string, baseUrl?: string): Promise<string | null>;
    /** La base que se va a usar para una empresa, para poder mostrarla en el diagnóstico. */
    static baseDe(empresa?: {
        tangoApiUrl?: string;
    }): string;
}
export declare const tangoApi: TangoApi;
