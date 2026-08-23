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
  proyecto: { variable: "{{proyecto}}", descripcion: "Nombre del proyecto, como se ve en la grilla (ej. 426_LN+)", grupo: G.proyecto },
  proyectoId: { variable: "{{proyectoId}}", descripcion: "Id externo del proyecto (ej. 705)", grupo: G.proyecto },
  apellido: { variable: "{{apellido}}", descripcion: "Apellido de la persona", grupo: G.persona },
  nombres: { variable: "{{nombres}}", descripcion: "Nombres de la persona", grupo: G.persona },
  email: { variable: "{{email}}", descripcion: "Email; el @ va como -ARROBA- para poder reconstruirlo", grupo: G.persona },
  // Se llamaba `{{identidad}}` cuando el bloque eran dos campos (CUIL + documento). Con el documento
  // afuera es un CUIT y nada más, y `{{cuit}}` dice qué sale sin tener que abrir la ayuda. El nombre
  // viejo sigue funcionando: ver ALIAS.
  cuit: { variable: "{{cuit}}", descripcion: "CUIT/CUIL de la persona (o su documento, si no tiene CUIL)", grupo: G.identificacion },
  tipo: { variable: "{{tipo}}", descripcion: "Tipo de documento (Contrato, Release…)", grupo: G.documento },
  contrato: { variable: "{{contrato}}", descripcion: "Nombre del tipo de contrato (ej. Jornada 2030 SRL)", grupo: G.documento },
  docName: { variable: "{{docName}}", descripcion: "Nombre de la plantilla usada", grupo: G.documento },
  numero: { variable: "{{numero}}", descripcion: "Número de pedido o de vacación", grupo: G.documento },
  extra: { variable: "{{extra}}", descripcion: "Etiqueta extra del trámite", grupo: G.documento },
  fechaAlta: { variable: "{{fechaAlta}}", descripcion: "Alta del contrato, YYYYMMDD («-» si no hay)", grupo: G.periodo },
  fechaBaja: { variable: "{{fechaBaja}}", descripcion: "Baja del contrato, YYYYMMDD («-» si no hay)", grupo: G.periodo },
  /**
   * La razón social YA NO se ofrece en el ABM: el CUIT identifica a la empleadora igual y sin
   * gastar 12 caracteres del nombre, que está peleando contra el tope de 255. La definición queda
   * porque `datosNombreArchivo` sigue proveyendo el valor, así que un patrón guardado con
   * `{{empresa}}` sigue rindiendo bien en vez de escribir la llave literal en el archivo.
   */
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
    V.proyectoId,
    V.apellido,
    V.nombres,
    V.tipo,
    V.contrato,
    V.docName,
    { ...V.fechaAlta, requerida: true },
    { ...V.fechaBaja, requerida: true },
    { ...V.cuit, requerida: true },
    V.email,
    V.extra,
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
    Pedido: [V.proyecto, V.proyectoId, V.apellido, V.nombres, V.tipo, { ...V.numero, requerida: true }, V.fecha, { ...V.cuit, requerida: true }, V.email, V.empresaCuit, V.timestamp],
    Vacacion: [V.proyecto, V.proyectoId, V.apellido, V.nombres, V.tipo, { ...V.numero, requerida: true }, V.anio, { ...V.cuit, requerida: true }, V.email, V.empresaCuit, V.timestamp],
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
  const deContrato = "{{proyecto}}_{{apellido}}_{{nombres}}_{{tipo}}_{{contrato}}_{{docName}}_Alta_{{fechaAlta}}_Baja_{{fechaBaja}}_{{cuit}}_EMAIL-{{email}}_{{extra}}_{{empresaCuit}}";
  return {
    Contrato: deContrato,
    Release: deContrato,
    AltaAFIP: deContrato,
    ConstanciaCUIT: deContrato,
    Documentacion: deContrato,
    Pedido: "{{proyecto}}_{{apellido}}_{{nombres}}_{{tipo}}_{{numero}}_{{fecha}}_{{cuit}}_EMAIL-{{email}}_{{empresaCuit}}",
    Vacacion: "{{proyecto}}_{{apellido}}_{{nombres}}_{{tipo}}_{{numero}}_{{anio}}_{{cuit}}_EMAIL-{{email}}_{{empresaCuit}}",
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
export const VARIABLES_COMPUESTAS = new Set(["cuit", "identidad"]);

/**
 * Variables que EXISTIERON y ya no se ofrecen.
 *
 * `{{empresa}}` era la razón social: doce caracteres para decir lo mismo que `{{empresaCuit}}`, con
 * el nombre peleando contra el tope de 255. No se puede guardar un patrón que la use, pero el valor
 * se sigue proveyendo: un patrón ya guardado con ella rinde bien hasta que alguien lo edite, en vez
 * de escribir la llave literal adentro del archivo.
 *
 * Se rechazan con su propio motivo y no con el de «variable inventada», que diría que el campo
 * quedaría vacío — y no es cierto.
 */
const VARIABLES_RETIRADAS: Record<string, string> = {
  "{{empresa}}": "la empleadora ya se identifica con {{empresaCuit}}, que ocupa la mitad",
};

/** Las variables que un patrón menciona, en orden y sin repetir. */
export const variablesUsadas = (patron: string): string[] => [...new Set((String(patron || "").match(/\{\{\s*[\w]+\s*\}\}/g) || []).map((v) => v.replace(/\s/g, "")))];

/**
 * Tope de un nombre de archivo, en BYTES.
 *
 * Son dos límites que caen en el mismo número: Dropbox corta en 255 caracteres y el filesystem del
 * server (ext4) en 255 bytes por componente del path. El que manda es el de bytes, porque siempre es
 * mayor o igual: si el nombre entra en 255 bytes, entra en 255 caracteres.
 *
 * Y la diferencia NO es teórica. Medir en caracteres reventó en producción con
 * `Carlos-Andrés_…`: 255 caracteres, 256 bytes por la tilde, y el `writeFileSync` falló con
 * ENAMETOOLONG antes de poder generar el release.
 */
export const MAX_NOMBRE = 255;

/** Lo que ocupa de verdad. `"é"` es UN carácter y DOS bytes, y el filesystem cuenta bytes. */
export const largoEnBytes = (s: string): number => new TextEncoder().encode(s).length;

/** Piso de un campo recortado. Debajo de esto el valor deja de decir nada y solo ocupa lugar. */
const MINIMO_CAMPO = 8;

/**
 * ¿Este campo se puede recortar?
 *
 * Los ANCLAS no: son los que leen los parsers de vuelta. Cortar un dígito del CUIL o de una fecha no
 * acorta el nombre, lo rompe — el archivo se sube igual y después no se puede asociar a nadie.
 *
 *   CUIL-20331501027   `extraerIdentidadDeArchivo` → /(?:^|_)CUIL-(\d{11})/
 *   DNI-33150102       `extraerIdentidadDeArchivo` → /_(DNI|CI|LE|LC|PAS|DOC)-([A-Za-z0-9]+)/
 *   20260810           `extraerFechasDeNombre`     → tokens de 8 dígitos aislados
 *   CUIT-…             `extraerCuitDeNombre`       → primer token de 11 dígitos aislado
 *
 * Lo que sí se puede recortar es todo lo descriptivo: proyecto, nombre, tipo de contrato, plantilla,
 * email y razón social. Ninguno participa del matching (verificado: el email no lo mira nadie).
 */
const esAncla = (campo: string): boolean => /^CUIL-\d{11}$/i.test(campo) || /^(DNI|CI|LE|LC|PAS|DOC)-/i.test(campo) || /^\d{8}$/.test(campo) || /\d{11}/.test(campo) || campo.length <= MINIMO_CAMPO;

/**
 * Deja el nombre dentro del tope, midiendo en BYTES.
 *
 * Recorta el campo NO ancla más largo, de a un carácter, hasta que entre. Se hace así y no cortando
 * la cola porque la cola es justamente lo que se agregó para poder leer el nombre —el email y la
 * empleadora rotulados—: tijeretear ahí devolvería el problema que esto viene a resolver. Recortando
 * el más largo, el nombre conserva todos sus bloques y todas sus etiquetas, y lo que se pierde son
 * caracteres del final de los valores más gordos, que es donde menos información hay.
 *
 * `reservar` es lo que el llamador va a pegar después y todavía no está en el string: como mínimo la
 * extensión.
 *
 * Si aun con todo en el piso no entra, avisa y corta la cola. Es el peor caso y no debería pasar
 * nunca; queda como red y no como comportamiento esperado.
 */
export function recortarNombre(nombre: string, reservar = 4): string {
  const tope = MAX_NOMBRE - reservar;
  if (largoEnBytes(nombre) <= tope) return nombre;

  const campos = nombre.split("_");
  const recortables = campos.map((c, i) => ({ i, ancla: esAncla(c) })).filter((c) => !c.ancla);

  while (largoEnBytes(campos.join("_")) > tope) {
    // El más largo de los recortables, siempre que todavía esté por encima del piso. Se compara por
    // bytes: un nombre con tildes ocupa más de lo que mide, y es justo el que hay que recortar.
    const objetivo = recortables.filter((r) => campos[r.i].length > MINIMO_CAMPO).sort((a, b) => largoEnBytes(campos[b.i]) - largoEnBytes(campos[a.i]))[0];
    if (!objetivo) break;
    // Se saca un PUNTO DE CÓDIGO, no una unidad UTF-16: `slice(0, -1)` puede partir un par
    // subrogado al medio y dejar media letra, que es un carácter inválido en el nombre del archivo.
    campos[objetivo.i] = [...campos[objetivo.i]].slice(0, -1).join("").replace(/-+$/, "");
  }

  const recortado = campos.join("_");
  if (largoEnBytes(recortado) <= tope) return recortado;

  console.warn(`[NOMENCLATURA] El nombre no entra en ${MAX_NOMBRE} bytes ni recortando todo; se corta la cola: ${nombre}`);
  // Corte duro por bytes: se van sacando puntos de código del final hasta entrar.
  const chars = [...recortado];
  while (chars.length > 0 && largoEnBytes(chars.join("")) > tope) chars.pop();
  return chars.join("").replace(/[_-]+$/, "");
}


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
  // Resueltas por su nombre canónico: un patrón viejo con {{identidad}} cumple igual el requisito de
  // {{cuit}}, porque rinde exactamente lo mismo (ver ALIAS_VARIABLES).
  const usadasCanonicas = new Set(usadas.map((v) => `{{${canonica(v.replace(/[{}]/g, ""))}}}`));

  const faltantes = disponibles.filter((v) => v.requerida && !usadasCanonicas.has(v.variable));
  if (faltantes.length > 0) {
    const lista = faltantes.map((v) => v.variable).join(", ");
    errores.push({
      campo: "patron",
      motivo: `Falta ${lista}. Este archivo vuelve a entrar al sistema por su nombre —firmado desde Dropbox Sign, o levantado de la carpeta de Dropbox— y sin esos datos no se puede asociar a ninguna persona ni a ningún trámite. El error no se ve hasta que alguien lo busca.`,
    });
  }

  /*
   * El CUIT de la empleadora NO puede ir antes que el bloque de identidad.
   *
   * `estadoDropboxCronService.extraerCuitDeNombre()` toma el PRIMER token de 11 dígitos aislado del
   * nombre, sin exigir la etiqueta. Hoy sale el CUIL de la persona porque `{{identidad}}` va antes;
   * invertidos, el cron empieza a matchear por el CUIT de la empleadora y ningún candidato coincide.
   *
   * Es la misma clase de trampa que previenen las variables requeridas —se guarda bien, se genera
   * bien, y falla recién cuando el documento vuelve—, con el agravante de que acá el patrón se ve
   * perfectamente razonable.
   */
  const posIdentidad = Math.max(patron.indexOf("{{cuit}}"), patron.indexOf("{{identidad}}"));
  const posCuitEmpresa = patron.indexOf("{{empresaCuit}}");
  if (posIdentidad >= 0 && posCuitEmpresa >= 0 && posCuitEmpresa < posIdentidad) {
    errores.push({
      campo: "patron",
      motivo: "{{empresaCuit}} tiene que ir DESPUÉS de {{cuit}}. El escaneo de Dropbox reconoce a la persona por el primer número de 11 dígitos del nombre: si el CUIT de la empleadora aparece antes, los documentos que vuelvan se van a intentar asociar por la empresa y no van a encontrar a nadie.",
    });
  }

  const conocidas = new Set(disponibles.map((v) => v.variable));
  const retiradas = usadas.filter((v) => VARIABLES_RETIRADAS[v]);
  if (retiradas.length > 0) {
    const lista = retiradas.map((v) => `${v} (${VARIABLES_RETIRADAS[v]})`).join(", ");
    errores.push({ campo: "patron", motivo: `${lista}. Sacala del patrón para poder guardar.` });
  }

  // El alias no se marca como inventada: un patrón viejo con {{identidad}} sigue siendo válido.
  const inventadas = usadas.filter((v) => !conocidas.has(v) && !VARIABLES_RETIRADAS[v] && !conocidas.has(`{{${canonica(v.replace(/[{}]/g, ""))}}}`));
  if (inventadas.length > 0) {
    errores.push({ campo: "patron", motivo: `${inventadas.join(", ")} no existe para este tipo de documento: en el archivo real quedaría vacío.` });
  }

  if (String(patron || "").replace(/\{\{\s*[\w]+\s*\}\}/g, "").replace(/[\s_-]/g, "") === "" && usadas.length === 0) {
    errores.push({ campo: "patron", motivo: "El patrón está vacío: los archivos saldrían sin nombre." });
  }

  return errores;
}

/**
 * Nombres viejos de variables que siguen funcionando.
 *
 * `{{identidad}}` se renombró a `{{cuit}}` cuando el bloque dejó de tener dos campos. En producción no
 * había ningún patrón guardado con el nombre viejo, pero un patrón que quedara con él generaría
 * archivos con un `{{identidad}}` literal adentro — o sea, sin el CUIL, que es lo único que permite
 * reencontrarlos. El alias cuesta dos líneas y esa falla no se ve hasta que un documento vuelve.
 *
 * El ABM ofrece el nombre nuevo; el viejo solo se acepta, no se sugiere.
 */
const ALIAS_VARIABLES: Record<string, string> = { identidad: "cuit" };

/** El nombre canónico de una variable, resolviendo los alias. */
const canonica = (nombre: string): string => ALIAS_VARIABLES[nombre] || nombre;

/**
 * Aplica el patrón. Devuelve el nombre SIN extensión.
 *
 * Los segmentos vacíos se colapsan: una variable sin valor no puede dejar un "__" en el medio ni un
 * "_" colgando al final. Es el mismo resultado que daba el `parts.filter(...).join("_")` de antes.
 */
export function renderNomenclatura(patron: string, datos: Record<string, unknown>): string {
  const reemplazado = String(patron || "").replace(/\{\{\s*([\w]+)\s*\}\}/g, (_m, nombre) =>
    VARIABLES_COMPUESTAS.has(nombre) ? String(datos[nombre] ?? datos[canonica(nombre)] ?? "").trim() : campoNomenclatura(datos[nombre] ?? datos[canonica(nombre)]),
  );
  return reemplazado
    .split("_")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .join("_");
}
