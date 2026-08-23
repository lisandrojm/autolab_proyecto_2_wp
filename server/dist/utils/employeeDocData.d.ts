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
 * Cómo viaja el "@" del email dentro del nombre de archivo.
 *
 * No puede ir literal: Dropbox Sign no lo admite en el título de la solicitud de firma y lo
 * transforma por su cuenta, y ese título es lo que después se lee del asunto del aviso.
 *
 * Iba como "-", y eso lo volvía irreconstruible: el guion es legal a los dos lados del "@". Sobre el
 * padrón real son 6 de 1.566 direcciones las que quedan ambiguas —`ivonne.nino@into-films.com` e
 * `ivonne.nino-into@films.com` colapsan al mismo texto—, y el modo de falla es mandarle el contrato
 * a la dirección equivocada.
 *
 * Va en MAYÚSCULA a propósito: `campo()` no toca las mayúsculas, así que la marca nunca se confunde
 * con un "arroba" escrito en minúscula dentro de la propia dirección.
 */
export declare const MARCA_ARROBA = "-ARROBA-";
/**
 * El email tal como entra al nombre del archivo.
 *
 * Es una función única porque el reemplazo estaba copiado en tres lugares —los dos caminos de este
 * archivo y el de Pedidos/Vacaciones en `pdfGenerator`—, y tres copias de la misma regla es cuestión
 * de tiempo hasta que una quede atrás.
 *
 * Ojo con `campo()`, que colapsa los guiones repetidos: un email terminado en "-" antes del "@"
 * (`juan-@gmail.com`) queda `juan-ARROBA-gmail.com` y pierde ese guion. Es el único caso en que la
 * vuelta no es exacta, y no existe en el padrón de hoy.
 */
export declare const emailNomenclatura: (email: unknown) => string;
/**
 * La línea de firma que se imprime en el documento, donde va `{{firma}}`.
 *
 * Es una LÍNEA DE FIRMA CLÁSICA y no un placeholder entre corchetes, y la diferencia es funcional:
 * la detección automática de campos de Dropbox Sign está entrenada con documentos reales, donde una
 * firma se ve así. Un `[FIRMA: Juan Pérez]` le parece texto del cuerpo y no propone ningún campo —
 * que es exactamente lo contrario de para lo que existe esto.
 *
 * Es la firma de la PERSONA. La de la empresa no lleva línea porque no se firma acá: viene estampada
 * en el membrete (Plantillas → Empresa/s | Membrete/s y firma).
 *
 * NO lleva el nombre. Lo llevaba, para que quien arma la solicitud supiera a quién asignar el campo;
 * como en el documento hay UNA sola línea de firma, no había a quién confundir, y el nombre rompía
 * el patrón que el detector reconoce.
 *
 * Los guiones bajos son 30: alcanzan para que se lea como una línea y entran en el ancho de página
 * sin cortarse.
 */
export declare const MARCA_FIRMA = "Firma: ______________________________";
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
 *      EMAIL-juanmanuel.gonzalezrotstein-ARROBA-gmail.com_Constancia-de-Cuit`
 *
 * Decisiones y por qué:
 *
 * - La PERSONA va primera: es el dato por el que se busca al mirar una carpeta de Dropbox.
 * - El "_" es el ÚNICO separador de campos; los espacios internos de cada campo van como "-"
 *   (ver `campo()`). Antes convivían los dos, y el nombre en disco (que reemplazaba espacios) no
 *   coincidía con el nombre lógico guardado en la base.
 * - `Alta`/`Baja` van SIEMPRE, aunque el contrato no tenga baja: en ese caso la baja es "-". Omitir
 *   el bloque hacía ambiguo si el contrato era por tiempo indeterminado o si faltaba cargar el dato.
 * - El "@" del email va como "-ARROBA-": Dropbox Sign no lo admite en el título de la solicitud de
 *   firma, y ese título es lo que después se lee del asunto del aviso. Ver `emailNomenclatura`.
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
/**
 * Los datos crudos del nombre, sin decidir todavía en qué orden van.
 *
 * Separado de `buildDocFileName` porque ahora hay DOS consumidores: el nombre por defecto (abajo) y
 * el patrón configurable del ABM de Nomenclatura, que arma el mismo nombre en otro orden. Los dos
 * tienen que partir de los mismos valores ya normalizados o el `{{apellido}}` del ABM y el de acá
 * darían resultados distintos para la misma persona.
 */
export declare function datosNombreArchivo(opts: {
    tipo: string;
    user: any;
    up: any;
    contract: any;
    docName?: string;
    extra?: string;
}): Record<string, string>;
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
