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
/**
 * ¿Ese documento ya está en Pendbox? Se compara por nombre normalizado y, sobre todo, por CUIL: el
 * archivo real suele tener un nombre distinto al del asunto (Dropbox Sign transforma símbolos y el
 * título de la solicitud es editable), así que el nombre solo no alcanza para reconocerlo.
 */
export declare function yaEstaEnPendbox(entries: {
    tag: string;
    name: string;
}[], archivo: string, ident: {
    cuit: string;
    documento: string;
}): boolean;
/** Una línea por aviso encontrado: qué se decidió y por qué. Lo consume el modal de Logs. */
export interface LineaLog {
    resultado: "archivado" | "duplicado" | "sin-archivo" | "ignorado" | "error";
    asunto?: string;
    archivo?: string;
    cuit?: string;
    documento?: string;
    detalle?: string;
}
export interface ResultadoLectura {
    ok: boolean;
    detalle: string;
    avisos: number;
    movidos: number;
    /** Avisos salteados porque ese documento ya tenía su JSON en Pendbox. */
    duplicados: number;
    /** Avisos salteados porque el PDF no aparece en Outbox (no se puede atribuir a un contrato). */
    sinArchivoEnOutbox: number;
    /** Qué pasó con cada aviso, para el modal de Logs. */
    logs: LineaLog[];
}
/**
 * Lee la casilla del tenant y archiva en Pendbox un JSON por cada aviso de envío a firmar.
 * `soloPrueba` conecta y cuenta los avisos sin escribir nada (para el botón "Probar" de la config).
 */
export declare function leerCasillaDropboxSign(tenantId: string, soloPrueba?: boolean): Promise<ResultadoLectura>;
/**
 * Update de Mongo que deja registrada una lectura. La corrida se suma al historial solo si encontró
 * algo o si falló: el job corre cada 5 minutos y guardar las corridas vacías llenaría el documento
 * del tenant sin aportar nada. Se conservan las últimas 50, de la más reciente a la más vieja.
 */
export declare function registrarLectura(r: ResultadoLectura): any;
/** Corre la lectura para todos los tenants que la tengan activada (lo usa el scheduler). */
export declare function leerCasillasDeTodosLosTenants(): Promise<void>;
/** Arranca el chequeo periódico de la casilla (lo llama server.ts al levantar). */
export declare const initDropboxSignMailScheduler: () => void;
