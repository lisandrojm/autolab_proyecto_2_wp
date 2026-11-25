import type { DataSourceOptions } from 'typeorm';
import type { Configuracion } from '../config/configuracion';
import { ENTIDADES } from './entidades';
import { Inicial1760000000000 } from './migraciones/1760000000000-inicial';
import { EmpresaPorCompanyId1760100000000 } from './migraciones/1760100000000-empresa-por-company-id';
import { CredencialesWeb1760200000000 } from './migraciones/1760200000000-credenciales-web';
import { AuditoriaEscrituras1760300000000 } from './migraciones/1760300000000-auditoria-escrituras';

export function opcionesDb(config: Configuracion): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.db.host,
    port: config.db.puerto,
    database: config.db.nombre,
    username: config.db.usuario,
    password: config.db.password,
    entities: ENTIDADES,
    migrations: [Inicial1760000000000, EmpresaPorCompanyId1760100000000, CredencialesWeb1760200000000, AuditoriaEscrituras1760300000000],
    // El esquema lo definen las migraciones, nunca la sincronización automática.
    synchronize: false,
  };
}
