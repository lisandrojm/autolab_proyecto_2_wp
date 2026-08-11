/**
 * Bloque identificador de la persona para el NOMBRE de archivo de cualquier PDF que genere la
 * plataforma (Firma Digital, Pedidos y Vacaciones). Es idéntico en los tres flujos, así que alcanza
 * con el nombre del archivo —lo único que viaja en el aviso de Dropbox Sign y lo que se ve al listar
 * una carpeta— para saber de quién es un documento sin abrirlo.
 *
 *   `CUIL-{11 dígitos}_{DNI|CI|LE|LC|PAS|DOC}-{número}`   ej. `CUIL-23232274409_DNI-23232274`
 *
 * Los números van sin puntos ni guiones internos, para que sean tokens aislados y parseables:
 *   /CUIL-(\d{11})/            → CUIL/CUIT
 *   /(DNI|CI|LE|LC|PAS|DOC)-([A-Za-z0-9]+)/  → tipo y número de documento
 *
 * Cada parte se omite si el dato no está cargado (nunca se escribe una etiqueta con valor vacío).
 * `DOC` es el fallback cuando hay número pero no está cargado el tipo.
 */
export declare function buildIdentidadTag(user: any): string;
/**
 * Nomenclatura de archivos descargados (contratos y releases):
 *   [proyecto]_[Contrato|Release]_[nombreDoc]_[apellido]_[nombres]_[email]_[identidad]_Desde_[fechaAlta][_Hasta_[fechaBaja]]_[extra]
 *
 * - `proyecto`: número/ID externo del proyecto (ej. 426).
 * - `nombreDoc`: opcional; para releases es el nombre del release.
 * - `email`: el de la persona, para identificarla sin ambigüedad de un vistazo (dos personas pueden
 *   compartir apellido y nombre).
 * - `extra`: opcional; texto libre adicional (p. ej. "Constancia de Cuit" para identificar el trámite
 *   de origen en Firma Digital).
 * - `Desde`/`Hasta`: fecha de alta/baja del contrato, para que se entienda de un vistazo el período —
 *   se omite "Hasta" si el contrato no tiene fecha de baja. Los valores en sí son tokens compactos
 *   `YYYYMMDD` (sin separadores): `estadoDropboxCronService.ts` los usa como desempate cuando el CUIT
 *   solo no alcanza para identificar el contrato al ver volver este archivo desde Dropbox Sign (que
 *   preserva el nombre) — cambiar ese formato rompería ese matching, por eso NO se usan separadores
 *   dentro de la fecha aunque sí alrededor (mantiene el token de 8 dígitos aislado y detectable).
 * - `identidad`: bloque `CUIL-...[_DNI-...]` de `buildIdentidadTag()`, común a los PDF de Pedidos y
 *   Vacaciones. El CUIT sigue siendo un token de 11 dígitos aislado, así que el matching por CUIT de
 *   `estadoDropboxCronService.ts` sigue funcionando igual que cuando iba suelto.
 * Devuelve el nombre SIN extensión (el caller agrega la extensión correspondiente).
 */
export declare function buildDocFileName(opts: {
    tipo: "Contrato" | "Release" | "ConstanciaCUIT" | "AltaAFIP";
    user: any;
    up: any;
    contract: any;
    docName?: string;
    extra?: string;
}): string;
/**
 * Construye el mapa de variables para rellenar plantillas .docx (contratos y releases)
 * a partir del empleado, su UserProject en el proyecto y el contrato seleccionado.
 *
 * Provee múltiples alias (camelCase y nombres usados en las plantillas) para máxima cobertura.
 * Las variables que no estén acá quedan visibles como {variable} (ver nullGetter en releaseFiller).
 */
/**
 * Variables de la Empresa/Productora ("La Empleadora") para las plantillas.
 * Se toman del ABM de Empresas (colección companies), seteada por empresa en el proyecto
 * (contratoEmpresas / releaseEmpresas) y tagueada en cada contrato/release.
 * Van con prefijo `empresa*` para no chocar con los datos personales del empleado
 * (que ya usan cuit, localidad, codigoPostal).
 */
export declare function buildEmpresaDocData(empresa: any): Record<string, any>;
export declare function buildEmployeeDocData(user: any, up: any, contract: any, empresa?: any): Promise<Record<string, any>>;
