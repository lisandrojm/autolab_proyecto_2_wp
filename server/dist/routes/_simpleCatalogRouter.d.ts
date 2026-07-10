import { Router } from "express";
import { Model } from "mongoose";
/**
 * Factory de router CRUD para catálogos simples de FRAME con forma
 * `{ externalId, name, data: { id, nombre } }` (Bancos, Obras Sociales,
 * Centros de Costos, etc). Mismo patrón global que Categorías SAT:
 * sin tenantId, solo `authenticateToken`, con plantilla + import Excel.
 */
export interface SimpleCatalogConfig {
    /** Etiqueta singular para mensajes de error, ej. "Banco". */
    entityLabel: string;
    /** Nombre de la hoja del Excel, ej. "Bancos". */
    sheetName: string;
    /** Nombre del archivo de plantilla, ej. "plantilla_bancos.xlsx". */
    templateFilename: string;
    /** Ejemplos para la plantilla (solo nombres). */
    sampleNames?: string[];
    /**
     * Campos string extra (además de name/externalId) a persistir en create/update/import.
     * Solo lo usan los catálogos que lo requieren (ej. Bancos → tipoEntidad); el resto no se ve afectado.
     */
    extraStringFields?: Array<{
        key: string;
        excelHeader?: string;
        aliases?: string[];
    }>;
}
export declare function createSimpleCatalogRouter(model: Model<any>, config: SimpleCatalogConfig): Router;
