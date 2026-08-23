import { buscarCategoriaCompatPorLegacyId } from "./categoriaCompat.js";
import { numeroALetras } from "./numeroALetras.js";
import { formatDateAr } from "./releaseFiller.js";
import { normalizarCuit } from "./constanciaPdf.js";
const num = (n) => (n != null && n !== "" && !isNaN(Number(n)) ? Number(n).toLocaleString("es-AR") : "");
/** "YYYY-MM-DD" → "YYYYMMDD" (token compacto, sin separadores). "" si no matchea ese formato. */
const fechaCompacta = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    return m ? `${m[1]}${m[2]}${m[3]}` : "";
};
/**
 * Siglas del catálogo `tipo-documento` (Info) por su `data.id`, para el nombre de archivo.
 * Son las mismas que muestra el catálogo, salvo Pasaporte → PAS (token corto y sin ambigüedad).
 */
const SIGLA_TIPO_DOCUMENTO = {
    1: "DNI",
    2: "CI",
    3: "LE",
    4: "LC",
    5: "PAS",
};
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
export function buildIdentidadTag(user) {
    const cuitCrudo = normalizarCuit(user?.metadata?.cuit);
    // Un CUIT de todos ceros es el placeholder que quedó cargado en la gente sin CUIL argentino
    // (típicamente extranjeros con pasaporte): no identifica a nadie y, si se escribiera, el matching
    // por CUIT de `estadoDropboxCronService.ts` lo tomaría como válido y daría ambiguo entre todos ellos.
    const cuit = /^0+$/.test(cuitCrudo) ? "" : cuitCrudo;
    // Se conservan letras porque los pasaportes son alfanuméricos.
    const documento = String(user?.metadata?.documento ?? "").replace(/[^A-Za-z0-9]/g, "");
    const sigla = SIGLA_TIPO_DOCUMENTO[Number(user?.metadata?.tipoDocumentoId)] || "DOC";
    const partes = [];
    if (cuit)
        partes.push(`CUIL-${cuit}`);
    if (documento)
        partes.push(`${sigla}-${documento}`);
    return partes.join("_");
}
/** Espacios y separadores sueltos dentro de UN campo pasan a "-", para que el "_" quede como único
 *  separador de campos. Así el nombre se puede partir por "_" sin ambigüedad. */
const campo = (v) => String(v ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
export const MARCA_ARROBA = "-ARROBA-";
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
export const emailNomenclatura = (email) => campo(String(email ?? "").replace(/@/g, MARCA_ARROBA));
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
export const MARCA_FIRMA = "Firma: ______________________________";
/**
 * Etiqueta del trámite impositivo para el final del nombre de archivo, para poder distinguir de un
 * vistazo con qué trámite se generó el documento sin abrirlo.
 *
 * Van con "-" adentro porque el "_" es el separador de CAMPOS del nombre (ver `buildDocFileName`).
 * Nadie las parsea: son descriptivas, así que se pueden cambiar sin romper el matching de vuelta
 * desde Dropbox Sign.
 */
export const ETIQUETA_TRAMITE = {
    alta_temprana_afip: "Alta-Temprana-de-ARCA",
    constancia_cuit: "Constancia-de-CUIT",
};
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
export function datosNombreArchivo(opts) {
    const { tipo, user, up, contract, docName, extra } = opts;
    /*
      `proyecto` es el NOMBRE del proyecto ("426_LN+"), no su id externo ("705").
  
      El nombre del archivo usaba el id externo mientras que la grilla, el PDF y todo lo que una
      persona mira usan el nombre. Resultado: el archivo decía "705" y nadie lo reconocía — el dato era
      correcto y aun así inútil, que para un nombre de archivo es lo mismo que estar mal. El id externo
      sigue disponible como `{{proyectoId}}` para quien lo necesite.
    */
    const proyecto = contract?.nombre_proyecto ?? up?.nombre_proyecto ?? "";
    const proyectoId = up?.externalProjectId ?? contract?.proyecto_id ?? "";
    return {
        apellido: campo(user?.lastName),
        nombres: campo(user?.firstName),
        proyecto: campo(proyecto),
        proyectoId: campo(proyectoId),
        tipo: campo(tipo),
        docName: campo(docName),
        // El nombre del TIPO de contrato ("Jornada 2030 SRL", "Eventual Crew My secret"). Es distinto de
        // `docName`, que es la plantilla con la que se generó el documento: dos contratos del mismo tipo
        // pueden salir de plantillas distintas, y dos plantillas iguales servir a tipos distintos.
        contrato: campo(contract?.nombre_contrato),
        // El período va SIEMPRE, con "-" en lo que falte: sin baja significa contrato vigente / sin fin,
        // y sin alta significa dato sin cargar. Omitir el bloque hacía indistinguibles esos dos casos.
        fechaAlta: fechaCompacta(contract?.fecha_alta_contrato) || "-",
        fechaBaja: fechaCompacta(contract?.fecha_baja_contrato) || "-",
        identidad: buildIdentidadTag(user), // ya viene como CUIL-…_DNI-…, con "_" entre bloques
        email: emailNomenclatura(user?.email),
        extra: campo(extra),
    };
}
export function buildDocFileName(opts) {
    const { tipo, user, up, contract, docName, extra } = opts;
    const proyecto = up?.externalProjectId ?? contract?.proyecto_id ?? up?.nombre_proyecto ?? contract?.nombre_proyecto ?? "";
    const apellido = campo(user?.lastName);
    const nombres = campo(user?.firstName);
    const email = emailNomenclatura(user?.email);
    const identidad = buildIdentidadTag(user); // ya viene como CUIL-…_DNI-…, con "_" entre bloques
    const fechaAlta = fechaCompacta(contract?.fecha_alta_contrato);
    const fechaBaja = fechaCompacta(contract?.fecha_baja_contrato);
    // El período va SIEMPRE, con "-" en lo que falte: sin baja significa contrato vigente / sin fin, y
    // sin alta significa dato sin cargar. Omitir el bloque hacía indistinguibles esos dos casos de un
    // contrato con las fechas completas.
    const rango = `Alta_${fechaAlta || "-"}_Baja_${fechaBaja || "-"}`;
    const parts = [apellido, nombres, campo(proyecto), campo(tipo), campo(docName), rango, identidad, email, campo(extra)];
    return parts.filter((p) => p !== "").join("_");
}
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
export function buildEmpresaDocData(empresa) {
    const e = empresa || {};
    const calle = e.domicilioCalle || "";
    const numero = e.domicilioNumero || "";
    const pisoDepto = e.domicilioPisoDepto || "";
    const domicilio = [[calle, numero].filter(Boolean).join(" "), pisoDepto].filter(Boolean).join(", ");
    return {
        // Razón social (varios alias porque las plantillas la nombran de distintas formas)
        empresa: e.razonSocial || "",
        razonSocial: e.razonSocial || "",
        empresaRazonSocial: e.razonSocial || "",
        empresaCuit: e.cuit || "",
        // Domicilio legal
        empresaDomicilio: domicilio,
        empresaDomicilioCalle: calle,
        empresaDomicilioNumero: numero,
        empresaDomicilioPisoDepto: pisoDepto,
        empresaLocalidad: e.localidad || "",
        empresaProvincia: e.provincia || "",
        empresaCodigoPostal: e.codigoPostal || "",
        // Firmante
        empresaFirmanteNombre: e.firmanteNombre || "",
        empresaFirmanteDni: e.firmanteDni || "",
        empresaFirmanteCargo: e.firmanteCargo || "",
        // Representante legal / apoderado
        empresaRepresentanteLegalNombre: e.representanteLegalNombre || "",
        empresaRepresentanteLegalEmail: e.representanteLegalEmail || "",
    };
}
export async function buildEmployeeDocData(user, up, contract, empresa) {
    const meta = user?.metadata || {};
    const c = contract || {};
    const nombre = user?.firstName || "";
    const apellido = user?.lastName || "";
    // Número de categoría SAT (lookup por el id externo guardado en el contrato)
    let catSatNumero = "";
    let catSatNombre = c.nombre_categoria_sat || "";
    if (c.categoria_sat_id != null) {
        try {
            // Resuelve contra el modelo nuevo (Categoria + su grupo) con fallback a la tabla vieja.
            // Buscar directo en `CategoriaSat`, como hacía antes, dejaba los PDFs con el nombre y el
            // número congelados en el estado previo a la migración.
            const cat = await buscarCategoriaCompatPorLegacyId(Number(c.categoria_sat_id));
            if (cat) {
                catSatNumero = String(cat.data?.numeroCategoria ?? cat.data?.id ?? "");
                catSatNombre = catSatNombre || cat.name || cat.data?.nombre || "";
            }
        }
        catch {
            /* sin categoría → queda vacío */
        }
    }
    if (!catSatNumero && c.categoria_sat_id != null)
        catSatNumero = String(c.categoria_sat_id);
    const sueldoJornadaNum = Number(c.sueldo_jornada) || 0;
    const sueldoManoNum = Number(c.sueldo_mano) || 0;
    return {
        // ── Datos personales ──
        nombre,
        apellido,
        nombreCompleto: `${nombre} ${apellido}`.trim(),
        // Línea de firma de la persona, para que Dropbox Sign detecte el campo. Ver `MARCA_FIRMA`.
        firma: MARCA_FIRMA,
        dni: meta.documento || "",
        documento: meta.documento || "",
        cuit: meta.cuit || "",
        email: user?.email || "",
        fechaDeNacimiento: formatDateAr(meta.fechaNac),
        fechaNacimiento: formatDateAr(meta.fechaNac),
        estadoCivil: meta.estadoCivil || "",
        telefono: meta.telefono || "",
        telefono2: meta.telefono2 || "",
        // ── Domicilio ──
        direccion: meta.calle || "",
        calle: meta.calle || "",
        altura: meta.altura || "",
        pisoDepto: meta.pisoDepto || "",
        localidad: meta.localidad || "",
        codigoPostal: meta.codigoPostal || "",
        // ── Datos bancarios ──
        cbu: meta.cbu || "",
        aliasBancario: meta.aliasBancario || "",
        nroDeCuentaBancaria: meta.nroDeCuentaBancaria || "",
        tipoDeCuentaBancaria: meta.tipoDeCuentaBancaria || "",
        // ── Datos del contrato ──
        nombreProyecto: c.nombre_proyecto || up?.nombre_proyecto || "",
        rolFrame: c.nombre_rol_frame || up?.nombre_rol_frame || "",
        nombreRolFrame: c.nombre_rol_frame || up?.nombre_rol_frame || "",
        nombreContrato: c.nombre_contrato || "",
        nombreSede: c.nombre_sede || "",
        sede: c.nombre_sede || "",
        nombreCargo: c.nombre_cargo || "",
        cargo: c.nombre_cargo || "",
        nombreNivel: c.nombre_nivel || "",
        nivel: c.nombre_nivel || "",
        nombreArea: c.nombre_area || "",
        area: c.nombre_area || "",
        nombreTurno: c.nombre_turno || "",
        turno: c.nombre_turno || "",
        fechaAltaContrato: formatDateAr(c.fecha_alta_contrato),
        fechaBajaContrato: formatDateAr(c.fecha_baja_contrato),
        horaInicio: c.hora_inicio || "",
        horaFin: c.hora_fin || "",
        cantidadJornadas: c.cantidad_jornadas_laborales != null ? String(c.cantidad_jornadas_laborales) : "",
        // ── Categoría SAT ──
        catSatNumero,
        categoriaSat: catSatNombre,
        nombreCategoriaSat: catSatNombre,
        // ── Sueldos ──
        SueldoJornada: num(sueldoJornadaNum),
        sueldoJornada: num(sueldoJornadaNum),
        SueldoJornadaLetras: numeroALetras(sueldoJornadaNum),
        sueldoJornadaLetras: numeroALetras(sueldoJornadaNum),
        sueldoMano: num(sueldoManoNum),
        SueldoMano: num(sueldoManoNum),
        sueldoManoLetras: c.sueldo_mano_texto || numeroALetras(sueldoManoNum),
        SueldoManoLetras: c.sueldo_mano_texto || numeroALetras(sueldoManoNum),
        sueldoNeto: num(c.sueldo_neto),
        sueldoBruto: num(c.sueldo_bruto),
        sueldoDiarioNeto: num(c.sueldo_diario_neto),
        // ── Otros ──
        fecha: formatDateAr(new Date()),
        // ── Empresa / Productora (La Empleadora) ──
        ...buildEmpresaDocData(empresa),
    };
}
