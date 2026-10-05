/**
 * EL TEXTO PLANO DE UN PDF. No lee importes: devuelve el documento entero como string.
 *
 * QUÉ EXTRACTOR SE USA, Y POR QUÉ HAY DOS
 * ───────────────────────────────────────
 * `pdftotext -layout` (poppler) es lo que se usa a mano y respeta las columnas, que es lo que va a
 * necesitar la capa 3 para leer una tabla de escala. Pero es un binario del sistema: si no está en el
 * server, no hay forma de instalarlo desde acá y la entrega se cae entera por una dependencia que ni
 * siquiera es de Node.
 *
 * `pdf-parse` YA ES DEPENDENCIA declarada del proyecto y no necesita nada del sistema. Verificado
 * contra los 33 PDF guardados: extrae los 33 y conserva las columnas separadas por tabulaciones —el
 * acuerdo de abril 2026 sale con «1.187.208,59 $ 118.720,86 $ 1.305.929,45 $» en una línea—, que es
 * exactamente el formato que la capa 3 va a tener que parsear.
 *
 * Se prefiere `pdftotext` cuando está y se cae a `pdf-parse` cuando no, y QUÉ EXTRACTOR CORRIÓ QUEDA
 * GUARDADO en la publicación. No es un detalle de auditoría: los dos producen layouts distintos, y
 * un parser de tablas afinado contra uno se rompe con el otro sin avisar. Cuando la capa 3 falle
 * sobre un documento, lo primero que hay que poder contestar es con cuál se extrajo.
 */
export type Extractor = "pdftotext" | "pdf-parse";
export type EstadoExtraccion = "ok" | "vacio" | "error";
export interface TextoExtraido {
    texto: string;
    paginas: number;
    estado: EstadoExtraccion;
    motivo: string;
    extractor: Extractor | null;
}
/** Si `pdftotext` está instalado. Se averigua UNA vez por proceso: la respuesta no cambia sola. */
export declare const detectarPdftotext: () => Promise<boolean>;
/**
 * Extrae el texto de un PDF del disco.
 *
 * NUNCA DEVUELVE UN STRING VACÍO COMO ÉXITO. Un PDF escaneado extrae cero caracteres, y guardar eso
 * como `ok` es la forma de que más adelante alguien concluya «este acuerdo no menciona ningún
 * convenio» cuando lo que pasa es que nunca se leyó. Ya pasó dos veces en este proyecto que un cero
 * se leyera como «no hay problema»; acá el cero tiene su propio estado y se ve en pantalla.
 */
export declare const extraerTexto: (rutaAbsoluta: string) => Promise<TextoExtraido>;
