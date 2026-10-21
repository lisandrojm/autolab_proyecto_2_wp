import { Types } from "mongoose";
import { type ILoteRecibosSueldo } from "../models/LoteRecibosSueldo.js";
/**
 * RECIBOS DE SUELDO (Contratación › Recibos de sueldo, 20/10/2026).
 *
 * Se sube la sábana (un PDF con todos los recibos del mes, de a dos páginas por persona). El lote nace
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
/** Crea el lote, guarda la sábana y dispara la lectura en segundo plano. Devuelve el lote «leyendo». */
export declare function procesarSabana(tenantId: Types.ObjectId, subidoPor: string | undefined, nombreArchivo: string, buffer: Buffer, paginasPorRecibo?: number): Promise<ILoteRecibosSueldo>;
/** Asigna a mano la persona de un recibo (y su contrato que rige). */
export declare function asignarPersona(lote: ILoteRecibosSueldo, reciboId: string, userId: string): Promise<void>;
/**
 * Manda los recibos al Outbox de Dropbox, uno por uno, con la nomenclatura «Recibos de sueldo» (tipo
 * interno "Contrato") del contrato que rige. El código del documento queda marcado como recibo de
 * sueldo para que, al volver firmado, el escaneo de carpetas marque el recibo y NO mueva el estado del
 * contrato (ver `estadoDropboxCronService`).
 */
export declare function enviarAFirmar(lote: ILoteRecibosSueldo, reciboIds?: string[]): Promise<{
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
/** Todo lo que se leyó del PDF, para descargar como JSON y revisar qué entendió el lector. */
export declare function exportacionDelLote(lote: ILoteRecibosSueldo): {
    lote: {
        id: string;
        archivo: string;
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
