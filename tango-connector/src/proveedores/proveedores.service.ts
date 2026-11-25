import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { CatalogoService } from '../catalogo/catalogo.service';
import { ErrorConnector } from '../comun/errores';
import { Locks } from '../comun/locks';
import { AuditoriaEscritura, type ApiKey } from '../database/entidades';
import { TangoClient } from '../tango/tango.client';
import { SesionesWebService } from '../tango-web/sesiones-web.service';
import type { DestinoTango } from '../tenants/tenants.service';
import { razonSocialClave, type CambiosProveedor, type EntradaAlta, type EntradaAltaExterior } from './validaciones';

/** Proceso de Proveedores en Tango. */
export const PROCESO_PROVEEDORES = 3142;
/** Proceso de Provincias (Compras): traduce el código de provincia al ID de cada empresa. */
const PROCESO_PROVINCIAS = 2728;

/**
 * Obligatorios reales del alta (Tango exige más de lo que dice el schema): los 10 relevados en
 * la prueba de escritura, más el CUIT y los dos del RG 3685. Se controlan antes de llamar a Tango.
 */
export const OBLIGATORIOS: Record<string, string> = {
  COD_CPA01: 'Código del proveedor: lo propone Tango (GetDefaultValues)',
  NOM_PROVEE: 'Razón social: la trae ARCA',
  N_CUIT: 'CUIT',
  ID_CPA57: 'Provincia: la trae ARCA o se indica con codigoProvincia (código de Tango, proceso 2728)',
  ID_TIPO_DOCUMENTO_GV: 'Tipo de documento: valor por defecto de Tango',
  ID_CATEGORIA_IVA_COND_IVA: 'Categoría de IVA: la trae ARCA',
  EDITA_COMPROBANTE_REFERENCIA_REMITO: 'Valor por defecto de Tango',
  MON_CTE_HA: 'Valor por defecto de Tango',
  NUM_AUTOMA: 'Valor por defecto de Tango',
  CITI_OPERA: 'Valor por defecto de Tango',
  CITI_TIPO: 'Valor por defecto de Tango',
  ID_OPERACION_AFIP_RG_3685_TIPO_OPERACION_COMPRAS: 'RG 3685: el primero de la lista de tipos de operación',
  ID_TIPO_COMPROBANTE_AFIP_RG_3685_COMPROBANTE_COMPRAS: 'RG 3685: el primero de la lista de comprobantes AFIP',
};

export interface Faltante {
  campo: string;
  comoResolver: string;
}

export interface VistaPrevia {
  /** `true` si se puede dar el alta tal cual. */
  listo: boolean;
  /** Lo que se mandaría a `Api/Create`. */
  cuerpo: Record<string, unknown>;
  faltantes: Faltante[];
  avisos: string[];
  /** Lo que devolvió ARCA (por Tango), para mostrarlo antes de confirmar. */
  arca: { razonSocial?: string; domicilio?: string; localidad?: string; codigoPostal?: string; idProvincia?: number; actividad?: string; categoriaIva?: string };
}

interface RespuestaWeb<T> {
  data?: T;
  succeeded?: boolean;
  message?: string | null;
  exceptionInfo?: { messages?: string[] } | null;
}

interface RespuestaApi {
  succeeded?: boolean;
  message?: string | null;
  exceptionInfo?: { messages?: string[] } | null;
  savedId?: number;
  value?: Record<string, unknown> | null;
  list?: Record<string, unknown>[];
  resultData?: { list?: Record<string, unknown>[] } | null;
}

const detalle = (r: RespuestaApi | RespuestaWeb<unknown> | undefined) =>
  (r?.exceptionInfo?.messages ?? []).filter(Boolean).join(' | ') || r?.message || 'sin detalle';

/** Cuerpo de `processresolver/execute` del proceso de Proveedores. */
export const cuerpoEjecutar = (metodo: string, data: unknown) => ({ processNumber: String(PROCESO_PROVEEDORES), method: metodo, data });

/** `data` de `ActualizaAutomaticamenteCuit`, como lo manda la web al salir del campo CUIT. */
export const cuerpoConsultaArca = (defaults: Record<string, unknown>, cuit: string) => ({
  iD_CPA01: -1,
  iD_TIPO_DOCUMENTO_GV: defaults.iD_TIPO_DOCUMENTO_GV ?? null,
  n_CUIT: cuit,
  noM_PROVEE: null, domicilio: null, localidad: null, c_POSTAL: null, orden: null, noM_FANT: null, iD_CPA57: null,
  iD_CATEGORIA_IVA_COND_IVA: defaults.iD_CATEGORIA_IVA_COND_IVA ?? null,
  calcU_RET: defaults.calcU_RET ?? null,
  codigo: defaults.codigo ?? null,
  domiciliO_COMERCIAL: null, n_IVA: null, retenciones: [], confirmA_ACTUALIZACION_AFIP: false, cpA57: null,
});

/** Cuerpo de `processresolver/getdatalookup`: primera página de una lista de la web. */
export const cuerpoLista = (lookup: string) => ({
  lookup, pageIndex: 0, needTotalCount: true, filter: null, columns: null, serverFilterLookupData: null, invertFilter: false, prioritizeKey: false,
});

/**
 * Las listas de la ficha de Proveedores con las que se traduce un código de Tango al ID de cada empresa
 * (relevadas en PRUEBAS FZERO el 2026-10-28, scripts/web/sonda-proveedores-exterior.ts).
 */
export const LISTAS = {
  operacionAfip: { lookup: 'OperacionAfipComprasLookup', id: 'iD_OPERACION_AFIP_COMPRAS', codigo: 'coD_OPERACION_AFIP_COMPRAS' },
  comprobanteAfip: { lookup: 'TipoComprobanteAfipHabilitadoCompraLookup', id: 'iD_TIPO_COMPROBANTE_AFIP', codigo: 'coD_TIPO_COMPROBANTE_AFIP' },
  categoriaIva: { lookup: 'CategoriaIvaExcluyeExeSncLookup', id: 'iD_CATEGORIA_IVA', codigo: 'coD_CATEGORIA_IVA' },
} as const;
type Lista = (typeof LISTAS)[keyof typeof LISTAS];

/** El modelo de un proveedor del exterior (docs/tango/alta-proveedores.md, "Proveedores del exterior"). */
export const MODELO_EXTERIOR = {
  codigoProvincia: '99',
  operacionAfip: 'X',
  comprobanteAfip: '019',
  citiOpera: 'I',
  citiTipo: 'B',
} as const;

/** La fecha de hoy en la Argentina (AAAA-MM-DD), para las fechas de Tango. */
const hoyEnArgentina = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });

/** El mismo valor, como lo devuelve Tango (null y vacío son lo mismo; una fecha, con o sin hora). */
const mismoValor = (a: unknown, b: unknown) => {
  const texto = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v).replace(/T00:00:00(\.0+)?Z?$/, ''));
  return texto(a) === texto(b);
};

/** Un lock por servidor y empresa (no por el slug de la URL, que puede variar). */
const claveLock = (destino: DestinoTango) => `${destino.urlBase}:${destino.tangoCompanyId}`;

/** Busca el CUIT con y sin guiones: hay registros viejos cargados sin guiones. */
const filtroCuit = (cuit: string) => `WHERE REPLACE(N_CUIT, '-', '') = '${cuit.replace(/\D/g, '')}'`;

/** `iD_CPA57` → `ID_CPA57`: los nombres de la web en mayúsculas son los campos de la API. */
const aCampoApi = (clave: string) => clave.toUpperCase();

/**
 * Alta y actualización de proveedores (ADR 0004). Combina la sesión web (valores por defecto,
 * datos de ARCA y listas, que la API no tiene) con la API pública para escribir.
 */
@Injectable()
export class ProveedoresService {
  private readonly logger = new Logger(ProveedoresService.name);
  private readonly locks = new Locks();
  private readonly provincias = new Map<string, { hasta: number; porCodigo: Map<string, number> }>();
  private readonly listas = new Map<string, { hasta: number; porCodigo: Map<string, number> }>();

  constructor(
    private readonly web: SesionesWebService,
    private readonly tango: TangoClient,
    private readonly catalogo: CatalogoService,
    @InjectRepository(AuditoriaEscritura) private readonly auditoria: Repository<AuditoriaEscritura>,
  ) {}

  /** Arma el alta sin escribir. */
  async vistaPrevia(tenant: string, destino: DestinoTango, entrada: EntradaAlta): Promise<VistaPrevia> {
    await this.exigirCuitLibre(destino, entrada.cuit);
    return this.preparar(tenant, destino, entrada);
  }

  /** Da de alta el proveedor. Las altas de una misma empresa van de a una (lock). */
  async alta(tenant: string, destino: DestinoTango, entrada: EntradaAlta, apiKey: ApiKey) {
    return this.locks.con(claveLock(destino), async () => {
      await this.exigirCuitLibre(destino, entrada.cuit);
      const vista = await this.preparar(tenant, destino, entrada);
      if (!vista.listo) {
        throw new ErrorConnector(HttpStatus.UNPROCESSABLE_ENTITY, 'Faltan datos obligatorios para el alta', [
          ...vista.faltantes.map((f) => `${f.campo}: ${f.comoResolver}`),
          ...vista.avisos,
        ]);
      }
      const codigo = String(vista.cuerpo.COD_CPA01);
      const conCodigo = await this.buscar(destino, `WHERE COD_CPA01 = '${codigo.replace(/'/g, "''")}'`);
      if (conCodigo.length) {
        throw new ErrorConnector(HttpStatus.CONFLICT, `El código ${codigo} que propuso Tango ya existe`, [
          `Lo tiene el proveedor ${String(conCodigo[0].ID_CPA01)}. Revisar la numeración automática en Tango`,
        ]);
      }

      const r = await this.escribir(apiKey, tenant, destino, 'AltaDeProveedor', null, vista.cuerpo, 'POST', 'Create', vista.cuerpo, [
        `Buscar el CUIT ${entrada.cuit} antes de repetir el alta: si se guardó, repetirla da 409`,
      ]);
      if (!r.succeeded) {
        await this.auditar(apiKey, tenant, destino, 'AltaDeProveedor', null, vista.cuerpo, 'error', detalle(r));
        throw new ErrorConnector(HttpStatus.BAD_GATEWAY, 'Tango rechazó el alta', [detalle(r)]);
      }
      const avisos = [...vista.avisos];
      // Tango dijo que sí: sin savedId, el ID se busca por CUIT. No se informa como error.
      let id: number | null = typeof r.savedId === 'number' && r.savedId > 0 ? r.savedId : null;
      if (id === null) id = await this.buscar(destino, filtroCuit(entrada.cuit)).then((l) => Number(l[0]?.ID_CPA01) || null, () => null);
      await this.auditar(apiKey, tenant, destino, 'AltaDeProveedor', id, vista.cuerpo, 'ok', id === null ? 'Tango no devolvió el ID' : null);
      const proveedor = id === null ? null : await this.obtener(destino, id).catch(() => null);
      if (!proveedor) avisos.push('El alta se hizo, pero no se pudo leer el proveedor creado: consultarlo por CUIT');
      return { id, codigo, proveedor, avisos };
    });
  }

  /** Arma el alta de un proveedor del exterior sin escribir. */
  async vistaPreviaExterior(tenant: string, destino: DestinoTango, entrada: EntradaAltaExterior): Promise<VistaPrevia> {
    await this.exigirRazonSocialLibre(destino, entrada);
    return this.prepararExterior(tenant, destino, entrada);
  }

  /**
   * Da de alta un proveedor del exterior (CUIT país, 2026-10-28): sin ARCA (no tiene datos de un CUIT
   * país), con la razón social que se indica y el modelo de los proveedores del exterior. El CUIT país lo
   * comparten muchos: el duplicado es la misma razón social con el mismo CUIT país.
   */
  async altaExterior(tenant: string, destino: DestinoTango, entrada: EntradaAltaExterior, apiKey: ApiKey) {
    return this.locks.con(claveLock(destino), async () => {
      await this.exigirRazonSocialLibre(destino, entrada);
      const vista = await this.prepararExterior(tenant, destino, entrada);
      if (!vista.listo) {
        throw new ErrorConnector(HttpStatus.UNPROCESSABLE_ENTITY, 'Faltan datos obligatorios para el alta', [
          ...vista.faltantes.map((f) => `${f.campo}: ${f.comoResolver}`),
          ...vista.avisos,
        ]);
      }
      const codigo = String(vista.cuerpo.COD_CPA01);
      const conCodigo = await this.buscar(destino, `WHERE COD_CPA01 = '${codigo.replace(/'/g, "''")}'`);
      if (conCodigo.length) {
        throw new ErrorConnector(HttpStatus.CONFLICT, `El código ${codigo} que propuso Tango ya existe`, [
          `Lo tiene el proveedor ${String(conCodigo[0].ID_CPA01)}. Revisar la numeración automática en Tango`,
        ]);
      }

      const r = await this.escribir(apiKey, tenant, destino, 'AltaDeProveedor', null, vista.cuerpo, 'POST', 'Create', vista.cuerpo, [
        `Buscar "${entrada.razonSocial}" (CUIT país ${entrada.cuitPais}) antes de repetir el alta: si se guardó, repetirla da 409`,
      ]);
      if (!r.succeeded) {
        await this.auditar(apiKey, tenant, destino, 'AltaDeProveedor', null, vista.cuerpo, 'error', detalle(r));
        throw new ErrorConnector(HttpStatus.BAD_GATEWAY, 'Tango rechazó el alta', [detalle(r)]);
      }
      const avisos = [...vista.avisos];
      // Sin savedId, el ID se busca por el código que se dio (el CUIT país no lo identifica)
      let id: number | null = typeof r.savedId === 'number' && r.savedId > 0 ? r.savedId : null;
      if (id === null) id = await this.buscar(destino, `WHERE COD_CPA01 = '${codigo.replace(/'/g, "''")}'`).then((l) => Number(l[0]?.ID_CPA01) || null, () => null);
      await this.auditar(apiKey, tenant, destino, 'AltaDeProveedor', id, vista.cuerpo, 'ok', id === null ? 'Tango no devolvió el ID' : null);
      const proveedor = id === null ? null : await this.obtener(destino, id).catch(() => null);
      if (!proveedor) avisos.push(`El alta se hizo, pero no se pudo leer el proveedor creado: consultarlo por el código ${codigo}`);
      return { id, codigo, proveedor, avisos };
    });
  }

  /** Cambia el CBU y su descripción: GetById + Update completo (Update reemplaza el registro). */
  async actualizar(tenant: string, destino: DestinoTango, id: number, cambios: CambiosProveedor, apiKey: ApiKey) {
    // Lock: dos cambios a la vez no se pisan (Update reemplaza todo). Uno hecho en la web entre el
    // GetById y el Update sí se pierde: Tango no tiene control de concurrencia.
    return this.locks.con(claveLock(destino), () => this.actualizarSinLock(tenant, destino, id, cambios, apiKey));
  }

  private async actualizarSinLock(tenant: string, destino: DestinoTango, id: number, cambios: CambiosProveedor, apiKey: ApiKey) {
    const actual = await this.obtener(destino, id);
    const nuevo = { ...actual };
    if ('cbu' in cambios) nuevo.CBU = cambios.cbu ?? null;
    if ('descripcionCbu' in cambios) nuevo.DESCRIPCION_CBU = cambios.descripcionCbu ?? null;
    // Los datos fiscales van por su código: el ID es de cada empresa (las listas de la ficha)
    const empresa = destino.tangoCompanyId;
    if (cambios.operacionAfip !== undefined)
      nuevo.ID_OPERACION_AFIP_RG_3685_TIPO_OPERACION_COMPRAS = await this.idDeLista(tenant, empresa, LISTAS.operacionAfip, cambios.operacionAfip);
    if (cambios.comprobanteAfip !== undefined)
      nuevo.ID_TIPO_COMPROBANTE_AFIP_RG_3685_COMPROBANTE_COMPRAS = await this.idDeLista(tenant, empresa, LISTAS.comprobanteAfip, cambios.comprobanteAfip);
    if (cambios.categoriaIva !== undefined) nuevo.ID_CATEGORIA_IVA_COND_IVA = await this.idDeLista(tenant, empresa, LISTAS.categoriaIva, cambios.categoriaIva);
    if (cambios.citiOpera !== undefined) nuevo.CITI_OPERA = cambios.citiOpera;
    if (cambios.citiTipo !== undefined) nuevo.CITI_TIPO = cambios.citiTipo;
    if (cambios.aplicaRetenciones === false) nuevo.CALCU_RET = 'N';
    // Habilitado: en Tango es no tener fecha de inhabilitación (HABILITADO no está en Update y se ignora;
    // relevado el 2026-10-29: los 25 deshabilitados de las empresas tienen FECHA_INHA y ningún habilitado la tiene)
    if (cambios.habilitado === false && !actual.FECHA_INHA) nuevo.FECHA_INHA = `${hoyEnArgentina()}T00:00:00`;
    if (cambios.habilitado === true) nuevo.FECHA_INHA = null;

    // Lo que cambia (para la auditoría y la respuesta); sin cambios, no se escribe
    const campos = Object.keys(nuevo).filter((k) => nuevo[k] !== actual[k]);
    const resumen: Record<string, unknown> = { ID_CPA01: id, ...Object.fromEntries(campos.map((k) => [k, nuevo[k]])) };
    if (!campos.length) return { id, proveedor: actual, cambios: [], avisos: ['Sin cambios: el proveedor ya tenía esos valores'] };
    const r = await this.escribir(apiKey, tenant, destino, 'ActualizarProveedor', id, resumen, 'PUT', 'Update', nuevo, [
      `Leer el proveedor ${id} para ver si el cambio quedó`,
    ]);
    if (!r.succeeded) {
      await this.auditar(apiKey, tenant, destino, 'ActualizarProveedor', id, resumen, 'error', detalle(r));
      throw new ErrorConnector(HttpStatus.BAD_GATEWAY, 'Tango rechazó la actualización', [detalle(r)]);
    }
    // Tango puede responder OK e ignorar un campo (ej. uno que Update no tiene): se relee y se controla
    const proveedor = await this.obtener(destino, id).catch(() => null);
    const noQuedaron = proveedor ? campos.filter((k) => !mismoValor(proveedor[k], nuevo[k])) : [];
    if (noQuedaron.length) {
      const mensaje = `Tango respondió OK pero no guardó: ${noQuedaron.map((k) => `${k} (quedó ${JSON.stringify(proveedor![k])})`).join(', ')}`;
      await this.auditar(apiKey, tenant, destino, 'ActualizarProveedor', id, resumen, 'error', mensaje);
      throw new ErrorConnector(HttpStatus.BAD_GATEWAY, 'Tango no guardó la actualización', [mensaje]);
    }
    await this.auditar(apiKey, tenant, destino, 'ActualizarProveedor', id, resumen, 'ok', proveedor ? null : 'No se pudo releer el proveedor');
    return { id, proveedor, cambios: campos, avisos: proveedor ? [] : ['El cambio se hizo, pero no se pudo leer el proveedor para controlarlo'] };
  }

  // --- Armado del alta ---

  private async preparar(tenant: string, destino: DestinoTango, entrada: EntradaAlta): Promise<VistaPrevia> {
    const empresa = destino.tangoCompanyId;
    const avisos: string[] = [];

    const defaults = await this.ejecutarWeb<Record<string, unknown>>(tenant, empresa, 'GetDefaultValues', {
      defaultParams: null,
      context: { companyId: empresa },
    });
    const arca = await this.ejecutarWeb<Record<string, unknown>>(tenant, empresa, 'ActualizaAutomaticamenteCuit', cuerpoConsultaArca(defaults, entrada.cuit), true);
    // Sin razón social, ARCA no encontró el CUIT (Tango responde OK y vacío).
    if (typeof arca.noM_PROVEE !== 'string' || !arca.noM_PROVEE.trim()) {
      throw new ErrorConnector(HttpStatus.UNPROCESSABLE_ENTITY, 'ARCA no devolvió datos para el CUIT', [
        `${entrada.cuit}: puede no estar inscripto, o ARCA no respondió. Verificarlo en ARCA y reintentar`,
      ]);
    }
    if (arca.cuiT_DUPLICADO === true) {
      throw new ErrorConnector(HttpStatus.CONFLICT, 'El CUIT ya está cargado en Tango', [`${entrada.cuit}: Tango lo informa como duplicado`]);
    }

    // Defaults + ARCA, con los nombres de la API, solo los campos que acepta Create.
    const permitidos = this.camposCreate();
    const cuerpo: Record<string, unknown> = {};
    // ARCA devuelve el pedido con nulls donde no tiene dato: esos no pisan los defaults.
    const deArca = Object.fromEntries(Object.entries(arca).filter(([, v]) => v !== null && v !== undefined));
    for (const [clave, valor] of Object.entries({ ...defaults, ...deArca })) {
      const campo = aCampoApi(clave);
      if (permitidos.has(campo) && valor !== null && valor !== undefined && typeof valor !== 'object') cuerpo[campo] = valor;
    }
    cuerpo.COD_CPA01 = defaults.codigo;
    cuerpo.N_CUIT = entrada.cuit;

    // Provincia: la indicada gana; si no, la de ARCA.
    if (entrada.codigoProvincia) {
      const id = await this.idProvincia(destino, entrada.codigoProvincia);
      if (typeof arca.iD_CPA57 === 'number' && arca.iD_CPA57 !== id) {
        avisos.push(`Provincia: se usó la indicada (${entrada.codigoProvincia}) en lugar de la de ARCA`);
      }
      cuerpo.ID_CPA57 = id;
    } else if (typeof arca.iD_CPA57 !== 'number') {
      delete cuerpo.ID_CPA57;
    }

    // "Aplica retenciones" destildado: sin clasificación ni retenciones (definición del usuario).
    cuerpo.CALCU_RET = 'N';
    delete cuerpo.ID_CLASIFICACION_RETENCION;
    if (Array.isArray(arca.retenciones) && arca.retenciones.length) {
      avisos.push(`ARCA sugirió ${arca.retenciones.length} retenciones: no se cargan (alta con "Aplica retenciones" destildado)`);
    }

    // RG 3685: el primero de cada lista (son sugerencias).
    cuerpo.ID_OPERACION_AFIP_RG_3685_TIPO_OPERACION_COMPRAS = await this.primeroDeLista(tenant, empresa, 'OperacionAfipComprasLookup', 'iD_OPERACION_AFIP_COMPRAS');
    cuerpo.ID_TIPO_COMPROBANTE_AFIP_RG_3685_COMPROBANTE_COMPRAS = await this.primeroDeLista(
      tenant,
      empresa,
      'TipoComprobanteAfipHabilitadoCompraLookup',
      'iD_TIPO_COMPROBANTE_AFIP',
    );

    if (entrada.cbu) cuerpo.CBU = entrada.cbu;
    if (entrada.descripcionCbu) cuerpo.DESCRIPCION_CBU = entrada.descripcionCbu;

    const faltantes = Object.entries(OBLIGATORIOS)
      .filter(([campo]) => cuerpo[campo] === undefined || cuerpo[campo] === null || cuerpo[campo] === '')
      .map(([campo, comoResolver]) => ({ campo, comoResolver }));

    const categoria = arca.categoriA_IVA as { coD_DESCRIP?: string } | undefined;
    return {
      listo: faltantes.length === 0,
      cuerpo,
      faltantes,
      avisos,
      arca: {
        razonSocial: arca.noM_PROVEE as string,
        domicilio: (arca.domicilio as string) || undefined,
        localidad: (arca.localidad as string) || undefined,
        codigoPostal: (arca.c_POSTAL as string) || undefined,
        idProvincia: typeof arca.iD_CPA57 === 'number' ? arca.iD_CPA57 : undefined,
        actividad: (arca.n_IVA as string) || undefined,
        categoriaIva: categoria?.coD_DESCRIP,
      },
    };
  }

  /**
   * El alta de un proveedor del exterior: los valores por defecto de Tango, la razón social indicada (también
   * nombre de fantasía y orden, como las altas del exterior que ya hay) y el modelo: provincia 99 Exterior,
   * RG 3685 X y 019, CITI I y B, "Aplica retenciones" destildado y la categoría de IVA indicada (EX o RI).
   */
  private async prepararExterior(tenant: string, destino: DestinoTango, entrada: EntradaAltaExterior): Promise<VistaPrevia> {
    const empresa = destino.tangoCompanyId;
    const defaults = await this.ejecutarWeb<Record<string, unknown>>(tenant, empresa, 'GetDefaultValues', {
      defaultParams: null,
      context: { companyId: empresa },
    });
    const permitidos = this.camposCreate();
    const cuerpo: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(defaults)) {
      const campo = aCampoApi(clave);
      if (permitidos.has(campo) && valor !== null && valor !== undefined && typeof valor !== 'object') cuerpo[campo] = valor;
    }
    cuerpo.COD_CPA01 = defaults.codigo;
    cuerpo.N_CUIT = entrada.cuitPais;
    cuerpo.NOM_PROVEE = entrada.razonSocial;
    cuerpo.NOM_FANT = entrada.razonSocial;
    cuerpo.ORDEN = entrada.razonSocial;
    cuerpo.ID_CPA57 = await this.idProvincia(destino, MODELO_EXTERIOR.codigoProvincia);
    cuerpo.ID_CATEGORIA_IVA_COND_IVA = await this.idDeLista(tenant, empresa, LISTAS.categoriaIva, entrada.categoriaIva);
    cuerpo.CALCU_RET = 'N';
    delete cuerpo.ID_CLASIFICACION_RETENCION;
    cuerpo.CITI_OPERA = MODELO_EXTERIOR.citiOpera;
    cuerpo.CITI_TIPO = MODELO_EXTERIOR.citiTipo;
    cuerpo.ID_OPERACION_AFIP_RG_3685_TIPO_OPERACION_COMPRAS = await this.idDeLista(tenant, empresa, LISTAS.operacionAfip, MODELO_EXTERIOR.operacionAfip);
    cuerpo.ID_TIPO_COMPROBANTE_AFIP_RG_3685_COMPROBANTE_COMPRAS = await this.idDeLista(tenant, empresa, LISTAS.comprobanteAfip, MODELO_EXTERIOR.comprobanteAfip);
    if (entrada.cbu) cuerpo.CBU = entrada.cbu;
    if (entrada.descripcionCbu) cuerpo.DESCRIPCION_CBU = entrada.descripcionCbu;

    const faltantes = Object.entries(OBLIGATORIOS)
      .filter(([campo]) => cuerpo[campo] === undefined || cuerpo[campo] === null || cuerpo[campo] === '')
      .map(([campo, comoResolver]) => ({ campo, comoResolver }));
    return { listo: faltantes.length === 0, cuerpo, faltantes, avisos: [], arca: {} };
  }

  /** El mismo proveedor del exterior: el CUIT país y la razón social (sin mayúsculas, acentos ni puntuación). */
  private async exigirRazonSocialLibre(destino: DestinoTango, entrada: EntradaAltaExterior): Promise<void> {
    const clave = razonSocialClave(entrada.razonSocial);
    const mismo = (await this.buscar(destino, filtroCuit(entrada.cuitPais))).find((p) => razonSocialClave(String(p.NOM_PROVEE ?? '')) === clave);
    if (mismo) {
      throw new ErrorConnector(HttpStatus.CONFLICT, 'El proveedor ya está cargado en Tango', [
        `${entrada.razonSocial} (CUIT país ${entrada.cuitPais}): proveedor ${String(mismo.ID_CPA01)}, código ${String(mismo.COD_CPA01)} (${String(mismo.NOM_PROVEE)})`,
      ]);
    }
  }

  /** El ID de un código en una lista de la ficha, en esa empresa (las listas se leen enteras, una hora). */
  private async idDeLista(tenant: string, empresa: number, lista: Lista, codigo: string): Promise<number> {
    const clave = `${tenant}:${empresa}:${lista.lookup}`;
    let cache = this.listas.get(clave);
    if (!cache || cache.hasta < Date.now()) {
      const porCodigo = new Map<string, number>();
      // De a páginas (la web devuelve hasta 100)
      for (let pagina = 0; pagina < 20; pagina++) {
        const r = await this.web.pedir<{ succeeded?: boolean; resultData?: { list?: Record<string, unknown>[]; totalCount?: number } } & RespuestaWeb<unknown>>(
          tenant,
          empresa,
          'POST',
          '/processresolver/getdatalookup',
          { ...cuerpoLista(lista.lookup), pageIndex: pagina },
        );
        const items = r?.resultData?.list;
        if (r?.succeeded === false || !Array.isArray(items)) {
          throw new ErrorConnector(HttpStatus.BAD_GATEWAY, 'La web de Tango cambió: el connector no la entiende', [
            `getdatalookup ${lista.lookup}: ${r?.succeeded === false ? detalle(r) : 'no devolvió la lista'}`,
            'Correr los tests de contrato (npm run test:contrato) y ajustar el connector',
          ]);
        }
        for (const item of items) {
          if (typeof item[lista.id] === 'number' && item[lista.codigo] !== null && item[lista.codigo] !== undefined)
            porCodigo.set(String(item[lista.codigo]).trim(), item[lista.id] as number);
        }
        const total = r.resultData?.totalCount;
        if (!items.length || (typeof total === 'number' && porCodigo.size >= total) || (typeof total !== 'number' && items.length < 100)) break;
      }
      cache = { hasta: Date.now() + 3_600_000, porCodigo };
      this.listas.set(clave, cache);
    }
    const id = cache.porCodigo.get(codigo);
    if (id === undefined) {
      throw new ErrorConnector(HttpStatus.BAD_REQUEST, `Código desconocido en ${lista.lookup}: ${codigo}`, [
        `Códigos válidos en esta empresa: ${[...cache.porCodigo.keys()].sort().join(', ')}`,
      ]);
    }
    return id;
  }

  private camposCreate(): Set<string> {
    const data = this.catalogo.endpoint(PROCESO_PROVEEDORES, 'Create')?.parametros.find((p) => p.nombre === 'data');
    const props = (data?.schema as { properties?: Record<string, unknown> } | undefined)?.properties;
    if (!props) throw new ErrorConnector(HttpStatus.INTERNAL_SERVER_ERROR, 'El catálogo no tiene el schema de Create de Proveedores');
    return new Set(Object.keys(props));
  }

  private async exigirCuitLibre(destino: DestinoTango, cuit: string): Promise<void> {
    const existentes = await this.buscar(destino, filtroCuit(cuit));
    if (existentes.length) {
      const p = existentes[0];
      throw new ErrorConnector(HttpStatus.CONFLICT, 'El CUIT ya está cargado en Tango', [
        `${cuit}: proveedor ${String(p.ID_CPA01)}, código ${String(p.COD_CPA01)} (${String(p.NOM_PROVEE)})`,
      ]);
    }
  }

  private async idProvincia(destino: DestinoTango, codigo: string): Promise<number> {
    const clave = `${destino.urlBase}:${destino.tangoCompanyId}`;
    let cache = this.provincias.get(clave);
    if (!cache || cache.hasta < Date.now()) {
      const r = await this.api(destino, 'GET', 'Get', `process=${PROCESO_PROVINCIAS}&pageSize=1000&pageIndex=0&view=`);
      const lista = r.resultData?.list;
      if (!r.succeeded || !Array.isArray(lista)) throw new ErrorConnector(HttpStatus.BAD_GATEWAY, 'No se pudieron leer las provincias de Tango', [detalle(r)]);
      cache = { hasta: Date.now() + 3_600_000, porCodigo: new Map(lista.map((p) => [String(p.COD_CPA57).trim(), Number(p.ID_CPA57)])) };
      this.provincias.set(clave, cache);
    }
    const id = cache.porCodigo.get(codigo.padStart(2, '0'));
    if (id === undefined) {
      throw new ErrorConnector(HttpStatus.BAD_REQUEST, `Código de provincia desconocido: ${codigo}`, [
        `Códigos válidos en esta empresa: ${[...cache.porCodigo.keys()].sort().join(', ')} (proceso 2728)`,
      ]);
    }
    return id;
  }

  private async primeroDeLista(tenant: string, empresa: number, lookup: string, campoId: string): Promise<number> {
    const r = await this.web.pedir<{ succeeded?: boolean; resultData?: { list?: Record<string, unknown>[] } } & RespuestaWeb<unknown>>(
      tenant,
      empresa,
      'POST',
      '/processresolver/getdatalookup',
      cuerpoLista(lookup),
    );
    const primero = r?.resultData?.list?.[0];
    if (r?.succeeded === false || typeof primero?.[campoId] !== 'number') {
      throw new ErrorConnector(HttpStatus.BAD_GATEWAY, 'La web de Tango cambió: el connector no la entiende', [
        `getdatalookup ${lookup}: ${r?.succeeded === false ? detalle(r) : 'no devolvió la lista'}`,
        'Correr los tests de contrato (npm run test:contrato) y ajustar el connector',
      ]);
    }
    return primero[campoId] as number;
  }

  /** `vacioOk`: una respuesta OK sin `data` vale `{}` (ARCA sin datos para el CUIT). */
  private async ejecutarWeb<T>(tenant: string, empresa: number, metodo: string, data: unknown, vacioOk = false): Promise<T> {
    const r = await this.web.pedir<RespuestaWeb<T>>(tenant, empresa, 'POST', '/processresolver/execute', cuerpoEjecutar(metodo, data));
    if (vacioOk && r && r.succeeded !== false && (r.data === null || r.data === undefined)) return {} as T;
    if (r?.succeeded === false || !r?.data || typeof r.data !== 'object') {
      throw new ErrorConnector(HttpStatus.BAD_GATEWAY, `La web de Tango no respondió ${metodo} como se esperaba`, [
        r?.succeeded === false ? detalle(r) : `${metodo} no devolvió data`,
        'Si persiste, correr los tests de contrato (npm run test:contrato)',
      ]);
    }
    return r.data;
  }

  // --- API pública ---

  private async obtener(destino: DestinoTango, id: number): Promise<Record<string, unknown>> {
    const r = await this.api(destino, 'GET', 'GetById', `process=${PROCESO_PROVEEDORES}&id=${id}`);
    if (!r.succeeded || !r.value) {
      if (/inexistente/i.test(detalle(r))) throw new ErrorConnector(HttpStatus.NOT_FOUND, `No existe el proveedor ${id}`);
      throw new ErrorConnector(HttpStatus.BAD_GATEWAY, `No se pudo leer el proveedor ${id}`, [detalle(r)]);
    }
    return r.value;
  }

  private async buscar(destino: DestinoTango, filtroSql: string): Promise<Record<string, unknown>[]> {
    const q = new URLSearchParams({ process: String(PROCESO_PROVEEDORES), view: '', filtroSql }).toString();
    const r = await this.api(destino, 'GET', 'GetByFilter', q);
    const lista = r.list ?? r.resultData?.list;
    // Sin lista no se sabe si hay coincidencias: seguir podría duplicar el proveedor.
    if (r.succeeded === false || !Array.isArray(lista)) {
      throw new ErrorConnector(HttpStatus.BAD_GATEWAY, 'No se pudo consultar Proveedores en Tango', [detalle(r)]);
    }
    return lista;
  }

  private async api(destino: DestinoTango, metodo: string, endpoint: string, query: string, cuerpo?: unknown): Promise<RespuestaApi> {
    const r = await this.tango.enviar(destino, metodo, endpoint, query, cuerpo);
    let json: RespuestaApi | undefined;
    try {
      json = JSON.parse(r.cuerpo.toString('utf8')) as RespuestaApi;
    } catch {
      json = undefined;
    }
    // Tango responde 200 también a sus errores (succeeded: false); otro status es un problema de acceso o del servidor.
    if (r.status !== 200 || !json || typeof json !== 'object') {
      throw new ErrorConnector(HttpStatus.BAD_GATEWAY, `Tango respondió HTTP ${r.status} en ${endpoint}`, [json ? detalle(json) : 'La respuesta no es JSON']);
    }
    return json;
  }

  /**
   * Una escritura. Si se corta (timeout, red, respuesta rara) no se sabe si Tango la guardó:
   * se audita como `desconocido` y el error lo dice, con cómo verificarlo.
   */
  private async escribir(
    apiKey: ApiKey,
    tenant: string,
    destino: DestinoTango,
    operacion: string,
    idRegistro: number | null,
    resumen: Record<string, unknown>,
    metodo: string,
    endpoint: string,
    cuerpo: unknown,
    comoVerificar: string[],
  ): Promise<RespuestaApi> {
    try {
      return await this.api(destino, metodo, endpoint, `process=${PROCESO_PROVEEDORES}`, cuerpo);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      await this.auditar(apiKey, tenant, destino, operacion, idRegistro, resumen, 'desconocido', mensaje);
      const status = error instanceof ErrorConnector ? error.getStatus() : HttpStatus.BAD_GATEWAY;
      throw new ErrorConnector(status, `No se sabe si Tango guardó la escritura: ${mensaje}`, comoVerificar);
    }
  }

  private async auditar(
    apiKey: ApiKey,
    tenant: string,
    destino: DestinoTango,
    operacion: string,
    idRegistro: number | null,
    cuerpo: Record<string, unknown>,
    resultado: 'ok' | 'error' | 'desconocido',
    mensaje: string | null,
  ): Promise<void> {
    try {
      await this.auditoria.save(this.auditoria.create({
        apiKeyId: apiKey.id,
        plataforma: apiKey.plataforma,
        tenant,
        empresa: destino.slug,
        companyId: destino.tangoCompanyId,
        operacion,
        idRegistro,
        cuerpo,
        resultado,
        mensaje,
      }));
    } catch (error) {
      // La escritura en Tango ya pasó: que falle la auditoría no la deshace, pero tiene que verse.
      this.logger.error(`No se pudo auditar ${operacion} ${idRegistro ?? ''}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
