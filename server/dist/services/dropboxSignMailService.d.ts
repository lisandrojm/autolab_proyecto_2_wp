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
 * EL documento del aviso en Outbox: el archivo cuyo nombre completo (sin la extensión) es el título.
 *
 * Coinciden TODOS los campos —proyecto, persona, tipo, contrato, período, CUIT, email y empresa—, no
 * solo la persona y el período: un alta, su contrato y su release comparten persona y período, y
 * mover «lo de esa persona» se llevó a Pendbox los tres por un aviso que nombraba solo el alta.
 *
 * Lo que el título tenga DESPUÉS del nombre no importa («…_Empresa-30717068374-Frame Firma
 * Digital»): el título de la solicitud es editable y Dropbox Sign o quien envía le agregan cosas.
 * Para que eso no confunda un nombre con otro más largo que lo contiene, después del nombre tiene que
 * venir un separador, no una letra o un número; y si igual quedan dos, gana el más largo.
 *
 * Primero se compara el texto tal cual. Solo si no aparece nada, normalizado a letras y números (por
 * si Dropbox Sign cambió algún símbolo), con la misma regla de «el título empieza con el nombre».
 */
export declare function documentosDelAvisoEnOutbox(entries: {
    tag: string;
    name: string;
    path: string;
}[], archivo: string, _ident?: AnclasNombre): {
    name: string;
    path: string;
}[];
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
}[], archivo: string, _ident?: AnclasNombre): boolean;
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
 * Por qué falló el IMAP, en palabras que sirvan para arreglarlo.
 *
 * `imapflow` tira SIEMPRE «Command failed» cuando el servidor contesta NO/BAD: el motivo real viene
 * aparte, en `responseText` (lo que dijo el servidor) y `authenticationFailed`. Mostrando solo el
 * `message`, la pantalla decía «Command failed» igual para una contraseña rechazada que para
 * cualquier otra cosa, y no había por dónde empezar.
 *
 * El caso que más pasa tiene nombre propio: Gmail no acepta la contraseña de la cuenta por IMAP,
 * pide una «contraseña de aplicación». No se manda nunca `executedCommand`: en un LOGIN lleva la
 * contraseña.
 */
export declare function motivoFalloImap(e: any): string;
export declare function leerCasillaDropboxSign(tenantId: string, soloPrueba?: boolean): Promise<ResultadoLectura>;
export declare function registrarLectura(r: ResultadoLectura): any;
/** Corre la lectura para todos los tenants que la tengan activada (el sondeo de respaldo). */
export declare function leerCasillasDeTodosLosTenants(): Promise<void>;
/**
 * Rearma la vigilancia de un tenant con su configuración actual. Lo llama la ruta que guarda la
 * casilla: una contraseña nueva o la lectura apagada tienen que regir sin reiniciar el servidor.
 */
export declare function actualizarVigilancia(tenantId: string): void;
/** Arranca la vigilancia de las casillas y el sondeo de respaldo (lo llama server.ts al levantar). */
export declare const initDropboxSignMailScheduler: () => void;
