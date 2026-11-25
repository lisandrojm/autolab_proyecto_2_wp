import type { SobreTango } from "./centrosCostoTango.js";
export declare const TENANT_POR_DEFECTO = "servertango";
export interface ConfigConnector {
    /** Sin barra final. */
    url: string;
    apiKey: string;
    tenant: string;
    timeoutMs: number;
}
/** La configuración del entorno, o `null` si falta la URL o la key: sin las dos no hay a quién preguntarle. */
export declare function configDelEntorno(env?: NodeJS.ProcessEnv): ConfigConnector | null;
/** De dónde salió una falla: el connector la rechazó, Tango contestó con error, o no hubo respuesta. */
export type OrigenFalla = "connector" | "tango" | "red";
/**
 * Una consulta que no trajo el sobre de Tango. Guarda lo que hace falta para explicarla: quién
 * contestó, con qué estado HTTP y con qué detalle (`exceptionInfo.messages`, que es donde el
 * connector y Tango ponen el motivo real; el `message` suele ser genérico).
 */
export declare class ErrorConnector extends Error {
    readonly origen: OrigenFalla;
    readonly status: number;
    readonly mensajes: string[];
    /** `tenant/empresa` al que se le preguntó. Nunca la key. */
    readonly destino: string;
    readonly reintentable: boolean;
    constructor(origen: OrigenFalla, status: number, mensajes: string[], 
    /** `tenant/empresa` al que se le preguntó. Nunca la key. */
    destino: string, reintentable: boolean);
}
/** Lo que vuelve de un request, ya leído: estado, el header de origen y el body parseado (JSON) o en texto. */
export interface RespuestaHttp {
    status: number;
    origen: string | null;
    cuerpo: unknown;
}
export type Transporte = (url: string, headers: Record<string, string>, timeoutMs: number) => Promise<RespuestaHttp>;
/** Los mensajes de un body de error, del más específico al más general, sin repetir (como `mensajesDe` del SDK). */
export declare function mensajesDe(cuerpo: unknown): string[];
/** Qué contestó `GET /meta/yo`: la key con la que se habla y lo que tiene permitido. Para el diagnóstico. */
export interface IdentidadEnConnector {
    plataforma?: string;
    prefijo?: string;
    permisos?: {
        empresas?: string[];
        procesos?: Record<string, string[]>;
        filtroSql?: boolean;
    };
    catalogo?: string;
}
export declare class TangoApi {
    private readonly transporte;
    private readonly leerConfig;
    constructor(transporte?: Transporte, leerConfig?: () => ConfigConnector | null);
    /** ¿Está configurada? Sin URL y key del connector, cada llamada terminaría en un error. */
    static configurada(): boolean;
    /** `tenant/empresa` tal como viaja en la URL, para poder mostrarlo en un diagnóstico. */
    static destino(empresaTangoId: string, env?: NodeJS.ProcessEnv): string;
    /** La URL del connector, sin la key. Vacía si no está configurada. */
    static url(): string;
    /** El servidor Tango registrado en el connector al que se le habla. */
    static tenant(env?: NodeJS.ProcessEnv): string;
    private config;
    /**
     * `GET /tango/{tenant}/{empresa}/GetById?process=&id=` para una empresa, por su Company ID de Tango.
     *
     * Devuelve el sobre de Tango tal cual: interpretarlo es de quien sabe qué pidió (para centros de
     * costo, `leerRegistroAuxiliares`; un `succeeded: false` de Tango también llega por acá). Lo que
     * NO es un sobre —rechazos del connector, túnel caído, red— sale como `ErrorConnector`.
     */
    getRegistro(proceso: number, id: number, empresaTangoId: string): Promise<SobreTango<any>>;
    /** Con qué key se está hablando y qué le permiten: `GET /meta/yo`. Para el diagnóstico de «Probar Tango». */
    quienSoy(): Promise<IdentidadEnConnector>;
    /** Un request con un reintento ante fallas del túnel o de la red. Un 4xx es un rechazo: se explica, no se repite. */
    private pedir;
}
/**
 * Por qué no se pudo consultar Tango, en palabras de quien tiene que ir a arreglarlo.
 *
 * «Request failed with status code 403» no dice qué hacer. Cada rechazo del connector tiene un
 * responsable distinto —la key la administra Lumba en su VPS, el túnel lo levanta el cliente del
 * lado de Tango, la URL está en el `.env` de WeProdu— y el mensaje tiene que mandar al lugar correcto.
 */
export declare function explicarFalla(e: unknown): string;
export declare const tangoApi: TangoApi;
