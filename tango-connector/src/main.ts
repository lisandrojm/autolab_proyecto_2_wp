import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HEADER_API_KEY } from './auth/api-key.guard';
import { cargarEnv, CONFIGURACION, type Configuracion } from './config/configuracion';

export const PREFIJO = 'v1';

async function arrancar(): Promise<void> {
  cargarEnv();
  // El módulo se importa después de cargar el .env: la configuración se lee al construirlo.
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule);
  const config = app.get<Configuracion>(CONFIGURACION);

  app.setGlobalPrefix(PREFIJO);
  app.enableShutdownHooks();

  const openapi = new DocumentBuilder()
    .setTitle('tango-connector')
    .setDescription(
      'La API de Tango Gestión, idéntica, con API key por plataforma (ADR 0002). ' +
        'Los endpoints /tango/... reciben los mismos parámetros que /Api/... de Tango.',
    )
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: HEADER_API_KEY }, HEADER_API_KEY)
    .addSecurityRequirements(HEADER_API_KEY)
    .build();
  SwaggerModule.setup(`${PREFIJO}/docs`, app, () => SwaggerModule.createDocument(app, openapi));

  await app.listen(config.puerto, config.host);
}

void arrancar();
