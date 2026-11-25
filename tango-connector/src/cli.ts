/**
 * Administración del connector, desde la consola del servidor.
 *
 *   npm run cli -- tenant:crear <slug> <nombre> <urlBase>
 *   npm run cli -- empresa:crear <tenant> <slug> <nombre> <tangoCompanyId> [--token-env VARIABLE]
 *   npm run cli -- tenant:credenciales-web <tenant> [--usuario-env VARIABLE] [--password-env VARIABLE]
 *   npm run cli -- tenants:listar
 *   npm run cli -- key:crear <plataforma> --empresas <t/e,...> --procesos <id:Ep,Ep;id:Ep;*:Ep> [--filtro-sql]
 *   npm run cli -- key:permisos <prefijo> --empresas <t/e,...> --procesos <...> [--filtro-sql]
 *   npm run cli -- key:listar
 *   npm run cli -- key:desactivar <prefijo>
 *
 * El token de Tango de una empresa nunca va como argumento (quedaría en el historial de la
 * consola): se lee de una variable de entorno, por defecto TANGO_API_TOKEN. Lo mismo el usuario
 * y la contraseña web del tenant: TANGO_WEB_USUARIO y TANGO_WEB_PASSWORD (ADR 0003).
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ApiKeysService } from './auth/api-keys.service';
import { cargarEnv } from './config/configuracion';
import type { Permisos } from './database/entidades';
import { TenantsService } from './tenants/tenants.service';

function opcion(args: string[], nombre: string): string | undefined {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
}

/** `3142:Get,GetById;*:Get` → `{ "3142": ["Get","GetById"], "*": ["Get"] }` */
function parsearProcesos(texto: string): Permisos['procesos'] {
  const procesos: Permisos['procesos'] = {};
  for (const parte of texto.split(';').filter(Boolean)) {
    const [id, endpoints] = parte.split(':');
    if (!id || !endpoints) throw new Error(`--procesos mal formado: "${parte}"`);
    procesos[id.trim()] = endpoints.split(',').map((e) => e.trim()).filter(Boolean);
  }
  return procesos;
}

async function main(args: string[]): Promise<void> {
  cargarEnv();
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const tenants = app.get(TenantsService);
  const keys = app.get(ApiKeysService);
  const [comando, ...resto] = args;

  try {
    switch (comando) {
      case 'tenant:crear': {
        const [slug, nombre, urlBase] = resto;
        if (!slug || !nombre || !urlBase) throw new Error('Uso: tenant:crear <slug> <nombre> <urlBase>');
        const t = await tenants.crearTenant(slug, nombre, urlBase);
        console.log(`Tenant ${t.slug} → ${t.urlBase}`);
        break;
      }
      case 'empresa:crear': {
        const [tenant, slug, nombre, companyId] = resto;
        if (!tenant || !slug || !nombre || !companyId) {
          throw new Error('Uso: empresa:crear <tenant> <slug> <nombre> <tangoCompanyId> [--token-env VARIABLE]');
        }
        const variable = opcion(resto, '--token-env') ?? 'TANGO_API_TOKEN';
        const token = process.env[variable];
        if (!token) throw new Error(`La variable ${variable} está vacía: ahí va el token de Tango de la empresa`);
        const e = await tenants.crearEmpresa(tenant, { slug, nombre, tangoCompanyId: Number(companyId), token });
        console.log(`Empresa ${tenant}/${e.slug} (Company ${e.tangoCompanyId}), token cifrado desde ${variable}`);
        break;
      }
      case 'tenant:credenciales-web': {
        const [tenant] = resto;
        if (!tenant) throw new Error('Uso: tenant:credenciales-web <tenant> [--usuario-env VARIABLE] [--password-env VARIABLE]');
        const varUsuario = opcion(resto, '--usuario-env') ?? 'TANGO_WEB_USUARIO';
        const varPassword = opcion(resto, '--password-env') ?? 'TANGO_WEB_PASSWORD';
        const usuario = process.env[varUsuario];
        const password = process.env[varPassword];
        if (!usuario || !password) throw new Error(`Faltan ${varUsuario} y/o ${varPassword}: el usuario técnico de la web de Tango`);
        await tenants.guardarCredencialesWeb(tenant, usuario, password);
        console.log(`Credenciales web de ${tenant} guardadas cifradas (usuario desde ${varUsuario})`);
        console.log('El servicio las toma al reiniciarse: pm2 reload tango-connector-<entorno>');
        break;
      }
      case 'tenants:listar': {
        for (const t of await tenants.listar()) {
          console.log(`${t.slug}  ${t.urlBase}  ${t.nombre}  usuario web: ${t.webUsuarioCifrado ? 'sí' : 'no'}`);
          for (const e of t.empresas) console.log(`  ${t.slug}/${e.slug}  Company ${e.tangoCompanyId}  ${e.nombre}`);
        }
        break;
      }
      case 'key:crear': {
        const [plataforma] = resto;
        const empresas = opcion(resto, '--empresas');
        const procesos = opcion(resto, '--procesos');
        if (!plataforma || !empresas || !procesos) {
          throw new Error('Uso: key:crear <plataforma> --empresas <t/e,...> --procesos <id:Ep,Ep;*:Ep> [--filtro-sql]');
        }
        const permisos: Permisos = {
          empresas: empresas.split(',').map((e) => e.trim()),
          procesos: parsearProcesos(procesos),
          filtroSql: resto.includes('--filtro-sql'),
        };
        const { key, apiKey } = await keys.crear(plataforma, permisos);
        console.log(`Key de ${apiKey.plataforma} (prefijo ${apiKey.prefijo}):`);
        console.log(JSON.stringify(permisos, null, 2));
        console.log(`\n${key}\n\nSe muestra una sola vez: guardarla en la plataforma.`);
        break;
      }
      case 'key:permisos': {
        // Reemplaza los permisos completos (no los suma): se pasan como en key:crear.
        const [prefijo] = resto;
        const empresas = opcion(resto, '--empresas');
        const procesos = opcion(resto, '--procesos');
        if (!prefijo || !empresas || !procesos) {
          throw new Error('Uso: key:permisos <prefijo> --empresas <t/e,...> --procesos <id:Ep,Ep;*:Ep> [--filtro-sql]');
        }
        const permisos: Permisos = {
          empresas: empresas.split(',').map((e) => e.trim()),
          procesos: parsearProcesos(procesos),
          filtroSql: resto.includes('--filtro-sql'),
        };
        const apiKey = await keys.cambiarPermisos(prefijo, permisos);
        if (!apiKey) throw new Error(`No hay key ${prefijo}`);
        console.log(`Permisos de ${apiKey.plataforma} (prefijo ${apiKey.prefijo}):`);
        console.log(JSON.stringify(permisos, null, 2));
        break;
      }
      case 'key:listar': {
        for (const k of await keys.listar()) {
          console.log(
            `${k.prefijo}  ${k.activa ? 'activa  ' : 'inactiva'}  ${k.plataforma}  empresas: ${k.permisos.empresas.join(',')}  filtroSql: ${k.permisos.filtroSql ? 'sí' : 'no'}  último uso: ${k.ultimoUso?.toISOString() ?? '-'}`,
          );
        }
        break;
      }
      case 'key:desactivar': {
        const [prefijo] = resto;
        if (!prefijo) throw new Error('Uso: key:desactivar <prefijo>');
        console.log((await keys.desactivar(prefijo)) ? `Key ${prefijo} desactivada` : `No hay key ${prefijo}`);
        break;
      }
      default:
        console.log('Comandos: tenant:crear, tenant:credenciales-web, empresa:crear, tenants:listar, key:crear, key:permisos, key:listar, key:desactivar');
    }
  } finally {
    await app.close();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
