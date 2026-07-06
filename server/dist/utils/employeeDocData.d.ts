/**
 * Nomenclatura de archivos descargados (contratos y releases):
 *   [proyecto]_[Contrato|Release]_[nombreDoc]_[YYYY_MM_DD]_[apellido]_[nombres]
 *
 * - `proyecto`: número/ID externo del proyecto (ej. 426).
 * - `nombreDoc`: opcional; para releases es el nombre del release.
 * - fecha: día de la descarga (hoy) en formato YYYY_MM_DD.
 * Devuelve el nombre SIN extensión (el caller agrega `.docx`).
 */
export declare function buildDocFileName(opts: {
    tipo: "Contrato" | "Release";
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
export declare function buildEmployeeDocData(user: any, up: any, contract: any): Promise<Record<string, any>>;
