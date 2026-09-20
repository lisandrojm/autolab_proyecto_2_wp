/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DE QUÉ EMPRESA ES UN CONTRATO Y BAJO QUÉ RÉGIMEN SE LIQUIDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Las dos preguntas que definen en qué HOJA del archivo de Memosoft cae cada persona (una hoja por
 * empresa × centro de costo × régimen). Están acá, puras y sin Mongo, porque son lo que hay que
 * poder probar sin levantar nada: si esto se equivoca, la plata va a la hoja equivocada.
 *
 * NINGUNA DE LAS DOS ADIVINA. Cuando no puede resolver, devuelve una excepción con el motivo, y esa
 * excepción termina en el anexo para que la resuelva una persona. Un default silencioso acá es una
 * liquidación mal hecha que nadie revisa.
 *
 * ── Lo que se midió antes de escribir esto (producción, 2026-09-20) ──
 *
 * EMPRESA: de 7.462 contratos, 24 tienen `empresaContratoId`. En el resto la empresa está adentro
 * del TEXTO de `nombre_contrato` ("Jornada 2030 SRL", "Servicios - FZERO SRL"). Por eso el orden es
 * campo primero, texto después: el campo es la verdad cuando está, y el texto es de dónde sale el
 * backfill que lo va a completar.
 *
 * RÉGIMEN: `tipo_contrato_id` usa 13 valores distintos en los contratos vigentes, y el catálogo
 * FRAME (`infos` type=contrato) sólo define 8 (ids 1 a 8). 116 de 578 contratos vigentes apuntan a
 * un tipo que no existe. Lo que sí discrimina limpio es `cantidad_jornadas_laborales`: 339
 * contratos en 1 y 175 en 30. Por eso el régimen se resuelve por tipo cuando el tipo se conoce, y
 * por jornadas cuando no —y si los dos hablan y se contradicen, es excepción, no desempate.
 */

/** Lo que cada función necesita del contrato. Un subconjunto, para poder testear sin construir el doc entero. */
export interface ContratoParaLiquidar {
  empresaContratoId?: unknown;
  nombre_contrato?: string | null;
  tipo_contrato_id?: number | null;
  cantidad_jornadas_laborales?: number | null;
  fecha_alta_contrato?: string | Date | null;
  fecha_baja_contrato?: string | Date | null;
}

export interface EmpresaConocida {
  id: string;
  razonSocial: string;
}

export type Regimen = "mensual" | "jornalero";

export type MotivoSinResolver =
  | "empresa_sin_dato"
  | "empresa_ambigua"
  | "regimen_sin_dato"
  | "regimen_contradictorio";

export interface Resuelto<T> {
  valor: T;
  /** De dónde salió. Sirve para saber cuánto confiar y para medir cuánto falta backfillear. */
  origen: "campo" | "nombre_contrato" | "jornadas" | "tipo_contrato";
}

export interface SinResolver {
  valor: null;
  motivo: MotivoSinResolver;
  /** Para el anexo: qué se miró y qué se encontró, en castellano. */
  detalle: string;
}

export type Resolucion<T> = Resuelto<T> | SinResolver;

export const resolvio = <T>(r: Resolucion<T>): r is Resuelto<T> => r.valor !== null;

/* ───────────────────────────── Empresa ───────────────────────────── */

/**
 * Saca puntos y espacios de más, pasa a mayúsculas, y pega las siglas sueltas: "S.R.L." y "S R L"
 * quedan los dos en "SRL".
 *
 * NO SACA LA FORMA JURÍDICA. Es parte del nombre, y es lo único que separa a FZERO S.R.L. —la
 * empleadora argentina— de FZERO CORP, que es la entidad de Estados Unidos y no emplea a nadie acá.
 * Sacarla las haría ver iguales, y los 651 centros de costo de la CORP terminarían en las hojas
 * de la SRL.
 */
export const normalizarRazonSocial = (texto: string): string =>
  String(texto || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[._,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // "S R L" quedó separado al sacar los puntos; se vuelve a pegar en "SRL".
    .replace(/\b(?:[A-Z]\s+){1,}[A-Z]\b/g, (sigla) => sigla.replace(/\s+/g, ""));

/** Si `aguja` aparece como palabra o frase entera dentro de `pajar`, y no como pedazo de otra palabra. */
const contiene = (pajar: string, aguja: string): boolean => {
  if (!aguja) return false;
  const escapada = aguja.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escapada}(\\s|$)`).test(pajar);
};

/**
 * La primera palabra de la razón social ("2030", "FZERO", "GRINI"): alcanza para SOSPECHAR que una
 * empresa está mencionada, no para afirmarlo. Se usa sólo para levantar la mano, nunca para resolver.
 */
const marcaDe = (razonSocial: string): string => normalizarRazonSocial(razonSocial).split(" ")[0] || "";

/**
 * DE QUÉ EMPRESA ES ESTE CONTRATO.
 *
 * Primero el campo. Si no está, se busca la razón social COMPLETA dentro del nombre del contrato:
 * "2030 SRL" resuelve, "FZERO" suelto no.
 *
 * Y SI HAY OTRA EMPRESA MENCIONADA A MEDIAS, TAMPOCO RESUELVE. Son 57 contratos vigentes llamados
 * "Plazo fijo 5x10 2030 SRL + Release JSA FZERO": la razón social entera que aparece es una sola,
 * pero la otra empresa está ahí, y cuál emplea y cuál recibe el release lo decide RRHH. El backfill
 * los agrupa por nombre para que se decida una vez por cada nombre distinto —son 16—, y no una vez
 * por contrato.
 */
export function empresaDelContrato(contrato: ContratoParaLiquidar, empresas: EmpresaConocida[]): Resolucion<string> {
  const delCampo = contrato.empresaContratoId ? String(contrato.empresaContratoId) : "";
  if (delCampo) return { valor: delCampo, origen: "campo" };

  const nombre = normalizarRazonSocial(contrato.nombre_contrato || "");
  if (!nombre) {
    return { valor: null, motivo: "empresa_sin_dato", detalle: "El contrato no tiene empresaContratoId ni nombre_contrato." };
  }

  const nombradas = empresas.filter((e) => contiene(nombre, normalizarRazonSocial(e.razonSocial)));
  const insinuadas = empresas.filter((e) => !nombradas.includes(e) && contiene(nombre, marcaDe(e.razonSocial)));

  if (nombradas.length === 1 && insinuadas.length === 0) {
    return { valor: nombradas[0].id, origen: "nombre_contrato" };
  }

  if (nombradas.length + insinuadas.length === 0) {
    return { valor: null, motivo: "empresa_sin_dato", detalle: `"${contrato.nombre_contrato}" no nombra a ninguna de las empresas conocidas.` };
  }

  const mencionadas = [...nombradas, ...insinuadas].map((c) => c.razonSocial).join(" y ");
  return {
    valor: null,
    motivo: "empresa_ambigua",
    detalle: `"${contrato.nombre_contrato}" menciona a ${mencionadas}: hay que decidir cuál emplea.`,
  };
}

/* ───────────────────────────── Régimen ───────────────────────────── */

/**
 * QUÉ RÉGIMEN LE CORRESPONDE A CADA TIPO DE CONTRATO DE FRAME.
 *
 * Los ids son los de `infos` type=contrato, que es contra lo que resuelve hoy el resto del sistema
 * (ver `routes/projects.ts`, que hace `Info.findOne({ type: "contrato", "data.id": ... })`).
 *
 * Los tipos de Servicios y Eventual QUEDAN AFUERA A PROPÓSITO. Un contrato de servicios se factura,
 * no se liquida por recibo; y los eventuales de talento y músicos tienen su propio circuito. Que
 * caigan en excepción es el comportamiento correcto: mejor que RRHH los saque de la lista a que el
 * motor los meta en una hoja porque había que ponerlos en alguna.
 */
const REGIMEN_POR_TIPO_FRAME: Record<number, Regimen> = {
  1: "mensual", // Plazo fijo 5x7
  2: "mensual", // Plazo fijo 6x6
  3: "jornalero", // Jornada
  4: "mensual", // Tiempo indeterminado
};

/** Con 30 jornadas se liquida el mes entero; con 1, se liquida el día. Es la señal más limpia que hay en los datos. */
const JORNADAS_MENSUAL = 30;
const JORNADAS_JORNALERO = 1;

const regimenPorJornadas = (jornadas: number | null | undefined): Regimen | null => {
  if (jornadas === JORNADAS_MENSUAL) return "mensual";
  if (jornadas === JORNADAS_JORNALERO) return "jornalero";
  return null;
};

/**
 * BAJO QUÉ RÉGIMEN SE LIQUIDA.
 *
 * Mira las dos señales que existen —el tipo y la cantidad de jornadas— y sólo devuelve algo cuando
 * no se pelean. Si se contradicen, la excepción dice exactamente qué dijo cada una: un contrato
 * "Tiempo Indeterminado" con 1 jornada está mal cargado, y eso se arregla en el contrato, no acá.
 */
export function regimenDelContrato(contrato: ContratoParaLiquidar): Resolucion<Regimen> {
  const porTipo = contrato.tipo_contrato_id != null ? REGIMEN_POR_TIPO_FRAME[Number(contrato.tipo_contrato_id)] ?? null : null;
  const porJornadas = regimenPorJornadas(contrato.cantidad_jornadas_laborales);

  if (porTipo && porJornadas && porTipo !== porJornadas) {
    return {
      valor: null,
      motivo: "regimen_contradictorio",
      detalle: `El tipo de contrato ${contrato.tipo_contrato_id} dice ${porTipo} y las ${contrato.cantidad_jornadas_laborales} jornadas dicen ${porJornadas}.`,
    };
  }

  if (porTipo) return { valor: porTipo, origen: "tipo_contrato" };
  if (porJornadas) return { valor: porJornadas, origen: "jornadas" };

  return {
    valor: null,
    motivo: "regimen_sin_dato",
    detalle: `Ni el tipo de contrato (${contrato.tipo_contrato_id ?? "vacío"}) ni las jornadas (${contrato.cantidad_jornadas_laborales ?? "vacío"}) permiten determinarlo.`,
  };
}

/* ───────────────────────────── Vigencia ───────────────────────────── */

/** Una fecha que puede venir como Date o como string, a "AAAA-MM-DD". Vacía = sin fecha. */
export const aDia = (f: string | Date | null | undefined): string => {
  if (!f) return "";
  if (f instanceof Date) return f.toISOString().slice(0, 10);
  return String(f).slice(0, 10);
};

/**
 * Si el contrato estuvo vigente en algún momento del período.
 *
 * Sin baja = sigue vigente: es lo que significa un contrato de tiempo indeterminado, y también lo
 * que queda cuando nadie cargó la baja todavía. Tratar la falta de baja como "terminado" sacaría de
 * la liquidación justo a los de planta permanente.
 */
export function contratoVigenteEn(contrato: ContratoParaLiquidar, desde: string, hasta: string): boolean {
  const alta = aDia(contrato.fecha_alta_contrato);
  const baja = aDia(contrato.fecha_baja_contrato);
  if (!alta) return false;
  if (alta > hasta) return false;
  return !baja || baja >= desde;
}

/** El primer y el último día de un período "AAAA-MM", como strings comparables. */
export function limitesDelPeriodo(periodo: string): { desde: string; hasta: string } {
  const [anio, mes] = String(periodo).split("-").map(Number);
  if (!anio || !mes || mes < 1 || mes > 12) throw new Error(`Período inválido: "${periodo}". Va como AAAA-MM.`);
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimo).padStart(2, "0")}` };
}
