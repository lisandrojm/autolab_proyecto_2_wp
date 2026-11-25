import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeyGuard } from './auth/api-key.guard';
import { ApiKeysService } from './auth/api-keys.service';
import { CatalogoService } from './catalogo/catalogo.service';
import { MetaController } from './catalogo/meta.controller';
import { FiltroErrores } from './comun/errores';
import { CONFIGURACION, leerConfiguracion, type Configuracion } from './config/configuracion';
import { ApiKey, AuditoriaEscritura, Empresa, Tenant } from './database/entidades';
import { opcionesDb } from './database/opciones-db';
import { HealthController } from './health.controller';
import { TangoClient } from './tango/tango.client';
import { TangoController } from './tango/tango.controller';
import { ProveedoresController } from './proveedores/proveedores.controller';
import { ProveedoresService } from './proveedores/proveedores.service';
import { CentrosCostoCompraController } from './tango-web/centros-costo-compra.controller';
import { OrdenesPagoController } from './tango-web/ordenes-pago.controller';
import { OrdenesPagoService } from './tango-web/ordenes-pago.service';
import { CentrosCostoCompraService } from './tango-web/centros-costo-compra.service';
import { PerfilesCompraController } from './tango-web/perfiles-compra.controller';
import { PerfilesCompraService } from './tango-web/perfiles-compra.service';
import { FETCH_WEB, SesionesWebService } from './tango-web/sesiones-web.service';
import { TenantsService } from './tenants/tenants.service';

const configuracion = { provide: CONFIGURACION, useFactory: () => leerConfiguracion() };

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [CONFIGURACION],
      extraProviders: [configuracion],
      useFactory: (config: Configuracion) => opcionesDb(config),
    }),
    TypeOrmModule.forFeature([Tenant, Empresa, ApiKey, AuditoriaEscritura]),
  ],
  // Los controllers propios antes que TangoController: su ruta ':endpoint' también matchearía
  // 'perfiles-de-factura-de-compra', 'centros-de-costo-de-comprobantes-de-compra' y 'proveedores'.
  controllers: [HealthController, MetaController, PerfilesCompraController, CentrosCostoCompraController, OrdenesPagoController, ProveedoresController, TangoController],
  providers: [
    configuracion,
    CatalogoService,
    ApiKeysService,
    TenantsService,
    TangoClient,
    SesionesWebService,
    PerfilesCompraService,
    CentrosCostoCompraService,
    OrdenesPagoService,
    ProveedoresService,
    { provide: FETCH_WEB, useValue: globalThis.fetch },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_FILTER, useClass: FiltroErrores },
  ],
  exports: [ApiKeysService, TenantsService],
})
export class AppModule {}
