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
     * Campos que son una REFERENCIA a otro documento (ej. Convenios → `sindicatoId`).
     *
     * Aparte de los numéricos porque el modo de fallar es otro: `Number("x")` da NaN y se descarta,
     * pero un ObjectId mal formado hace estallar el `save` con un CastError que llega al cliente como
     * un 500 sin causa. Acá se valida antes y se contesta 400 diciendo cuál es el campo.
     *
     * `null` es un valor que se GUARDA (desvincular), distinto de `undefined` = "no vino en el body,
     * no se toca". Sin esa diferencia no habría forma de sacarle el sindicato a un convenio.
     *
     * NO participan del import de Excel: una planilla trae texto, y resolver ese texto a un documento
     * es exactamente lo que no se puede automatizar sobre este dominio.
     */
    extraRefFields?: Array<{
        key: string;
    }>;
    /**
     * Campos sí/no a persistir en create/update/bulk (ej. Bancos → `activo`).
     *
     * Aparte de los de texto porque el cliente puede mandarlos como `true`, `"true"` o `"false"`, y
     * guardar el string `"false"` lo haría verdadero en cualquier `if`. No participan del import de
     * Excel: una planilla no es donde se decide si algo se ofrece o no.
     */
    extraBooleanFields?: Array<{
        key: string;
    }>;
    /**
     * Qué popular en el listado, para que el front no resuelva las refs con un pedido por fila.
     * Ej. Convenios → `{ path: "sindicatoId", select: "_id name sigla" }`.
     */
    populate?: Array<{
        path: string;
        select: string;
    }>;
    /**
     * Query params por los que se puede filtrar el listado. Lista blanca explícita: pasar `req.query`
     * como filtro dejaría armar consultas arbitrarias sobre la colección.
     *
     * El valor `"null"` (texto) filtra por ausencia — los convenios sin gremio son un subconjunto que
     * se consulta como cualquier otro.
     */
    filtrosPermitidos?: string[];
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
