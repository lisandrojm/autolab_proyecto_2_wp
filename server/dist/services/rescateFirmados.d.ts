import { type ArchivoConNombre } from "../utils/coincidenciaDeNombre.js";
/**
 * RESCATE DE FIRMADOS DESDE EL EMAIL (23/10/2026). Doble validación «Requested signatures» / correo.
 *
 * El paso «Enviado a la firma → Firmados» depende de la integración nativa Dropbox Sign → Dropbox, que
 * deposita el PDF firmado en la carpeta con propósito `firmados`. Esa integración se corta a veces y
 * los firmados no llegan. La misma lectura IMAP que mueve Outbox → Pendbox con los avisos de «se inició
 * el proceso de firma» detecta además los avisos de «documento firmado» y, si el PDF NO está en la
 * carpeta, lo baja del adjunto del email y lo sube ella misma. Si la integración ya lo depositó, no
 * hace nada (idempotente). Los estados no se tocan acá: después de un rescate se dispara el escaneo de
 * carpetas y todo sigue por el camino de siempre.
 *
 * Este módulo es PURO (sin IMAP ni Dropbox): recibe los avisos ya leídos y las operaciones inyectadas,
 * así se prueba entero sin red. `dropboxSignMailService.ts` lo alimenta.
 */
/** Remitente de los avisos de Dropbox Sign (confirmado con un mail real: «Frame Zero <noreply@mail.hellosign.com>»). */
export declare const REMITENTE_FIRMADO = "mail.hellosign.com";
/**
 * Términos del SEARCH IMAP. PALABRAS ENTERAS, con acento: Gmail no busca por subcadena sino por
 * palabra (como su buscador), y por eso «firm» devolvía 0 con 204 mails de «firmó» en la casilla
 * (medido el 25/10/2026: «firm» → 0, «firmo» → 0, «firmó» → 204). El charset no es problema:
 * ImapFlow manda el SEARCH en UTF-8. El filtro fino sigue siendo `extraerArchivoFirmado`.
 */
export declare const TERMINOS_BUSQUEDA_FIRMADO: string[];
export declare const ASUNTO_FIRMADO: RegExp[];
/** El aviso de firmado leído del asunto: el nombre del PDF (con `.pdf`) y quién firmó, o null si no es de firmado. */
export declare function extraerAvisoFirmado(asunto: string): {
    archivo: string;
    quien: string;
} | null;
/** El nombre del PDF firmado tal como aparece en el asunto (con `.pdf`), o "" si el asunto no es de firmado. */
export declare const extraerArchivoFirmado: (asunto: string) => string;
export declare const esAvisoDeFirmado: (asunto: string) => boolean;
/** Un adjunto PDF de un mensaje, por su número de parte (para bajarlo). */
export interface AdjuntoPdf {
    part: string;
    nombre: string;
    /** Tamaño codificado (base64), si el servidor lo informa. */
    bytes: number | null;
    tipo: string;
}
/** La fecha de un mensaje de imapflow: la del encabezado Date (cuándo lo mandó Dropbox Sign) o, si no viene, la de llegada. */
export declare function fechaDelAviso(m: any): Date | undefined;
/** Los adjuntos PDF de un `bodyStructure` de imapflow (recorre las partes anidadas). */
export declare function adjuntosPdf(estructura: any): AdjuntoPdf[];
/** Límites del adjunto: un recibo o contrato pesa entre ~100 KB y unos pocos MB. */
export declare const MIN_BYTES_PDF: number;
export declare const MAX_BYTES_PDF: number;
/** El adjunto es dato NO confiable: no se interpreta, sólo se verifica que sea un PDF de tamaño razonable. */
export declare function validarAdjunto(buffer: Buffer): {
    ok: true;
} | {
    ok: false;
    motivo: string;
};
/**
 * El nombre con el que se sube: el título del documento (nombre exacto con el que se envió), saneado
 * (sin rutas ni caracteres de control), con el código al final si no lo traía, recortado al tope de
 * Dropbox y con `.pdf`.
 */
export declare function nombreDestino(titulo: string, codigo?: string): string;
/**
 * El sello de la integración nativa: «Wed, 07 Oct 2026 19h07m43s», EN UTC y con día y mes en inglés.
 * Medido el 25/10/2026 contra la carpeta: el sello cae 8-10 s después del mail «Fulano firmó …» del
 * mismo documento, y está en UTC. Con la fecha del mail el rescatado queda a segundos del que habría
 * depositado la integración, y la columna «Fecha Firma» de Documentos lo lee igual.
 */
export declare function selloIntegracion(d: Date): string;
/** El texto que la integración pone entre el título y el sello (es el título del envío). */
export declare const TEXTO_INTEGRACION = "Firma solicitada por";
/**
 * EL NOMBRE COMO LO DEJA LA INTEGRACIÓN NATIVA (25/10/2026), para que un rescatado no se distinga de
 * uno depositado por Dropbox Sign:
 *
 *   <título con .pdf>_ Firma solicitada por Wed, 07 Oct 2026 19h07m43s.pdf
 *
 * (ejemplo real: «…_ID-000003.pdf_ Firma solicitada por Wed, 07 Oct 2026 19h07m43s.pdf»). El «.pdf»
 * del título queda adentro, como en los reales: `limpiezaPendbox` cuenta con eso.
 *
 * TOPE 255 BYTES, Y NUNCA SE CORTA UN ANCLA. La integración nativa corta el título a 160 caracteres y
 * a veces se come el texto («Firma solicit») — con títulos más largos se comería el código. Acá el
 * orden es: primero se acorta el texto «Firma solicitada por» (hasta sacarlo), y si todavía no entra
 * se recortan los campos descriptivos del título con `recortarNombre` (nombre, email, proyecto…),
 * nunca el `ID-NNNNNN`, el CUIL ni las fechas, que son lo que la plataforma lee de vuelta.
 */
export declare function nombreComoIntegracion(titulo: string, codigo: string, firmadoEl: Date): string;
/** ¿El firmado ya está en la carpeta? Por código si el título lo trae; si no, por nombre (el más largo que coincida). */
export declare function yaEstaEnFirmados<T extends ArchivoConNombre>(entries: Array<T & {
    tag?: string;
}>, titulo: string): T | null;
/** Dropbox contesta 409 `path/conflict/file` cuando ya hay un archivo con ese nombre (subida sin renombrar). */
export declare function esConflictoDeNombre(e: any): boolean;
export interface AvisoFirmado {
    uid: number;
    asunto: string;
    /** El nombre del PDF según el asunto. */
    titulo: string;
    /** Quién firmó, según el asunto. */
    quien?: string;
    adjuntos: AdjuntoPdf[];
    /** Cuándo mandó Dropbox Sign el aviso (≈ cuándo se firmó). Con esto el nombre lleva el sello de la integración. */
    fecha?: Date;
}
/** «firmado-faltante» sólo sale en una prueba detallada: faltaba y se habría subido con ese nombre. */
export type ResultadoRescate = "firmado-rescatado" | "firmado-ya-estaba" | "firmado-sin-adjunto" | "firmado-faltante" | "error";
export interface LineaRescate {
    resultado: ResultadoRescate;
    /** El mensaje de la casilla del que salió la línea. */
    uid?: number;
    asunto: string;
    archivo: string;
    cuit?: string;
    documento?: string;
    detalle: string;
    /** Sólo en «firmado-rescatado»: lo que hace falta para el registro permanente. */
    rescate?: {
        uid: number;
        codigo: string;
        titulo: string;
        quien: string;
        path: string;
        carpeta: string;
        bytes: number;
    };
}
export interface DepsRescate {
    carpetaFirmados: string;
    /** El listado de la carpeta, UNA vez por corrida. Se actualiza en memoria con lo que se sube. */
    enFirmados: ArchivoConNombre[];
    /** Con `soloPrueba` cuenta cuántos faltan sin bajar ni subir nada. */
    soloPrueba: boolean;
    existeDocumento: (codigo: string) => Promise<boolean>;
    descargar: (uid: number, adjunto: AdjuntoPdf) => Promise<Buffer>;
    /** Sube SIN renombrar: si ya existe, tira un error que `esConflictoDeNombre` reconoce. */
    subir: (path: string, buffer: Buffer) => Promise<void>;
    /** UIDs ya resueltos en esta vida del proceso (rescatados o sin adjunto): no se vuelven a bajar. */
    verificados: Set<number>;
    cederHilo?: () => Promise<void>;
    /**
     * Prueba DETALLADA (el backfill en seco): además de contar, valida código, documento y adjunto como
     * la corrida real y deja una línea «firmado-faltante» con el nombre con el que se subiría. No baja
     * ni sube nada. Sin esto, la prueba sólo cuenta (lo que usa «Probar conexión»).
     */
    detallarPrueba?: boolean;
    /**
     * El documento generado cuyo nombre EMPIEZA con este prefijo, si hay exactamente uno. Lo usa el caso
     * del código cortado en el asunto («…_ID-0.pdf»). Sin esto, ese aviso es un error como antes.
     */
    documentoPorPrefijo?: (prefijo: string) => Promise<{
        codigo: string;
        archivo: string;
    } | null>;
    /** Tope de subidas (o de faltantes, en prueba). Al llegar se corta y `cortadoPorLimite` lo dice. */
    limite?: number;
}
export interface ResumenRescate {
    avisos: number;
    yaEstaban: number;
    rescatados: number;
    sinAdjunto: number;
    /** Sólo en prueba: cuántos no están en la carpeta (se rescatarían). */
    faltan: number;
    errores: string[];
    logs: LineaRescate[];
    /** La pasada se cortó por `limite`: quedaron avisos sin mirar. */
    cortadoPorLimite?: boolean;
}
/** Por cada aviso de firmado: ¿está en la carpeta? Si no, bajar el adjunto, validarlo y subirlo. Idempotente. */
export declare function rescatarFirmados(avisos: AvisoFirmado[], deps: DepsRescate): Promise<ResumenRescate>;
