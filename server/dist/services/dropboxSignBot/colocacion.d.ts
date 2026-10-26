import type { Worker } from "tesseract.js";
import { type ResumenColocacion } from "../../models/DropboxSignEnvio.js";
import { type ColocacionDeclarada, type Deteccion, type PaginaPdf, type ReglaColocacion } from "../../compartido/reglasColocacionFirma.js";
import { type ConfigDropbox } from "./outbox.js";
/**
 * LA DETECCIÓN DEL ANCLA, FUERA DEL NAVEGADOR (22/10/2026): el mismo código que usa la corrida, para
 * poder VERLO antes de que el bot envíe nada.
 *
 *  · `detectarParaArchivo`: baja el PDF del Outbox, lee el texto (y el OCR de la franja si la regla lo
 *    pide) y resuelve la colocación. Es lo que corre la tanda antes de abrir Chromium.
 *  · `previsualizarColocacion`: lo mismo, más la página renderizada a imagen, para dibujar encima el
 *    campo, el ancla y lo descartado.
 *  · `arrancarVerificacion`: «Verificar todos», en segundo plano con avance: la cola, lo que requiere
 *    revisión o el Outbox entero. No cambia estados; deja en cada registro el resumen (✓/✗, página,
 *    rótulo, motivo) que muestran la cola y el tab.
 */
export interface DeteccionDeArchivo {
    archivo: string;
    codigo: string;
    tipo: string | null;
    firmante: {
        nombre: string;
        email: string;
    } | null;
    motivoSinFirmante?: string;
    deteccion: Deteccion;
    paginas: PaginaPdf[] | null;
    buffer: Buffer;
    ocrMs: number;
    /** «plantilla»: la posición la declaró la plantilla al generar (familia A). «ancla»: por regla (familia B). */
    origen: "plantilla" | "ancla";
    /** Con la posición declarada no se leen las páginas: el total viene de la captura. */
    totalPaginas: number;
    /** La posición declarada que había, si la hubo (aunque no se haya podido usar). */
    declarada: ColocacionDeclarada | null;
    /** Por qué, habiendo posición declarada, se usó la regla por ancla (el PDF cambió). */
    notaOrigen?: string;
}
/** La posición de la firma declarada por la plantilla al generar ese documento, si la hay. */
export declare function declaradaDe(tenantId: string, codigo: string): Promise<ColocacionDeclarada | null>;
/** Los códigos (de esta lista) cuyos documentos traen posición declarada, con el nombre de la plantilla. */
export declare function declaradasDe(tenantId: string, codigos: string[]): Promise<Map<string, {
    plantillaNombre: string;
}>>;
/**
 * Baja el PDF y resuelve la colocación. El firmante, si no viene, se resuelve desde la base.
 *
 * PRIMERO LA POSICIÓN DECLARADA (25/10/2026): si el documento se generó desde una plantilla con
 * `{{firma}}`, la posición se capturó al generarlo y se usa tal cual —sin leer texto ni hacer OCR,
 * que es más lento y podría dar distinto—, siempre que el PDF del Outbox sea EXACTAMENTE el generado
 * (mismo SHA-256). Si no lo es (alguien lo reemplazó), la posición no vale y se sigue por regla.
 */
export declare function detectarParaArchivo(tenantId: string, ctx: {
    cfg: ConfigDropbox;
    outbox: string;
}, archivo: string, reglas: ReglaColocacion[], opciones?: {
    firmante?: {
        nombre: string;
        email: string;
    } | null;
    worker?: Worker;
}): Promise<DeteccionDeArchivo>;
export declare function resumenDe(d: Deteccion): ResumenColocacion;
/**
 * El hash de contenido de Dropbox (`content_hash`): SHA-256 de cada bloque de 4 MB, y SHA-256 de esos
 * hashes concatenados. Calculado sobre el PDF verificado, se compara después con el que lista Dropbox
 * sin volver a bajar el archivo.
 */
export declare function hashDropbox(b: Buffer): string;
/** El resumen con lo necesario para saber después si sigue valiendo (PDF, reglas, plantilla). */
export declare function resumenDeArchivo(d: DeteccionDeArchivo, reglasAt: Date | null): ResumenColocacion;
/** Deja el resumen en el registro del archivo, si lo hay (no crea registros: eso lo hace el encolado). */
export declare function guardarResumen(tenantId: string, codigo: string, resumen: ResumenColocacion): Promise<void>;
export interface Previsualizacion {
    archivo: string;
    codigo: string;
    tipo: string | null;
    regla: {
        tipo: string;
        descripcion: string;
        pagina: string;
    } | null;
    firmante: {
        nombre: string;
        email: string;
    } | null;
    motivoSinFirmante?: string;
    deteccion: Deteccion;
    /** La página que se muestra (la del campo, o donde se buscó). */
    pagina: {
        numero: number;
        total: number;
        ancho: number;
        alto: number;
    };
    imagen: {
        base64: string;
        ancho: number;
        alto: number;
    };
    ocrMs: number;
    /** «plantilla» = posición declarada por la plantilla; «ancla» = por regla. */
    origen: "plantilla" | "ancla";
    /** Lo que conviene saber de la posición (varias líneas de firma, página del medio, PDF cambiado). */
    avisos: string[];
}
/** La detección más la página renderizada, para dibujar encima el campo, el ancla y lo descartado. */
export declare function previsualizarColocacion(tenantId: string, archivo: string): Promise<Previsualizacion>;
export type AlcanceVerificacion = "cola" | "revision" | "cola_y_revision" | "outbox";
export interface ResultadoVerificado {
    archivo: string;
    codigo: string;
    tipo: string | null;
    /** Estado del registro del bot al momento de verificar ("" si no tiene). */
    estado: string;
    firmante: string;
    ok: boolean;
    pagina: number | null;
    rotulo: string;
    fuente: string;
    motivo: string;
    ms: number;
    /** Cuándo se verificó (ISO): la pantalla lo muestra junto al resultado. */
    verificadaAt: string;
    origen: "plantilla" | "ancla";
}
export interface Verificacion {
    tenantId: string;
    alcance: AlcanceVerificacion;
    arrancadaEl: Date;
    terminadaEl: Date | null;
    total: number;
    hechos: number;
    enviables: number;
    noEnviables: number;
    actual: string | null;
    resultados: ResultadoVerificado[];
    /** Cuántos no enviables por motivo (resumido: sin el nombre del archivo). */
    porMotivo: Record<string, number>;
    error: string | null;
    detenerPedido: boolean;
}
export declare const verificacionDe: (tenantId: string) => Verificacion | undefined;
export declare function detenerVerificacion(tenantId: string): {
    ok: boolean;
    motivo?: string;
};
/** Arranca «Verificar todos» y vuelve en el acto; la UI sigue el avance con `verificacionDe`. */
export declare function arrancarVerificacion(tenantId: string, alcance?: AlcanceVerificacion): Promise<{
    total: number;
}>;
