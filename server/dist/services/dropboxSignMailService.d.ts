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
/**
 * Ubica en Outbox el PDF al que se refiere el aviso. El nombre del asunto NO se puede comparar
 * carácter a carácter: Dropbox Sign reemplaza símbolos del original (la "@" del mail pasa a "_").
 * Por eso se matchea por el bloque CUIL/documento —que es estable— y recién después por el nombre
 * normalizado a solo alfanumérico. Si hay más de un candidato, devuelve null: nunca adivina.
 */
export declare function buscarEnOutbox(entries: {
    tag: string;
    name: string;
    path: string;
}[], archivo: string, ident: {
    cuit: string;
    documento: string;
}): {
    name: string;
    path: string;
} | null;
/** ¿Ese documento ya fue archivado en Pendbox? Compara normalizado, sin extensión. */
export declare function yaArchivado(entries: {
    tag: string;
    name: string;
}[], archivo: string, ident: {
    cuit: string;
    documento: string;
}): boolean;
export interface ResultadoLectura {
    ok: boolean;
    detalle: string;
    avisos: number;
    archivados: number;
    movidos: number;
    /** Avisos salteados porque ese documento ya tenía su JSON en Pendbox. */
    duplicados: number;
    /** Avisos salteados porque el PDF no aparece en Outbox (no se puede atribuir a un contrato). */
    sinArchivoEnOutbox: number;
}
/**
 * Lee la casilla del tenant y archiva en Pendbox un JSON por cada aviso de envío a firmar.
 * `soloPrueba` conecta y cuenta los avisos sin escribir nada (para el botón "Probar" de la config).
 */
export declare function leerCasillaDropboxSign(tenantId: string, soloPrueba?: boolean): Promise<ResultadoLectura>;
/** Corre la lectura para todos los tenants que la tengan activada (lo usa el scheduler). */
export declare function leerCasillasDeTodosLosTenants(): Promise<void>;
/** Arranca el chequeo periódico de la casilla (lo llama server.ts al levantar). */
export declare const initDropboxSignMailScheduler: () => void;
