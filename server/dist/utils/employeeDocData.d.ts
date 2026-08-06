/**
 * Nomenclatura de archivos descargados (contratos y releases):
 *   [proyecto]_[Contrato|Release]_[nombreDoc]_[YYYY_MM_DD]_[apellido]_[nombres]_[cuit]_[fechaAlta]_[fechaBaja]
 *
 * - `proyecto`: número/ID externo del proyecto (ej. 426).
 * - `nombreDoc`: opcional; para releases es el nombre del release.
 * - fecha: día de la descarga (hoy) en formato YYYY_MM_DD.
 * - cuit/fechaAlta/fechaBaja: tokens compactos (sin separadores) para que
 *   `estadoDropboxCronService.ts` pueda identificar el contrato sin ambigüedad cuando este archivo
 *   vuelve a Dropbox (p. ej. tras pasar por Dropbox Sign, que preserva el nombre de archivo).
 * Devuelve el nombre SIN extensión (el caller agrega `.docx`).
 */
export declare function buildDocFileName(opts: {
    tipo: "Contrato" | "Release" | "ConstanciaCUIT";
    user: any;
    up: any;
    contract: any;
    docName?: string;
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
