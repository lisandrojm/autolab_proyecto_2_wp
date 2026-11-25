import { Types } from "mongoose";
import { type IdentidadEnConnector } from "./tangoApi.js";
/** Dónde vive el catálogo de centros de costo en Tango. Es igual en las tres empresas. */
export declare const PROCESO_CENTROS_COSTO = 1656;
export declare const REGISTRO_CENTROS_COSTO = 1;
/** El mensaje único de «no hay connector configurado», para la ruta, el cron y la sincronización. */
export declare const SIN_CONNECTOR = "Falta configurar el tango-connector (TANGO_CONNECTOR_URL y TANGO_CONNECTOR_API_KEY): sin eso no se puede consultar Tango. Mientras tanto se puede importar el JSON.";
export interface EmpresaExtra {
    /** Company ID de Tango. */
    id: string;
    /** Cómo se la nombra en el catálogo, si se dijo en la variable. */
    nombre?: string;
}
/**
 * EMPRESAS DE TANGO QUE NO SON EMPLEADORAS DE LA PLATAFORMA (`TANGO_EMPRESAS_EXTRA`).
 *
 * FZERO CORP —la entidad de Estados Unidos— es el caso: su catálogo se usa, pero darla de alta como
 * empresa acá la pondría a elegir como empleadora en cada contrato, y sin CUIT. Se listan sus ids de
 * Tango separados por coma, cada uno con su nombre si se quiere: `9:FZERO CORP, 15`.
 *
 * Antes el nombre se le preguntaba a Tango (proceso 1050, «Datos de la empresa»). Ese proceso no
 * tiene API en el catálogo del connector —lo rechaza con 404—, así que el nombre viene de acá o,
 * si no se dijo, del que ya tiene en el catálogo (`nombreDeEmpresaExtra`).
 */
export declare function parsearEmpresasExtra(valor: string | undefined): EmpresaExtra[];
/** El nombre con que se guarda una empresa extra: el de la variable, si no el que ya tiene el catálogo, si no el id. */
export declare function nombreDeEmpresaExtra(x: EmpresaExtra): Promise<string>;
export interface ResultadoEmpresa {
    empresaId: string;
    empresa: string;
    tangoId?: string;
    ok: boolean;
    /** Cómo llama Tango a este tipo de auxiliar en esta empresa («CC — CENTRO DE COSTOS»). */
    tipo?: string;
    creados: number;
    actualizados: number;
    /** Los que ya no están en Tango y quedaron marcados como inhabilitados. */
    inhabilitados: number;
    total: number;
    errores: string[];
}
export interface ResultadoSync {
    ok: boolean;
    empresas: ResultadoEmpresa[];
    /** Cuántos centros quedaron en el catálogo, en total. */
    totalCatalogo: number;
    sincronizadoEl: Date;
}
/**
 * Sincroniza una empresa.
 *
 * Exportada aparte para poder correr una sola —cuando una falló y las demás ya están— sin repetir
 * las tres consultas.
 */
export declare function sincronizarEmpresa(empresa: {
    _id?: Types.ObjectId | string | null;
    razonSocial?: string;
    tangoId?: string;
}): Promise<ResultadoEmpresa>;
/**
 * Sincroniza TODAS las empresas que tengan `tangoId`.
 *
 * `syncIndexes` al principio: los únicos de este catálogo pasaron de ser globales a ser por empresa
 * (ver el modelo), y el índice viejo sigue vivo en la base hasta que alguien lo reemplace. Sin esto,
 * la segunda empresa choca contra el `idAuxiliar` de la primera y no entra ni un registro suyo.
 */
export declare function sincronizarCentrosCostoDesdeTango(): Promise<ResultadoSync>;
/** Qué contestó el connector y qué contestó Tango por cada empresa, en «Probar Tango». */
export interface PruebaTango {
    connector: {
        url: string;
        tenant: string;
        ok: boolean;
        identidad?: IdentidadEnConnector;
        detalle: string;
    };
    empresas: Array<{
        empresa: string;
        tangoId?: string;
        destino: string;
        ok: boolean;
        tipo?: string;
        centros?: number;
        detalle: string;
    }>;
}
/**
 * PROBAR LA CONEXIÓN, SIN TOCAR EL CATÁLOGO.
 *
 * Primero el connector solo —`GET /meta/yo`: si la key es válida y qué empresas y procesos tiene
 * permitidos—, porque con una key mal cargada las cuatro empresas fallan igual y el motivo es uno.
 * Después, por empresa, qué contestó Tango —el estado HTTP, o el tipo de auxiliar que trajo— y
 * cuántos centros vendrían, sin escribir una sola fila.
 */
export declare function probarTango(): Promise<PruebaTango>;
/** Cuándo se sincronizó por última vez y cuántos centros tiene cada empresa. Para mostrarlo. */
export declare function estadoSincronizacion(): Promise<{
    sincronizadoEl: Date | null;
    total: number;
    porEmpresa: Array<{
        empresa: string;
        total: number;
    }>;
}>;
