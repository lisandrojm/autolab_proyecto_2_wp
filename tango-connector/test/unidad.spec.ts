import { HttpStatus } from '@nestjs/common';
import { endpointsPermitidos, puedeUsarEmpresa } from '../src/auth/permisos';
import { CatalogoService } from '../src/catalogo/catalogo.service';
import { ErrorConnector } from '../src/comun/errores';
import type { Configuracion } from '../src/config/configuracion';
import { cifrar, descifrar } from '../src/database/cifrado';
import type { Permisos } from '../src/database/entidades';
import { validarFiltroSql, validarRequest } from '../src/tango/validaciones';

const CATALOGO = 'docs/tango/catalogo/2026-10-08';

function catalogoReal(): CatalogoService {
  const c = new CatalogoService({ catalogoDir: CATALOGO } as Configuracion);
  c.cargar(CATALOGO);
  return c;
}

/** Ejecuta y devuelve el status del ErrorConnector, o `ok`. */
function resultado(f: () => unknown): HttpStatus | 'ok' {
  try {
    f();
    return 'ok';
  } catch (e) {
    if (e instanceof ErrorConnector) return e.getStatus();
    throw e;
  }
}

const lectura: Permisos = {
  empresas: ['cliente/fzero'],
  procesos: { '3142': ['Get', 'GetById', 'GetByFilter'], '*': ['GetApiLiveQueryData'] },
  filtroSql: true,
};

describe('catálogo', () => {
  const catalogo = catalogoReal();

  it('carga los procesos con API del relevamiento', () => {
    expect(catalogo.listar().length).toBe(662);
    expect(catalogo.obtener(3142)).toMatchObject({ descripcion: 'Proveedores', tipo: 'CRUD' });
    expect(catalogo.endpoint(3142, 'getbyid')?.nombre).toBe('GetById');
  });

  it('trae el schema de Create y las columnas de la vista', () => {
    const create = catalogo.endpoint(3142, 'Create');
    expect(create?.parametros.find((p) => p.nombre === 'data')?.schema).toMatchObject({ title: 'CPA01' });
    expect(catalogo.obtener(3142)?.tablas.AXV_PROVEEDOR).toContain('N_CUIT');
  });

  it('busca campos', () => {
    expect(catalogo.buscarCampos('n_cuit').some((c) => c.proceso === 3142)).toBe(true);
  });
});

describe('permisos', () => {
  it('empresa exacta o comodín del tenant', () => {
    expect(puedeUsarEmpresa(lectura, 'cliente', 'fzero')).toBe(true);
    expect(puedeUsarEmpresa(lectura, 'cliente', 'otra')).toBe(false);
    expect(puedeUsarEmpresa({ ...lectura, empresas: ['cliente/*'] }, 'cliente', 'otra')).toBe(true);
  });

  it('suma los endpoints del proceso y los de "*"', () => {
    expect([...endpointsPermitidos(lectura, 3142)].sort()).toEqual(
      ['get', 'getapilivequerydata', 'getbyfilter', 'getbyid'],
    );
  });

  it('los EXEC peligrosos no se habilitan aunque la key diga "*"', () => {
    expect(endpointsPermitidos({ ...lectura, procesos: { '*': ['Process'] } }, 19785).size).toBe(0);
  });
});

describe('validarRequest', () => {
  const catalogo = catalogoReal();
  const ctx = { catalogo, permisos: lectura, pageSizeMax: 1000 };
  const req = (endpoint: string, query: Record<string, unknown>, metodo = 'GET') => () =>
    validarRequest({ metodo, endpoint, query }, ctx);

  it('deja pasar una lectura permitida', () => {
    expect(resultado(req('Get', { process: '3142', pageSize: '100', view: '' }))).toBe('ok');
    expect(resultado(req('getbyid', { process: '3142', id: '1' }))).toBe('ok');
  });

  it('rechaza escrituras en esta etapa', () => {
    expect(resultado(req('Create', { process: '3142' }, 'POST'))).toBe(HttpStatus.FORBIDDEN);
  });

  it('exige process, que exista y que tenga el endpoint', () => {
    expect(resultado(req('Get', {}))).toBe(HttpStatus.BAD_REQUEST);
    expect(resultado(req('Get', { process: '999999' }))).toBe(HttpStatus.NOT_FOUND);
    expect(resultado(req('GetApiLiveQueryData', { process: '3142' }))).toBe(HttpStatus.BAD_REQUEST);
  });

  it('respeta los permisos de la key', () => {
    expect(resultado(req('Get', { process: '2117' }))).toBe(HttpStatus.FORBIDDEN);
    expect(resultado(req('GetApiLiveQueryData', { process: '10091', fromDate: '01/02/2026' }))).toBe('ok');
  });

  it('rechaza el método equivocado y los parámetros repetidos', () => {
    expect(resultado(req('Get', { process: '3142' }, 'POST'))).toBe(HttpStatus.METHOD_NOT_ALLOWED);
    expect(resultado(req('Get', { process: ['3142', '1'] }))).toBe(HttpStatus.BAD_REQUEST);
  });

  it('limita pageSize', () => {
    expect(resultado(req('Get', { process: '3142', pageSize: '1000' }))).toBe('ok');
    expect(resultado(req('Get', { process: '3142', pageSize: '5000' }))).toBe(HttpStatus.BAD_REQUEST);
  });

  it('valida las fechas de LIVE con los formatos de Tango', () => {
    const live = (fromDate: string) => req('GetApiLiveQueryData', { process: '10091', fromDate });
    expect(resultado(live('01/02/2026'))).toBe('ok');
    expect(resultado(live('2026-02-01T00:00:00'))).toBe('ok');
    expect(resultado(live(''))).toBe('ok');
    expect(resultado(live('2026-02-01'))).toBe(HttpStatus.BAD_REQUEST);
    expect(resultado(live('20260201'))).toBe(HttpStatus.BAD_REQUEST);
  });
});

describe('validarFiltroSql', () => {
  const ok = (sql: string) => resultado(() => validarFiltroSql(sql, lectura));

  it('acepta un WHERE común', () => {
    expect(ok("WHERE NOM_PROVEE LIKE 'A%'")).toBe('ok');
    expect(ok('where ID_CPA01 = 1')).toBe('ok');
  });

  it('exige WHERE y rechaza el filtro vacío', () => {
    expect(ok('ID_CPA01 = 1')).toBe(HttpStatus.BAD_REQUEST);
    expect(ok('')).toBe(HttpStatus.BAD_REQUEST);
  });

  it('rechaza varias sentencias, comentarios y escrituras', () => {
    expect(ok('WHERE 1=1; DROP TABLE CPA01')).toBe(HttpStatus.BAD_REQUEST);
    expect(ok('WHERE 1=1 -- x')).toBe(HttpStatus.BAD_REQUEST);
    expect(ok('WHERE 1=1 /* x */')).toBe(HttpStatus.BAD_REQUEST);
    expect(ok('WHERE ID_CPA01 IN (SELECT 1 INTO #t)')).toBe(HttpStatus.BAD_REQUEST);
    expect(ok("WHERE EXEC xp_cmdshell 'dir'")).toBe(HttpStatus.BAD_REQUEST);
  });

  it('no rechaza palabras ni símbolos dentro de un valor que Tango sí acepta', () => {
    expect(ok("WHERE NOM_PROVEE = 'GRANT THORNTON ARGENTINA SRL'")).toBe('ok');
    expect(ok("WHERE NOM_PROVEE = 'Transportes --Norte' OR NOM_PROVEE = 'sp_ventas'")).toBe('ok');
    expect(ok("WHERE NOM_PROVEE = 'O''Higgins /* x */ SELECT INTO'")).toBe('ok');
  });

  it('rechaza con mensaje claro lo que Tango corta dentro de un valor', () => {
    expect(ok("WHERE DOMICILIO = 'Av. Corrientes 1234; Piso 2'")).toBe(HttpStatus.BAD_REQUEST);
    expect(ok("WHERE NOM_PROVEE = 'CREATE SOLUTIONS SA'")).toBe(HttpStatus.BAD_REQUEST);
    expect(ok("WHERE NOM_PROVEE = 'ACME DELETE'")).toBe(HttpStatus.BAD_REQUEST);
  });

  it('pero sí lo que queda afuera de las comillas, y las comillas sin cerrar', () => {
    expect(ok("WHERE NOM_PROVEE = 'x'; DROP TABLE CPA01")).toBe(HttpStatus.BAD_REQUEST);
    expect(ok("WHERE NOM_PROVEE = 'x' -- '")).toBe(HttpStatus.BAD_REQUEST);
    expect(ok("WHERE NOM_PROVEE = 'x''; DROP TABLE CPA01 --")).toBe(HttpStatus.BAD_REQUEST);
  });

  it('es un permiso aparte', () => {
    expect(resultado(() => validarFiltroSql('WHERE 1=1', { ...lectura, filtroSql: false }))).toBe(
      HttpStatus.FORBIDDEN,
    );
  });
});

describe('cifrado', () => {
  const clave = Buffer.alloc(32, 7);

  it('ida y vuelta, con IV distinto cada vez', () => {
    const a = cifrar('token-secreto', clave);
    expect(a.startsWith('v1:')).toBe(true);
    expect(a).not.toContain('token-secreto');
    expect(a).not.toBe(cifrar('token-secreto', clave));
    expect(descifrar(a, clave)).toBe('token-secreto');
  });

  it('falla con otra clave', () => {
    expect(() => descifrar(cifrar('x', clave), Buffer.alloc(32, 8))).toThrow();
  });
});
