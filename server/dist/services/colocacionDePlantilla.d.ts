import { type ColocacionDeclarada } from "../compartido/reglasColocacionFirma.js";
/**
 * LA POSICIÓN DE LA FIRMA, CAPTURADA AL GENERAR (25/10/2026). Familia A de
 * `compartido/reglasColocacionFirma.ts`: documentos generados desde una plantilla del ABM.
 *
 * Se llama con el PDF recién hecho y ANTES de ponerle nombre: si la plantilla tiene `{{firma}}` y la
 * línea de firma no aparece en el PDF, la generación falla acá, con el motivo, y no queda un documento
 * que después se trabe en el Outbox. Sin `{{firma}}` en el contenido no hay nada que declarar y el
 * documento sigue el camino de siempre (reglas por ancla del bot).
 */
export interface PlantillaDeOrigen {
    tipo: "contrato" | "release";
    id: string;
    nombre: string;
    version: number;
}
export interface CapturaFirma {
    colocacion: Omit<ColocacionDeclarada, "capturadaAt"> | null;
}
/** Ubica la firma en el PDF. Tira si la plantilla la declara y no está. `null` = la plantilla no declara firma. */
export declare function capturarFirmaDePlantilla(cuerpo: string, buffer: Buffer, plantilla: PlantillaDeOrigen): Promise<CapturaFirma>;
export declare const sha256: (b: Buffer) => string;
/**
 * La guarda con el documento, por su código (el del nombre del archivo). Sin código no hay a qué
 * atarla: el documento sale igual y el bot cae al camino por ancla.
 */
export declare function guardarFirmaDelDocumento(tenantId: string, filename: string, captura: CapturaFirma): Promise<void>;
/**
 * LA PRUEBA DEL ABM (25/10/2026): genera la plantilla con datos de ejemplo —como un documento real,
 * sin el resaltado de variables de la vista previa, que cambia el texto— y dice dónde va a quedar la
 * firma, con la página renderizada para dibujar el recuadro. No guarda nada.
 */
export interface PruebaFirma {
    /** La plantilla tiene `{{firma}}`. Sin eso, el bot ubica la firma por las reglas por rótulo. */
    declara: boolean;
    ok: boolean;
    motivo?: string;
    pagina?: number;
    totalPaginas?: number;
    campo?: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    paginaSize?: {
        w: number;
        h: number;
    };
    avisos: string[];
    /** El bot coloca en la primera o la última página; en otra, el documento queda en revisión. */
    enviable: boolean;
    imagen?: {
        base64: string;
        ancho: number;
        alto: number;
    };
}
export declare function probarFirmaDePlantilla(contenido: string, membrete: any): Promise<PruebaFirma>;
