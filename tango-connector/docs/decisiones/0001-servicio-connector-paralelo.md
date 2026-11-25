# ADR 0001 — tango-connector como servicio paralelo a lumba-tango

- **Fecha:** 2026-10-08
- **Estado:** Aceptada. El diseño de la API lo reemplaza en parte el
  [ADR 0002](0002-api-identica-a-tango.md).
- **Contexto previo:** `lumba-tango/docs/research/connector-tango/` (relevamiento y propuesta)

## Contexto

### Qué hay hoy

El único acceso a Tango que tiene Lumba es el proxy del backend de lumba-tango. Ese proxy:

- exige el login de un usuario de lumba-tango (JWT en cookie);
- usa el token de Tango **personal** de cada usuario;
- no tiene operaciones de dominio.

comprobantes-to-tango (y, a futuro, comprobantes-middleware y mendel-to-tango-jsa) necesitan
consultar proveedores por CUIT, dar de alta proveedores, leer maestros y consultar
comprobantes. Todos esos casos son máquina a máquina.

### Qué proponía el relevamiento

La recomendación fue "servicio connector + SDK tipado" (opciones B + C), en dos pasos: un
módulo aislado dentro del backend de lumba-tango y, después, su extracción.

### Qué cambió

El túnel FRP termina en el VPS, y Lumba tiene acceso a ese VPS. Cualquier proceso que corra
ahí llega a cada servidor Tango por `127.0.0.1:{puerto}`. Con eso, el paso intermedio por
dentro de lumba-tango deja de aportar.

## Decisión

### El servicio

- Se crea **tango-connector**, un servicio nuevo en un repo propio (`LumbaDev/tango-connector`).
- Se despliega en el **mismo VPS que el túnel**.
- Toma de lumba-tango solo lo que sirve:
  - el núcleo del proxy HTTP a Tango;
  - los tipos de respuesta;
  - la lógica de "próximo código";
  - el conocimiento de los procesos y filtros de los maestros;
  - los JSON-schema de los procesos usados.
- **lumba-tango no se modifica.** Sigue como plataforma interna con su propio proxy. Si
  migra a consumir el connector, se decide más adelante.

### Stack

NestJS + TypeScript, PostgreSQL, REST `/v1` con OpenAPI y un SDK TypeScript generado.

### Diseño

Se mantiene lo de la propuesta, `03-propuesta-arquitectura.md` de lumba-tango:

- API key por consumidor, con scopes y empresas permitidas.
- Token de servicio de Tango por empresa: usuario técnico, guardado cifrado.
- ~~Endpoints de dominio. El `filtroSql` se arma del lado del servidor.~~ Reemplazado por
  el ADR 0002: la API es idéntica a la de Tango.
- Acceso raw con allowlist. En el ADR 0002, todo el acceso es "raw", con allowlist por
  proceso y endpoint.
- ~~Errores normalizados con `problem+json`.~~ Reemplazado por el ADR 0002: las respuestas
  de Tango pasan sin cambios, y los errores del connector usan la misma forma.
- Caché de maestros.
- Concurrencia limitada por tenant y circuit breaker.
- Auditoría de escrituras.

## Consecuencias

### Positivas

- Cero riesgo sobre lumba-tango y su roadmap.
- Repo limpio, sin secretos en el historial.
- Se llega directo a la arquitectura final, sin la etapa intermedia.

### Negativas y costos

- **Dos caminos hacia Tango** (el proxy de lumba-tango y el connector) mientras convivan.
- **Registro de servidores y empresas duplicado:** lumba-tango lo tiene en Mongo y el
  connector en Postgres. Se acepta mientras sean pocas filas.
- **Un servicio más para operar en el VPS:** PM2, nginx, monitoreo de `/health`.

### Lo que sigue aplicando sin cambios

La etapa 0 de seguridad (`04-plan-de-migracion.md`):

- rotar el token de FRP;
- cerrar al exterior los puertos de túnel 8003+;
- rotar los secretos commiteados en lumba-tango.

El connector usa el mismo túnel, así que lo hereda.

## Próximos pasos

1. Relevar el VPS en **modo solo lectura**: frps, puertos expuestos, nginx, PM2 y Postgres.
2. Plan de deploy y etapa 0.
3. Scaffold de NestJS y etapa 1: proveedores por CUIT, maestros, OpenAPI y SDK.
