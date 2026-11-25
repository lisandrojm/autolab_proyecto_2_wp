import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { puedeUsarEndpoint } from '../auth/permisos';
import { ErrorConnector } from '../comun/errores';
import type { ApiKey } from '../database/entidades';
import { TangoClient } from '../tango/tango.client';
import type { DestinoTango } from '../tenants/tenants.service';
import { separarEtiqueta } from './perfiles-compra.service';
import { SesionesWebService } from './sesiones-web.service';

/** Ficha Live de facturas, créditos y débitos de compra: trae los comprobantes relacionados. */
export const PROCESO_FICHA_FACTURA = 14162;
/** Ficha Live de órdenes de pago. */
export const PROCESO_FICHA_OP = 14184;
/** Órdenes de pago que se leen a la vez para una factura (casi siempre es una). */
const OP_EN_PARALELO = 4;
/** Tope total de la lista de una factura: por debajo del corte de nginx (180 s) y del SDK (170 s). */
const PLAZO_TOTAL_MS = 150_000;
/** El CUIT y el CBU son un extra: si la API tarda más que esto, la OP sale sin ellos. */
const PLAZO_PROVEEDOR_MS = 8_000;
/** Estado de una orden de pago anulada. */
const ANULADA = 'ANU';

/**
 * Body de `processresolver/execute` con que la web carga una ficha: un solo pedido trae la
 * cabecera y todas las pestañas (docs/tango/ordenes-de-pago.md).
 */
export const cuerpoFicha = (proceso: number, idCpa04: number) => ({ processNumber: String(proceso), method: 'GetData', data: { iD_CPA04: idCpa04 } });

// Deben coincidir con los tipos del SDK (`sdk/src/tipos.ts`).

export interface OrdenDePagoDeFactura {
  idCpa04: number;
  /** `O/P`. */
  tipo: string;
  /** `0000100000795`. */
  numero: string;
  /** `YYYY-MM-DD`. */
  fecha: string | null;
  /** `IMP`, `ANU`… */
  estado: string;
  /** `estado === 'ANU'`: no cuenta como pago (`importeCancelado` 0). */
  anulada: boolean;
  /** Total de la orden de pago. */
  total: number;
  /** Lo que la orden de pago cancela de esta factura, en moneda corriente (puede ser un pago parcial). */
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

export interface OrdenDePago {
  idCpa04: number;
  tipo: string;
  numero: string;
  fecha: string | null;
  fechaContable: string | null;
  estado: string;
  /**
   * `cuit` y `cbu` salen del proveedor (API, 3142), solo si la key tiene `3142:GetById`. El CBU es
   * el **actual** del proveedor (el que imprime el PDF), no necesariamente el del día del pago.
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
  /** El asiento de la OP: la cuenta del proveedor en el debe y las de pago en el haber. */
  valores: ValorOrdenDePago[];
  /**
   * Las cuentas del haber de `valores`: con qué se pagó. Si hay retenciones o diferencias de
   * cambio, sus cuentas también están acá.
   */
  pagadoCon: { cuenta: string; descripcion: string; importe: number }[];
  imputaciones: {
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

type Fila = Record<string, unknown>;

interface RespuestaFicha {
  succeeded?: boolean;
  message?: string | null;
  exceptionInfo?: { messages?: string[] } | null;
  data?: Fila | null;
}

function cambio(detalle: string): ErrorConnector {
  return new ErrorConnector(HttpStatus.BAD_GATEWAY, 'La web de Tango cambió: el connector no la entiende', [
    detalle,
    'Correr los tests de contrato (npm run test:contrato) y ajustar el connector',
  ]);
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v));
const textoONull = (v: unknown): string | null => texto(v) || null;

/** `"X - Importaciones del exterior"` → código y descripción; `null` si está vacío o no tiene código. */
function conCodigo(v: unknown): { codigo: string; descripcion: string } | null {
  const m = /^\s*([^\s-][^-]*?)\s+-\s+(.*)$/.exec(texto(v));
  return m && m[1].trim() ? { codigo: m[1].trim(), descripcion: m[2].trim() } : null;
}
/** `" - "` es el vacío de los combos de Tango. */
const combo = (v: unknown): string | null => (texto(v) === '-' ? null : textoONull(v));
/** Importe obligatorio: si no es número, Tango cambió (502), no 0 en silencio. */
function importe(v: unknown, donde: string): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v === null || v === undefined) return 0;
  throw cambio(`${donde} no es un número`);
}
const numeroONull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
/** `2026-10-07T00:00:00` → `2026-10-07`. */
const fecha = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/**
 * `"CTE (Cotización: 1505.0000000)"` → CTE / 1505. Acepta `1.505,00` y `1505,00`. Sin cotización,
 * o si no se puede leer, `null`: es un dato de más, no rompe la ficha.
 */
export function separarMoneda(valor: string): { moneda: string; cotizacion: number | null } {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(valor);
  if (!m) return { moneda: valor.trim(), cotizacion: null };
  const crudo = (/[:\s]([\d.,]+)\s*$/.exec(m[2])?.[1] ?? '').trim();
  const coma = crudo.lastIndexOf(',');
  const punto = crudo.lastIndexOf('.');
  const normal = coma > punto ? crudo.replace(/\./g, '').replace(',', '.') : crudo.replace(/,/g, '');
  const n = Number(normal);
  return { moneda: m[1].trim(), cotizacion: crudo && Number.isFinite(n) ? n : null };
}

function lista(data: Fila, campo: string, proceso: number): Fila[] {
  const v = data[campo];
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) throw cambio(`${proceso}: ${campo} no es una lista`);
  return v as Fila[];
}

/**
 * Órdenes de pago de facturas de compra (docs/tango/ordenes-de-pago.md). Las fichas Live no
 * están en la API pública: se leen de la web con la sesión del ADR 0003. Solo lectura.
 */
@Injectable()
export class OrdenesPagoService {
  private readonly logger = new Logger(OrdenesPagoService.name);

  constructor(
    private readonly web: SesionesWebService,
    private readonly tango: TangoClient,
  ) {}

  /**
   * Las órdenes de pago que cancelan una factura, crédito o débito de compra. Un relacionado que
   * ya no existe o que no es una O/P se saltea (no es un error de la factura).
   */
  async deFactura(tenant: string, destino: DestinoTango, idCpa04: number): Promise<OrdenDePagoDeFactura[]> {
    const limite = Date.now() + PLAZO_TOTAL_MS;
    const factura = await this.ficha(tenant, destino.tangoCompanyId, PROCESO_FICHA_FACTURA, idCpa04);
    if (!factura) throw new ErrorConnector(HttpStatus.NOT_FOUND, `No existe el comprobante de compra ${idCpa04}`);
    if (texto(factura.t_COMP) === 'O/P') {
      throw new ErrorConnector(HttpStatus.NOT_FOUND, `El comprobante ${idCpa04} es una orden de pago, no una factura`, [
        'Usar GET ordenes-de-pago/:idCpa04',
      ]);
    }
    const ids = [
      ...new Set(
        lista(factura, 'comprobanteS_RELACIONADOS', PROCESO_FICHA_FACTURA)
          .map((r) => r.iD_CPA04_OP)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ),
    ];

    const resultado: OrdenDePagoDeFactura[] = [];
    for (let i = 0; i < ids.length; i += OP_EN_PARALELO) {
      if (Date.now() > limite) {
        throw new ErrorConnector(HttpStatus.GATEWAY_TIMEOUT, 'Tango tardó demasiado en dar las órdenes de pago', [
          `Se leyeron ${i} de ${ids.length} órdenes de pago`,
        ]);
      }
      const tanda = await Promise.all(
        ids.slice(i, i + OP_EN_PARALELO).map((id) =>
          this.leerOrden(tenant, destino.tangoCompanyId, id).catch((error: unknown) => {
            if (error instanceof ErrorConnector && error.getStatus() === HttpStatus.NOT_FOUND) {
              this.logger.warn(`Factura ${idCpa04}: el relacionado ${id} se saltea (${error.message})`);
              return null;
            }
            throw error;
          }),
        ),
      );
      for (const op of tanda) {
        if (!op) continue;
        const anulada = op.estado === ANULADA;
        const propias = anulada ? [] : op.imputaciones.filter((imp) => imp.idCpa04Factura === idCpa04);
        const ext = propias.map((imp) => imp.canceladoExt);
        resultado.push({
          idCpa04: op.idCpa04,
          tipo: op.tipo,
          numero: op.numero,
          fecha: op.fecha,
          estado: op.estado,
          anulada,
          total: op.total,
          importeCancelado: propias.reduce((s, imp) => s + imp.cancelado, 0),
          importeCanceladoExt: ext.some((x) => x === null) ? null : ext.reduce<number>((s, x) => s + (x as number), 0),
        });
      }
    }
    return resultado.sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? '') || a.idCpa04 - b.idCpa04);
  }

  /**
   * Un comprobante de compra (factura, crédito o débito) con sus relacionados: las órdenes de pago
   * y los comprobantes imputados. Un relacionado sin ID se saltea (queda en el log).
   */
  async relacionados(tenant: string, destino: DestinoTango, idCpa04: number): Promise<RelacionadosDeComprobanteCompra> {
    const P = PROCESO_FICHA_FACTURA;
    const d = await this.ficha(tenant, destino.tangoCompanyId, P, idCpa04);
    if (!d) throw new ErrorConnector(HttpStatus.NOT_FOUND, `No existe el comprobante de compra ${idCpa04}`);
    if (texto(d.t_COMP) === 'O/P') {
      throw new ErrorConnector(HttpStatus.NOT_FOUND, `El comprobante ${idCpa04} es una orden de pago, no una factura, crédito o débito`, [
        'Usar GET ordenes-de-pago/:idCpa04',
      ]);
    }
    if (typeof d.iD_CPA01 !== 'number' || typeof d.totaL_CTE_VALUE !== 'number') throw cambio(`${P}: faltan iD_CPA01 o totaL_CTE_VALUE`);
    const proveedor = separarEtiqueta(texto(d.proveedoR_RAZON_SOCI));
    const moneda = separarMoneda(texto(d.moneda));
    const relacionados: ComprobanteRelacionadoCompra[] = [];
    for (const r of lista(d, 'comprobanteS_RELACIONADOS', P)) {
      const op = typeof r.iD_CPA04_OP === 'number' && r.iD_CPA04_OP > 0 ? r.iD_CPA04_OP : null;
      const comp = typeof r.iD_CPA04_FACCREDEB === 'number' && r.iD_CPA04_FACCREDEB > 0 ? r.iD_CPA04_FACCREDEB : null;
      const id = op ?? comp;
      if (!id) {
        this.logger.warn(`Comprobante ${idCpa04}: relacionado sin ID se saltea (${texto(r.numero)})`);
        continue;
      }
      // "N/C - A0000100000011", "O/P -  0000100000795"
      const m = /^(\S+)\s*-\s*(.*)$/.exec(texto(r.numero));
      relacionados.push({ tipo: m ? m[1] : op ? 'O/P' : '', numero: (m ? m[2] : texto(r.numero)).trim(), fecha: fecha(r.fecha), idCpa04: id, ordenDePago: !!op });
    }
    return {
      idCpa04,
      tipo: texto(d.t_COMP),
      numero: texto(d.n_COMP),
      fecha: fecha(d.fecha),
      fechaContable: fecha(d.fechA_CONTABLE),
      estado: texto(d.estadO_CTE),
      proveedor: { idCpa01: d.iD_CPA01, codigo: proveedor.codigo, razonSocial: proveedor.descripcion },
      moneda: moneda.moneda,
      cotizacion: moneda.cotizacion,
      total: d.totaL_CTE_VALUE,
      totalExt: numeroONull(d.totaL_EXT_VALUE),
      vencimientos: lista(d, 'vencimientos', P).map((v) => ({
        fecha: fecha(v.fechA_DE_VENCIMIENTO),
        importe: importe(v.importE_CTE, `${P}: vencimientos.importE_CTE`),
        estado: texto(v.estadO_CTE),
      })),
      relacionados,
      fiscal: {
        tipoOperacion: textoONull(d.tipO_OPERACION),
        clasificacionCiti: textoONull(d.clasificacioN_CITI),
        operacionRg3685: conCodigo(d.tipO_OPERACION_RG_3685_4597),
        comprobanteAfip: conCodigo(d.comprobantE_AFIP),
        caiCae: textoONull(d.caI_CAE),
      },
    };
  }

  /**
   * La ficha de una orden de pago, con sus pestañas. Si la key puede leer proveedores
   * (`3142:GetById`), suma el CUIT y el CBU del proveedor (API pública).
   */
  async orden(tenant: string, destino: DestinoTango, idCpa04: number, apiKey: ApiKey): Promise<OrdenDePago> {
    const op = await this.leerOrden(tenant, destino.tangoCompanyId, idCpa04);
    if (!puedeUsarEndpoint(apiKey.permisos, 3142, 'GetById')) return op;
    return { ...op, proveedor: { ...op.proveedor, ...(await this.datosProveedor(destino, op.proveedor.idCpa01)) } };
  }

  private async leerOrden(tenant: string, companyId: number, idCpa04: number): Promise<OrdenDePago> {
    const d = await this.ficha(tenant, companyId, PROCESO_FICHA_OP, idCpa04);
    if (!d) throw new ErrorConnector(HttpStatus.NOT_FOUND, `No existe la orden de pago ${idCpa04}`);
    if (texto(d.t_COMP) !== 'O/P') {
      throw new ErrorConnector(HttpStatus.NOT_FOUND, `El comprobante ${idCpa04} no es una orden de pago (es ${texto(d.t_COMP) || 'otro tipo'})`);
    }
    if (typeof d.iD_CPA01 !== 'number' || typeof d.totaL_CTE !== 'number') throw cambio(`${PROCESO_FICHA_OP}: faltan iD_CPA01 o totaL_CTE`);

    const P = PROCESO_FICHA_OP;
    const proveedor = separarEtiqueta(texto(d.proveedoR_RAZON_SOCI));
    const moneda = separarMoneda(texto(d.moneda));
    const valores = lista(d, 'valores', P).map((v) => ({
      cuenta: texto(v.cuenta),
      descripcion: texto(v.descripcion),
      operacion: combo(v.operacion),
      debe: importe(v.debE_CTE, `${P}: valores.debE_CTE`),
      haber: importe(v.habeR_CTE, `${P}: valores.habeR_CTE`),
      debeExt: importe(v.debE_EXT, `${P}: valores.debE_EXT`),
      haberExt: importe(v.habeR_EXT, `${P}: valores.habeR_EXT`),
    }));
    return {
      idCpa04,
      tipo: 'O/P',
      numero: texto(d.n_COMP),
      fecha: fecha(d.fecha),
      fechaContable: fecha(d.fechA_CONTABLE),
      estado: texto(d.estadO_CTE),
      proveedor: { idCpa01: d.iD_CPA01, codigo: proveedor.codigo, razonSocial: proveedor.descripcion },
      moneda: moneda.moneda,
      cotizacion: moneda.cotizacion,
      total: d.totaL_CTE,
      totalExt: numeroONull(d.totaL_EXT),
      leyendas: [1, 2, 3, 4, 5].map((n) => texto(d[`leyendA_${n}`])).filter(Boolean),
      observaciones: { comerciales: textoONull(d.observacioneS_COMERCIALES), otras: textoONull(d.otraS_OBSERVACIONES) },
      valores,
      pagadoCon: valores.filter((v) => v.haber > 0).map((v) => ({ cuenta: v.cuenta, descripcion: v.descripcion, importe: v.haber })),
      imputaciones: lista(d, 'imputaciones', P).map((i) => {
        if (typeof i.iD_CPA04_FACCREDEB !== 'number') throw cambio(`${P}: imputación sin iD_CPA04_FACCREDEB`);
        return {
          idCpa04Factura: i.iD_CPA04_FACCREDEB,
          tipo: texto(i.tipO_COMPROBANTE),
          numero: texto(i.nrO_COMPROBANTE),
          vencimiento: fecha(i.fechA_VENCIMIENTO),
          estado: texto(i.estado),
          moneda: texto(i.moneda),
          cancelado: importe(i.totaL_CANCELADO_CTE, `${P}: imputaciones.totaL_CANCELADO_CTE`),
          canceladoExt: numeroONull(i.totaL_CANCELADO_EXT),
        };
      }),
      retenciones: lista(d, 'retenciones', P).map((r) => ({
        retencion: texto(r.retencion),
        certificado: textoONull(r.nrO_CERTIFICADO),
        fecha: fecha(r.fecha),
        importe: importe(r.importe, `${P}: retenciones.importe`),
        certificadoRelacionado: textoONull(r.certificadO_RELACIONADO),
      })),
      documentos: lista(d, 'documentos', P),
      totales: lista(d, 'totales', P).map((t) => ({ concepto: texto(t.concepto), importe: importe(t.importe, `${P}: totales.importe`), importeExt: numeroONull(t.importE_EXT) })),
      comprobantesRelacionados: lista(d, 'comprobanteS_RELACIONADOS', P).map((r) => ({
        tipo: texto(r.tipo),
        numero: texto(r.numero),
        fecha: fecha(r.fecha),
        idCpa04Factura: numeroONull(r.iD_CPA04_FACCREDEB),
      })),
      ingreso: { fecha: textoONull(d.fechA_INGRESO), usuario: textoONull(d.usuariO_INGRESO) },
    };
  }

  /** `null` si no existe: Tango responde OK con `data` casi vacía (sin `t_COMP`). */
  private async ficha(tenant: string, companyId: number, proceso: number, idCpa04: number): Promise<Fila | null> {
    const r = await this.web.pedir<RespuestaFicha>(tenant, companyId, 'POST', '/processresolver/execute', cuerpoFicha(proceso, idCpa04));
    if (r?.succeeded === false) {
      const detalle = (r.exceptionInfo?.messages ?? []).filter(Boolean).join(' | ') || r.message || 'sin detalle';
      throw new ErrorConnector(HttpStatus.BAD_GATEWAY, `La web de Tango no pudo abrir la ficha ${proceso}`, [detalle]);
    }
    if (!r?.data || typeof r.data !== 'object') throw cambio(`${proceso}: GetData no devolvió data`);
    return r.data.t_COMP === undefined || r.data.t_COMP === null ? null : r.data;
  }

  /** CUIT y CBU del proveedor, de la API pública (3142). Si no se pueden leer, la orden sale igual, sin ellos. */
  private async datosProveedor(destino: DestinoTango, idCpa01: number): Promise<{ cuit?: string; cbu?: string }> {
    try {
      let timer: NodeJS.Timeout | undefined;
      const tarde = new Promise<never>((_, rechazar) => {
        timer = setTimeout(() => rechazar(new Error(`la API no respondió en ${PLAZO_PROVEEDOR_MS / 1000} s`)), PLAZO_PROVEEDOR_MS);
      });
      const r = await Promise.race([this.tango.enviar(destino, 'GET', 'GetById', `process=3142&id=${idCpa01}`), tarde]).finally(() => clearTimeout(timer));
      const j = JSON.parse(r.cuerpo.toString('utf8')) as { succeeded?: boolean; value?: { N_CUIT?: unknown; CBU?: unknown } };
      if (!j.succeeded || !j.value) return {};
      const cuit = texto(j.value.N_CUIT);
      const cbu = texto(j.value.CBU);
      return { ...(cuit ? { cuit } : {}), ...(cbu ? { cbu } : {}) };
    } catch (error) {
      this.logger.warn(`Proveedor ${idCpa01}: ${error instanceof Error ? error.message : String(error)}`);
      return {};
    }
  }
}
