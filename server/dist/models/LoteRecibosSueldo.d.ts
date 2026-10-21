import { Document, Model, Types } from "mongoose";
/**
 * UN LOTE DE RECIBOS DE SUELDO: la sábana PDF que se subió, partida en un recibo por persona (módulo
 * Contratación › Recibos de sueldo, 20/10/2026).
 *
 * Cada recibo guarda sus páginas como PDF propio en `storage/<tenant>/recibos-sueldo/<lote>/`, lo que se
 * leyó del texto (`datos`), el texto crudo entero (para verlo y exportarlo cuando algo no cierra) y a
 * quién se asoció: la persona por su CUIL y su contrato que rige, que es lo que la nomenclatura y el
 * circuito de firma necesitan. El circuito es el de los contratos: el PDF va al Outbox de Dropbox con
 * la nomenclatura «Recibos de sueldo» y se reconoce al volver por su código («ID-000123»).
 *
 * `textoCrudo` puede pesar (unos KB por página): los listados lo excluyen con `select`.
 */
export type EstadoRecibo = "sin_persona" | "listo" | "enviando" | "enviado" | "firmado" | "error";
export interface IReciboDelLote {
    _id: Types.ObjectId;
    /** Páginas de la sábana (base 1) que forman este recibo. */
    paginas: number[];
    datos: {
        cuil: string;
        empleadorCuit: string;
        nombre: string;
        periodo: string;
        legajo: string;
        neto: string;
        cuitsEncontrados: string[];
        /** Lo que sigue sólo sale del TXT de MEMOSOFT (`utils/reciboTxtMemosoft.ts`); con OCR queda vacío. */
        empresa?: string;
        basico?: string;
        ingreso?: string;
        antiguedad?: string;
        sector?: string;
        modalidad?: string;
        categoria?: string;
        tarea?: string;
        periodoTexto?: string;
        periodoDeposito?: string;
        fechaDeposito?: string;
        bancoDeposito?: string;
        costoTotal?: string;
        contribucionesEmpleador?: string;
        sueldoBruto?: string;
        remunerativo?: string;
        noRemunerativo?: string;
        descuentos?: string;
        sueldoNeto?: string;
        otros?: string;
        formaPago?: string;
        fechaPago?: string;
        numeroRecibo?: string;
        conceptos?: Array<{
            codigo: string;
            concepto: string;
            unidad: string;
            monto: string;
            seccion: string;
        }>;
    };
    textoCrudo: string;
    /** `/storage/<tenant>/recibos-sueldo/<lote>/<n>.pdf` */
    archivoUrl: string;
    userId?: Types.ObjectId | null;
    userProjectId?: Types.ObjectId | null;
    projectId?: Types.ObjectId | null;
    contractIndex?: number | null;
    /** Para mostrar sin volver a buscar. */
    nombreUsuario?: string;
    nombreProyecto?: string;
    /** Si la persona se eligió a mano (el CUIL no se leyó o no coincidía). */
    asignadoAMano?: boolean;
    /** Si se asoció por apellido y nombre porque el OCR no leyó el CUIL: para revisar antes de enviar. */
    asociadoPorNombre?: boolean;
    estado: EstadoRecibo;
    enviadoEl?: Date | null;
    firmadoEl?: Date | null;
    /** El nombre con el que salió al Outbox, y su código. */
    nombreEnviado?: string;
    codigo?: string;
    error?: string;
}
export type EstadoLote = "leyendo" | "listo" | "error";
export interface ILoteRecibosSueldo extends Document {
    tenantId: Types.ObjectId;
    nombreArchivo: string;
    subidoPor?: Types.ObjectId | null;
    /** La sábana original, por si hay que volver a leerla: `/storage/<tenant>/recibos-sueldo/<lote>/sabana.pdf`. */
    sabanaUrl: string;
    /**
     * La lectura corre en segundo plano (OCR: ~1 s por página): el lote nace «leyendo», con el avance en
     * `progreso`, y pasa a «listo» con sus recibos, o a «error» con el motivo.
     */
    estadoLote: EstadoLote;
    progreso: {
        leidas: number;
        total: number;
    };
    error?: string;
    paginas: number;
    paginasPorRecibo: number;
    /**
     * De dónde salen los datos: «txt» si se subió el TXT que MEMOSOFT exporta con la sábana (el bloque N
     * del TXT es la página N del PDF; sin OCR), «ocr» si sólo vino el PDF.
     */
    fuente: "ocr" | "txt";
    nombreTxt?: string;
    txtUrl?: string;
    /** El período que más se repite entre los recibos leídos ("YYYY-MM"), o "". */
    periodo: string;
    /** El último envío a firmar, que corre en segundo plano: su avance, para mostrarlo en la pantalla. */
    envio?: {
        estado: "enviando" | "listo" | "error";
        total: number;
        hechos: number;
        fallidos: number;
        iniciadoEl: Date;
        ultimoAvance: Date;
        terminadoEl?: Date | null;
        porNombre?: string;
        error?: string;
    } | null;
    recibos: Types.DocumentArray<IReciboDelLote & Types.Subdocument>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const LoteRecibosSueldo: Model<ILoteRecibosSueldo>;
