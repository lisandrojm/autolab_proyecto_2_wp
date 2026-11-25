import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorConnector } from '../comun/errores';
import { separarEtiqueta } from './perfiles-compra.service';
import { SesionesWebService } from './sesiones-web.service';

/** "Detalle por auxiliar": lo que abre la web desde la columna Auxiliar de 10939. */
const PROCESO_AUXILIARES = '-14024';
/** Máximo de comprobantes por pedido: cada uno es una regla OR en el filtro de Tango. */
export const MAX_COMPROBANTES = 50;
/** Filas por página al pedirle a Tango (comprobante × cuenta × auxiliar). */
const FILAS_POR_PAGINA = 500;
/** Tope de páginas: 50 comprobantes caben holgados en una o dos. */
const MAX_PAGINAS = 10;
/** Tope total del pedido: por debajo del corte de nginx (180 s) y del timeout del SDK (170 s). */
const PLAZO_TOTAL_MS = 150_000;
/** El mayor ID que acepta Tango (int32). */
const MAX_ID = 2_147_483_647;
/**
 * El tipo de auxiliar de los centros de costo. **Supuesto:** el tipo se define en cada base de
 * Tango; en FZERO es "CC - CENTROS DE COSTO". Un tenant con otro código recibiría [] (ver la spec).
 */
const PREFIJO_CENTRO_COSTO = 'CC';

/**
 * Columnas que se piden. `iD_CPA04` y `coD_CUENTA` no están en la vista de la web pero se
 * pueden pedir. `nrO_COMPROBANTE` no: lo vuelve lento (10 s en lugar de 0,3 s).
 */
const COLUMNAS = [
  { field: 'tipO_AUXILIAR', type: 'string' },
  { field: 'auxiliar', type: 'string' },
  { field: 'porC_DE_APROPIACION', type: 'double' },
  { field: 'debE_CTE', type: 'double' },
  { field: 'habeR_CTE', type: 'double' },
  { field: 'iD_CPA04', type: 'integer' },
  { field: 'coD_CUENTA', type: 'string' },
].map((c, order) => ({ ...c, order, sortOrder: 0 }));

/** Una imputación de un comprobante a un auxiliar (por defecto, a un centro de costo). */
/** Debe coincidir con `ImputacionCentroCosto` del SDK (`sdk/src/tipos.ts`). */
export interface ImputacionAuxiliar {
  idCpa04: number;
  codCuenta: string;
  /** `CC - CENTROS DE COSTO`, … */
  tipoAuxiliar: string;
  idAuxiliar: number;
  /**
   * Código del auxiliar, el mismo del proceso 1656 (centros de costo), p. ej. `99HUI`. Sale del
   * texto `<código> - <descripción>`: para cruzar datos, la clave segura es `idAuxiliar`.
   */
  codigo: string;
  descripcion: string;
  /** `porC_DE_APROPIACION`: si una cuenta se reparte entre varios, una fila por cada uno. */
  porcentaje: number;
  debe: number;
  haber: number;
}

interface FilaTango {
  iD_CPA04: number;
  coD_CUENTA: string;
  iD_TIPO_AUXILIAR?: number;
  tipO_AUXILIAR: string;
  iD_AUXILIAR: number;
  auxiliar: string;
  porC_DE_APROPIACION: number;
  debE_CTE: number;
  habeR_CTE: number;
}

interface RespuestaTango {
  succeeded?: boolean;
  message?: string | null;
  exceptionInfo?: { messages?: string[] } | null;
  resultData?: { list?: FilaTango[]; totalCount?: number | null } | null;
}

function cambio(detalle: string): ErrorConnector {
  return new ErrorConnector(HttpStatus.BAD_GATEWAY, 'La web de Tango cambió: el connector no la entiende', [
    detalle,
    'Correr los tests de contrato (npm run test:contrato) y ajustar el connector',
  ]);
}

/**
 * `"61386, 61566"` → [61386, 61566], sin repetidos. Lanza 400 si algo no es un ID válido:
 * solo dígitos (nada de `0x10`, `1e3`, `12.0` ni `+5`), entre 1 y el máximo int32 de Tango.
 * Acepta el parámetro repetido (`?idCpa04=1&idCpa04=2`, que llega como array).
 */
export function parsearIds(valor: unknown): number[] {
  const texto = Array.isArray(valor) ? valor.join(',') : valor;
  if (texto !== undefined && typeof texto !== 'string') {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'idCpa04 inválido', ['Uno o más ID_CPA04 separados por coma: ?idCpa04=61386,61566']);
  }
  const partes = (texto ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  if (!partes.length) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'Falta idCpa04', ['Uno o más ID_CPA04 separados por coma: ?idCpa04=61386,61566']);
  }
  if (partes.some((p) => !/^\d{1,10}$/.test(p) || Number(p) < 1 || Number(p) > MAX_ID)) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'idCpa04 inválido', ['Tienen que ser enteros positivos (el ID_CPA04 del comprobante)']);
  }
  const ids = [...new Set(partes.map(Number))];
  if (ids.length > MAX_COMPROBANTES) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, `Máximo ${MAX_COMPROBANTES} comprobantes por pedido`, ['Partir el pedido en varios']);
  }
  return ids;
}

/** `todos`: solo `true`/`1`/`false`/`0` o ausente. Cualquier otra cosa es 400, no `false` en silencio. */
export function parsearTodos(valor: unknown): boolean {
  if (valor === undefined || valor === 'false' || valor === '0') return false;
  if (valor === 'true' || valor === '1') return true;
  throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'todos inválido', ['Valores: true o false']);
}

/**
 * El body de `processresolver/execute` para -14024, relevado en docs/tango/imputacion-comprobante-compra.md.
 * Trampas: sin `periodConfiguration` (si no, filtra por el mes actual y devuelve vacío sin
 * error); `selectedColumns` obligatorio; cada regla con `type`, `condition` e `input`; varios
 * comprobantes con reglas `equal` en OR (`in` y `between` cuelgan la consulta).
 */
export function cuerpoAuxiliares(ids: number[], pageIndex: number, pageSize = FILAS_POR_PAGINA) {
  return {
    processNumber: PROCESO_AUXILIARES,
    method: 'GetPagedDataGrid',
    data: {
      pageIndex,
      pageSize,
      needTotalCount: true,
      gridDataMethod: 'GetDataGrid',
      loadOptions: { skip: pageIndex * pageSize, take: pageSize, requireTotalCount: true },
      columns: COLUMNAS,
    },
    context: {
      configuration: {
        filter: {
          condition: 'AND',
          rules: [
            {
              condition: 'OR',
              rules: ids.map((id) => ({
                field: 'axvLiveAsientoComprobanteCp.ID_CPA04',
                operator: 'equal',
                type: 'integer',
                value: id,
                condition: 'OR',
                input: 'text',
              })),
            },
          ],
        },
        selectedColumns: COLUMNAS,
      },
    },
  };
}

/** Valida la forma de una fila de -14024: si Tango cambia un campo, 502 y no datos raros. */
function validarFila(f: FilaTango, ids: Set<number>): void {
  const forma =
    typeof f.iD_CPA04 === 'number' &&
    typeof f.tipO_AUXILIAR === 'string' &&
    typeof f.auxiliar === 'string' &&
    typeof f.iD_AUXILIAR === 'number' &&
    typeof f.coD_CUENTA === 'string' &&
    typeof f.porC_DE_APROPIACION === 'number' &&
    typeof f.debE_CTE === 'number' &&
    typeof f.habeR_CTE === 'number';
  if (!forma) throw cambio('-14024 cambió la forma de las filas');
  // Si Tango ignorara el filtro, traería la base entera: se corta en la primera página.
  if (!ids.has(f.iD_CPA04)) throw cambio(`-14024 devolvió el comprobante ${f.iD_CPA04}, que no se pidió: ¿ignoró el filtro?`);
}

/** `99HUI - 99 - Huidobro` → 99HUI / 99 - Huidobro. Sin " - ", el texto entero es el código. */
function separarAuxiliar(auxiliar: string): { codigo: string; descripcion: string } {
  const partes = separarEtiqueta(auxiliar);
  return partes.codigo ? partes : { codigo: auxiliar.trim(), descripcion: '' };
}

/**
 * Centros de costo (y demás auxiliares) imputados en comprobantes de compra. No está en la
 * API pública: se lee de la web con la sesión del ADR 0003.
 */
@Injectable()
export class CentrosCostoCompraService {
  constructor(private readonly web: SesionesWebService) {}

  async imputaciones(
    tenant: string,
    companyId: number,
    ids: number[],
    todosLosAuxiliares = false,
    pageSize = FILAS_POR_PAGINA,
  ): Promise<ImputacionAuxiliar[]> {
    const pedidos = new Set(ids);
    const filas: FilaTango[] = [];
    let paginaAnterior = '';
    const limite = Date.now() + PLAZO_TOTAL_MS;
    let total: number | undefined;

    for (let pageIndex = 0; ; pageIndex++) {
      if (Date.now() > limite) {
        throw new ErrorConnector(HttpStatus.GATEWAY_TIMEOUT, 'Tango tardó demasiado en devolver las imputaciones', [
          'Pedir menos comprobantes por vez',
        ]);
      }
      const r = await this.web.pedir<RespuestaTango>(tenant, companyId, 'POST', '/processresolver/execute', cuerpoAuxiliares(ids, pageIndex, pageSize));
      if (r?.succeeded === false) {
        throw cambio(`-14024 respondió con error: ${r.exceptionInfo?.messages?.join(' | ') || r.message || 'sin detalle'}`);
      }
      const lista = r?.resultData?.list;
      if (!Array.isArray(lista)) throw cambio('-14024 ya no devuelve resultData.list');
      const totalPagina = r.resultData?.totalCount;
      if (typeof totalPagina !== 'number' || totalPagina < 0) throw cambio('-14024 ya no devuelve resultData.totalCount');
      total ??= totalPagina;

      for (const f of lista) validarFila(f, pedidos);
      // Si Tango ignorara la paginación, repetiría la misma página: se corta con error.
      const pagina = JSON.stringify(lista);
      if (lista.length && pagina === paginaAnterior) throw cambio(`-14024 repitió la página ${pageIndex}`);
      paginaAnterior = pagina;
      filas.push(...lista);
      if (filas.length >= total) break;
      if (lista.length === 0) throw cambio(`-14024 cortó en ${filas.length} de ${total} filas`);
      if (pageIndex + 1 >= MAX_PAGINAS) throw cambio(`-14024 superó ${MAX_PAGINAS} páginas`);
    }
    if (filas.length !== total) throw cambio(`-14024 devolvió ${filas.length} filas y dijo que eran ${total}`);

    return filas
      .filter((f) => todosLosAuxiliares || f.tipO_AUXILIAR.trim().startsWith(`${PREFIJO_CENTRO_COSTO} `))
      .map((f) => ({
        idCpa04: f.iD_CPA04,
        codCuenta: f.coD_CUENTA,
        tipoAuxiliar: f.tipO_AUXILIAR,
        idAuxiliar: f.iD_AUXILIAR,
        ...separarAuxiliar(f.auxiliar),
        porcentaje: f.porC_DE_APROPIACION,
        debe: f.debE_CTE,
        haber: f.habeR_CTE,
      }));
  }
}
