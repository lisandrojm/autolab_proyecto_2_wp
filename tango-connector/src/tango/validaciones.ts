import { HttpStatus } from '@nestjs/common';
import { ENDPOINTS_LECTURA, PROCESOS_BLOQUEADOS, puedeUsarEndpoint } from '../auth/permisos';
import type { CatalogoService, EndpointProceso, Proceso } from '../catalogo/catalogo.service';
import { ErrorConnector } from '../comun/errores';
import type { Permisos } from '../database/entidades';

/** Endpoints de escritura de Tango: existen, pero no están habilitados en esta etapa. */
const ENDPOINTS_ESCRITURA = new Set(['create', 'update', 'delete', 'process', 'custom']);

/** Lo que `GetApiLiveQueryData` acepta: `dd/MM/yyyy` o ISO con hora (docs/tango/api-lectura.md). */
const FECHA_TANGO = /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)$/;

/**
 * Lo que no puede aparecer en un `filtroSql`. No vuelve seguro al SQL libre, pero corta
 * lo obvio: varias sentencias, comentarios y DDL/DML. Habilitar `GetByFilter` sigue siendo
 * un permiso explícito de la key (ADR 0002).
 */
const SQL_PROHIBIDO = [
  { patron: /;/, motivo: 'no se permite ";"' },
  { patron: /--|\/\*|\*\//, motivo: 'no se permiten comentarios' },
  {
    patron: /\b(insert|update|delete|drop|alter|create|truncate|merge|exec|execute|grant|revoke|declare|into|openrowset|opendatasource|shutdown|waitfor)\b/i,
    motivo: 'no se permiten sentencias de escritura ni de control',
  },
  { patron: /\b(xp_|sp_)\w*/i, motivo: 'no se permiten procedimientos del sistema' },
];

export interface RequestTango {
  metodo: string;
  endpoint: string;
  query: Record<string, unknown>;
}

export interface Contexto {
  catalogo: CatalogoService;
  permisos: Permisos;
  pageSizeMax: number;
}

function texto(valor: unknown): string | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string') {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'Parámetro repetido', ['Cada parámetro va una sola vez']);
  }
  return valor;
}

/**
 * Valida un request antes de mandarlo a Tango. Si algo no cumple, lanza un
 * `ErrorConnector` y el request no sale. Devuelve el proceso y su endpoint del catálogo.
 */
export function validarRequest(
  req: RequestTango,
  ctx: Contexto,
): { proceso: Proceso; endpoint: EndpointProceso } {
  const nombre = req.endpoint.toLowerCase();

  if (ENDPOINTS_ESCRITURA.has(nombre)) {
    throw new ErrorConnector(HttpStatus.FORBIDDEN, `${req.endpoint} no está habilitado`, [
      'En esta etapa el connector solo permite lecturas',
    ]);
  }
  if (!ENDPOINTS_LECTURA.has(nombre)) {
    throw new ErrorConnector(HttpStatus.NOT_FOUND, `Endpoint desconocido: ${req.endpoint}`);
  }

  const processTexto = texto(req.query.process);
  const id = Number(processTexto);
  if (!processTexto || !Number.isInteger(id)) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'Falta el parámetro process', [
      'process tiene que ser el ID del proceso de Tango',
    ]);
  }
  if (PROCESOS_BLOQUEADOS.has(id)) {
    throw new ErrorConnector(HttpStatus.FORBIDDEN, `El proceso ${id} no se puede usar desde el connector`);
  }

  const proceso = ctx.catalogo.obtener(id);
  if (!proceso) {
    throw new ErrorConnector(HttpStatus.NOT_FOUND, `El proceso ${id} no tiene API`, [
      `No figura en el catálogo ${ctx.catalogo.fechaRelevamiento}`,
    ]);
  }
  const endpoint = ctx.catalogo.endpoint(id, req.endpoint);
  if (!endpoint) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, `El proceso ${id} no tiene ${req.endpoint}`, [
      `Endpoints del proceso: ${proceso.endpoints.map((e) => e.nombre).join(', ')}`,
    ]);
  }
  if (endpoint.metodo.toUpperCase() !== req.metodo.toUpperCase()) {
    throw new ErrorConnector(HttpStatus.METHOD_NOT_ALLOWED, `${endpoint.nombre} se usa con ${endpoint.metodo}`);
  }
  if (!puedeUsarEndpoint(ctx.permisos, id, endpoint.nombre)) {
    throw new ErrorConnector(HttpStatus.FORBIDDEN, `La API key no puede usar ${endpoint.nombre} en el proceso ${id}`);
  }

  validarPageSize(texto(req.query.pageSize), ctx.pageSizeMax);
  if (nombre === 'getbyfilter') validarFiltroSql(texto(req.query.filtroSql), ctx.permisos);
  if (nombre === 'getapilivequerydata') {
    validarFecha('fromDate', texto(req.query.fromDate));
    validarFecha('toDate', texto(req.query.toDate));
  }
  return { proceso, endpoint };
}

function validarPageSize(valor: string | undefined, maximo: number): void {
  if (valor === undefined || valor === '') return;
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'pageSize inválido', ['Tiene que ser un entero positivo']);
  }
  if (n > maximo) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, `pageSize máximo: ${maximo}`, [
      'Para traer más registros, paginar con pageIndex',
    ]);
  }
}

export function validarFiltroSql(valor: string | undefined, permisos: Permisos): void {
  if (!permisos.filtroSql) {
    throw new ErrorConnector(HttpStatus.FORBIDDEN, 'La API key no puede usar filtroSql', [
      'GetByFilter manda SQL a la base de Tango: es un permiso aparte',
    ]);
  }
  if (!valor || !/^\s*where\s/i.test(valor)) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'filtroSql tiene que empezar con WHERE', [
      'Sin filtro, GetByFilter devuelve la tabla entera sin paginar; para eso usar Get',
    ]);
  }
  // La lista negra mira el SQL, no los valores: "WHERE NOM_PROVEE = 'GRANT THORNTON SRL'" es
  // legítimo. Los literales ('...', con '' adentro) se sacan antes de buscar.
  const literales = valor.match(/'(?:[^']|'')*'/g) ?? [];
  const sinLiterales = valor.replace(/'(?:[^']|'')*'/g, ' ? ');
  if (sinLiterales.includes("'")) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'filtroSql rechazado', ['Hay una comilla sin cerrar']);
  }
  const problemas = SQL_PROHIBIDO.filter((r) => r.patron.test(sinLiterales)).map((r) => r.motivo);
  if (problemas.length) throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'filtroSql rechazado', problemas);

  // Dentro de un valor, Tango corta el SQL en ";" y en estas palabras (probado el
  // 2026-10-09, docs/tango/api-lectura.md). Se avisa claro en vez del error de Tango.
  for (const literal of literales) {
    const m = TANGO_CORTA_EN_VALOR.exec(literal);
    if (m) {
      throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'filtroSql: Tango no admite este valor', [
        `Tango corta el SQL en "${m[0]}" aunque esté entre comillas: usar LIKE con otra parte del texto`,
      ]);
    }
  }
}

/** Lo que Tango no tolera dentro de un literal de `filtroSql`. */
const TANGO_CORTA_EN_VALOR = /;|\b(insert|update|delete|drop|alter|create|exec)\b/i;

function validarFecha(nombre: string, valor: string | undefined): void {
  if (valor === undefined || valor === '') return;
  if (!FECHA_TANGO.test(valor)) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, `${nombre} con formato inválido`, [
      'Formatos: dd/MM/yyyy (01/02/2026) o yyyy-MM-ddTHH:mm:ss (2026-02-01T00:00:00)',
    ]);
  }
}
