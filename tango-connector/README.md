# tango-connector

Servicio interno de Lumba. Es **la capa única de acceso a Tango Gestión** para los
proyectos de Lumba (comprobantes-to-tango y los que vengan).

Expone **la API de Tango, idéntica**: los mismos endpoints con los mismos parámetros, y la
respuesta de Tango sin cambios ([ADR 0002](docs/decisiones/0002-api-identica-a-tango.md)).
Cada plataforma se autentica con su propia API key, que define a qué empresas, procesos y
endpoints accede.

> **Estado: primera versión, solo lectura.** Funcionan `Get`, `GetById`, `GetByFilter`,
> `GetApiLiveQueryData` y `GetPdf` para los 662 procesos del catálogo, más los metadatos.
> Las escrituras (`Create`, `Update`, `Delete`, `Process`, `Custom`) responden 403 hasta
> que se habiliten, con la validación de schemas.

## Uso

```
GET /v1/tango/<tenant>/<empresa>/<Endpoint>?process=<id>&<los mismos parámetros que Tango>
X-Api-Key: <key de la plataforma>
```

Por ejemplo, lo que en Tango es `GET /Api/Get?process=3142&pageSize=100&pageIndex=0&view=`
en el connector es:

```
GET /v1/tango/servertango/pruebas-fzero/Get?process=3142&pageSize=100&pageIndex=0&view=
```

- **Empresa:** `<empresa>` es el slug con que está registrada (`fzero-srl`) o su Company ID
  de Tango (`3`). Las dos formas son equivalentes, y los permisos de la key se controlan igual.
- **Respuesta:** la de Tango, byte por byte. El header `X-Connector-Origin: tango` lo indica.
- **Rechazos del connector:** por key, permisos o validación. Responden con el código HTTP
  que corresponde, `X-Connector-Origin: connector` y un body con la forma de los errores de
  Tango (`succeeded`, `message`, `exceptionInfo.messages`).
- **Cómo se comporta cada endpoint de Tango** (fechas, `view`, paginado, `customQuery`):
  [`docs/tango/api-lectura.md`](docs/tango/api-lectura.md).
- **SDK TypeScript:** [`sdk/`](sdk/README.md). Tiene los mismos métodos que Tango, más
  tipos, `ErrorTango` con el detalle real y helpers: `todas`, `todasLive`, `paginas`,
  `pdf`, `fechaTango`, `sql`, `sqlLike`.

| Instancia | URL base |
| --------- | -------- |
| development | `https://www.somoslumba.site/development/tango-connector/v1` |
| local | `http://localhost:3100/v1` |

Cómo se despliega y se administra: [`docs/operacion/deploy.md`](docs/operacion/deploy.md).

### Resguardos antes de llegar a Tango

| Qué | Regla |
| --- | ----- |
| Empresa | La key tiene que tenerla en `empresas` (`tenant/empresa` o `tenant/*`) |
| Proceso y endpoint | Tienen que existir en el catálogo y estar permitidos en la key |
| Procesos bloqueados | 19785, 3436, 3359 y 3366 (EXEC del Administrador): nunca |
| `pageSize` | Máximo `TANGO_PAGE_SIZE_MAX`, 1.000 por defecto |
| `GetByFilter` | Permiso `filtroSql` de la key; empieza con `WHERE`. Fuera de las comillas: sin `;`, comentarios ni sentencias de escritura. Dentro: sin `;` ni INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, EXEC, porque Tango corta el SQL ahí |
| `fromDate`, `toDate` | `dd/MM/yyyy` o `yyyy-MM-ddTHH:mm:ss` |

### Datos de la web de Tango (ADR 0003)

Algunos datos no están en la API pública de Tango. El connector los lee de la web, con un
usuario técnico por servidor, y los expone como endpoints propios. **No son idénticos a
Tango.**

| Endpoint | Devuelve | Permiso de la key |
| -------- | -------- | ----------------- |
| `GET /v1/tango/<tenant>/<empresa>/perfiles-de-factura-de-compra` | `[{ id, codigo, descripcion }]` | `27:PerfilesDeFacturaDeCompra` |
| `GET /v1/tango/<tenant>/<empresa>/perfiles-de-factura-de-compra/:id` | La fila de `CPA128` tal cual | ídem |
| `GET /v1/tango/<tenant>/<empresa>/centros-de-costo-de-comprobantes-de-compra?idCpa04=…[&todos=true]` | Centros de costo reales de comprobantes de compra, una fila por comprobante × cuenta × centro | `-14024:CentrosDeCostoDeComprobantesDeCompra` |
| `GET /v1/tango/<tenant>/<empresa>/facturas-de-compra/:idCpa04/ordenes-de-pago` | Órdenes de pago que cancelan una factura, con lo que cancela cada una | `14162:OrdenesDePagoDeFacturaDeCompra` |
| `GET /v1/tango/<tenant>/<empresa>/facturas-de-compra/:idCpa04/relacionados` | Un comprobante de compra (factura, crédito o débito) con su estado, vencimientos y relacionados: órdenes de pago y comprobantes imputados | `14162:ComprobantesRelacionadosDeCompra` |
| `GET /v1/tango/<tenant>/<empresa>/ordenes-de-pago/:idCpa04` | La ficha de una OP: cabecera, valores (`pagadoCon`), imputaciones, retenciones y totales | `14184:OrdenDePago` |

- **Usuario técnico:** se carga con
  `npm run cli -- tenant:credenciales-web <tenant>`, que lo lee de `TANGO_WEB_USUARIO` y
  `TANGO_WEB_PASSWORD`.
- **Tests de contrato:** `npm run test:contrato` prueba los endpoints internos contra la web
  real. Hay que correrlo después de cada actualización de Tango y antes de cada deploy.

### Alta y actualización de proveedores (ADR 0004)

Las primeras escrituras. Parten del CUIT, suman los datos de ARCA y los valores por defecto
por la web de Tango, y escriben por la API pública. Cada escritura queda en
`auditoria_escrituras`.

| Endpoint | Hace | Permiso de la key |
| -------- | ---- | ----------------- |
| `POST /v1/tango/<tenant>/<empresa>/proveedores/vista-previa` | Arma el alta sin escribir: `{ listo, cuerpo, faltantes, avisos, arca }` | `3142:AltaDeProveedor` |
| `POST /v1/tango/<tenant>/<empresa>/proveedores` | `{ cuit, cbu?, descripcionCbu?, codigoProvincia? }` → 201 `{ id, codigo, proveedor, avisos }` | ídem |
| `PATCH /v1/tango/<tenant>/<empresa>/proveedores/:id` | `{ cbu?, descripcionCbu? }` (`null` borra) → `{ id, proveedor }` | `3142:ActualizarProveedor` |

Errores: 400 datos inválidos, 409 CUIT o código ya cargado, 422 ARCA sin datos o faltan
obligatorios (con la lista y cómo resolverlos), 502 Tango rechazó. Ver
`docs/tango/alta-proveedores.md`.

### Metadatos

Salen del catálogo relevado (`CATALOGO_DIR`). Muestran solo lo que la key puede usar.

| Endpoint | Devuelve |
| -------- | -------- |
| `GET /v1/meta/yo` | La key: plataforma y permisos |
| `GET /v1/meta/procesos?tipo=&modulo=&buscar=` | Los procesos y sus endpoints permitidos |
| `GET /v1/meta/procesos/:id` | Endpoints con parámetros, schemas y columnas de cada tabla |
| `GET /v1/meta/campos?buscar=cuit` | En qué procesos y tablas está un campo |
| `GET /v1/docs` | OpenAPI (Swagger UI) |
| `GET /v1/health` | Estado de la base y del catálogo (sin key) |

## Desarrollo

```bash
npm install
cp .env.example .env      # completar CLAVE_CIFRADO y TANGO_API_TOKEN
docker compose up -d      # Postgres en 127.0.0.1:5433
npm run build
npm run migration:run
npm run cli -- tenant:crear servertango "Servidor Tango" http://servertango:17000
npm run cli -- empresa:crear servertango pruebas-fzero "PRUEBAS FZERO" 13   # token desde TANGO_API_TOKEN
npm run cli -- key:crear mi-plataforma --empresas servertango/pruebas-fzero \
  --procesos "*:Get,GetById,GetApiLiveQueryData" [--filtro-sql]
npm run start:prod        # http://localhost:3100/v1
npm test
```

- **Token de Tango:** el de cada empresa se guarda cifrado (AES-256-GCM con
  `CLAVE_CIFRADO`). El CLI lo lee de una variable de entorno, nunca de un argumento.
- **API keys:** se muestran una sola vez y se guarda solo su hash. `key:listar` y
  `key:desactivar <prefijo>` las administran.
- **`--procesos`:** `id:Endpoint,Endpoint;id:Endpoint;*:Endpoint`. `*` vale para todos
  los procesos.

## Cómo se ubica

```
proyectos Lumba ──HTTPS + API key──► tango-connector (VPS, PM2)
                                        │  127.0.0.1:{puerto del tunel}
                                        ▼
                                     frps ── tunel FRP ──► frpc ──► Tango (servertango:17000)
```

- Corre en el **mismo VPS** donde termina el túnel FRP. Llega a cada servidor Tango por
  `127.0.0.1:{puerto}`, igual que lumba-tango.
- **lumba-tango** sigue funcionando como app interna con su propio proxy. Más adelante
  puede pasar a ser un consumidor del connector, pero no es requisito.

## Stack

| Capa      | Tecnología                                           |
| --------- | ---------------------------------------------------- |
| Servicio  | NestJS + TypeScript                                  |
| Datos     | PostgreSQL + TypeORM (tenants, empresas, API keys)   |
| Contrato  | REST `/v1` + OpenAPI (`@nestjs/swagger`)             |
| Metadatos | Catálogo relevado en `docs/tango/catalogo/<fecha>/`  |
| Deploy    | VPS + PM2 + nginx (HTTPS); todavía no desplegado     |

## Antecedentes

El relevamiento y la propuesta original están en `lumba-tango`, en
`docs/research/connector-tango/`:

| Documento | Contenido |
| --------- | --------- |
| `01` | Estado actual de lumba-tango: túnel, auth, API Tango, hallazgos de seguridad |
| `02` | Matriz de necesidades de comprobantes-to-tango |
| `03` | Arquitectura: contrato, auth, caché, errores |
| `04` | Plan por etapas. La etapa 1 queda reemplazada por este repo; ver ADR 0001 |
| `05` | Preguntas abiertas |

## Conexión al VPS

Copiar `.vps.example` como `.vps` y completarlo. `.vps` está en `.gitignore`: **nunca se
commitea**.
