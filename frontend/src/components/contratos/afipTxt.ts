import { ContractOverviewRow } from "../../api/users";
import { AfipCatalogs, AfipValues, resolveAfipValues, MODALIDADES_PLAZO_DETERMINADO, MODALIDADES_TIEMPO_INDETERMINADO } from "./afipCompleteness";

/**
 * Generación del archivo TXT de "Alta masiva sin límite de registros" de ARCA.
 * Registro de ancho fijo de 130 caracteres, sin separadores. Los campos obligatorios numéricos van
 * con ceros a la izquierda; los opcionales, en blanco (espacios), tal como pide la interfaz de ARCA.
 *
 * Contrastado posición por posición contra el diseño de registro oficial que publica la pantalla
 * Relaciones Laborales → Carga Masiva (14/08/2026). Las 22 posiciones coinciden.
 *
 * El layout está en UN solo lugar (`describirRegistro`): de ahí salen tanto el registro que se
 * escribe en el archivo como la vista previa del modal "Datos ARCA". Si estuvieran duplicados,
 * la vista previa terminaría mintiendo sobre lo que realmente se manda.
 *
 * QUÉ VA EN BLANCO: lo decide `NO_INFORMABLES_EN_ALTA`, no cada campo por su cuenta. Un alta no
 * puede informar ocho de las veintidós posiciones, y ARCA rechaza el archivo si alguna trae
 * contenido — un cero incluido. Ver el comentario de esa lista.
 *
 * FORMATO DEL ARCHIVO: registros de 130 separados por LF (no CRLF), con un LF final, en latin-1 y
 * sin BOM. Ver `buildAltaTxt` y `downloadTxt`.
 *
 * PENDIENTE de confirmar con un alta real hecha a mano en ARCA ("golden record"):
 *  - Retribución (58-72): hoy se mandan CENTAVOS implícitos (importe × 100). El diseño de 130 no
 *    aclara los decimales, pero el formato de 85 caracteres parte el importe en parte entera (8) +
 *    parte decimal (2), así que ARCA lleva centavos en las altas. Si el golden record mostrara pesos
 *    enteros, alcanza con poner `RETRIBUCION_EN_CENTAVOS = false`.
 */

/** Largo exacto que debe tener cada registro según el diseño oficial. */
const LARGO_REGISTRO = 130;

/**
 * LOS CAMPOS QUE UN ALTA (movimiento "AT") NO PUEDE INFORMAR. Van SIEMPRE en blanco.
 *
 * ARCA rechaza el archivo si alguno viene con contenido, y un cero ES contenido:
 *
 *   «En un ALTA no debe informar: Situación de Baja, Fecha de Telegrama de Renuncia, Marca de
 *    Rectificación, Fecha de suspensión servicios temporarios y Número Formulario Agropecuario.»
 *   «Marca de Covid Tipo de Contrato CCG no permitido para la fecha de inicio.»
 *
 * Los dos que producían ese rechazo estaban escritos como CONSTANTES del formato —«00» en
 * Rectificación y «0» en Marca COVID— porque el diseño de registro los declara numéricos y enumera
 * sus valores. El diseño describe el registro para TODOS los movimientos; el 00 de Rectificación
 * solo tiene sentido en una rectificación (MR) y el 0 de COVID solo dentro de la ventana en que el
 * organismo admitía ese marcador. En un alta de hoy los dos son «no informar», y eso se escribe en
 * blanco.
 *
 * Es una lista y no una decisión campo por campo a propósito: se aplica al final de armar el
 * registro, así ningún default numérico que se agregue después se filtra a una posición que el alta
 * no puede informar.
 */
const NO_INFORMABLES_EN_ALTA: { desde: number; hasta: number }[] = [
  { desde: 46, hasta: 47 }, // Situación de baja
  { desde: 48, hasta: 57 }, // Fecha telegrama renuncia
  { desde: 85, hasta: 88 }, // Puesto desempeñado (no se informa)
  { desde: 89, hasta: 90 }, // Rectificación
  { desde: 91, hasta: 100 }, // Código convenio colectivo (no se informa)
  { desde: 110, hasta: 119 }, // Fecha suspensión servicios temporarios
  { desde: 120, hasta: 129 }, // Número formulario agropecuario
  { desde: 130, hasta: 130 }, // Marca COVID / tipo de contrato CCG
];

/** Si esa posición es una de las que un alta no puede informar. */
export const noInformableEnAlta = (desde: number, hasta: number): boolean =>
  NO_INFORMABLES_EN_ALTA.some((c) => c.desde === desde && c.hasta === hasta);

/**
 * CÓMO VIAJA LA RETRIBUCIÓN (58-72): en centavos implícitos (importe × 100) o en pesos enteros.
 *
 * El diseño de 130 no aclara los decimales. El de 85 parte el importe en 8 enteros + 2 decimales, y
 * de ahí sale que las altas lleven centavos — pero es una inferencia, no un dato confirmado, y la
 * diferencia entre las dos lecturas es un sueldo cien veces más grande o cien veces más chico.
 *
 * Queda acá, en una sola constante, para que confirmarlo contra un alta aceptada sea cambiar un
 * `true` por un `false` y no repasar el generador, los tests y el tooltip. Mientras no esté
 * confirmado, el tooltip del campo lo dice en la pantalla en vez de dejarlo sólo en el código.
 */
export const RETRIBUCION_EN_CENTAVOS = true;

/** Solo dígitos, justificado a la derecha con ceros a la izquierda, a lo sumo `len` caracteres. */
const num = (v: string | number | null | undefined, len: number): string =>
  String(v ?? "")
    .replace(/\D/g, "")
    .slice(-len)
    .padStart(len, "0");

/** Texto justificado a la izquierda, relleno con espacios a la derecha, cortado a `len`. */
const txt = (v: string, len: number): string => (v || "").slice(0, len).padEnd(len, " ");

/** Campo opcional: se completa con espacios en blanco. */
const blank = (len: number): string => " ".repeat(len);

/** Fecha en formato AAAA/MM/DD que pide ARCA. Acepta "YYYY-MM-DD" o "DD/MM/YYYY". */
export const fechaAfip = (s: string): string => {
  if (!s) return "";
  let m = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(s);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  m = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return "";
};

/** De dónde sale el contenido de un campo del registro. */
export type ClaseCampo =
  /** Constante del formato (tipo de registro, movimiento, rectificación…). */
  | "constante"
  /** Dato del contrato/persona que hay que resolver. */
  | "dato"
  /** No aplica a un alta: va en blanco a propósito. */
  | "no_aplica";

export interface CampoRegistro {
  desde: number;
  hasta: number;
  nombre: string;
  clase: ClaseCampo;
  /** Contenido formateado listo para el archivo, o `null` si el dato falta / está mal. */
  contenido: string | null;
  /** Con qué se muestra en la vista previa cuando `contenido` es null. */
  placeholder: string;
  /** `key` del check de completitud que lo resuelve, para poder cruzarlos en la UI. */
  checkKey?: string;
}

/**
 * Describe el registro campo por campo. Es la fuente única del layout: `buildAltaRecord` lo
 * concatena y el modal lo muestra. Los campos que no se pudieron resolver vienen con
 * `contenido: null`, así la vista previa puede marcarlos en su posición exacta.
 */
/**
 * El registro de 130, descripto para DOCUMENTACIÓN: qué hay en cada posición y de dónde sale.
 *
 * Es el mismo layout que arma `describirRegistro`, pero sin necesitar un contrato. La pantalla
 * "Cómo funciona ARCA" lo lee de acá y no de una tabla escrita a mano: una tabla explicativa que se
 * desfasa del generador es peor que no tenerla, porque se le cree. Hay un test que compara las dos
 * listas posición por posición.
 *
 * `tipo` es la única información que agrega sobre el generador, y es lo que contesta las preguntas
 * que se repiten: si un campo hay que pedirlo o si ya está resuelto.
 */
export type TipoCampoAlta = "obligatorio" | "condicional" | "constante" | "en_blanco";

export interface CampoAltaDoc {
  desde: number;
  hasta: number;
  nombre: string;
  /** De dónde sale el dato, en el lenguaje de la app. */
  origen: string;
  tipo: TipoCampoAlta;
}

export const LAYOUT_ALTA: CampoAltaDoc[] = [
  { desde: 1, hasta: 2, nombre: "Tipo de registro", origen: "01 — fijo", tipo: "constante" },
  { desde: 3, hasta: 4, nombre: "Código de movimiento (alta)", origen: "AT — alta", tipo: "constante" },
  { desde: 5, hasta: 15, nombre: "CUIL", origen: "Persona", tipo: "obligatorio" },
  { desde: 16, hasta: 16, nombre: "Marca trabajador agropecuario", origen: "N — fijo", tipo: "constante" },
  { desde: 17, hasta: 19, nombre: "Modalidad de contrato", origen: "Tipo de contrato", tipo: "obligatorio" },
  { desde: 20, hasta: 29, nombre: "Fecha inicio relación laboral", origen: "Contrato · AAAA/MM/DD", tipo: "obligatorio" },
  { desde: 30, hasta: 39, nombre: "Fecha fin relación laboral", origen: "Contrato · solo si la modalidad es a plazo determinado", tipo: "condicional" },
  { desde: 40, hasta: 45, nombre: "Código de obra social (RNOS)", origen: "Persona → convenio (o su excepción) → excluidos de convenio", tipo: "obligatorio" },
  { desde: 46, hasta: 47, nombre: "Código situación de baja", origen: "No aplica a un alta", tipo: "en_blanco" },
  { desde: 48, hasta: 57, nombre: "Fecha telegrama renuncia", origen: "No aplica a un alta", tipo: "en_blanco" },
  { desde: 58, hasta: 72, nombre: "Retribución pactada", origen: "Grupo salarial del convenio de la categoría", tipo: "obligatorio" },
  { desde: 73, hasta: 73, nombre: "Modalidad de liquidación", origen: "Tipo de contrato (o el default de la empleadora)", tipo: "obligatorio" },
  { desde: 74, hasta: 78, nombre: "Sucursal (domicilio de desempeño)", origen: "Domicilio de explotación de la empleadora", tipo: "obligatorio" },
  { desde: 79, hasta: 84, nombre: "Actividad del domicilio", origen: "Actividad declarada en ese domicilio", tipo: "obligatorio" },
  { desde: 85, hasta: 88, nombre: "Puesto desempeñado", origen: "Opcional en este formato", tipo: "en_blanco" },
  { desde: 89, hasta: 90, nombre: "Rectificación", origen: "No aplica a un alta", tipo: "en_blanco" },
  { desde: 91, hasta: 100, nombre: "Código Convenio Colectivo", origen: "Opcional: ARCA lo infiere de la categoría", tipo: "en_blanco" },
  { desde: 101, hasta: 106, nombre: "Categoría profesional", origen: "Categoría del contrato", tipo: "obligatorio" },
  { desde: 107, hasta: 109, nombre: "Tipo de servicio", origen: "Tipo de contrato (o el default de la empleadora)", tipo: "obligatorio" },
  { desde: 110, hasta: 119, nombre: "Fecha suspensión servicios temporarios", origen: "No aplica a un alta", tipo: "en_blanco" },
  { desde: 120, hasta: 129, nombre: "N° Formulario Agropecuario", origen: "No aplica", tipo: "en_blanco" },
  { desde: 130, hasta: 130, nombre: "Marca COVID / tipo de contrato CCG", origen: "No aplica a un alta", tipo: "en_blanco" },
];

export function describirRegistro(row: ContractOverviewRow, cat: AfipCatalogs): { campos: CampoRegistro[]; valores: AfipValues } {
  const v = resolveAfipValues(row, cat);

  // Las fechas se normalizan ANTES de decidir si están: `fechaAfip` devuelve "" si la fecha guardada
  // no matchea ninguno de los dos formatos que entiende. Sin este paso, una fecha con otro formato
  // pasaba como "cargada" y terminaba escribiendo espacios en un campo obligatorio, generando un
  // registro que ARCA rechaza sin explicar por qué.
  const fechaInicio = fechaAfip(v.fechaInicio);
  const fechaFin = fechaAfip(v.fechaFin);
  const fechaFinInvalida = !!v.fechaFin && !fechaFin;
  // La fecha de fin es obligatoria en las modalidades a plazo determinado y tiene que ir en blanco
  // en las de tiempo indeterminado: en un caso falta y en el otro sobra, y las dos cambian el
  // sentido del alta (ver MODALIDADES_* en afipCompleteness).
  const exigeFechaFin = MODALIDADES_PLAZO_DETERMINADO.includes(v.modalidadContrato);
  const prohibeFechaFin = MODALIDADES_TIEMPO_INDETERMINADO.includes(v.modalidadContrato);
  /*
    En un contrato a plazo determinado, la fecha de fin tiene que ser POSTERIOR a la de inicio.

    Con las dos en el mismo día el archivo pasa el validador de formato —son dos fechas bien
    escritas— y da de alta una relación laboral que dura cero días. El error aparece después, cuando
    ya está registrada. Se compara como texto porque `AAAA/MM/DD` ordena igual alfabética que
    cronológicamente, y así no entra la zona horaria a decidir un día.
  */
  const finAnteriorOInvalido = !!fechaInicio && !!fechaFin && fechaFin <= fechaInicio;
  const fechaFinOk = !fechaFinInvalida && !(exigeFechaFin && !fechaFin) && !(prohibeFechaFin && !!fechaFin) && !finAnteriorOInvalido;

  const dato = (desde: number, hasta: number, nombre: string, contenido: string | null, checkKey?: string): CampoRegistro => ({
    desde,
    hasta,
    nombre,
    clase: "dato",
    contenido,
    placeholder: "·".repeat(hasta - desde + 1),
    checkKey,
  });
  const cte = (desde: number, hasta: number, nombre: string, contenido: string): CampoRegistro => ({ desde, hasta, nombre, clase: "constante", contenido, placeholder: contenido });
  const na = (desde: number, hasta: number, nombre: string): CampoRegistro => ({ desde, hasta, nombre, clase: "no_aplica", contenido: blank(hasta - desde + 1), placeholder: blank(hasta - desde + 1) });

  const base: CampoRegistro[] = [
    cte(1, 2, "Tipo de registro", "01"),
    cte(3, 4, "Código de movimiento (alta)", "AT"),
    dato(5, 15, "CUIL", v.cuilValido ? num(v.cuil, 11) : null, "cuil"),
    cte(16, 16, "Marca trabajador agropecuario", "N"),
    dato(17, 19, "Modalidad de contrato", v.modalidadContrato ? num(v.modalidadContrato, 3) : null, "modalidadContrato"),
    dato(20, 29, "Fecha inicio relación laboral", fechaInicio ? txt(fechaInicio, 10) : null, "fechaInicio"),
    // Único campo que puede estar legítimamente vacío: en las relaciones por tiempo indeterminado
    // el blanco ES el valor correcto, no un faltante.
    dato(30, 39, "Fecha fin relación laboral", fechaFinOk ? (fechaFin ? txt(fechaFin, 10) : blank(10)) : null, "fechaFin"),
    dato(40, 45, "Código de obra social (RNOS)", v.rnos ? num(v.rnos, 6) : null, "rnos"),
    na(46, 47, "Código situación de baja"),
    na(48, 57, "Fecha telegrama renuncia"),
    // Centavos implícitos o pesos enteros según `RETRIBUCION_EN_CENTAVOS`. Ver el PENDIENTE de arriba.
    dato(58, 72, "Retribución pactada", v.retribucionOk ? num(Math.round(v.retribucion * (RETRIBUCION_EN_CENTAVOS ? 100 : 1)), 15) : null, "retribucion"),
    dato(73, 73, "Modalidad de liquidación", v.modalidadLiq ? num(v.modalidadLiq, 1) : null, "modalidadLiq"),
    dato(74, 78, "Sucursal (domicilio de desempeño)", v.sucursal ? num(v.sucursal, 5) : null, "sucursal"),
    dato(79, 84, "Actividad del domicilio", v.actividad ? num(v.actividad, 6) : null, "actividad"),
    na(85, 88, "Puesto desempeñado"),
    cte(89, 90, "Rectificación", "00"),
    na(91, 100, "Código Convenio Colectivo"),
    dato(101, 106, "Categoría profesional", v.categoriaProf ? num(v.categoriaProf, 6) : null, "categoriaProf"),
    dato(107, 109, "Tipo de servicio", v.tipoServicio ? num(v.tipoServicio, 3) : null, "tipoServicio"),
    na(110, 119, "Fecha suspensión servicios temporarios"),
    na(120, 129, "N° Formulario Agropecuario"),
    cte(130, 130, "Marca COVID / tipo de contrato CCG", "0"),
  ];

  /*
    LA ÚLTIMA PALABRA LA TIENE `NO_INFORMABLES_EN_ALTA`.

    Se pasa al final y sobre la lista ya armada, en vez de escribir el blanco en cada campo: así da
    igual que alguno se haya declarado como constante, como dato o con un default numérico — si la
    posición no se puede informar en un alta, sale en blanco igual. Es la diferencia entre una regla
    y veintidós lugares donde acordarse de ella.
  */
  const campos = base.map((c) =>
    noInformableEnAlta(c.desde, c.hasta)
      ? {
          ...c,
          clase: "no_aplica" as const,
          contenido: blank(c.hasta - c.desde + 1),
          placeholder: blank(c.hasta - c.desde + 1),
          // Sin `checkKey`: no es un dato que alguien tenga que completar, así que no cuenta como
          // pendiente ni como resuelto en el contador de la fila.
          checkKey: undefined,
        }
      : c,
  );

  return { campos, valores: v };
}

/**
 * Arma el registro de 130 caracteres de un contrato. Devuelve null si le faltan datos obligatorios
 * (no se puede generar una línea válida sin ellos).
 */
export function buildAltaRecord(row: ContractOverviewRow, cat: AfipCatalogs): string | null {
  const { campos } = describirRegistro(row, cat);
  // Un mismo TXT se sube a la sesión de UNA sola empresa: sin saber cuál, el contrato no puede
  // entrar. No es un campo del registro, por eso se chequea aparte del layout.
  if (!row.empresaContratoId) return null;
  if (campos.some((c) => c.contenido === null)) return null;

  const record = campos.map((c) => c.contenido).join("");

  // Invariante: todos los campos son de ancho fijo, así que un largo distinto de 130 solo puede
  // venir de un error al armar el registro (nunca de los datos). Se corta acá y no en ARCA.
  if (record.length !== LARGO_REGISTRO) {
    throw new Error(`Registro de alta ARCA con largo inválido: ${record.length} caracteres (se esperaban ${LARGO_REGISTRO}).`);
  }

  return record;
}

/**
 * Une los registros: un LF entre cada uno y UNO al final. Sin CR.
 *
 * Venía con CRLF y sin salto final. El CR es un caracter más pegado al registro, así que la línea
 * medía 131 donde el validador espera 130 y el rechazo no dice eso: dice que algún campo está mal.
 * El salto final cierra el último registro, que sin él queda como una línea sin terminar.
 */
export function buildAltaTxt(records: string[]): string {
  return records.length === 0 ? "" : `${records.join("\n")}\n`;
}

/**
 * Dispara la descarga del .txt.
 *
 * Se escriben BYTES, no un string: un `Blob` de texto lo codifica en UTF-8, y aunque para ASCII puro
 * eso dé los mismos bytes, alcanza un caracter acentuado que se cuele en un campo de texto para que
 * ocupe dos bytes y corra todo el registro. Acá cada caracter es un byte (latin-1) y no hay BOM.
 */
export function downloadTxt(content: string, filename: string): void {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    if (code > 255) {
      // Se corta acá: un registro con un caracter fuera de latin-1 no es representable en el archivo
      // que ARCA espera, y mandarlo «como salga» produce un rechazo que no se entiende.
      throw new Error(`El archivo ARCA tiene un caracter no representable en latin-1 (posición ${i}, código ${code}).`);
    }
    bytes[i] = code;
  }
  const blob = new Blob([bytes], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
