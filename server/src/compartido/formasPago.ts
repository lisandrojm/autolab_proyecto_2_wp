/**
 * FORMAS DE PAGO (27/10/2026): Efectivo, Transferencia bancaria, Cheque… Catálogo propio (Configuración →
 * Formas de pago) que cada tipo de contrato acota: qué formas habilita y cuál es la predeterminada. El
 * contrato de un miembro guarda la elegida en `forma_pago_id`.
 *
 * Las reglas viven acá, compartidas: el server las hace cumplir y el formulario las usa para no ofrecer
 * lo que después se rechaza. Sin dependencias (se importa desde el front con `@compartido`).
 */

export interface FormaPagoLike {
  _id: string;
  /** El nombre («Transferencia bancaria»). */
  name: string;
  /** El código («TRANSFERENCIA_BANCARIA»): `externalId` del catálogo. */
  externalId?: string;
  descripcion?: string;
  requiereDatosBancarios?: boolean;
  requiereComprobante?: boolean;
  /** Ausente = activa, igual que en Entidades Financieras. */
  activo?: boolean;
  orden?: number | null;
}

/** Lo que un tipo de contrato dice de las formas de pago (`Contrato.data`). */
export interface FormasDelTipo {
  formasPagoIds?: Array<string | { toString(): string }> | null;
  formaPagoDefaultId?: string | { toString(): string } | null;
}

export const NOMBRE_MIN = 3;
export const NOMBRE_MAX = 50;
export const DESCRIPCION_MAX = 200;
const CODIGO_VALIDO = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;

export const formaActiva = (f: Pick<FormaPagoLike, "activo"> | null | undefined): boolean => !!f && f.activo !== false;

/** «Compensación / Intercambio» → «COMPENSACION_INTERCAMBIO»: mayúsculas, sin tildes, sin espacios. */
export function codigoDesdeNombre(nombre: string): string {
  return String(nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Lo que se escribió en el campo «Código», llevado a la forma válida (mismas reglas que el autogenerado). */
export const normalizarCodigo = (codigo: string): string => codigoDesdeNombre(codigo);

/**
 * Valida nombre, código y descripción de un alta o edición. `undefined` = el campo no vino (edición
 * parcial: un interruptor o el orden) y no se valida. Devuelve el primer error, o `null`.
 */
export function errorDeCampos(c: { nombre?: string; codigo?: string; descripcion?: string }): string | null {
  if (c.nombre !== undefined) {
    const n = String(c.nombre).trim();
    if (!n) return "El nombre es obligatorio.";
    if (n.length < NOMBRE_MIN || n.length > NOMBRE_MAX) return `El nombre tiene que tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.`;
  }
  if (c.codigo !== undefined) {
    const k = String(c.codigo).trim();
    if (!k) return "El código es obligatorio.";
    if (!CODIGO_VALIDO.test(k)) return "El código va en mayúsculas, sin espacios ni tildes (por ejemplo, TRANSFERENCIA_BANCARIA).";
  }
  if (c.descripcion !== undefined && String(c.descripcion).trim().length > DESCRIPCION_MAX) return `La descripción admite hasta ${DESCRIPCION_MAX} caracteres.`;
  return null;
}

const clave = (s: string | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/**
 * NOMBRE Y CÓDIGO ÚNICOS. El nombre sin distinguir mayúsculas ni tildes («efectivo» = «Efectivo»); el
 * código, exacto (ya viene normalizado). `idPropio` excluye al registro que se está editando.
 */
export function conflictoDeUnicidad(existentes: FormaPagoLike[], candidato: { nombre?: string; codigo?: string }, idPropio?: string | null): string | null {
  const otros = existentes.filter((f) => String(f._id) !== String(idPropio ?? ""));
  if (candidato.nombre !== undefined) {
    const repetida = otros.find((f) => clave(f.name) === clave(candidato.nombre));
    if (repetida) return `Ya existe una forma de pago llamada «${repetida.name}».`;
  }
  if (candidato.codigo !== undefined) {
    const repetida = otros.find((f) => String(f.externalId ?? "") === String(candidato.codigo).trim());
    if (repetida) return `El código ${candidato.codigo} ya lo usa «${repetida.name}».`;
  }
  return null;
}

/**
 * BORRAR SÓLO LO QUE NADIE USA. Con contratos o tipos de contrato asociados se rechaza diciendo cuántos y
 * ofreciendo la salida que no rompe nada: desactivarla.
 */
export function motivoParaNoBorrar(nombre: string, uso: { contratos: number; tipos: number }): string | null {
  if (!(uso.contratos > 0) && !(uso.tipos > 0)) return null;
  const partes = [uso.contratos > 0 ? `${uso.contratos} ${uso.contratos === 1 ? "contrato" : "contratos"}` : "", uso.tipos > 0 ? `${uso.tipos} ${uso.tipos === 1 ? "tipo de contrato" : "tipos de contrato"}` : ""].filter(Boolean);
  return `No se puede eliminar «${nombre}»: la usan ${partes.join(" y ")}. Desactivala para que deje de ofrecerse sin perder el historial.`;
}

/** Por `orden` (los sin orden, al final) y después por nombre: el orden de todos los selectores. */
export function ordenarFormas<T extends FormaPagoLike>(lista: T[]): T[] {
  const o = (f: T) => (typeof f.orden === "number" && f.orden > 0 ? f.orden : Number.POSITIVE_INFINITY);
  return [...lista].sort((a, b) => o(a) - o(b) || a.name.localeCompare(b.name, "es"));
}

const ids = (v: FormasDelTipo["formasPagoIds"]): string[] => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x ?? "")).filter(Boolean))];

/**
 * Lo que guarda un tipo de contrato: habilitadas sin repetir y la predeterminada SÓLO si es una de
 * ellas (si se deshabilita la que era predeterminada, se limpia).
 */
export function normalizarFormasDelTipo(formasPagoIds: unknown, formaPagoDefaultId: unknown): { formasPagoIds: string[]; formaPagoDefaultId: string | null } {
  const habilitadas = ids(formasPagoIds as FormasDelTipo["formasPagoIds"]);
  const def = formaPagoDefaultId == null ? "" : String(formaPagoDefaultId);
  return { formasPagoIds: habilitadas, formaPagoDefaultId: def && habilitadas.includes(def) ? def : null };
}

/**
 * LAS OPCIONES DEL SELECTOR DE FORMA DE PAGO DE UN CONTRATO.
 *
 *  · El tipo habilita algunas → sólo esas, y sólo las activas.
 *  · El tipo no habilita ninguna → todas las activas (no se bloquea el alta).
 *  · La que el contrato YA tiene se ofrece siempre, aunque después se haya desactivado o el tipo la haya
 *    sacado: editar un contrato viejo no puede borrarle su forma de pago en silencio.
 *
 * `predeterminada` es la del tipo, si está entre las opciones y activa.
 */
export function formasParaSelector<T extends FormaPagoLike>(todas: T[], tipo: FormasDelTipo | null | undefined, actualId?: string | null): { opciones: T[]; predeterminada: string | null; restringido: boolean } {
  const habilitadas = ids(tipo?.formasPagoIds);
  const restringido = habilitadas.length > 0;
  const actual = String(actualId ?? "");
  const opciones = ordenarFormas(todas.filter((f) => String(f._id) === actual || (formaActiva(f) && (!restringido || habilitadas.includes(String(f._id))))));
  const def = tipo?.formaPagoDefaultId == null ? "" : String(tipo.formaPagoDefaultId);
  const predeterminada = def && opciones.some((f) => String(f._id) === def && formaActiva(f)) ? def : null;
  return { opciones, predeterminada, restringido };
}

/** Datos bancarios de la persona (`User.metadata`) que pide una forma con `requiereDatosBancarios`. */
export function faltanDatosBancarios(metadata: { cbu?: string | null; aliasBancario?: string | null; bancoId?: number | string | null } | null | undefined): string[] {
  const m = metadata || {};
  const faltan: string[] = [];
  if (!String(m.cbu ?? "").trim() && !String(m.aliasBancario ?? "").trim()) faltan.push("CBU o alias");
  if (m.bancoId === null || m.bancoId === undefined || String(m.bancoId).trim() === "") faltan.push("entidad financiera");
  return faltan;
}

/**
 * ¿Se puede guardar este contrato con esta forma de pago? Devuelve el motivo para rechazarlo, o `null`.
 *
 * Una forma que el contrato YA tenía (`previaId`) no se vuelve a juzgar: desactivarla o sacarla del tipo
 * no puede impedir editar otra cosa del contrato. Una forma NUEVA tiene que estar activa, habilitada por
 * el tipo (si el tipo acota) y, si pide datos bancarios, la persona los tiene que tener cargados.
 */
export function rechazoDeFormaPago(p: { forma: FormaPagoLike | null; tipo: FormasDelTipo | null | undefined; previaId?: string | null; metadata?: Parameters<typeof faltanDatosBancarios>[0] }): string | null {
  const { forma } = p;
  if (!forma) return "La forma de pago elegida no existe.";
  if (String(p.previaId ?? "") === String(forma._id)) return null;
  if (!formaActiva(forma)) return `La forma de pago «${forma.name}» está inactiva: elegí otra.`;
  const habilitadas = ids(p.tipo?.formasPagoIds);
  if (habilitadas.length > 0 && !habilitadas.includes(String(forma._id))) return `El tipo de contrato no habilita la forma de pago «${forma.name}».`;
  if (forma.requiereDatosBancarios) {
    const faltan = faltanDatosBancarios(p.metadata);
    if (faltan.length > 0) return `«${forma.name}» requiere los datos bancarios de la persona y le falta: ${faltan.join(" y ")}. Cargalos en su ficha (Datos bancarios) o elegí otra forma de pago.`;
  }
  return null;
}
