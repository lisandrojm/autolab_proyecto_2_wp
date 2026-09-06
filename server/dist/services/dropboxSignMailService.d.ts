import { leerAnclas, AnclasNombre } from "../utils/anclasNombre.js";
/** Nombre del documento tal como aparece en el asunto del aviso. "" si el asunto no es de envío. */
export declare function extraerArchivoDeAsunto(asunto: string): string;
/**
 * Los campos obligatorios de la nomenclatura que están dentro del nombre del archivo: CUIT, email,
 * documento y las fechas del período (ver `leerAnclas`). Dropbox Sign reemplaza algunos caracteres
 * del nombre original, así que se buscan esos datos sueltos en lugar de intentar reconstruir el
 * nombre completo. Por eso el "@" viaja escrito como `-ARROBA-`: es una palabra, y las letras
 * atraviesan esa transformación intactas.
 *
 * Se mantiene el nombre viejo de la función porque es como se la conoce en los comentarios de todo
 * el circuito; lo que cambió es que ahora lee también el email y las fechas, y que las expresiones
 * son las mismas que usa el escaneo de carpetas en vez de una copia.
 */
export declare const extraerIdentidadDeArchivo: typeof leerAnclas;
/**
 * Ubica en Outbox el PDF al que se refiere el aviso. El nombre del asunto NO se puede comparar
 * carácter a carácter: Dropbox Sign reemplaza símbolos del original. Por eso se matchea por los
 * campos obligatorios de la nomenclatura —quién (CUIT o email) y de qué período—, que atraviesan esa
 * transformación intactos, y recién después por el nombre normalizado a solo alfanumérico. Si queda
 * más de un candidato, devuelve null: nunca adivina.
 *
 * EL CUIT SOLO NO ALCANZA, y era lo que se comparaba antes. Una persona con dos documentos en Outbox
 * —un contrato y su renovación, dos períodos distintos— daba dos candidatos con el mismo CUIT, y el
 * aviso se descartaba entero: el contrato se quedaba para siempre en "Para Firmar" pese a haberse
 * enviado. Las fechas son obligatorias en la nomenclatura justamente para desempatar esto.
 */
export declare function buscarEnOutbox(entries: {
    tag: string;
    name: string;
    path: string;
}[], archivo: string, ident: AnclasNombre): {
    name: string;
    path: string;
} | null;
/**
 * ¿Ese documento ya está en Pendbox? Se compara por nombre normalizado y, si no, por los campos
 * obligatorios de la nomenclatura: el archivo real suele tener un nombre distinto al del asunto
 * (Dropbox Sign transforma símbolos y el título de la solicitud es editable), así que el nombre solo
 * no alcanza para reconocerlo.
 *
 * ACÁ EL CUIT SOLO ERA UN FALSO POSITIVO. La condición era "hay algún archivo en Pendbox cuyo nombre
 * contenga este CUIT", y con eso el SEGUNDO documento de una persona nunca se movía: el aviso de la
 * renovación se daba por duplicado porque el contrato anterior ya estaba ahí. Se descartaba en
 * silencio y quedaba registrado como "ya estaba" — la peor forma de perder un envío, porque el log
 * dice que todo salió bien.
 */
export declare function yaEstaEnPendbox(entries: {
    tag: string;
    name: string;
}[], archivo: string, ident: AnclasNombre): boolean;
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
