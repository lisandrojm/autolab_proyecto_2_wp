/**
 * QUÉ DATOS BANCARIOS SE PIDEN, SEGÚN EL TIPO DE ENTIDAD. Una sola cascada.
 *
 * Vivía solo en el link de registro público, y por eso «Nuevo Usuario» pedía siempre los mismos
 * campos: Banco, Tipo de Cuenta, Número de Cuenta y CBU, para todo el mundo. Con una billetera
 * virtual eso son dos campos que no existen —no hay tipo de cuenta ni número— y un rótulo que miente:
 * lo que tiene es un CVU. Quien cargaba desde adentro inventaba algo o dejaba huecos, y el dato
 * quedaba distinto según por dónde entró la misma persona.
 *
 * LA MISMA CASCADA EN LOS DOS LADOS, entonces, y en un módulo aparte para que no puedan separarse.
 *
 * LO QUE NO SE COMPARTE es la autorización para crear la cuenta: eso solo tiene sentido en el
 * registro, donde la persona se autoriza a sí misma. Adentro se ve como un aviso en la ficha —alguien
 * de la productora tiene que ir a hacer el trámite—, no como un check que un administrativo pueda
 * marcar por otro.
 */

/** El tipo que declara «no tengo banco». No es una entidad: es la ausencia de una. */
export const SIN_BANCO = "sin_banco";

export const TIPO_ENTIDAD_OPTIONS = [
  { value: "banco", label: "Banco" },
  { value: "billetera_virtual", label: "Billetera Virtual" },
  { value: "compania_financiera", label: "Compañía Financiera" },
  { value: "caja_credito", label: "Caja de Crédito" },
  { value: SIN_BANCO, label: "No tengo Banco" },
];

/**
 * Qué campos pide cada tipo.
 *
 * `cbuLabel` cambia porque el número NO se llama igual: un banco da un CBU y una billetera virtual da
 * un CVU. Son los dos 22 dígitos y van al mismo campo, pero rotularlos «CBU» a los dos hace dudar de
 * si se está cargando lo correcto — y quien duda, deja el campo vacío.
 */
export interface CamposTipo {
  tipoCuenta: boolean;
  nroCuenta: boolean;
  cbuLabel: string;
}

const CAMPOS_POR_TIPO: Record<string, CamposTipo> = {
  banco: { tipoCuenta: true, nroCuenta: true, cbuLabel: "CBU" },
  caja_credito: { tipoCuenta: true, nroCuenta: true, cbuLabel: "CBU" },
  compania_financiera: { tipoCuenta: false, nroCuenta: true, cbuLabel: "CBU" },
  billetera_virtual: { tipoCuenta: false, nroCuenta: false, cbuLabel: "CVU" },
  otro: { tipoCuenta: false, nroCuenta: false, cbuLabel: "CBU/CVU" },
};

/** Un tipo desconocido cae en `otro`: pide lo mínimo y no promete un rótulo que no puede garantizar. */
export const camposDe = (tipo: string): CamposTipo => CAMPOS_POR_TIPO[tipo] || CAMPOS_POR_TIPO.otro;

export const labelTipo = (tipo: string): string => TIPO_ENTIDAD_OPTIONS.find((o) => o.value === tipo)?.label || "Entidad";

/** Con «No tengo Banco» no se pide ningún dato de cuenta: no hay ninguno que cargar. */
export const declaraSinBanco = (tipo: string): boolean => tipo === SIN_BANCO;

/**
 * ¿Hay que crearle la cuenta a esta persona?
 *
 * Es el estado que deja el registro cuando alguien declara no tener banco y autoriza que se le abra
 * una. Del lado de adentro no es un campo editable sino una TAREA PENDIENTE: por eso la ficha lo
 * muestra como aviso y no como check — marcarlo por otro sería autorizar en su nombre.
 */
export const esperaCuentaBancaria = (metadata: { tipoEntidadFinanciera?: string; solicitaCreacionCuenta?: boolean; cbu?: string } | null | undefined): boolean =>
  !!metadata?.solicitaCreacionCuenta && !metadata?.cbu;
