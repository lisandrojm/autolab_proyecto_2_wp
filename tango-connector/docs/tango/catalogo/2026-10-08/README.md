# Relevamiento 2026-10-08

- **Tango:** 25.01.000.4263
- **Empresa:** PRUEBAS FZERO (13)
- **Origen:** la web de Tango (`GetMenuItems`, `getapi`, `formdefinition`, `getdata`). Solo
  lectura.
- **Alcance:** el árbol de menús completo, la API de cada proceso web, el form y los datos
  de los CRUD, y el catálogo de lectura.

## Archivos

| Archivo           | Contenido                                                       |
| ----------------- | --------------------------------------------------------------- |
| `menu/*.json`     | La respuesta de `GetMenuItems` de cada módulo, sin cambios      |
| `procesos.csv`    | Una fila por proceso: módulo, `accessNumber`, ruta, descripción, `migrated` |
| `candidatos.csv`  | Los procesos web (`migrated`), uno por fila                     |
| `api.csv`         | Qué API tiene cada candidato: tipo, endpoints, tablas           |
| `crud.json`       | Resultado de `formdefinition` y `getdata` de cada CRUD          |
| `lectura.csv`     | Los procesos que se pueden leer por API, con sus tablas         |
| `campos.csv`      | Un campo por fila: en qué proceso y tabla está cada dato        |
| `procesos/`       | Los JSON de cada proceso (`-api`, `-form`, `-data`)             |
| `meta.json`       | Fecha de captura, empresa y versión                             |

## Totales

| Módulo              | ID    | Procesos en el menú | Web (`migrated`) |
| ------------------- | ----- | ------------------: | ---------------: |
| Ventas              | 10023 | 361                 | 202              |
| Stock               | 10002 | 144                 | 62               |
| Compras             | 10003 | 239                 | 113              |
| Tesorería           | 10005 | 132                 | 78               |
| Cash Flow           | 10006 | 12                  | 0                |
| Contabilidad        | 6     | 63                  | 32               |
| Sueldos             | 8     | 207                 | 164              |
| Control de personal | 9     | 72                  | 30               |
| Procesos generales  | 11    | 140                 | 117              |
| Live                | 53    | 436                 | 423              |
| Administrador       | 51    | 53                  | 43               |
| Aplicaciones nexo   | 10026 | 11                  | 11               |
| **Total**           |       | **1.870**           |                  |

- Un mismo proceso puede aparecer en más de un lugar del menú. Hay **1.440 procesos
  distintos**, y **856** de ellos son web.
- Live, Administrador y Aplicaciones nexo **no estaban** en el relevamiento de abril.

## Comparación con el relevamiento de abril

La comparación se hace sobre los 9 módulos que se relevaron en abril.

| Dato                                                        | Cantidad |
| ----------------------------------------------------------- | -------: |
| Procesos con API en abril (`hasAPI`)                        | 566      |
| …que hoy siguen en el menú y son web                        | 566 (todos) |
| Procesos de abril que ya no están en el menú                | 0        |
| Procesos web hoy que en abril **no** tenían API             | 232      |
| …de esos, en abril figuraban con `hasAPI=false`             | 146      |
| …de esos, en abril no figuraban (o figuraban sin ID)        | 86       |

**Qué indica:**
- **No se perdió nada.** Todo lo que tenía API en abril sigue en el menú y sigue siendo web.
- **`migrated` no equivale a "tiene API".** Ser web es condición para tener API, pero no
  alcanza. Hay 232 procesos web que en abril no tenían API: pueden ser procesos que
  pasaron a web con la actualización o procesos web sin API.
- **Hay que revisar proceso por proceso.** La revisión de la API de cada proceso web es lo
  que confirma qué tiene API hoy.

## Lo que importa para el connector (Compras)

| Proceso                                          | ID    | Web | Nota |
| ------------------------------------------------ | ----- | --- | ---- |
| Proveedores                                      | 3142  | ✅  | Ya tenía API |
| Alícuotas, Condiciones de compra                 | 19759, 3479 | ✅ | Ya tenían API |
| Factura, Factura - Remito, Factura de Conceptos  | 10302, 10301, 10303 | ❌ | Sigue sin versión web → **sin API** |
| Notas de crédito y débito                        | 10305–10309 | ❌ | Sin API |
| Modificación / Baja de comprobantes              | 10326, 10325 | ❌ | Sin API |
| **Importación masiva de comprobantes por Excel** | 21397 | ✅  | **Nuevo en el menú.** Candidato para cargar comprobantes. Revisar su API. |
| **Comprobantes por AI**: Administrador, Revisión, Sincronización | 21438, 21508, 21518 | ✅ | **Nuevos.** Revisar qué exponen. |
| Remitos: Ingreso por Excel o Colectora           | 20343 | ✅  | Antes `hasAPI=false` |
| Datos de la empresa                              | 1050  | ✅  | Antes `hasAPI=false`. Revisar si ahora da el CUIT de la empresa. |
| Clasificación para retenciones                   | 21885 | ✅  | Nuevo |

## Candidatos a tener API (`candidatos.csv`)

Solo puede tener API un ítem con `isProcess: true` y `migrated: true`. Que cumpla las dos
condiciones no garantiza que la tenga. `candidatos.csv` es esa lista, con un proceso por
fila: si aparece en varios lugares del menú, el resto queda en `otrasUbicaciones`. Lo
genera `scripts/catalogo/candidatos.py`.

| Módulo              | Candidatos | Con API en abril | Sin API en abril | No figuraba en abril |
| ------------------- | ---------: | ---------------: | ---------------: | -------------------: |
| Ventas              | 202        | 169              | 31               | 2                    |
| Stock               | 62         | 43               | 17               | 2                    |
| Compras             | 113        | 87               | 16               | 10                   |
| Tesorería           | 78         | 59               | 13               | 6                    |
| Contabilidad        | 32         | 18               | 3                | 11                   |
| Sueldos             | 164        | 126              | 21               | 17                   |
| Control de personal | 30         | 6                | 1                | 23                   |
| Procesos generales  | 117        | 58               | 44               | 15                   |
| Live                | 4          | —                | —                | 4                    |
| Administrador       | 43         | —                | —                | 43                   |
| Aplicaciones nexo   | 11         | —                | —                | 11                   |
| **Total**           | **856**    | **566**          | **146**          | **144**              |

- Casi todo lo de Live (423 de 427 procesos web) son accesos directos a procesos de otros
  módulos. Por eso en la tabla quedan solo 4 propios.
- Cash Flow no tiene ningún proceso web.
- Hay que revisar 856 procesos. Los 290 que en abril no tenían API (146 + 144) son los que
  pueden cambiar con la actualización.

## API de cada proceso (`api.csv` y `procesos/`)

Para cada uno de los 856 candidatos se pidió `GET /processresolver/getapi?action={id}`. Es
lo que carga la página **Apertura > API** del proceso (`/company/13/api/{id}`). Fueron solo
lecturas, con los encabezados de la sesión web.

**Cómo se interpreta la respuesta**

| Respuesta de `getapi`              | Estado    | Tipo según los endpoints                               |
| ---------------------------------- | --------- | ------------------------------------------------------ |
| Trae `paths`                       | `api`     | **CRUD** si hay Create, Update o Delete<br>**LIVE** si hay `GetApiLiveQueryData`<br>**EXEC** si hay `Process` o `Custom`<br>**PDF** si solo hay `GetPdf` |
| Trae solo `tables`, sin `paths`    | `sin-api` | —                                                      |
| `succeeded: false`                 | `error`   | Siempre "Se detectó una situación inesperada"          |

**Archivos**
- `procesos/<Módulo>/<id>/<id>-api.json`: la respuesta completa de cada proceso con API.
- `procesos/<Módulo>/_indice.json`: todos los candidatos del módulo, con su estado, tipo,
  endpoints y tablas.
- `api.csv`: todo junto, un proceso por fila. Lo genera `scripts/catalogo/api.py`.

**Totales**

| Módulo              | Candidatos | Con API | CRUD | LIVE | EXEC | PDF | Sin API | Error |
| ------------------- | ---------: | ------: | ---: | ---: | ---: | -----: | ------: | ----: |
| Ventas              | 202        | 174     | 47   | 118  | 5    | 4      | 25      | 3     |
| Stock               | 62         | 45      | 16   | 28   | 1    | 0      | 15      | 2     |
| Compras             | 113        | 95      | 29   | 59   | 5    | 2      | 15      | 3     |
| Tesorería           | 78         | 64      | 17   | 43   | 4    | 0      | 12      | 2     |
| Contabilidad        | 32         | 25      | 10   | 12   | 3    | 0      | 5       | 2     |
| Sueldos             | 164        | 137     | 69   | 63   | 5    | 0      | 25      | 2     |
| Control de personal | 30         | 29      | 5    | 23   | 1    | 0      | 1       | 0     |
| Procesos generales  | 117        | 61      | 32   | 25   | 4    | 0      | 55      | 1     |
| Administrador       | 43         | 23      | 4    | 11   | 8    | 0      | 20      | 0     |
| Aplicaciones nexo   | 11         | 9       | 0    | 0    | 9    | 0      | 1       | 1     |
| Live                | 4          | 1       | 0    | 1    | 0    | 0      | 2       | 1     |
| **Total**           | **856**    | **663** | **229** | **383** | **45** | **6** | **176** | **17** |

En abril había 566 procesos con API, y hoy hay 663. **Ninguno de los 566 perdió la API.**

**Notas**
- Live `-10002` ("PEDIDO/COTIZACION") tiene API LIVE, pero su ID es negativo. Está en el
  índice y no se guardó su JSON.
- Los 17 con error son casi todos "Actualización global …" y "Depuración …". Son procesos
  web cuya página de API no carga.
- **Faltan cosas que el relevamiento de abril sí tenía:** en `getapi` ya no aparecen los
  endpoints `InternalApi/*`. Proveedores, por ejemplo, tenía `InternalApi/Create`,
  `Update`, `Delete` y `GetById`.

## Hallazgos para el connector

| Proceso | ID | Resultado |
| ------- | -- | --------- |
| Importación masiva de comprobantes por Excel | 21397 | **Sin API.** Igual, en `tables` declara `IngresoMasivoDeComprobantesPorExcelApiParams` y `CPA128`, lo que sugiere una API de parámetros a futuro. |
| Sincronización de comprobantes (AI) | 21518 | **EXEC** (`Process`, `Custom`), con parámetros `AsistenteSincronizacionComprobantesApiParams` |
| Administrador / Revisión de comprobantes por AI | 21438, 21508 | Sin API |
| Datos de la empresa | 1050 | Sin API. Tablas `EMPRESA`, … |
| **Empresas** (Administrador) | 1418 | **CRUD nuevo.** Puede ser la fuente para listar empresas y su CUIT. También existe LIVE 20177. |
| Fichas Live de comprobantes (Ventas y Compras) | 14077, 14154, 14184, … | **PDF** (`GetPdf`): el PDF del comprobante |
| Clasificación para retenciones | 21885 | CRUD nuevo |
| Proveedores | 3142 | Igual que en abril, más 2 campos (`E_MAIL_OP`, `ID_CLASIFICACION_RETENCION`) |

**Los EXEC del Administrador son peligrosos.** Restaurar empresa, Instalar actualizaciones,
Compactar base y Restablecer configuración técnica tienen `Api/Process`. El connector
**nunca** debe exponerlos: el allowlist del acceso raw tiene que excluirlos explícitamente.

## Formulario y datos de los CRUD (`-form.json`, `-data.json`)

Son los dos requests que hace la página `/abm/{id}` del proceso. Acá se piden directo, con el
ID en el body:

```
POST /processresolver/formdefinition   { "action": <id>, "context": { "companyId": 13 } }
POST /processresolver/getdata          { "processNumber": <id>,
                                         "data": { "pageIndex": 0, "pageSize": 100,
                                                   "filter": { "condition": 0, "rules": [], ... },
                                                   "columns": [] } }
```

- **`getdata` sin `columns` devuelve todos los campos.** La página manda solo las columnas
  de la consulta por defecto; en abril los `-data.json` traían esas columnas, por ejemplo 8
  en Proveedores. Acá se guarda la **primera página completa** (hasta 100 registros, con
  todos los campos). `resultData.totalCount` dice cuántos registros hay en total.
- **Archivos:** `procesos/<Módulo>/<id>/<id>-form.json` y `<id>-data.json`, para los 229
  CRUD. Pesan ~134 MB formateados; el más grande es un form de 7,5 MB (Ventas 12290).
- **Resultado de cada uno:** `crud.json`.

| Resultado | Cantidad |
| --------- | -------: |
| `formdefinition` OK | 228 de 229 (21248 pendiente) |
| `getdata` OK | 229 de 229 (160 con registros) |

**`columns: []` no sirve en todos los procesos.** En 7 procesos, Tango pide todas las columnas
del modelo, y algunas no existen en la base de la empresa. Responde "Se detectó una
situación inesperada", y el detalle real viene en `exceptionInfo.messages`.

| Proceso | Detalle del error con `columns: []` |
| ------- | ----------------------------------- |
| 259 Chequeras, 1377 (Sueldos) | `Invalid column name 'CAMPOS_ADICIONALES'`, `'ROW_VERSION'` |
| 1273 (Sueldos) | `Invalid column name 'ROW_VERSION'` |
| 2832 Embargos y obligaciones | `Invalid column name 'ROW_VERSION'`, `'TIPO_CUENTA_BANCO'` |
| 21434 (Ventas) | `Invalid column name 'TIPO_COTIZ'` |
| 12263, 20020 (Ventas) | `Data is Null. This method or property cannot be called on Null values.` |

Para esos 7 se piden las columnas de la grilla del form, que son los controles
`<campo>_column_` de `gridMode`. Se mandan explícitas, con `context: { companyId: 13 }`,
como hace la web. 2832 trae `TIPO_CUENTA_BANCO` en la grilla, pero la web lo excluye y acá
también. `crud.json` dice qué columnas se usaron en cada caso (`dataNota`).

**Para el connector:** no hay que confiar en "todas las columnas". Conviene armar la lista
desde el form y descartar las que no existen en la base.

**Pendiente:** el `formdefinition` de 21248 (Fraccionamiento de artículos). Pide habilitar el
parámetro de Stock "Permite fraccionar artículos desde procesos" en la empresa. No está en
el relevamiento de abril: ahí figuraba sin API.

**Contienen datos reales** de la empresa PRUEBAS FZERO: clientes, proveedores, legajos y
liquidaciones. Por ejemplo, Sueldos tiene 44 procesos con datos, con 1.454 filas.

## Lectura (`lectura.csv`, `campos.csv`)

Para que las plataformas lean datos de Tango, por ejemplo para llenar Excels, no hacen
falta los formularios. Alcanza con los endpoints de lectura de la API pública y con las
columnas que declara cada `getapi` en `tables`.

`python scripts/catalogo/lectura.py docs/tango/catalogo/2026-10-08` genera los dos archivos.

**617 procesos se pueden leer** (382 LIVE, 229 CRUD, 6 PDF), con 27.308 campos en total.
La API es muy uniforme: hay solo cuatro formas de leer.

| Endpoint                        | Procesos | Parámetros (query)                                          | Devuelve |
| ------------------------------- | -------: | ----------------------------------------------------------- | -------- |
| `GET Api/GetApiLiveQueryData`   | 382      | `process, fromDate, toDate, pageSize (10), pageIndex (0), customQuery (0)` | Una tabla `*Model` |
| `GET Api/Get`                   | 229      | `process, pageSize (10), pageIndex (0), view ("")`          | La vista `AXV_*` |
| `GET Api/GetByFilter`           | 229      | `process, view, filtroSql`                                   | La vista, filtrada con un `WHERE` |
| `GET Api/GetById`               | 229      | `process, id`                                                | El registro con sus sub-tablas |
| `GET Api/GetPdf`                | 8        | `process, id`                                                | El PDF del comprobante |

Entre paréntesis está el valor por defecto que declara Tango.

- **Encabezados:** `ApiAuthorization: <token>` y `Company: <id de empresa>`. Es lo que usa
  lumba-tango (`server/src/modules/tango/tango.service.ts`).
- **Tablas:** en los CRUD, la primera tabla es la vista que devuelven `Get` y
  `GetByFilter`. Las demás son sub-tablas: por ejemplo, los renglones de un asiento modelo
  (134). En `campos.csv` la columna `principal` las distingue.
- 13118 y 21237 son LIVE con `GetPdf` además.
- **-10002 "PEDIDO/COTIZACION"** es una consulta externa del usuario, en Live > Mis
  consultas externas. Tiene API LIVE, pero su `-api.json` no se guardó, porque el receptor
  no aceptaba IDs negativos. No está en `lectura.csv`.

Cómo se comporta cada endpoint contra la API real (fechas, `view`, paginado, errores) está
en [`../../api-lectura.md`](../../api-lectura.md).

## Siguiente paso

- Confirmar `customQuery` (consultas guardadas de Live) desde la web.
- Para los EXEC, ver qué parámetros reciben `Process` y `Custom`.
