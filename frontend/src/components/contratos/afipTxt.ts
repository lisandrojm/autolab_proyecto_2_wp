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
 * PENDIENTE de confirmar con un alta real hecha a mano en ARCA ("golden record"):
 *  - Retribución (58-72): hoy se mandan CENTAVOS implícitos (importe × 100). El diseño de 130 no
 *    aclara los decimales, pero el formato de 85 caracteres parte el importe en parte entera (8) +
 *    parte decimal (2), así que ARCA lleva centavos en las altas. Si el golden record mostrara pesos
 *    enteros, hay que sacar el × 100 de `describirRegistro`.
 *  - Situación de baja (46-47) y Nro. Formulario Agropecuario (120-129): el diseño los declara
 *    NUMERICO pero en un alta no aplican, y ninguno tiene un valor documentado que signifique "no
 *    aplica" (a diferencia del campo 130, donde el 0 sí lo significa). Rellenarlos con ceros
 *    afirmaría algo falso — 00 es un código de situación de baja y 0000000000 se lee como un número
 *    de formulario — así que van en blanco hasta poder confirmar si el layout los acepta así.
 */

/** Largo exacto que debe tener cada registro según el diseño oficial. */
const LARGO_REGISTRO = 130;

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
  { desde: 89, hasta: 90, nombre: "Rectificación", origen: "00 — normal", tipo: "constante" },
  { desde: 91, hasta: 100, nombre: "Código Convenio Colectivo", origen: "Opcional: ARCA lo infiere de la categoría", tipo: "en_blanco" },
  { desde: 101, hasta: 106, nombre: "Categoría profesional", origen: "Categoría del contrato", tipo: "obligatorio" },
  { desde: 107, hasta: 109, nombre: "Tipo de servicio", origen: "Tipo de contrato (o el default de la empleadora)", tipo: "obligatorio" },
  { desde: 110, hasta: 119, nombre: "Fecha suspensión servicios temporarios", origen: "No aplica a un alta", tipo: "en_blanco" },
  { desde: 120, hasta: 129, nombre: "N° Formulario Agropecuario", origen: "No aplica", tipo: "en_blanco" },
  { desde: 130, hasta: 130, nombre: "Marca COVID / tipo de contrato CCG", origen: "0 — sin CCG", tipo: "constante" },
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
  const fechaFinOk = !fechaFinInvalida && !(exigeFechaFin && !fechaFin) && !(prohibeFechaFin && !!fechaFin);

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

  const campos: CampoRegistro[] = [
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
    // Retribución con 2 decimales IMPLÍCITOS (13 enteros + 2 decimales). Ver el PENDIENTE de arriba.
    dato(58, 72, "Retribución pactada", v.retribucionOk ? num(Math.round(v.retribucion * 100), 15) : null, "retribucion"),
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
    // El diseño oficial declara este campo NUMERICO y enumera sus valores (0 a 9): el blanco no es
    // uno de ellos. 0 = sin Lic. COVID y no asociado a un CCG.
    cte(130, 130, "Marca COVID / tipo de contrato CCG", "0"),
  ];

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

/** Une varios registros con CRLF (formato que espera ARCA). */
export function buildAltaTxt(records: string[]): string {
  return records.join("\r\n");
}

/** Dispara la descarga de un archivo .txt en el navegador. */
export function downloadTxt(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
