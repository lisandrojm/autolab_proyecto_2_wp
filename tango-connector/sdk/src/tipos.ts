/**
 * Tipos de las respuestas. Son los de Tango tal cual: el connector no las cambia (ADR 0002).
 * Base: `TangoResponse` de lumba-tango (`frontend/src/api/tango/tangoApiService.ts`).
 */

/** Una fila: los nombres de campo son los de Tango (ver `meta.proceso(id).tablas`). */
export type Fila = Record<string, unknown>;

export interface InfoError {
  title?: string;
  messages?: string[];
  detailMessages?: string[];
}

/** Campos comunes a toda respuesta de Tango y a los errores del connector. */
export interface RespuestaBase {
  succeeded?: boolean;
  message?: string | null;
  exceptionInfo?: InfoError | null;
}

export interface Paginado {
  pageIndex: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/** `Get` y `GetApiLiveQueryData`: la lista va en `resultData.list`. En los errores, `null`. */
export interface RespuestaLista<T = Fila> extends RespuestaBase {
  resultData?: (Paginado & { list?: T[] }) | null;
}

/** Una página que entregan `paginas()`: las filas y en qué punto del recorrido se está. */
export interface PaginaLeida<T = Fila> {
  filas: T[];
  pageIndex: number;
  pageSize: number;
  /** Total de filas según Tango; `undefined` si no lo informó. */
  totalCount?: number;
  totalPages?: number;
}

/**
 * `GetByFilter`: la lista va **en la raíz** y no pagina (trae todo lo que cumple el filtro).
 * Su `totalCount` no es confiable.
 */
export interface RespuestaFiltro<T = Fila> extends RespuestaBase, Partial<Paginado> {
  list?: T[];
}

/** `GetById`: el registro va en `value`, con sus sub-tablas como listas. */
export interface RespuestaRegistro<T = Fila> extends RespuestaBase {
  value?: T | null;
}

/**
 * `GetPdf`: el PDF viene **en base64 dentro de un JSON** (probado con 14184, Ficha Live de
 * órdenes de pago). Para tenerlo como bytes, usar `tango.pdf()`.
 */
export interface RespuestaPdf extends RespuestaBase {
  fileResult?: {
    /** El PDF en base64. */
    fileContents: string;
    /** Tango manda `application/file`, no `application/pdf`. */
    contentType: string;
    /** P. ej. `OP- 0000000024207.pdf`. */
    fileDownloadName: string;
    lastModified?: string | null;
    entityTag?: unknown;
    enableRangeProcessing?: boolean;
  } | null;
  contentResult?: string | null;
}

/** Un PDF listo para guardar o mandar. */
export interface Pdf {
  /** Seguro para usar como nombre de archivo: `N/C-A0000200000085.pdf` → `N-C-A0000200000085.pdf`. */
  nombre: string;
  /** El nombre tal cual lo manda Tango (puede traer `/`, como en las notas de crédito). */
  nombreOriginal: string;
  bytes: Uint8Array;
}

// --- Parámetros (los de la API de Tango, más `signal`, que no se manda) ---

export interface ConSignal {
  /** Para cancelar desde la plataforma (p. ej. si se cancela el job). */
  signal?: AbortSignal;
}

export interface ParamsGet extends ConSignal {
  /** Por defecto 1000 (el máximo del connector). Tango, sin el SDK, usa 10. */
  pageSize?: number;
  pageIndex?: number;
  /** Vacío (por defecto): todas las columnas. `"Vista Predeterminada"`: las de la grilla. */
  view?: string;
}

export interface ParamsFiltro extends ConSignal {
  view?: string;
}

/**
 * Fecha para LIVE: un `Date` (se manda como `dd/MM/yyyy`, en la zona horaria del cliente),
 * `yyyy-MM-dd`, o un texto ya en formato de Tango (`01/02/2026`, `2026-02-01T00:00:00`).
 */
export type FechaTango = Date | string;

export interface ParamsLive extends ConSignal {
  /** Hay que mandarlas: sin rango, Tango usa un período por defecto que puede traer 0 filas. */
  fromDate?: FechaTango;
  /** Inclusive: el rango incluye este día. */
  toDate?: FechaTango;
  /** Por defecto 1000 (el máximo del connector). Tango, sin el SDK, usa 10. */
  pageSize?: number;
  pageIndex?: number;
  /** `ID_CONSULTA` de una consulta guardada en "Mis consultas" del proceso. 0: por defecto. */
  customQuery?: number;
}

// --- Datos que el connector lee de la web de Tango (ADR 0003) ---

/** Un perfil de factura de compra (`CPA128`), en la lista. */
export interface PerfilFacturaCompra {
  /** `ID_CPA128`. */
  id: number;
  /** `COD_PERFIL`, p. ej. `002`. */
  codigo: string;
  descripcion: string;
}

/**
 * Un perfil completo: la fila de `CPA128` tal cual (118 campos). Los `COMP_*` y `CTR_*` dicen
 * si cada campo del comprobante se Edita (`E`), se Muestra (`M`) o se Oculta (`O`); `D_*`,
 * `DEPOSITO`, `LEYENDA`, … son valores por defecto.
 */
export type PerfilFacturaCompraCompleto = Record<string, unknown> & {
  ID_CPA128: number;
  COD_PERFIL: string;
  DESCRIPCIO: string;
};

/**
 * Una imputación de un comprobante de compra a un centro de costo (u otro auxiliar, con
 * `todos`). Una fila por comprobante × cuenta × centro de costo.
 */
/** Debe coincidir con `ImputacionAuxiliar` del connector (`src/tango-web/centros-costo-compra.service.ts`). */
export interface ImputacionCentroCosto {
  /** `ID_CPA04` del comprobante. */
  idCpa04: number;
  codCuenta: string;
  /** `CC - CENTROS DE COSTO`, … */
  tipoAuxiliar: string;
  idAuxiliar: number;
  /** Código del centro de costo, el mismo del proceso 1656, p. ej. `99HUI`. Para cruzar datos, la clave segura es `idAuxiliar`. */
  codigo: string;
  descripcion: string;
  /** Porcentaje de apropiación: si una cuenta se reparte, una fila por centro. */
  porcentaje: number;
  debe: number;
  haber: number;
}

// --- Metadatos del connector ---

export type TipoProceso = 'CRUD' | 'LIVE' | 'EXEC' | 'PDF';

export interface ProcesoResumen {
  id: number;
  descripcion: string;
  modulo: string;
  path: string;
  tipo: TipoProceso;
  /** Endpoints que la key puede usar en este proceso. */
  endpoints: string[];
}

export interface ParametroEndpoint {
  nombre: string;
  origen: string;
  tipo: string;
  defecto: unknown;
  schema?: Record<string, unknown>;
}

export interface EndpointProceso {
  nombre: string;
  metodo: string;
  titulo: string;
  parametros: ParametroEndpoint[];
  /** Si el connector lo tiene habilitado (en esta etapa, solo lecturas). */
  habilitado: boolean;
  /** Si la key lo puede usar. */
  permitido: boolean;
}

export interface ProcesoDetalle extends Omit<ProcesoResumen, 'endpoints'> {
  endpoints: EndpointProceso[];
  /** Tablas y sus columnas. En los CRUD, la primera es la vista de `Get`. */
  tablas: Record<string, string[]>;
  catalogo: string;
}

export interface Campo {
  proceso: number;
  descripcion: string;
  modulo: string;
  tipo: string;
  tabla: string;
  principal: boolean;
  campo: string;
}

export interface Permisos {
  empresas: string[];
  procesos: Record<string, string[]>;
  filtroSql: boolean;
}

export interface Yo {
  plataforma: string;
  prefijo: string;
  permisos: Permisos;
  catalogo: string;
}

// --- Proveedores (alta y actualización, ADR 0004) ---

/** Alta a partir del CUIT: el resto lo completan ARCA y los valores por defecto de Tango. */
export interface EntradaAltaProveedor {
  /** Con o sin guiones; se controla el dígito verificador. */
  cuit: string;
  /** 22 dígitos; se controlan los dos verificadores. */
  cbu?: string;
  /** Hasta 30 caracteres. */
  descripcionCbu?: string;
  /**
   * Código de provincia de Tango (`COD_CPA57`, proceso 2728), p. ej. `"01"`. Hace falta cuando
   * ARCA no trae la provincia (la vista previa lo informa en `faltantes`); si viene, gana sobre ARCA.
   */
  codigoProvincia?: string;
}

export interface FaltanteProveedor {
  /** Campo de Tango, p. ej. `ID_CPA57`. */
  campo: string;
  comoResolver: string;
}

export interface VistaPreviaAltaProveedor {
  /** `true` si el alta se puede hacer tal cual. */
  listo: boolean;
  /** Lo que se mandaría a Tango. */
  cuerpo: Fila;
  /** Obligatorios que faltan: mostrarlos y pedirlos antes de confirmar. */
  faltantes: FaltanteProveedor[];
  avisos: string[];
  /** Lo que devolvió ARCA (por Tango). */
  arca: { razonSocial?: string; domicilio?: string; localidad?: string; codigoPostal?: string; idProvincia?: number; actividad?: string; categoriaIva?: string };
}

export interface AltaProveedor {
  /** `ID_CPA01`. `null` solo si Tango confirmó el alta sin devolver el ID (va un aviso). */
  id: number | null;
  /** `COD_CPA01`. */
  codigo: string;
  /** El registro como quedó en Tango (GetById). `null` si no se pudo leer (va un aviso). */
  proveedor: Fila | null;
  avisos: string[];
}

/**
 * Alta de un proveedor del exterior (CUIT país, 2026-10-28): sin ARCA. El connector aplica el modelo del
 * exterior: provincia 99 Exterior, RG 3685 X y 019, CITI I y B, "Aplica retenciones" destildado.
 */
export interface EntradaAltaProveedorExterior {
  /** Un CUIT país de ARCA (50, 51 o 55), con o sin guiones. */
  cuitPais: string;
  /** Hasta 60 caracteres. También nombre de fantasía y orden. */
  razonSocial: string;
  /** `EX` (por defecto) o `RI` (el raro que factura con IVA). */
  categoriaIva?: 'EX' | 'RI';
  cbu?: string;
  descripcionCbu?: string;
}

/**
 * Lo que se cambia; `null` borra el CBU o su descripción. Los datos fiscales van por su código de Tango
 * (el connector los traduce al ID de la empresa).
 */
export interface CambiosProveedor {
  cbu?: string | null;
  descripcionCbu?: string | null;
  /** RG 3685, tipo de operación (ej. `X`). */
  operacionAfip?: string;
  /** RG 3685, comprobante AFIP (ej. `019`). */
  comprobanteAfip?: string;
  /** Ej. `EX`. */
  categoriaIva?: string;
  citiOpera?: 'O' | 'E' | 'I';
  citiTipo?: 'B' | 'S' | 'N';
  /** Solo destildarla. */
  aplicaRetenciones?: false;
  habilitado?: boolean;
}

export interface ProveedorActualizado {
  id: number;
  /** `null` si el cambio se hizo pero no se pudo releer (va un aviso). */
  proveedor: Fila | null;
  /** Los campos de Tango que cambiaron (vacío: ya tenía esos valores y no se escribió). */
  cambios: string[];
  avisos: string[];
}

// --- Órdenes de pago (fichas 14162 y 14184 de la web) ---

/** Un comprobante relacionado de una factura, crédito o débito de compra (ficha 14162). */
export interface ComprobanteRelacionadoCompra {
  /** Del número: `O/P`, `FAC`, `N/C`, `N/D`… */
  tipo: string;
  /** `A0000100000011`, `0000100000795` (sin el tipo). */
  numero: string;
  /** `YYYY-MM-DD`. */
  fecha: string | null;
  /** `ID_CPA04` del relacionado: la orden de pago o el comprobante imputado. */
  idCpa04: number;
  /** `true` si es una orden de pago (que lo cancela); si no, un comprobante imputado (una nota a su factura, o la factura de una nota). */
  ordenDePago: boolean;
}

/**
 * Un comprobante de compra con sus relacionados (ficha 14162): las órdenes de pago que lo cancelan
 * y los comprobantes imputados (sin importe: la ficha no lo da). El saldo pendiente no está acá:
 * sale del Live 17696 (Pagos a realizar, `TOTAL_PENDIENTE_CTE`).
 */
export interface RelacionadosDeComprobanteCompra {
  idCpa04: number;
  /** `t_COMP`: `FAC`, `N/C`, `N/D`, `NCA`… */
  tipo: string;
  numero: string;
  /** `YYYY-MM-DD`. */
  fecha: string | null;
  /** `YYYY-MM-DD`: la fecha contable (2026-10-30), la del período en que se imputó. */
  fechaContable: string | null;
  /**
   * `estadO_CTE`. Factura: `PEN` (con saldo), `CAN` (cancelada, por OP o por notas), `PAG`. Nota:
   * `IMP` (imputada), `CTA` (a cuenta: sin imputar).
   */
  estado: string;
  proveedor: { idCpa01: number; codigo: string; razonSocial: string };
  /** `CTE` o `EXT`. */
  moneda: string;
  cotizacion: number | null;
  /** Total, positivo también en las notas. */
  total: number;
  totalExt: number | null;
  /** `estado`: `Pendiente` o `Pagado`, como lo muestra Tango. */
  vencimientos: { fecha: string | null; importe: number; estado: string }[];
  relacionados: ComprobanteRelacionadoCompra[];
  /**
   * Lo fiscal del comprobante, de su cabecera (2026-10-30): el CITI (tipo de operación y clasificación de la
   * compra, como los muestra Tango: `Importación`, `Bienes y Servicios`), el tipo de operación y el comprobante
   * AFIP de la RG 3685/4597 (código y descripción: `X` Importaciones del exterior, `019` Facturas de
   * exportación) y el CAI o CAE. `null` lo que no tiene.
   */
  fiscal: {
    tipoOperacion: string | null;
    clasificacionCiti: string | null;
    operacionRg3685: { codigo: string; descripcion: string } | null;
    comprobanteAfip: { codigo: string; descripcion: string } | null;
    caiCae: string | null;
  };
}

/** Una orden de pago que cancela una factura de compra. */
export interface OrdenDePagoDeFactura {
  /** `ID_CPA04` de la orden de pago: sirve para `ordenDePago` y `pdfDeOrdenDePago`. */
  idCpa04: number;
  /** `O/P`. */
  tipo: string;
  /** `0000100000795`. */
  numero: string;
  /** `YYYY-MM-DD`. */
  fecha: string | null;
  /** `IMP`, `ANU`… */
  estado: string;
  /** Anulada (`ANU`): no cuenta como pago, `importeCancelado` es 0. */
  anulada: boolean;
  /** Total de la orden de pago. */
  total: number;
  /** Lo que cancela de esta factura, en moneda corriente (menos que `total` si paga varias, o si es un pago parcial). */
  importeCancelado: number;
  importeCanceladoExt: number | null;
}

export interface ValorOrdenDePago {
  cuenta: string;
  descripcion: string;
  operacion: string | null;
  debe: number;
  haber: number;
  debeExt: number;
  haberExt: number;
}

/** La ficha de una orden de pago (14184). */
export interface OrdenDePago {
  idCpa04: number;
  tipo: string;
  numero: string;
  fecha: string | null;
  fechaContable: string | null;
  estado: string;
  /**
   * `cuit` y `cbu` salen del proveedor (3142), solo si la key tiene `3142:GetById`; faltan si no se
   * pudieron leer. El CBU es el **actual** del proveedor (el que imprime el PDF).
   */
  proveedor: { idCpa01: number; codigo: string; razonSocial: string; cuit?: string; cbu?: string };
  /** `CTE` o `EXT`. */
  moneda: string;
  cotizacion: number | null;
  total: number;
  totalExt: number | null;
  /** LEYENDA_1…5, sin las vacías. */
  leyendas: string[];
  observaciones: { comerciales: string | null; otras: string | null };
  /** El asiento: la cuenta del proveedor en el debe y las de pago en el haber. */
  valores: ValorOrdenDePago[];
  /** Las cuentas del haber de `valores`: con qué se pagó. Con retenciones o diferencias de cambio, sus cuentas también están. */
  pagadoCon: { cuenta: string; descripcion: string; importe: number }[];
  imputaciones: {
    /** `ID_CPA04` de la factura que cancela. */
    idCpa04Factura: number;
    tipo: string;
    numero: string;
    vencimiento: string | null;
    estado: string;
    moneda: string;
    cancelado: number;
    canceladoExt: number | null;
  }[];
  retenciones: { retencion: string; certificado: string | null; fecha: string | null; importe: number; certificadoRelacionado: string | null }[];
  /** Tal cual los da Tango (cheques y otros documentos). */
  documentos: Record<string, unknown>[];
  totales: { concepto: string; importe: number; importeExt: number | null }[];
  comprobantesRelacionados: { tipo: string; numero: string; fecha: string | null; idCpa04Factura: number | null }[];
  /** `fecha` tal cual la muestra Tango: `"07/10/26 - 15:23"`. */
  ingreso: { fecha: string | null; usuario: string | null };
}
