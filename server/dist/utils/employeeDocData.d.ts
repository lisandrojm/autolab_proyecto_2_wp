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
 * Etiqueta del trámite impositivo para el final del nombre de archivo, para poder distinguir de un
 * vistazo con qué trámite se generó el documento sin abrirlo.
 *
 * Van con "-" adentro porque el "_" es el separador de CAMPOS del nombre (ver `buildDocFileName`).
 * Nadie las parsea: son descriptivas, así que se pueden cambiar sin romper el matching de vuelta
 * desde Dropbox Sign.
 */
export declare const ETIQUETA_TRAMITE: Record<"alta_temprana_afip" | "constancia_cuit", string>;
/**
 * Nomenclatura de archivos generados por la plataforma (contratos, releases, altas, constancias).
 * Se lee de izquierda a derecha como una frase: QUIÉN · DÓNDE · QUÉ · CUÁNDO · IDENTIFICADORES.
 *
 *   [apellido]_[nombres]_[proyecto]_[Contrato|Release|…]_[nombreDoc]_Alta_[YYYYMMDD]_Baja_[YYYYMMDD|-]_
 *   [CUIL-…]_[DNI-…]_[email]_[extra]
 *
 * ej. `gonzalez-rotstein_juan-manuel_748_Contrato_Alta_20260810_Baja_-_CUIL-20331501027_DNI-33150102_
 *      juanmanuel.gonzalezrotstein-gmail.com_Constancia-de-Cuit`
 *
 * Decisiones y por qué:
 *
 * - La PERSONA va primera: es el dato por el que se busca al mirar una carpeta de Dropbox.
 * - El "_" es el ÚNICO separador de campos; los espacios internos de cada campo van como "-"
 *   (ver `campo()`). Antes convivían los dos, y el nombre en disco (que reemplazaba espacios) no
 *   coincidía con el nombre lógico guardado en la base.
 * - `Alta`/`Baja` van SIEMPRE, aunque el contrato no tenga baja: en ese caso la baja es "-". Omitir
 *   el bloque hacía ambiguo si el contrato era por tiempo indeterminado o si faltaba cargar el dato.
 * - El "@" del email va como "-": Dropbox Sign no lo admite en el título de la solicitud de firma, y
 *   ese título es lo que después se lee del asunto del aviso para detectar el envío.
 * - `identidad`: bloque `CUIL-...[_DNI-...]` de `buildIdentidadTag()`, común a los PDF de Pedidos y
 *   Vacaciones.
 *
 * ⚠ El nombre se PARSEA de vuelta cuando el archivo regresa de Dropbox Sign. No cambiar sin mirar:
 *   - `dropboxSignMailService.extraerIdentidadDeArchivo()` → /_CUIL-(\d{11})/ y /_(DNI|CI|…)-(\w+)/,
 *     que exigen el "_" delante justamente porque los campos ya no llevan espacios (un apellido
 *     "LE ROY" quedaría como "LE-ROY" y sin el "_" se leería como tipo LE + número ROY).
 *   - `estadoDropboxCronService.extraerFechasDeNombre()` → tokens de 8 dígitos aislados: por eso las
 *     fechas van compactas `YYYYMMDD`, sin separadores internos.
 *
 * Devuelve el nombre SIN extensión (el caller agrega la extensión correspondiente).
 */
export declare function buildDocFileName(opts: {
    tipo: "Contrato" | "Release" | "ConstanciaCUIT" | "AltaAFIP" | "Documentacion";
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
