import { Types } from "mongoose";
import { type ILoteRecibosSueldo } from "../models/LoteRecibosSueldo.js";
/**
 * RECIBOS DE SUELDO (Contratación › Recibos de sueldo, 20/10/2026).
 *
 * Se sube la sábana (un PDF con todos los recibos del mes, de a dos páginas por persona) y, si se tiene,
 * el TXT que MEMOSOFT exporta con ella: con el TXT los datos salen de ahí, sin OCR y sin errores de
 * lectura (el bloque N del TXT es la página N del PDF, que sólo se parte). Sin TXT, el lote nace
 * en el acto, «leyendo», y la lectura sigue en segundo plano: se saca el texto de cada página y, si no
 * trae el CUIL (los recibos de MEMOSOFT dibujan los datos como trazos), se la renderiza y se le hace
 * OCR. Con el texto de cada página se parte la sábana en un recibo por persona (`agruparPaginas`),
 * cada recibo se guarda como PDF propio y se asocia a la persona por su CUIL y a su contrato que rige.
 * Después, el mismo circuito que los contratos: el PDF va al Outbox de Dropbox con la nomenclatura
 * «Recibos de sueldo» y vuelve firmado, reconocido por su código.
 *
 * Los archivos viven en `storage/<tenant>/recibos-sueldo/<lote>/` (fuera del repo), servidos como el
 * resto de `/storage`. Multi-tenant: todo filtra por `tenantId`.
 */
export declare class ErrorRecibos extends Error {
    status: number;
    constructor(msg: string, status?: number);
}
/**
 * Crea el lote y guarda la sábana. Con el TXT de MEMOSOFT lee los datos de ahí en el acto y devuelve el
 * lote «listo»; sin TXT dispara la lectura por OCR en segundo plano y lo devuelve «leyendo».
 */
export declare function procesarSabana(tenantId: Types.ObjectId, subidoPor: string | undefined, nombreArchivo: string, buffer: Buffer, paginasPorRecibo?: number, txt?: {
    nombre: string;
    buffer: Buffer;
}): Promise<ILoteRecibosSueldo>;
export interface ResultadoMasivo {
    lotes: Array<{
        loteId: string;
        pdf: string;
        txt: string;
        recibos: number;
        por: string;
    }>;
    /** Archivos que no se subieron, con el motivo. */
    omitidos: Array<{
        archivo: string;
        motivo: string;
    }>;
}
/**
 * SUBIDA MASIVA: todas las sábanas PDF y sus TXT de una vez. Cada TXT se empareja con su PDF (por nombre
 * y, si no, por cantidad de páginas: ver `utils/emparejarSabanas.ts`) y cada par es un lote, como si se
 * hubiera subido solo. Lo que no tiene pareja no se sube y se informa: un PDF solo se lee por OCR, que es
 * lento y menos preciso, así que se sube aparte a propósito.
 */
export declare function procesarVarios(tenantId: Types.ObjectId, subidoPor: string | undefined, archivos: Array<{
    nombre: string;
    buffer: Buffer;
}>, paginasPorRecibo?: number): Promise<ResultadoMasivo>;
/**
 * VOLVER A LEER UN RECIBO: su PDF (las páginas ya separadas) pasa otra vez por OCR, a más resolución
 * que la lectura del lote (4× la página entera, y el encabezado a 4× si falta el CUIL), se releen los
 * datos y se vuelve a buscar a la persona por CUIL o por nombre. La persona elegida a mano se respeta.
 */
export declare function releerRecibo(lote: ILoteRecibosSueldo, reciboId: string): Promise<void>;
/** Asigna a mano la persona de un recibo (y su contrato que rige). */
export declare function asignarPersona(lote: ILoteRecibosSueldo, reciboId: string, userId: string): Promise<void>;
/**
 * Manda los recibos al Outbox de Dropbox, uno por uno, con la nomenclatura «Recibos de sueldo» (tipo
 * interno "Contrato") del contrato que rige. El código del documento queda marcado como recibo de
 * sueldo para que, al volver firmado, el escaneo de carpetas marque el recibo y NO mueva el estado del
 * contrato (ver `estadoDropboxCronService`).
 */
export declare function enviarAFirmar(lote: ILoteRecibosSueldo, reciboIds?: string[], enviadoPor?: string): Promise<{
    enviados: number;
    fallidos: Array<{
        reciboId: string;
        motivo: string;
    }>;
}>;
/** Borra el lote y sus PDFs. Sólo si ningún recibo salió a firmar. */
export declare function eliminarLote(lote: ILoteRecibosSueldo): Promise<void>;
/** Marca como firmado el recibo cuyo código volvió a la carpeta de firmados. Lo llama el escaneo de Dropbox. */
export declare function marcarReciboFirmado(tenantId: unknown, codigo: string): Promise<boolean>;
/**
 * Completa el registro con los recibos enviados que todavía no están: los que salieron antes de que
 * existiera el registro, o aquéllos cuyo registro falló al enviar. Sólo agrega lo que falta y pone al día
 * el «firmado»; no pisa lo que ya está.
 */
export declare function completarHistorial(tenantId: Types.ObjectId): Promise<number>;
/** El registro de enviados, más nuevos primero, con filtros por período, estado y texto. */
export declare function listarEnviados(tenantId: Types.ObjectId, f: {
    periodo?: string;
    estado?: string;
    q?: string;
    pagina?: number;
    porPagina?: number;
}): Promise<{
    items: (import("mongoose").FlattenMaps<import("../models/ReciboSueldoEnviado.js").IReciboSueldoEnviado> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[];
    total: number;
    pagina: number;
    porPagina: number;
    periodos: string[];
}>;
/** Todo lo que se leyó del PDF, para descargar como JSON y revisar qué entendió el lector. */
export declare function exportacionDelLote(lote: ILoteRecibosSueldo): {
    lote: {
        id: string;
        archivo: string;
        fuente: "ocr" | "txt";
        txt: string;
        paginas: number;
        paginasPorRecibo: number;
        periodo: string;
        estado: import("../models/LoteRecibosSueldo.js").EstadoLote;
        subido: Date;
    };
    recibos: {
        paginas: any;
        datos: any;
        persona: {
            id: string;
            nombre: any;
            proyecto: any;
            asignadoAMano: boolean;
        };
        estado: any;
        error: any;
        enviado: {
            nombre: any;
            codigo: any;
            el: any;
        };
        textoCrudo: any;
    }[];
};
