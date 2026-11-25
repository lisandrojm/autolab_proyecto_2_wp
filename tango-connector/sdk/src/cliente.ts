import { ErrorTango, mensajesDe, type RequestFallido } from './errores';
import { ZONA_POR_DEFECTO, fechaTango, filas } from './helpers';
import type {
  AltaProveedor,
  Campo,
  CambiosProveedor,
  EntradaAltaProveedor,
  EntradaAltaProveedorExterior,
  ConSignal,
  Fila,
  PaginaLeida,
  ParamsFiltro,
  ParamsGet,
  ParamsLive,
  ImputacionCentroCosto,
  OrdenDePago,
  OrdenDePagoDeFactura,
  RelacionadosDeComprobanteCompra,
  PerfilFacturaCompra,
  PerfilFacturaCompraCompleto,
  ProcesoDetalle,
  ProcesoResumen,
  ProveedorActualizado,
  RespuestaBase,
  RespuestaPdf,
  Pdf,
  RespuestaFiltro,
  RespuestaLista,
  RespuestaRegistro,
  TipoProceso,
  VistaPreviaAltaProveedor,
  Yo,
} from './tipos';

/** Un request con cuerpo. `reintentar: false` en las escrituras. */
interface Envio {
  metodo: 'POST' | 'PATCH';
  cuerpo: unknown;
  reintentar: boolean;
}

/** Tamaño de página por defecto: el máximo que acepta el connector. */
export const PAGE_SIZE_MAXIMO = 1000;

export interface Reintentos {
  /** Reintentos después del primer intento. 0 desactiva. */
  intentos: number;
  /** Espera antes del primer reintento; se duplica en cada uno. */
  esperaMs: number;
}

export interface OpcionesCliente {
  /** URL base del connector, con `/v1`. P. ej. `https://www.somoslumba.site/development/tango-connector/v1`. */
  url: string;
  /** API key de la plataforma. Usarla solo del lado del servidor. */
  apiKey: string;
  /** Servidor Tango (`tenant`), como está registrado en el connector. */
  tenant: string;
  /** La empresa: su slug en el connector (`fzero-srl`) o su Company ID de Tango (`3`). */
  empresa: string | number;
  /**
   * Si `true` (por defecto), una respuesta de Tango con `succeeded: false` lanza `ErrorTango`.
   * Si `false`, `get`, `getById`, `getByFilter` y `getApiLiveQueryData` la devuelven tal cual.
   * Lanzan siempre: los errores HTTP, los rechazos del connector, la red y los helpers de
   * paginación (`paginas`, `todas`, `todasLive`), para no devolver datos incompletos.
   */
  lanzarErrores?: boolean;
  /** Timeout por request, en ms. Por defecto 170000: menos que el corte de nginx (180 s). */
  timeoutMs?: number;
  /** Reintentos ante fallas de red o del túnel (502, 504, y 5xx que no vengan del connector). Por defecto 2, desde 1 s. */
  reintentos?: Reintentos;
  /** Zona horaria en la que se interpretan los `Date`. Por defecto, Argentina. */
  zonaHoraria?: string;
  /** Tope de páginas de `paginas()`, por si Tango no informara el fin. Por defecto 10.000. */
  maxPaginas?: number;
  /** `fetch` a usar. Por defecto, el global (Node 18.17+). */
  fetch?: typeof fetch;
}

type Opciones = Required<OpcionesCliente>;
type Query = Record<string, string | number | undefined>;

/** Lo que vuelve de un request, con el body ya leído (dentro del timeout). */
interface Respuesta {
  status: number;
  headers: Headers;
  texto: string;
}

/** 502 y 504 pueden ser el túnel o Tango que no responde: se reintentan siempre. */
const STATUS_REINTENTABLES = new Set([502, 504]);

/**
 * Un nombre de Tango usable como archivo. Tango arma el nombre con el tipo de comprobante, y
 * en las notas de crédito y débito trae `/` (`N/C-A0000200000085.pdf`).
 */
function nombreDeArchivo(nombre: string): string {
  return nombre.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

/** Base64 → bytes, sin depender de `Buffer` (Node) ni de `atob` en un solo entorno. */
function base64ABytes(base64: string): Uint8Array {
  const B = (globalThis as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer;
  if (B) return new Uint8Array(B.from(base64, 'base64'));
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function entero(valor: number | undefined, defecto: number, nombre: string, minimo = 1): number {
  if (valor === undefined) return defecto;
  if (!Number.isInteger(valor) || valor < minimo) throw new Error(`${nombre} tiene que ser un entero >= ${minimo}`);
  return valor;
}

/**
 * Cliente del tango-connector. Los métodos se llaman como los endpoints de Tango y reciben
 * sus mismos parámetros (ADR 0002). Lo que se agrega: tipos, errores con el detalle real,
 * reintentos y helpers para traer todas las páginas.
 */
export class TangoConnector {
  private readonly opciones: Opciones;

  constructor(opciones: OpcionesCliente) {
    const f = opciones.fetch ?? globalThis.fetch;
    if (!f) throw new Error('No hay fetch disponible: pasar opciones.fetch (Node < 18)');
    if (!opciones.url || !opciones.apiKey || !opciones.tenant || opciones.empresa === undefined || opciones.empresa === '') {
      throw new Error('Faltan opciones: url, apiKey, tenant y empresa son obligatorias');
    }
    // `??` y no spread: una opción pasada como `undefined` no pisa el valor por defecto.
    this.opciones = {
      url: opciones.url.replace(/\/+$/, ''),
      apiKey: opciones.apiKey,
      tenant: opciones.tenant,
      empresa: opciones.empresa,
      lanzarErrores: opciones.lanzarErrores ?? true,
      timeoutMs: entero(opciones.timeoutMs, 170_000, 'timeoutMs'),
      reintentos: {
        intentos: entero(opciones.reintentos?.intentos, 2, 'reintentos.intentos', 0),
        esperaMs: entero(opciones.reintentos?.esperaMs, 1000, 'reintentos.esperaMs', 0),
      },
      zonaHoraria: opciones.zonaHoraria ?? ZONA_POR_DEFECTO,
      maxPaginas: entero(opciones.maxPaginas, 10_000, 'maxPaginas'),
      fetch: f,
    };
  }

  /** El mismo cliente, para otra empresa (o servidor). */
  conEmpresa(empresa: string | number, tenant = this.opciones.tenant): TangoConnector {
    return new TangoConnector({ ...this.opciones, tenant, empresa });
  }

  // --- Endpoints de Tango ---

  /** `Api/Get`: lista paginada de un CRUD. Con `view` vacío trae todas las columnas. */
  get<T = Fila>(process: number, params: ParamsGet = {}): Promise<RespuestaLista<T>> {
    return this.tango('Get', this.queryGet(process, params), params.signal, this.opciones.lanzarErrores);
  }

  /** `Api/GetById`: un registro con sus sub-tablas. */
  getById<T = Fila>(process: number, id: number, params: ConSignal = {}): Promise<RespuestaRegistro<T>> {
    return this.tango('GetById', { process, id }, params.signal, this.opciones.lanzarErrores);
  }

  /**
   * `Api/GetByFilter`: `filtroSql` es un `WHERE` de SQL Server sobre la vista
   * (`"WHERE N_CUIT = '30-12345678-9'"`). No pagina: trae todas las filas que cumplen.
   * Requiere el permiso `filtroSql` en la key. Para armar valores, usar `sql()` y `sqlLike()`.
   */
  getByFilter<T = Fila>(process: number, filtroSql: string, params: ParamsFiltro = {}): Promise<RespuestaFiltro<T>> {
    return this.tango(
      'GetByFilter',
      { process, view: params.view ?? '', filtroSql },
      params.signal,
      this.opciones.lanzarErrores,
    );
  }

  /** `Api/GetApiLiveQueryData`: consulta Live. Mandar siempre el rango de fechas. */
  getApiLiveQueryData<T = Fila>(process: number, params: ParamsLive = {}): Promise<RespuestaLista<T>> {
    return this.tango('GetApiLiveQueryData', this.queryLive(process, params), params.signal, this.opciones.lanzarErrores);
  }

  /**
   * `Api/GetPdf`: el PDF de un comprobante, en base64 dentro de `fileResult`. `id` es el ID
   * interno del comprobante (en 14184, órdenes de pago, el `ID_CPA04`). Para los bytes, `pdf()`.
   */
  getPdf(process: number, id: number, params: ConSignal = {}): Promise<RespuestaPdf> {
    return this.tango('GetPdf', { process, id }, params.signal, this.opciones.lanzarErrores);
  }

  // --- Helpers ---

  /**
   * Recorre todas las páginas de `Get` (CRUD) o de `GetApiLiveQueryData` (LIVE), de a
   * `PAGE_SIZE_MAXIMO`. Una página por iteración, con su posición para mostrar progreso:
   *
   *   for await (const p of tango.paginas('LIVE', 10091, { fromDate, toDate })) {
   *     console.log(`${p.pageIndex + 1}/${p.totalPages}`, p.filas.length);
   *   }
   *
   * Lanza siempre ante un error (aunque `lanzarErrores` sea `false`), si Tango repite una
   * página, y si `totalCount` cambia mientras se lee (los datos cambiaron: volver a leer).
   */
  paginas<T = Fila>(tipo: 'CRUD', process: number, params?: Omit<ParamsGet, 'pageIndex'>): AsyncGenerator<PaginaLeida<T>, void, undefined>;
  paginas<T = Fila>(tipo: 'LIVE', process: number, params?: Omit<ParamsLive, 'pageIndex'>): AsyncGenerator<PaginaLeida<T>, void, undefined>;
  async *paginas<T = Fila>(
    tipo: Extract<TipoProceso, 'CRUD' | 'LIVE'>,
    process: number,
    params: Omit<ParamsGet, 'pageIndex'> | Omit<ParamsLive, 'pageIndex'> = {},
  ): AsyncGenerator<PaginaLeida<T>, void, undefined> {
    const pageSize = params.pageSize ?? PAGE_SIZE_MAXIMO;
    let totalInicial: number | undefined;
    let paginaAnterior: string | undefined;

    for (let pageIndex = 0; ; pageIndex++) {
      const endpoint = tipo === 'CRUD' ? 'Get' : 'GetApiLiveQueryData';
      const query =
        tipo === 'CRUD'
          ? this.queryGet(process, { ...(params as ParamsGet), pageSize, pageIndex })
          : this.queryLive(process, { ...(params as ParamsLive), pageSize, pageIndex });
      const r = await this.tango<RespuestaLista<T>>(endpoint, query, params.signal, true);
      const rd = r.resultData ?? undefined;
      const lista = filas(r);
      const request = this.request(`/tango/${this.ruta()}/${endpoint}`, query);

      if (rd?.totalCount !== undefined) {
        if (totalInicial === undefined) totalInicial = rd.totalCount;
        else if (rd.totalCount !== totalInicial) {
          throw new ErrorTango('tango', 200, [
            `Los datos cambiaron mientras se leían (totalCount ${totalInicial} → ${rd.totalCount}): volver a leer`,
          ], r, request);
        }
      }
      // Si Tango ignorara pageIndex, devolvería siempre la misma página: se corta con error.
      if (lista.length) {
        const pagina = JSON.stringify(lista);
        if (pagina === paginaAnterior) {
          throw new ErrorTango('tango', 200, [`Tango devolvió la misma página dos veces (pageIndex ${pageIndex})`], undefined, request);
        }
        paginaAnterior = pagina;
      }

      if (lista.length) {
        yield { filas: lista, pageIndex, pageSize, totalCount: rd?.totalCount, totalPages: rd?.totalPages };
      }

      const hayMas = rd
        ? rd.hasNextPage !== false && (rd.totalPages === undefined || pageIndex + 1 < rd.totalPages)
        : lista.length === pageSize;
      if (!hayMas || lista.length === 0) return;
      if (pageIndex + 1 >= this.opciones.maxPaginas) {
        throw new ErrorTango('connector', 0, [`Se superó maxPaginas (${this.opciones.maxPaginas})`], undefined, request);
      }
    }
  }

  /**
   * El PDF de un comprobante como bytes, con el nombre que le da Tango:
   *
   *   const { nombre, bytes } = await tango.pdf(14184, 58877);
   *   await fs.writeFile(nombre, bytes);
   *
   * Lanza siempre si Tango no devuelve el PDF (p. ej. "Registro inexistente").
   */
  async pdf(process: number, id: number, params: ConSignal = {}): Promise<Pdf> {
    const ruta = `/tango/${this.ruta()}/GetPdf`;
    const r = await this.tango<RespuestaPdf>('GetPdf', { process, id }, params.signal, true);
    const archivo = r.fileResult;
    if (!archivo?.fileContents) {
      throw new ErrorTango('tango', 200, ['Tango no devolvió el PDF (fileResult vacío)'], r, this.request(ruta, { process, id }));
    }
    const nombreOriginal = archivo.fileDownloadName || `${process}-${id}.pdf`;
    return { nombre: nombreDeArchivo(nombreOriginal), nombreOriginal, bytes: base64ABytes(archivo.fileContents) };
  }

  /** Todas las filas de un CRUD (`Get`, todas las páginas). */
  async todas<T = Fila>(process: number, params: Omit<ParamsGet, 'pageIndex'> = {}): Promise<T[]> {
    const todas: T[] = [];
    for await (const p of this.paginas<T>('CRUD', process, params)) todas.push(...p.filas);
    return todas;
  }

  /** Todas las filas de una consulta Live (`GetApiLiveQueryData`, todas las páginas). */
  async todasLive<T = Fila>(process: number, params: Omit<ParamsLive, 'pageIndex'> = {}): Promise<T[]> {
    const todas: T[] = [];
    for await (const p of this.paginas<T>('LIVE', process, params)) todas.push(...p.filas);
    return todas;
  }

  // --- Datos de la web de Tango (ADR 0003) ---

  /**
   * Perfiles de factura de compra de la empresa (`CPA128`). No están en la API de Tango: el
   * connector los lee de la web. Requiere el permiso `27:PerfilesDeFacturaDeCompra` en la key.
   */
  perfilesDeFacturaDeCompra(params: ConSignal = {}): Promise<PerfilFacturaCompra[]> {
    return this.json<PerfilFacturaCompra[]>(`/tango/${this.ruta()}/perfiles-de-factura-de-compra`, {}, params.signal);
  }

  /** Un perfil completo: qué edita, muestra u oculta, y sus valores por defecto. */
  perfilDeFacturaDeCompra(id: number, params: ConSignal = {}): Promise<PerfilFacturaCompraCompleto> {
    return this.json<PerfilFacturaCompraCompleto>(`/tango/${this.ruta()}/perfiles-de-factura-de-compra/${id}`, {}, params.signal);
  }

  /**
   * Centros de costo reales (el auxiliar de la imputación, no la leyenda) de comprobantes de
   * compra ya cargados, por `ID_CPA04`: hasta 50 por pedido. Con `todos: true`, también los
   * demás tipos de auxiliar. Requiere el permiso `-14024:CentrosDeCostoDeComprobantesDeCompra`.
   */
  async centrosDeCostoDeComprobantesDeCompra(
    idCpa04: number[],
    params: ConSignal & { todos?: boolean } = {},
  ): Promise<ImputacionCentroCosto[]> {
    if (!idCpa04.length) return [];
    if (idCpa04.length > 50) throw new Error('Hasta 50 comprobantes por pedido: partir el pedido');
    return this.json<ImputacionCentroCosto[]>(
      `/tango/${this.ruta()}/centros-de-costo-de-comprobantes-de-compra`,
      { idCpa04: idCpa04.join(','), todos: params.todos ? 'true' : undefined },
      params.signal,
    );
  }

  // --- Órdenes de pago ---

  /**
   * Las órdenes de pago que cancelan una factura de compra (`ID_CPA04`), con lo que cancela cada
   * una. `[]` si no tiene. Requiere el permiso `14162:OrdenesDePagoDeFacturaDeCompra`.
   */
  ordenesDePagoDeFacturaDeCompra(idCpa04: number, params: ConSignal = {}): Promise<OrdenDePagoDeFactura[]> {
    return this.json<OrdenDePagoDeFactura[]>(`/tango/${this.ruta()}/facturas-de-compra/${idCpa04}/ordenes-de-pago`, {}, params.signal);
  }

  /**
   * Un comprobante de compra (factura, crédito o débito, `ID_CPA04`) con su estado, sus
   * vencimientos y sus relacionados: las órdenes de pago y los comprobantes imputados (una nota a
   * su factura). Requiere `14162:ComprobantesRelacionadosDeCompra`.
   */
  relacionadosDeComprobanteDeCompra(idCpa04: number, params: ConSignal = {}): Promise<RelacionadosDeComprobanteCompra> {
    return this.json<RelacionadosDeComprobanteCompra>(`/tango/${this.ruta()}/facturas-de-compra/${idCpa04}/relacionados`, {}, params.signal);
  }

  /**
   * La ficha de una orden de pago (`ID_CPA04`): cabecera, leyendas, observaciones, valores (y
   * `pagadoCon`), imputaciones, retenciones y totales. Requiere `14184:OrdenDePago`.
   */
  ordenDePago(idCpa04: number, params: ConSignal = {}): Promise<OrdenDePago> {
    return this.json<OrdenDePago>(`/tango/${this.ruta()}/ordenes-de-pago/${idCpa04}`, {}, params.signal);
  }

  /** El PDF de una orden de pago: `pdf(14184, idCpa04)`. Requiere `GetPdf` (incluido en `*`). */
  pdfDeOrdenDePago(idCpa04: number, params: ConSignal = {}): Promise<Pdf> {
    return this.pdf(14184, idCpa04, params);
  }

  // --- Proveedores (ADR 0004) ---

  /**
   * Arma el alta sin escribir: los datos de ARCA, lo que se mandaría a Tango, los obligatorios
   * que faltan y los avisos. Para mostrarlo y pedir lo que falte (p. ej. `codigoProvincia`).
   * Requiere el permiso `3142:AltaDeProveedor`.
   */
  vistaPreviaAltaProveedor(entrada: EntradaAltaProveedor, params: ConSignal = {}): Promise<VistaPreviaAltaProveedor> {
    return this.json<VistaPreviaAltaProveedor>(`/tango/${this.ruta()}/proveedores/vista-previa`, {}, params.signal, { metodo: 'POST', cuerpo: entrada, reintentar: true });
  }

  /**
   * Da de alta un proveedor a partir del CUIT. **No se reintenta solo**: si da timeout, el alta
   * pudo haberse guardado; consultar por CUIT antes de repetir (repetirla da 409).
   * Requiere el permiso `3142:AltaDeProveedor`.
   */
  altaProveedor(entrada: EntradaAltaProveedor, params: ConSignal = {}): Promise<AltaProveedor> {
    return this.json<AltaProveedor>(`/tango/${this.ruta()}/proveedores`, {}, params.signal, { metodo: 'POST', cuerpo: entrada, reintentar: false });
  }

  /** Arma el alta de un proveedor del exterior sin escribir (409 si ya existe). Requiere `3142:AltaDeProveedor`. */
  vistaPreviaAltaProveedorExterior(entrada: EntradaAltaProveedorExterior, params: ConSignal = {}): Promise<VistaPreviaAltaProveedor> {
    return this.json<VistaPreviaAltaProveedor>(`/tango/${this.ruta()}/proveedores/exterior/vista-previa`, {}, params.signal, { metodo: 'POST', cuerpo: entrada, reintentar: true });
  }

  /**
   * Da de alta un proveedor del exterior (CUIT país y razón social, con el modelo del exterior). **No se
   * reintenta solo**: si da timeout, buscarlo antes de repetir. Requiere `3142:AltaDeProveedor`.
   */
  altaProveedorExterior(entrada: EntradaAltaProveedorExterior, params: ConSignal = {}): Promise<AltaProveedor> {
    return this.json<AltaProveedor>(`/tango/${this.ruta()}/proveedores/exterior`, {}, params.signal, { metodo: 'POST', cuerpo: entrada, reintentar: false });
  }

  /**
   * Cambia el CBU y/o los datos fiscales (ver CambiosProveedor). Sin cambios reales no escribe. No se
   * reintenta solo. Requiere `3142:ActualizarProveedor`.
   */
  actualizarProveedor(id: number, cambios: CambiosProveedor, params: ConSignal = {}): Promise<ProveedorActualizado> {
    return this.json<ProveedorActualizado>(`/tango/${this.ruta()}/proveedores/${id}`, {}, params.signal, { metodo: 'PATCH', cuerpo: cambios, reintentar: false });
  }

  // --- Metadatos ---

  readonly meta = {
    /** La key: plataforma y permisos. */
    yo: () => this.json<Yo>('/meta/yo'),
    /** Los procesos que la key puede usar. */
    procesos: (filtros: { tipo?: TipoProceso; modulo?: string; buscar?: string } = {}) =>
      this.json<ProcesoResumen[]>('/meta/procesos', filtros),
    /** Endpoints con sus parámetros y schemas, y las columnas de cada tabla. */
    proceso: (id: number) => this.json<ProcesoDetalle>(`/meta/procesos/${id}`),
    /** En qué procesos y tablas está un campo. */
    campos: (buscar: string) => this.json<Campo[]>('/meta/campos', { buscar }),
  };

  // --- Interno ---

  private queryGet(process: number, params: ParamsGet): Query {
    return {
      process,
      pageSize: params.pageSize ?? PAGE_SIZE_MAXIMO,
      pageIndex: params.pageIndex ?? 0,
      view: params.view ?? '',
    };
  }

  private queryLive(process: number, params: ParamsLive): Query {
    const z = this.opciones.zonaHoraria;
    return {
      process,
      fromDate: params.fromDate === undefined ? '' : fechaTango(params.fromDate, z),
      toDate: params.toDate === undefined ? '' : fechaTango(params.toDate, z),
      pageSize: params.pageSize ?? PAGE_SIZE_MAXIMO,
      pageIndex: params.pageIndex ?? 0,
      customQuery: params.customQuery ?? 0,
    };
  }

  private ruta(): string {
    return `${encodeURIComponent(this.opciones.tenant)}/${encodeURIComponent(String(this.opciones.empresa))}`;
  }

  private request(ruta: string, query: Query): RequestFallido {
    return {
      ruta,
      tenant: this.opciones.tenant,
      empresa: String(this.opciones.empresa),
      query: Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])),
    };
  }

  private async tango<R extends RespuestaBase>(endpoint: string, query: Query, signal: AbortSignal | undefined, lanzar: boolean): Promise<R> {
    const ruta = `/tango/${this.ruta()}/${endpoint}`;
    const r = await this.json<R>(ruta, query, signal);
    if (lanzar && r.succeeded === false) {
      throw new ErrorTango('tango', 200, mensajesDe(r), r, this.request(ruta, query));
    }
    return r;
  }

  private async json<R>(ruta: string, query: Query = {}, signal?: AbortSignal, envio?: Envio): Promise<R> {
    return this.parsear<R>(await this.pedir(ruta, query, signal, envio), ruta, query);
  }

  /** El body como JSON. Cualquier problema (vacío, no JSON, HTTP de error) es un `ErrorTango`. */
  private parsear<R>(r: Respuesta, ruta: string, query: Query): R {
    const request = this.request(ruta, query);
    const origen = this.origen(r.headers);
    const texto = r.texto;
    let cuerpo: unknown;
    try {
      cuerpo = texto ? JSON.parse(texto) : undefined;
    } catch {
      throw new ErrorTango(origen, r.status, [`Respuesta no JSON (HTTP ${r.status})`], texto.slice(0, 500), request);
    }
    if (r.status >= 400) {
      const mensajes = mensajesDe(cuerpo as RespuestaBase);
      throw new ErrorTango(origen, r.status, mensajes.length ? mensajes : [`HTTP ${r.status}`], cuerpo, request);
    }
    if (cuerpo === undefined || cuerpo === null || typeof cuerpo !== 'object') {
      throw new ErrorTango(origen, r.status, [`Respuesta vacía o inesperada (HTTP ${r.status})`], cuerpo, request);
    }
    return cuerpo as R;
  }

  /** Un request con reintentos. Devuelve la respuesta con el body ya leído. */
  private async pedir(ruta: string, query: Query, signal: AbortSignal | undefined, envio?: Envio): Promise<Respuesta> {
    const { esperaMs } = this.opciones.reintentos;
    // Las escrituras no se reintentan: un intento que se cortó pudo haber escrito en Tango.
    const intentos = envio && !envio.reintentar ? 0 : this.opciones.reintentos.intentos;
    for (let intento = 0; ; intento++) {
      try {
        const r = await this.unIntento(ruta, query, signal, envio);
        // Escritura: la respuesta del connector se devuelve tal cual (trae el motivo). Solo un 5xx
        // de nginx o del túnel es "red", y nunca reintentable: no se sabe si se escribió.
        if (envio && !envio.reintentar) {
          if (r.status >= 500 && !r.headers.get('x-connector-origin')) {
            throw new ErrorTango('red', r.status, [`El connector o el túnel no respondieron bien (HTTP ${r.status}): la escritura pudo haberse hecho`], r.texto?.slice(0, 500), this.request(ruta, query), false);
          }
          return r;
        }
        if (this.reintentable(r) && intento < intentos) {
          await this.esperar(esperaMs * 2 ** intento, signal);
          continue;
        }
        if (this.reintentable(r)) {
          throw new ErrorTango('red', r.status, [`El connector o el túnel no respondieron bien (HTTP ${r.status})`], r.texto?.slice(0, 500), this.request(ruta, query), true);
        }
        return r;
      } catch (error) {
        if (error instanceof ErrorTango && error.reintentable && intento < intentos) {
          await this.esperar(esperaMs * 2 ** intento, signal);
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * 502/504, o un 5xx que no viene del connector (nginx, el túnel). Un 503 del connector es
   * configuración (p. ej. sin usuario web): reintentar no lo arregla.
   */
  private reintentable(r: Respuesta): boolean {
    return STATUS_REINTENTABLES.has(r.status) || (r.status >= 500 && !r.headers.get('x-connector-origin'));
  }

  private async unIntento(ruta: string, query: Query, externo: AbortSignal | undefined, envio?: Envio): Promise<Respuesta> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined) qs.append(k, String(v));
    const url = `${this.opciones.url}${ruta}${qs.size ? `?${qs}` : ''}`;
    const request = this.request(ruta, query);

    if (externo?.aborted) throw new ErrorTango('cancelado', 0, ['Cancelado por la plataforma'], undefined, request);
    // Timeout + signal externo combinados a mano (AbortSignal.any recién está en Node 20.3).
    const control = new AbortController();
    let porTimeout = false;
    const timer = setTimeout(() => {
      porTimeout = true;
      control.abort();
    }, this.opciones.timeoutMs);
    const alCancelar = () => control.abort();
    externo?.addEventListener('abort', alCancelar, { once: true });

    try {
      const headers: Record<string, string> = { 'X-Api-Key': this.opciones.apiKey, Accept: 'application/json' };
      if (envio) headers['Content-Type'] = 'application/json';
      const r = await this.opciones.fetch(url, {
        method: envio?.metodo ?? 'GET',
        headers,
        body: envio ? JSON.stringify(envio.cuerpo) : undefined,
        signal: control.signal,
      });
      // El body se lee dentro del mismo timeout: un corte a mitad del body también es un ErrorTango.
      return { status: r.status, headers: r.headers, texto: await r.text() };
    } catch (error) {
      if (externo?.aborted) throw new ErrorTango('cancelado', 0, ['Cancelado por la plataforma'], undefined, request, false, { cause: error });
      const mensaje = porTimeout
        ? `El connector no respondió en ${this.opciones.timeoutMs / 1000} s`
        : 'No se pudo conectar con el connector';
      // En una escritura no se sabe si llegó: no es reintentable.
      const escritura = Boolean(envio && !envio.reintentar);
      throw new ErrorTango('red', 0, escritura ? [mensaje, 'La escritura pudo haberse hecho'] : [mensaje], undefined, request, !escritura, { cause: error });
    } finally {
      clearTimeout(timer);
      externo?.removeEventListener('abort', alCancelar);
    }
  }

  private esperar(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new ErrorTango('cancelado', 0, ['Cancelado por la plataforma']));
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', alCancelar);
        resolve();
      }, ms);
      const alCancelar = () => {
        clearTimeout(timer);
        reject(new ErrorTango('cancelado', 0, ['Cancelado por la plataforma']));
      };
      signal?.addEventListener('abort', alCancelar, { once: true });
    });
  }

  private origen(headers: Headers): 'tango' | 'connector' {
    return headers.get('x-connector-origin') === 'tango' ? 'tango' : 'connector';
  }
}
