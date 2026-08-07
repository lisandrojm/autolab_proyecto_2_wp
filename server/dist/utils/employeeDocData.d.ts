/**
 * Nomenclatura de archivos descargados (contratos y releases):
 *   [proyecto]_[Contrato|Release]_[nombreDoc]_[apellido]_[nombres]_[email]_[cuit]_Desde_[fechaAlta][_Hasta_[fechaBaja]]_[extra]
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
 * - `cuit`: token compacto (sin separadores), mismo motivo.
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
