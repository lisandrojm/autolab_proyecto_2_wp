import { Types } from "mongoose";
/** Dónde vive el catálogo de centros de costo en Tango. Es igual en las tres empresas. */
export declare const PROCESO_CENTROS_COSTO = 1656;
export declare const REGISTRO_CENTROS_COSTO = 1;
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
    _id: Types.ObjectId | string;
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
/** Cuándo se sincronizó por última vez y cuántos centros tiene cada empresa. Para mostrarlo. */
export declare function estadoSincronizacion(): Promise<{
    sincronizadoEl: Date | null;
    total: number;
    porEmpresa: Array<{
        empresa: string;
        total: number;
    }>;
}>;
