import { HttpStatus } from '@nestjs/common';
import { ErrorConnector } from '../comun/errores';

const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * El CUIT normalizado a `XX-XXXXXXXX-X`, o 400. Acepta con o sin guiones. Tango no valida el
 * dígito verificador y su control de duplicados compara el texto: sin normalizar, un CUIT sin
 * guiones pasa como "no duplicado" (docs/tango/alta-proveedores.md).
 */
export function normalizarCuit(valor: unknown): string {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'Falta el CUIT', ['cuit: 11 dígitos, con o sin guiones (30-12345678-9)']);
  }
  const digitos = valor.replace(/[\s-]/g, '');
  if (!/^\d{11}$/.test(digitos)) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'CUIT inválido', ['cuit: tiene que tener 11 dígitos (30-12345678-9)']);
  }
  const suma = PESOS_CUIT.reduce((s, p, i) => s + p * Number(digitos[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto;
  if (resto === 10 || verificador !== Number(digitos[10])) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'CUIT inválido', ['cuit: el dígito verificador no corresponde']);
  }
  return `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos[10]}`;
}

function digitoVerificador(digitos: string, pesos: number[]): number {
  const suma = pesos.reduce((s, p, i) => s + p * Number(digitos[i]), 0);
  return (10 - (suma % 10)) % 10;
}

/** El CBU (22 dígitos, con sus dos dígitos verificadores), o 400. Tango no lo valida. */
export function validarCbu(valor: unknown, campo = 'cbu'): string {
  if (typeof valor !== 'string' || !/^\d{22}$/.test(valor.trim())) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'CBU inválido', [`${campo}: tiene que tener 22 dígitos, sin espacios ni guiones`]);
  }
  const cbu = valor.trim();
  const bloque1 = digitoVerificador(cbu.slice(0, 7), [7, 1, 3, 9, 7, 1, 3]) === Number(cbu[7]);
  const bloque2 = digitoVerificador(cbu.slice(8, 21), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]) === Number(cbu[21]);
  if (!bloque1 || !bloque2) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'CBU inválido', [`${campo}: los dígitos verificadores no corresponden`]);
  }
  return cbu;
}

/** Texto opcional con largo máximo (el de Tango), o 400. */
export function textoOpcional(valor: unknown, campo: string, maximo: number): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  if (typeof valor !== 'string' || valor.length > maximo) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, `${campo} inválido`, [`${campo}: texto de hasta ${maximo} caracteres`]);
  }
  return valor.trim() || undefined;
}

/** Datos de entrada del alta, validados. */
export interface EntradaAlta {
  cuit: string;
  cbu?: string;
  descripcionCbu?: string;
  codigoProvincia?: string;
}

/** Valida el cuerpo del alta (y de la vista previa). Rechaza campos desconocidos. */
export function validarEntradaAlta(cuerpo: unknown): EntradaAlta {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'Cuerpo inválido', ['Se espera { cuit, cbu?, descripcionCbu?, codigoProvincia? }']);
  }
  const c = cuerpo as Record<string, unknown>;
  const desconocidos = Object.keys(c).filter((k) => !['cuit', 'cbu', 'descripcionCbu', 'codigoProvincia'].includes(k));
  if (desconocidos.length) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'Campos desconocidos', [`No se admiten: ${desconocidos.join(', ')}`]);
  }
  const codigoProvincia = textoOpcional(c.codigoProvincia, 'codigoProvincia', 2);
  return {
    cuit: normalizarCuit(c.cuit),
    cbu: c.cbu === undefined || c.cbu === null || c.cbu === '' ? undefined : validarCbu(c.cbu),
    descripcionCbu: textoOpcional(c.descripcionCbu, 'descripcionCbu', 30),
    codigoProvincia,
  };
}

// --- Proveedores del exterior (CUIT país, 2026-10-28) ---------------------------------

/** Los combobox de CITI de la ficha (3142-form.json): tipo de operación y clasificación de la compra. */
export const CITI_OPERA = ['O', 'E', 'I'] as const;
export const CITI_TIPO = ['B', 'S', 'N'] as const;
/** La categoría de IVA de un proveedor del exterior: Exento, o Responsable inscripto (el raro que factura con IVA). */
export const CATEGORIAS_IVA_EXTERIOR = ['EX', 'RI'] as const;

/**
 * Un CUIT país de ARCA (50 persona humana, 51 otro tipo de entidad, 55 persona jurídica), normalizado a
 * `XX-XXXXXXXX-X`, o 400. No se controla el dígito verificador: la tabla de ARCA tiene algunos que no
 * cumplen y son los que se usan.
 */
export function normalizarCuitPais(valor: unknown): string {
  const digitos = typeof valor === 'string' ? valor.replace(/[\s-]/g, '') : '';
  if (!/^5[015]\d{9}$/.test(digitos)) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'CUIT país inválido', ['cuitPais: 11 dígitos que empiezan con 50, 51 o 55 (tabla de CUIT país de ARCA)']);
  }
  return `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos[10]}`;
}

/** Texto obligatorio con largo máximo, o 400. */
function textoObligatorio(valor: unknown, campo: string, maximo: number): string {
  const texto = textoOpcional(valor, campo, maximo);
  if (!texto) throw new ErrorConnector(HttpStatus.BAD_REQUEST, `Falta ${campo}`, [`${campo}: texto de hasta ${maximo} caracteres`]);
  return texto;
}

/** Uno de los valores admitidos, o 400. */
function unoDe<T extends string>(valor: unknown, campo: string, admitidos: readonly T[]): T {
  if (typeof valor !== 'string' || !admitidos.includes(valor as T)) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, `${campo} inválido`, [`${campo}: ${admitidos.join(', ')}`]);
  }
  return valor as T;
}

/** Datos de entrada del alta de un proveedor del exterior (sin ARCA: un CUIT país no tiene datos). */
export interface EntradaAltaExterior {
  cuitPais: string;
  razonSocial: string;
  categoriaIva: (typeof CATEGORIAS_IVA_EXTERIOR)[number];
  cbu?: string;
  descripcionCbu?: string;
}

/** Valida el cuerpo del alta del exterior (y de su vista previa). Rechaza campos desconocidos. */
export function validarEntradaAltaExterior(cuerpo: unknown): EntradaAltaExterior {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'Cuerpo inválido', ['Se espera { cuitPais, razonSocial, categoriaIva?, cbu?, descripcionCbu? }']);
  }
  const c = cuerpo as Record<string, unknown>;
  const desconocidos = Object.keys(c).filter((k) => !['cuitPais', 'razonSocial', 'categoriaIva', 'cbu', 'descripcionCbu'].includes(k));
  if (desconocidos.length) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'Campos desconocidos', [`No se admiten: ${desconocidos.join(', ')}`]);
  }
  return {
    cuitPais: normalizarCuitPais(c.cuitPais),
    // NOM_PROVEE de CPA01: 60 caracteres
    razonSocial: textoObligatorio(c.razonSocial, 'razonSocial', 60),
    categoriaIva: c.categoriaIva === undefined ? 'EX' : unoDe(c.categoriaIva, 'categoriaIva', CATEGORIAS_IVA_EXTERIOR),
    cbu: c.cbu === undefined || c.cbu === null || c.cbu === '' ? undefined : validarCbu(c.cbu),
    descripcionCbu: textoOpcional(c.descripcionCbu, 'descripcionCbu', 30),
  };
}

/**
 * Cambios admitidos en un proveedor existente: el CBU (y su descripción) y, para corregir un proveedor
 * del exterior (2026-10-28), los datos fiscales por su código en Tango (el connector los traduce al ID de
 * cada empresa), "Aplica retenciones" (solo destildar) y si está habilitado (ej. un duplicado).
 */
export interface CambiosProveedor {
  cbu?: string | null;
  descripcionCbu?: string | null;
  // RG 3685: código de tipo de operación (ej. X) y de comprobante AFIP (ej. 019)
  operacionAfip?: string;
  comprobanteAfip?: string;
  categoriaIva?: string;
  citiOpera?: (typeof CITI_OPERA)[number];
  citiTipo?: (typeof CITI_TIPO)[number];
  aplicaRetenciones?: false;
  habilitado?: boolean;
}

const CAMPOS_CAMBIOS = ['cbu', 'descripcionCbu', 'operacionAfip', 'comprobanteAfip', 'categoriaIva', 'citiOpera', 'citiTipo', 'aplicaRetenciones', 'habilitado'];

/** Un código de Tango (de una lista de la ficha), o 400. */
function codigoTango(valor: unknown, campo: string, formato: RegExp, ejemplo: string): string {
  if (typeof valor !== 'string' || !formato.test(valor.trim())) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, `${campo} inválido`, [`${campo}: el código de Tango (ej. ${ejemplo})`]);
  }
  return valor.trim();
}

/** Valida el cuerpo del PATCH; `null` borra el CBU o su descripción. */
export function validarCambios(cuerpo: unknown): CambiosProveedor {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'Cuerpo inválido', [`Se espera un objeto con alguno de: ${CAMPOS_CAMBIOS.join(', ')}`]);
  }
  const c = cuerpo as Record<string, unknown>;
  const desconocidos = Object.keys(c).filter((k) => !CAMPOS_CAMBIOS.includes(k));
  if (desconocidos.length) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'Campos desconocidos', [
      `No se admiten: ${desconocidos.join(', ')}. Se pueden cambiar: ${CAMPOS_CAMBIOS.join(', ')}`,
    ]);
  }
  if (!Object.keys(c).length) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'No hay cambios', [`Mandar alguno de: ${CAMPOS_CAMBIOS.join(', ')}`]);
  }
  const cambios: CambiosProveedor = {};
  if ('cbu' in c) cambios.cbu = c.cbu === null ? null : validarCbu(c.cbu);
  if ('descripcionCbu' in c) cambios.descripcionCbu = c.descripcionCbu === null ? null : (textoOpcional(c.descripcionCbu, 'descripcionCbu', 30) ?? null);
  if ('operacionAfip' in c) cambios.operacionAfip = codigoTango(c.operacionAfip, 'operacionAfip', /^[0-9A-Z]$/, 'X');
  if ('comprobanteAfip' in c) cambios.comprobanteAfip = codigoTango(c.comprobanteAfip, 'comprobanteAfip', /^\d{3}$/, '019');
  if ('categoriaIva' in c) cambios.categoriaIva = codigoTango(c.categoriaIva, 'categoriaIva', /^[A-Z]{2,3}$/, 'EX');
  if ('citiOpera' in c) cambios.citiOpera = unoDe(c.citiOpera, 'citiOpera', CITI_OPERA);
  if ('citiTipo' in c) cambios.citiTipo = unoDe(c.citiTipo, 'citiTipo', CITI_TIPO);
  if ('aplicaRetenciones' in c) {
    // Tildarla pide la clasificación y las retenciones: eso se hace en Tango
    if (c.aplicaRetenciones !== false) throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'aplicaRetenciones inválido', ['aplicaRetenciones: solo false (destildarla)']);
    cambios.aplicaRetenciones = false;
  }
  if ('habilitado' in c) {
    if (typeof c.habilitado !== 'boolean') throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'habilitado inválido', ['habilitado: true o false']);
    cambios.habilitado = c.habilitado;
  }
  return cambios;
}

// La forma societaria del final de una razón social (la misma regla que comprobantes-to-tango, src/lib/leyenda.ts)
const FORMA_SOCIETARIA =
  /[\s,]+(S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?(\s?[UICF]\.?){0,4}|S\.?\s?R\.?\s?L\.?|S\.?\s?[CH]\.?|LTDA\.?|INC\.?|LLC\.?|B\.?\s?V\.?|CORP\.?|SOCIEDAD\s+AN[OÓ]NIMA(\s+SIMPLIFICADA)?|SOCIEDAD\s+DE\s+RESPONSABILIDAD\s+LIMITADA|SOCIEDAD\s+POR\s+ACCIONES\s+SIMPLIFICADA|SOCIEDAD\s+COLECTIVA|SOCIEDAD\s+DE\s+HECHO)$/i;

/**
 * La razón social para identificar a un proveedor del exterior (el CUIT país no lo identifica): sin la
 * forma societaria, acentos, mayúsculas ni puntuación ("OpenAI, LLC" y "OPENAI,LLC" → "OPENAI"). La misma
 * que usa comprobantes-to-tango para sus entidades (src/lib/ambitos/entidades.ts).
 */
export const razonSocialClave = (razon: string) =>
  razon
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(FORMA_SOCIETARIA, '')
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ]/g, '');
