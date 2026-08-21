/**
 * Nomenclatura de los archivos que genera la plataforma.
 *
 * Un patrón con `{{variables}}` por tipo de documento, configurable por tenant. Misma idea que las
 * Plantillas de PDF —lista de variables por tipo, se insertan con un click— pero para el NOMBRE del
 * archivo en vez de su contenido.
 *
 * ⚠ POR QUÉ ESTO NO ES COSMÉTICO
 *
 * El nombre se PARSEA DE VUELTA. Cuando un documento firmado regresa de Dropbox Sign, dos servicios
 * lo leen para saber a quién pertenece:
 *
 *   - `dropboxSignMailService.extraerIdentidadDeArchivo()` → `_CUIL-\d{11}` y `_(DNI|CI|…)-\w+`
 *   - `estadoDropboxCronService.extraerFechasDeNombre()`   → tokens sueltos de 8 dígitos (YYYYMMDD)
 *
 * Un patrón sin esos bloques hace que los documentos vuelvan de la firma y **no se puedan asociar a
 * ninguna persona**. Y falla en silencio: el archivo se genera igual, se firma igual, y recién se
 * descubre cuando alguien busca un contrato que "se perdió".
 *
 * Por eso `validarPatron()` NO deja guardar un patrón al que le falten esos bloques en los tipos que
 * viajan a la firma. Es la única validación de este archivo que no se puede relajar.
 */

/** Los tipos de documento que la plataforma nombra. El orden es el que se muestra en el ABM. */
export const TIPOS_NOMENCLATURA = ["Contrato", "Release", "AltaAFIP", "ConstanciaCUIT", "Documentacion", "Pedido", "Vacacion"] as const;
export type TipoNomenclatura = (typeof TIPOS_NOMENCLATURA)[number];

/**
 * TODOS los tipos tienen que poder leerse de vuelta. Sin excepción.
 *
 * Al principio esto se acotó a "los que van a Dropbox Sign", y estaba mal por los dos lados:
 *
 *  - Pedidos y Vacaciones TAMBIÉN se firman y vuelven;
 *  - la Constancia de CUIT no se firma, pero igual hay que poder levantarla de Dropbox y saber de
 *    quién es — el archivo llega a la carpeta y lo único que lo identifica es su nombre.
 *
 * O sea que la regla no era "se firma", era "el archivo vuelve a entrar al sistema por su nombre", y
 * eso vale para los siete. Lo que cambia entre tipos no es SI hay datos obligatorios, sino CUÁLES:
 * un documento de contrato se ancla con las fechas del período, y un pedido con su número.
 */
export const TIPOS_NOMBRE_SE_LEE_DE_VUELTA: TipoNomenclatura[] = [...TIPOS_NOMENCLATURA];

export interface VariableNomenclatura {
  variable: string;
  descripcion: string;
  /** Sin esta variable el archivo no se puede reencontrar: el ABM no deja guardar sin ella. */
  requerida?: boolean;
  /**
   * De qué habla la variable. El editor las agrupa por esto, igual que el de Plantillas de Contrato.
   *
   * Doce chips en una sola bolsa se leen como una lista de códigos; agrupados por de dónde sale cada
   * dato —la persona, el período, la empleadora— se leen como las partes de un nombre.
   */
  grupo: string;
}

const G = {
  proyecto: "Proyecto",
  persona: "Persona",
  documento: "Documento",
  periodo: "Período del contrato",
  identificacion: "Identificación",
  empresa: "Empleadora (se toma del contrato)",
  otros: "Otros",
};

const V = {
  proyecto: { variable: "{{proyecto}}", descripcion: "Id externo del proyecto (ej. 748)", grupo: G.proyecto },
  apellido: { variable: "{{apellido}}", descripcion: "Apellido de la persona", grupo: G.persona },
  nombres: { variable: "{{nombres}}", descripcion: "Nombres de la persona", grupo: G.persona },
  email: { variable: "{{email}}", descripcion: "Email (el @ va como «-»)", grupo: G.persona },
  identidad: { variable: "{{identidad}}", descripcion: "Bloque CUIL-…_DNI-… de la persona", grupo: G.identificacion },
  tipo: { variable: "{{tipo}}", descripcion: "Tipo de documento (Contrato, Release…)", grupo: G.documento },
  contrato: { variable: "{{contrato}}", descripcion: "Nombre del tipo de contrato (ej. Jornada 2030 SRL)", grupo: G.documento },
  docName: { variable: "{{docName}}", descripcion: "Nombre de la plantilla usada", grupo: G.documento },
  numero: { variable: "{{numero}}", descripcion: "Número de pedido o de vacación", grupo: G.documento },
  extra: { variable: "{{extra}}", descripcion: "Etiqueta extra del trámite", grupo: G.documento },
  fechaAlta: { variable: "{{fechaAlta}}", descripcion: "Alta del contrato, YYYYMMDD («-» si no hay)", grupo: G.periodo },
  fechaBaja: { variable: "{{fechaBaja}}", descripcion: "Baja del contrato, YYYYMMDD («-» si no hay)", grupo: G.periodo },
  empresa: { variable: "{{empresa}}", descripcion: "Razón social de la empleadora", grupo: G.empresa },
  empresaCuit: { variable: "{{empresaCuit}}", descripcion: "CUIT de la empleadora, como CUIT-30710295839", grupo: G.empresa },
  anio: { variable: "{{anio}}", descripcion: "Año del período", grupo: G.otros },
  fecha: { variable: "{{fecha}}", descripcion: "Fecha de generación, YYYYMMDD", grupo: G.otros },
  timestamp: { variable: "{{timestamp}}", descripcion: "Marca temporal de generación", grupo: G.otros },
} satisfies Record<string, VariableNomenclatura>;

/** El orden en que se muestran los grupos: sigue el orden de los campos en el nombre. */
export const ORDEN_GRUPOS = [G.proyecto, G.persona, G.documento, G.periodo, G.identificacion, G.empresa, G.otros];

/**
 * Qué variables ofrece cada tipo, y cuáles son obligatorias.
 *
 * Ofrecer solo las que ese documento realmente tiene evita el peor resultado posible: un patrón que
 * se ve bien en el ABM y renderiza vacío en producción. Un contrato no tiene `{{numero}}` y un
 * pedido no tiene `{{fechaAlta}}`.
 */
export const VARIABLES_POR_TIPO: Record<TipoNomenclatura, VariableNomenclatura[]> = (() => {
  // Los cinco documentos de contrato comparten las mismas variables: son el mismo documento de una
  // persona en un proyecto, con distinto propósito. Repetir la lista cinco veces era garantizar que
  // se desincronizaran.
  const deContrato: VariableNomenclatura[] = [
    V.proyecto,
    V.apellido,
    V.nombres,
    V.tipo,
    V.contrato,
    V.docName,
    { ...V.fechaAlta, requerida: true },
    { ...V.fechaBaja, requerida: true },
    { ...V.identidad, requerida: true },
    V.email,
    V.extra,
    V.empresa,
    V.empresaCuit,
  ];
  return {
    Contrato: deContrato,
    Release: deContrato,
    AltaAFIP: deContrato,
    ConstanciaCUIT: deContrato,
    Documentacion: deContrato,
    // Pedidos y Vacaciones no vuelven de la firma, así que solo se les exige la identidad: es lo que
    // permite encontrar el PDF de una persona en la carpeta sin abrirlo. El resto de las variables es
    // el mismo esqueleto, con lo que estos documentos sí tienen (un número en vez de un período).
    // Pedidos y Vacaciones también se firman y vuelven. No tienen período —no son un contrato— así que
    // lo que los ancla es su NÚMERO: es lo que permite decir "este PDF firmado es el pedido 1042 de
    // esta persona" y no solo "es un pedido de esta persona".
    Pedido: [V.proyecto, V.apellido, V.nombres, V.tipo, { ...V.numero, requerida: true }, V.fecha, { ...V.identidad, requerida: true }, V.email, V.empresa, V.empresaCuit, V.timestamp],
    Vacacion: [V.proyecto, V.apellido, V.nombres, V.tipo, { ...V.numero, requerida: true }, V.anio, { ...V.identidad, requerida: true }, V.email, V.empresa, V.empresaCuit, V.timestamp],
  };
})();

/**
 * Lo que se usa cuando el tenant no configuró nada.
 *
 * Son EXACTAMENTE los nombres que la plataforma generaba antes de que esto existiera, expresados
 * como patrón. Que el default reproduzca el comportamiento anterior es lo que permite soltar esta
 * función sin migrar nada ni renombrar un solo archivo ya generado.
 */
export const PATRON_POR_DEFECTO: Record<TipoNomenclatura, string> = (() => {
  /*
    Un solo esqueleto para todos, leído de izquierda a derecha como una frase:

      DÓNDE (proyecto) · QUIÉN (persona) · QUÉ (documento) · CUÁNDO · IDENTIFICADORES · PARA QUIÉN (empleadora)

    El PROYECTO va primero porque es cómo se agrupan las carpetas: al mirar un directorio ordenado
    por nombre, todo lo del mismo proyecto queda junto. La EMPLEADORA va al final porque es el dato
    que menos se busca y el más largo — adelante empujaría el nombre de la persona fuera de la vista
    en cualquier listado angosto.

    Que los siete sean iguales no es prolijidad: el que mira una carpeta con contratos, pedidos y
    vacaciones mezclados lee siempre los mismos campos en el mismo lugar. Cada tipo cambia solo en lo
    que de verdad tiene distinto —un período contra un número de pedido— y todo lo demás coincide.
  */
  const deContrato = "{{proyecto}}_{{apellido}}_{{nombres}}_{{tipo}}_{{contrato}}_{{docName}}_Alta_{{fechaAlta}}_Baja_{{fechaBaja}}_{{identidad}}_{{email}}_{{extra}}_{{empresa}}_{{empresaCuit}}";
  return {
    Contrato: deContrato,
    Release: deContrato,
    AltaAFIP: deContrato,
    ConstanciaCUIT: deContrato,
    Documentacion: deContrato,
    Pedido: "{{proyecto}}_{{apellido}}_{{nombres}}_{{tipo}}_{{numero}}_{{fecha}}_{{identidad}}_{{email}}_{{empresa}}_{{empresaCuit}}",
    Vacacion: "{{proyecto}}_{{apellido}}_{{nombres}}_{{tipo}}_{{numero}}_{{anio}}_{{identidad}}_{{email}}_{{empresa}}_{{empresaCuit}}",
  };
})();

/**
 * Un valor listo para ir adentro de un nombre de archivo.
 *
 * El "_" es el separador de CAMPOS del nombre, así que los espacios internos de cada valor van como
 * "-". Cuando convivían los dos, el nombre en disco no coincidía con el nombre lógico guardado en la
 * base, y el matching de vuelta fallaba sin motivo aparente.
 */
export const campoNomenclatura = (v: unknown): string => {
  const crudo = String(v ?? "").trim();
  // Un "-" solo NO es basura: es el marcador de "este dato no existe" (una baja sin fecha, por
  // ejemplo). El bloque Alta/Baja va SIEMPRE, y sin esto la limpieza se lo comía y volvía
  // indistinguible un contrato sin fin de uno con el dato sin cargar.
  if (crudo === "-") return "-";
  return crudo
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

/**
 * Variables cuyo valor YA viene armado y no se vuelve a normalizar.
 *
 * `identidad` es un BLOQUE de dos campos —`CUIL-…_DNI-…`— y ese "_" del medio es estructural: el
 * parseo de vuelta (`/_(DNI|CI|…)-(\w+)/`) lo exige. Pasarlo por la normalización lo convertía en
 * "-", el nombre quedaba `CUIL-20331501027-DNI-33150102`, y el documento firmado volvía sin poder
 * identificar el documento de la persona. Se veía perfecto y estaba roto.
 */
export const VARIABLES_COMPUESTAS = new Set(["identidad"]);

/** Las variables que un patrón menciona, en orden y sin repetir. */
export const variablesUsadas = (patron: string): string[] => [...new Set((String(patron || "").match(/\{\{\s*[\w]+\s*\}\}/g) || []).map((v) => v.replace(/\s/g, "")))];

export interface ErrorPatron {
  campo: "patron";
  motivo: string;
}

/**
 * ¿Se puede guardar este patrón?
 *
 * Tres cosas, en orden de gravedad:
 *
 *  1. las variables OBLIGATORIAS están (sin ellas el archivo no se reencuentra al volver de la firma);
 *  2. no hay variables inventadas (renderizarían vacío en producción, y el ABM se vería bien);
 *  3. queda algo además de separadores (un patrón que rinde "" produce archivos sin nombre).
 */
export function validarPatron(tipo: TipoNomenclatura, patron: string): ErrorPatron[] {
  const errores: ErrorPatron[] = [];
  const disponibles = VARIABLES_POR_TIPO[tipo] || [];
  const usadas = variablesUsadas(patron);

  const faltantes = disponibles.filter((v) => v.requerida && !usadas.includes(v.variable));
  if (faltantes.length > 0) {
    const lista = faltantes.map((v) => v.variable).join(", ");
    errores.push({
      campo: "patron",
      motivo: `Falta ${lista}. Este archivo vuelve a entrar al sistema por su nombre —firmado desde Dropbox Sign, o levantado de la carpeta de Dropbox— y sin esos datos no se puede asociar a ninguna persona ni a ningún trámite. El error no se ve hasta que alguien lo busca.`,
    });
  }

  const conocidas = new Set(disponibles.map((v) => v.variable));
  const inventadas = usadas.filter((v) => !conocidas.has(v));
  if (inventadas.length > 0) {
    errores.push({ campo: "patron", motivo: `${inventadas.join(", ")} no existe para este tipo de documento: en el archivo real quedaría vacío.` });
  }

  if (String(patron || "").replace(/\{\{\s*[\w]+\s*\}\}/g, "").replace(/[\s_-]/g, "") === "" && usadas.length === 0) {
    errores.push({ campo: "patron", motivo: "El patrón está vacío: los archivos saldrían sin nombre." });
  }

  return errores;
}

/**
 * Aplica el patrón. Devuelve el nombre SIN extensión.
 *
 * Los segmentos vacíos se colapsan: una variable sin valor no puede dejar un "__" en el medio ni un
 * "_" colgando al final. Es el mismo resultado que daba el `parts.filter(...).join("_")` de antes.
 */
export function renderNomenclatura(patron: string, datos: Record<string, unknown>): string {
  const reemplazado = String(patron || "").replace(/\{\{\s*([\w]+)\s*\}\}/g, (_m, nombre) =>
    VARIABLES_COMPUESTAS.has(nombre) ? String(datos[nombre] ?? "").trim() : campoNomenclatura(datos[nombre]),
  );
  return reemplazado
    .split("_")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .join("_");
}
