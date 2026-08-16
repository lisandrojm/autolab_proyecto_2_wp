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
    /**
     * Campos numéricos extra a persistir en create/update (ej. Convenios → `obraSocialDefaultId`).
     *
     * Van aparte de `extraStringFields` porque el cliente los manda como string —el formulario genérico
     * serializa todo a texto— y guardarlos así rompería las comparaciones con `data.id`, que es número.
     * El vacío se guarda como `null` y no como `0`: "sin elegir" no es el RNOS 0.
     *
     * NO participan del import de Excel: estos catálogos se siembran desde el nomenclador de ARCA, que
     * no trae este dato.
     */
    extraNumberFields?: Array<{
        key: string;
    }>;
    /**
     * Encabezado de columna del Excel (plantilla + import) para "ID Externo", por si en este catálogo
     * ese id tiene otro nombre de dominio (ej. Obras Sociales → "RNOS"). Default: "ID Externo (opcional)".
     * Los alias de import siempre incluyen además "ID Externo (opcional)"/"ID Externo"/"externalId"/"Id"/"ID".
     */
    externalIdExcelHeader?: string;
    /** Encabezados adicionales aceptados al importar, más allá de los genéricos y `externalIdExcelHeader`. */
    externalIdExcelAliases?: string[];
    /**
     * Encabezado de la columna "Nombre" en la plantilla, por si en este catálogo el nombre tiene otro
     * nombre de dominio (ej. Convenios → "Actividad"). Default: "Nombre". Al importar se aceptan
     * siempre además "Nombre"/"nombre"/"Name"/"NAME".
     */
    nombreExcelHeader?: string;
    /** Encabezados adicionales aceptados para el nombre al importar. */
    nombreExcelAliases?: string[];
    /**
     * Normaliza `externalId` antes de guardarlo (create/update/import), ej. sacarle los guiones de
     * visualización del RNOS para que `data.id` (usado para vincular con FRAME) siga siendo un número
     * válido. Por defecto no se transforma: el resto de los catálogos no se ve afectado.
     */
    sanitizeExternalId?: (value: string) => string;
}
export declare function createSimpleCatalogRouter(model: Model<any>, config: SimpleCatalogConfig): Router;
