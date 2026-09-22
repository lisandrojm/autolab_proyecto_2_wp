import { buscarCategoriaCompatPorLegacyId } from "./categoriaCompat.js";
import { numeroALetras } from "./numeroALetras.js";
import { formatDateAr } from "./releaseFiller.js";
import { normalizarCuit } from "./constanciaPdf.js";
import { Project } from "../models/Project.js";
import { Client } from "../models/Client.js";

const num = (n: any): string => (n != null && n !== "" && !isNaN(Number(n)) ? Number(n).toLocaleString("es-AR") : "");

/** "YYYY-MM-DD" → "YYYYMMDD" (token compacto, sin separadores). "" si no matchea ese formato. */
const fechaCompacta = (s?: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
};

/**
 * Siglas del catálogo `tipo-documento` (Info) por su `data.id`, para el nombre de archivo.
 * Son las mismas que muestra el catálogo, salvo Pasaporte → PAS (token corto y sin ambigüedad).
 */
const SIGLA_TIPO_DOCUMENTO: Record<number, string> = {
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
 * Devuelve UNA sola cosa: el CUIL pelado si lo hay, y si no el documento con su sigla.
 *
 *   `23232274409`        con CUIL
 *   `PAS-AAE1450C7`      sin CUIL (39 personas del padrón, 31 de ellas con contratos)
 *
 * Los números van sin puntos ni guiones internos, para que sean tokens aislados y parseables:
 *   /(?<!\d)(\d{2}-?\d{8}-?\d)(?!\d)/        → el CUIL, por el respaldo de extraerIdentidadDeArchivo
 *   /(DNI|CI|LE|LC|PAS|DOC)-([A-Za-z0-9]+)/  → tipo y número de documento
 *
 * `DOC` es el fallback cuando hay número pero no está cargado el tipo.
 */
export function buildIdentidadTag(user: any): string {
  const cuitCrudo = normalizarCuit(user?.metadata?.cuit);
  // Un CUIT de todos ceros es el placeholder que quedó cargado en la gente sin CUIL argentino
  // (típicamente extranjeros con pasaporte): no identifica a nadie y, si se escribiera, el matching
  // por CUIT de `estadoDropboxCronService.ts` lo tomaría como válido y daría ambiguo entre todos ellos.
  const cuit = /^0+$/.test(cuitCrudo) ? "" : cuitCrudo;
  // Se conservan letras porque los pasaportes son alfanuméricos.
  const documento = String(user?.metadata?.documento ?? "").replace(/[^A-Za-z0-9]/g, "");
  const sigla = SIGLA_TIPO_DOCUMENTO[Number(user?.metadata?.tipoDocumentoId)] || "DOC";

  /*
   * DOS decisiones acá, las dos para ganar caracteres contra el tope de 255.
   *
   * 1. Con CUIL va el CUIL SOLO. Iban los dos y era el mismo número dos veces: el CUIL argentino
   *    contiene al DNI (20-33150102-7). Como desempate tampoco servía — `buscarEnOutbox` filtra
   *    primero por CUIL, y si una persona tiene dos archivos en Outbox los dos llevan su mismo
   *    documento—. El documento SÍ queda cuando NO hay CUIL: son 39 personas del padrón, 31 con
   *    contratos, y sacárselo las dejaría sin ningún identificador en el nombre.
   *
   * 2. El CUIL va PELADO, sin el rótulo `CUIL-`. Un número de once dígitos al principio del nombre
   *    no es otra cosa. Sacarlo mueve la identificación del camino etiquetado al RESPALDO de
   *    `extraerIdentidadDeArchivo`, que toma el primer token de once dígitos aislado. Funciona
   *    porque `validarPatron` no deja poner `{{empresaCuit}}` antes que `{{cuit}}`, y porque ningún
   *    otro campo del nombre trae once dígitos seguidos — verificado sobre el padrón: 0 proyectos,
   *    0 tipos de contrato, 0 plantillas, 0 apellidos y 0 emails.
   *
   *    Si algún día un proyecto o un apellido llegara a tener once dígitos seguidos ANTES del CUIL,
   *    ese número se leería como la persona. Es el precio de sacar el rótulo, y por eso está escrito.
   *
   * El DOCUMENTO conserva su sigla: ahí el rótulo NO es redundante —`DNI-43092696` contra
   * `PAS-AAE1450C7`— y `extraerIdentidadDeArchivo` lo busca justamente por esa sigla.
   */
  if (cuit) return cuit;
  return documento ? `${sigla}-${documento}` : "";
}

/** Espacios y separadores sueltos dentro de UN campo pasan a "-", para que el "_" quede como único
 *  separador de campos. Así el nombre se puede partir por "_" sin ambigüedad. */
const campo = (v: unknown): string =>
  String(v ?? "")
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
export const emailNomenclatura = (email: unknown): string => campo(String(email ?? "").replace(/@/g, MARCA_ARROBA));

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
export const ETIQUETA_TRAMITE: Record<"alta_temprana_afip" | "constancia_cuit", string> = {
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
 * ej. `gonzalez-rotstein_juan-manuel_748_Contrato_Alta_20260810_Baja_-_20331501027_
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
export function datosNombreArchivo(opts: { tipo: string; user: any; up: any; contract: any; docName?: string; extra?: string }): Record<string, string> {
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
    // La variable se llama `{{cuit}}` en el patrón. Sale de `buildIdentidadTag`: el CUIL, o el
    // documento cuando la persona no tiene CUIL cargado.
    cuit: buildIdentidadTag(user),
    email: emailNomenclatura(user?.email),
    extra: campo(extra),
  };
}

export function buildDocFileName(opts: { tipo: "Contrato" | "Release" | "ConstanciaCUIT" | "AltaAFIP" | "Documentacion"; user: any; up: any; contract: any; docName?: string; extra?: string }): string {
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
export function buildEmpresaDocData(empresa: any): Record<string, any> {
  const e: any = empresa || {};
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
    empresaFirmanteEmail: e.firmanteEmail || "",
    // Representante legal / apoderado
    empresaRepresentanteLegalNombre: e.representanteLegalNombre || "",
    empresaRepresentanteLegalEmail: e.representanteLegalEmail || "",
  };
}

export async function buildEmployeeDocData(user: any, up: any, contract: any, empresa?: any): Promise<Record<string, any>> {
  const meta: any = user?.metadata || {};
  const c: any = contract || {};
  const nombre = user?.firstName || "";
  const apellido = user?.lastName || "";

  /*
    El cliente del proyecto. Si no resuelve queda en "", nunca en el nombre del proyecto: un título
    equivocado se lee como correcto, y uno vacío se ve.
  */
  let nombreCliente = "";
  try {
    if (up?.projectId) {
      const proyecto: any = await Project.findById(up.projectId).select("clientId").lean();
      if (proyecto?.clientId) {
        const cliente: any = await Client.findById(proyecto.clientId).select("name").lean();
        nombreCliente = String(cliente?.name || "");
      }
    }
  } catch {
    /* Un proyecto borrado o un cliente que ya no está no pueden tumbar la generación del PDF. */
  }

  // Número de categoría SAT (lookup por el id externo guardado en el contrato)
  let catSatNumero = "";
  let catSatNombre = c.nombre_categoria_sat || "";
  /*
    El CONVENIO y el CÓDIGO DE ARCA salen del catálogo, no del contrato: el contrato guarda el id y
    el nombre de la categoría, y el encuadre no se puede explicar sin decir de qué convenio es ni con
    qué código se declaró.
  */
  let catSatConvenio = "";
  let catSatCodigoArca = "";
  if (c.categoria_sat_id != null) {
    try {
      // Resuelve contra el modelo nuevo (Categoria + su grupo) con fallback a la tabla vieja.
      // Buscar directo en `CategoriaSat`, como hacía antes, dejaba los PDFs con el nombre y el
      // número congelados en el estado previo a la migración.
      const cat = await buscarCategoriaCompatPorLegacyId(Number(c.categoria_sat_id));
      if (cat) {
        catSatNumero = String((cat as any).data?.numeroCategoria ?? (cat as any).data?.id ?? "");
        catSatNombre = catSatNombre || (cat as any).name || (cat as any).data?.nombre || "";
        catSatConvenio = String((cat as any).data?.convenio || "").trim();
        catSatCodigoArca = String((cat as any).data?.codigoArca || "").trim();
      }
    } catch {
      /* sin categoría → queda vacío */
    }
  }
  if (!catSatNumero && c.categoria_sat_id != null) catSatNumero = String(c.categoria_sat_id);

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
    /*
      EL CLIENTE Y EL PROYECTO NO SON LO MISMO, y confundirlos titula el contrato con la película.

      `nombreProyecto` es la OBRA —«Surrender», «My secret lover is his brother»— y ya se usa 5 a 8
      veces dentro de cada plantilla: «{{nombreProyecto}} (“Picture”)». `nombreCliente` es para quién
      se hace: REELSHORT. El título del documento —«PROJECT REELSHORT»— es el cliente.

      Sale del proyecto porque el contrato no lo guarda: `UserProject.projectId → Project.clientId →
      Client.name`. Se resuelve acá y no en cada llamador para que el PDF de contrato, el de release y
      la vista previa vean el mismo valor.
    */
    nombreCliente,
    nombreProyecto: c.nombre_proyecto || up?.nombre_proyecto || "",
    rolFrame: c.nombre_rol_frame || up?.nombre_rol_frame || "",
    nombreRolFrame: c.nombre_rol_frame || up?.nombre_rol_frame || "",
    nombreContrato: c.nombre_contrato || "",
    nombreSede: c.nombre_sede || "",
    sede: c.nombre_sede || "",
    /*
      Cargos y Niveles se sacaron de la aplicación: no hay ABM, ni campo en el contrato, ni colección.

      Estas cuatro variables SIGUEN declaradas a propósito. Hay 11 plantillas de contrato vivas que
      escriben `{{nombreCargo}}` y `{{nombreNivel}}` en medio de la prosa ("...en el rol de {{rolFrame}}
      (cargo: {{nombreCargo}}, área: {{nombreArea}})..."). Si la variable no existe, el renderer deja el
      `{{nombreCargo}}` literal impreso en un contrato que alguien firma — bastante peor que el vacío.

      Vacío es exactamente lo que ya imprimían: de 6780 contratos guardados, 6749 no tenían el campo y
      31 decían literalmente "Sin cargo" / "Sin nivel". Sacar esto de verdad es editar el texto de esas
      11 plantillas, que es una decisión de contenido, no de código.
    */
    nombreCargo: "",
    cargo: "",
    nombreNivel: "",
    nivel: "",
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
    convenio: catSatConvenio,
    codigoArca: catSatCodigoArca,

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
