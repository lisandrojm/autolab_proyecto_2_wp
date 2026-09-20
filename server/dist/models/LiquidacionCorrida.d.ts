import { Document, Types, Model } from "mongoose";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNA CORRIDA DE LIQUIDACIÓN: lo que se calculó, cuándo y con qué reglas
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * RELIQUIDAR NO PISA: crea una corrida nueva. Las viejas quedan enteras, con sus números y sus
 * excepciones. Es lo que permite contestar "¿qué mandamos el mes pasado?" sin depender de que
 * alguien haya guardado el archivo, y comparar dos corridas del mismo período para ver qué cambió.
 *
 * GUARDA LAS LÍNEAS, NO SÓLO EL RESUMEN. Y cada línea guarda de qué eventos salió. Un archivo que
 * se puede regenerar pero no explicar es un archivo en el que hay que confiar a ciegas.
 */
export interface ILineaCorrida {
    empresaId?: Types.ObjectId | null;
    empresaNombre?: string | null;
    ccCodigo?: string | null;
    ccNombre?: string | null;
    regimen?: string | null;
    legajo?: string | null;
    apellidoYNombre: string;
    userId?: Types.ObjectId | null;
    conceptoCodigo: string;
    conceptoDescripcion?: string | null;
    par1: number;
    par2: number;
    /** En qué hoja del XLSX va. Ver `hojaDe` en `services/liquidacion/agregar.ts`. */
    hoja: string;
    /** Los eventos que componen el número. La trazabilidad, no un extra. */
    eventIds: string[];
    dias: number;
    origenes: string[];
}
export interface IExcepcionCorrida {
    motivo: string;
    userId?: Types.ObjectId | null;
    apellidoYNombre?: string | null;
    fecha?: string | null;
    eventoId?: string | null;
    detalle: string;
    /** Si impide descargar el archivo de importación o sólo avisa. */
    bloqueante: boolean;
}
export interface ILiquidacionCorrida extends Document {
    tenantId: Types.ObjectId;
    periodo: string;
    filtros: Record<string, unknown>;
    /**
     * CON QUÉ VERSIÓN DEL MAPEO se calculó: la fecha contra la que se evaluó la vigencia de los
     * efectos. Sin esto, dos corridas del mismo período con números distintos son un misterio.
     */
    versionMapeo: string;
    createdBy: Types.ObjectId;
    lineas: ILineaCorrida[];
    excepciones: IExcepcionCorrida[];
    resumen: {
        partes: number;
        eventos: number;
        lineas: number;
        personas: number;
        hojas: number;
        excepciones: number;
        bloqueantes: number;
    };
    /** Huella de las líneas: dos corridas con el mismo hash generan el mismo archivo. */
    hashLineas: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const LiquidacionCorrida: Model<ILiquidacionCorrida>;
