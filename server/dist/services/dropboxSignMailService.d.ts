/** Nombre del documento tal como aparece en el asunto del aviso. "" si el asunto no es de envío. */
export declare function extraerArchivoDeAsunto(asunto: string): string;
/**
 * CUIL y documento que van dentro del nombre del archivo (ver `buildIdentidadTag`). Dropbox Sign
 * reemplaza algunos caracteres del nombre original (p. ej. la "@" del mail por "_"), así que se
 * buscan los tokens etiquetados en lugar de intentar reconstruir el nombre completo.
 */
export declare function extraerIdentidadDeArchivo(nombreArchivo: string): {
    cuit: string;
    tipoDoc: string;
    documento: string;
};
export interface ResultadoLectura {
    ok: boolean;
    detalle: string;
    avisos: number;
    archivados: number;
    movidos: number;
}
/**
 * Lee la casilla del tenant y archiva en Pendbox un JSON por cada aviso de envío a firmar.
 * `soloPrueba` conecta y cuenta los avisos sin escribir nada (para el botón "Probar" de la config).
 */
export declare function leerCasillaDropboxSign(tenantId: string, soloPrueba?: boolean): Promise<ResultadoLectura>;
/** Corre la lectura para todos los tenants que la tengan activada (lo usa el scheduler). */
export declare function leerCasillasDeTodosLosTenants(): Promise<void>;
