# Lectura por la API pública de Tango

Cómo se leen datos de Tango por la API pública (`/Api/...`). Es lo que va a usar el connector
para que las plataformas lean procesos, por ejemplo para llenar Excels.

- **Probado el 2026-10-08** contra Tango 25.01.000.4263, empresa PRUEBAS FZERO (13). Solo
  consultas.
- **Script:** `python scripts/api/leer.py <endpoint> clave=valor ...`. Solo hace GET y lee
  el token de `TANGO_API_TOKEN` en `.env`.
- **Qué procesos se pueden leer y con qué campos:** `catalogo/2026-10-08/lectura.csv` y
  `campos.csv`.

## Lo que ya estaba en lumba-tango

lumba-tango lo define en `frontend/src/api/tango/tangoApiService.ts` y en el proxy
`server/src/modules/tango/tango.service.ts`. Las pruebas lo confirman:

| Qué | En lumba-tango | Confirmado |
| --- | -------------- | ---------- |
| Encabezados | `ApiAuthorization: <token>`, `Company: <id>` | Sí |
| URL | `http://<host>:<puerto>/Api/<endpoint>?process=<id>&...` | Sí, por LAN (`servertango:17000`) y por el túnel (`72.60.9.42:8003`) |
| `Get` | `view: 'Vista Predeterminada'`, `pageSize: 50` | Sí, pero ver `view` abajo |
| `GetByFilter` | `filtroSql: "WHERE ..."` | Sí |
| `GetApiLiveQueryData` | `fromDate: ''`, `toDate: ''`, `customQuery: '0'` | Sí, pero las fechas vacías no sirven para todo (ver abajo) |
| Respuesta | `resultData.list`, `value` en `GetById`; `GetByFilter` a veces con `list` en la raíz | Sí; `GetByFilter` trae **siempre** `list` en la raíz |

lumba-tango no definía el formato de las fechas, qué hace `customQuery`, el `pageSize`
máximo ni cómo responde a los errores. Eso es lo nuevo de este documento.

## Endpoints

### `GET Api/Get`: lista paginada (CRUD)

`process, pageSize, pageIndex, view`

- **`view` vacío, o sin `view`: devuelve todas las columnas** de la vista `AXV_*`. Son las
  que declara `getapi` en `tables`, más el ID del registro. Por ejemplo, Proveedores: 98
  columnas más `ID_CPA01`.
- **`view=Vista Predeterminada`:** devuelve solo las columnas de la grilla (9 en
  Proveedores). Es lo que usa lumba-tango. **Para Excels conviene `view` vacío.**
- **Paginado:** `resultData` trae `pageIndex, pageSize, totalCount, totalPages,
  hasPreviousPage, hasNextPage`.
- **Tamaño de página:** no hay tope, pero el tiempo no crece parejo. Con Proveedores:

  | `pageSize` | Tiempo |
  | ---------: | -----: |
  | 100        | 0,8 s  |
  | 1.000      | 3,2 s  |
  | 5.000      | 62 s   |

  Conviene paginar de a 1.000.

### `GET Api/GetByFilter`: lista filtrada (CRUD)

`process, view, filtroSql`

- **`filtroSql` es un `WHERE` de SQL Server** sobre la vista: `WHERE NOM_PROVEE LIKE 'A%'`.
  Sin la palabra `WHERE` da `Incorrect syntax near '='`.
- **No pagina:** ignora `pageSize` y `pageIndex` y devuelve **todas** las filas que
  cumplen el filtro.
- **La respuesta trae `list` en la raíz**, sin `resultData`.
- **Con `filtroSql` vacío devuelve la tabla entera:** 5.251 proveedores en 74 s. El
  connector no debería permitirlo.
- `view` funciona igual que en `Get`.
- **Riesgo:** el `filtroSql` se ejecuta tal cual en la base de Tango. Por eso, en el
  connector es un permiso aparte de la key, con resguardos (ADR 0002).
- **Tango corta el SQL dentro de los valores.** Aunque estén entre comillas, con `;` y con
  las palabras INSERT, UPDATE, DELETE, DROP, ALTER, CREATE y EXEC responde "Unclosed
  quotation mark". Probado el 2026-10-09 con `WHERE NOM_PROVEE = 'ACME <palabra> SA'`.
  - Pasan bien: TRUNCATE, MERGE, EXECUTE, GRANT, REVOKE, DECLARE, INTO, SELECT, UNION,
    OPENROWSET, SHUTDOWN, WAITFOR, `xp_…`, `sp_…`, `--` y `/* */`.
  - **Parece un filtro propio de Tango** que deforma el texto.
  - **El connector rechaza esos valores** con un mensaje claro, en lugar del error de Tango.
    Para buscar, por ejemplo, "CREATE SOLUTIONS SA", hay que usar
    `LIKE '%SOLUTIONS SA%'`.

### `GET Api/GetById`: un registro (CRUD)

`process, id`

- **Devuelve `value`** con el registro y sus sub-tablas como listas. Por ejemplo, en
  Proveedores: `CONTACTOS`, `RETENCIONES`, `SUCURSALES`, …
- **Si el ID no existe:** `succeeded: false` con el detalle `Registro inexistente`.

### `GET Api/GetApiLiveQueryData`: consultas Live

`process, fromDate, toDate, pageSize, pageIndex, customQuery`

- **Fechas:** `dd/MM/yyyy` (`01/02/2026`) o ISO con hora (`2026-02-01T00:00:00`).
  - `2026-02-01` sin hora y `20260201` dan error: `was not recognized as a valid DateTime`.
  - `MM/dd/yyyy` también da error, así que no hay ambigüedad.
- **El rango incluye los dos extremos.** Del 02/02 al 02/02 trae los comprobantes de ese
  día.
- **Fechas vacías:** en 12205 Saldos trajo 228 filas. En 10091 Detalle de comprobantes
  trajo 0: sin rango, el período por defecto no incluye los datos. **Para
  procesos con fechas hay que mandar el rango siempre.**
- **Solo `fromDate`:** funciona; en la prueba trajo hasta la fecha actual.
- **Columnas:** devuelve **solo las de la consulta por defecto**. 10091 trajo 23
  columnas, aunque `tables` declara 107. Las demás existen, pero hay que pedirlas con
  una consulta guardada.
- **Período por defecto:** la web abre 10091 con `periodConfiguration.period = 8`, sin
  fechas, y muestra el período como "Fecha contable". Eso explica las 0 filas con fechas
  vacías: el período por defecto no incluye datos de esta empresa.
- **`customQuery` es el ID de una consulta guardada en "Mis consultas".** Así se eligen
  las columnas, por ejemplo las de un Excel.
  1. En la web, se abre el LIVE, se configuran las columnas en **Configurar** y se guarda
     con **Mis consultas > Guardar**.
  2. La consulta aparece en el menú de Live (`GetMenuItems`, módulo 53), en
     `Live\Mis consultas\...`, con el `accessNumber` del proceso y
     `extraParams: { "TIPO_PROCESO": 0, "ID_CONSULTA": <id> }`.
  3. Se pide con `customQuery=<ID_CONSULTA>`. **No es el `menuId`.**

  | Prueba (10091, febrero 2026) | Columnas |
  | ---------------------------- | -------: |
  | `customQuery=0` (por defecto) | 23 |
  | `customQuery=157`, con `FECHA_CONTABLE` y `COD_PROVEEDOR` agregadas | 25 |
  | `customQuery=18051` (el `menuId`) | 23: no la toma |

  - **IDs que no existen:** se ignoran y vuelve la consulta por defecto (0, 1, 2, 3, 5,
    10, -1, 18051).
  - **Una consulta de otro proceso no da error:** devuelve **0 filas**. Con 12205 y
    `customQuery=157` trajo 0, cuando sin ella trae 228. El connector tiene que validar
    que la consulta sea del proceso.
  - **El rango de fechas igual hace falta:** con 157 y fechas vacías trajo 0 filas.
  - **Son "Mis consultas" de un usuario.** Esta se guardó con el usuario de la web y la
    API la leyó con el token. Falta ver si funciona con el token de otro usuario.
- **Consultas externas (proceso -10002, "Mis consultas externas"):** hay 12 en la
  empresa, como "OP/FACTURA - FZERO SRL" o "FECHAS DE INGRESO Y EGRESO". En el menú todas
  tienen `accessNumber` -10002 y se distinguen por el `menuId`. **No están implementadas
  en la API pública:** `GetApiLiveQueryData` con `process=-10002` responde "The method or
  operation is not implemented." con cualquier `customQuery`.
- **La web no usa la API pública para Live:** abre `/company/13/live/<id>` y pide
  `processresolver/formdefinition` (`{action, context:{}}`) y `processresolver/execute`
  (`method: GetSubscriptionData`, …).
- **Tamaño de página:** con 10091, 1.000 filas tardaron 6 s y 5.000 tardaron 5 s.
  Aguanta páginas grandes.
- **`pageIndex` funciona:** con 10091 en 2026 y páginas de 5, la 0 y la 1 son distintas.
  De a 40 trae 40, 40 y 19 filas, igual que `totalCount` (99). Probado el 2026-10-09.

### `GET Api/GetPdf`: el PDF de un comprobante (fichas Live)

`process, id`. Probado el 2026-10-09 con 14184 (Ficha Live de órdenes de pago), orden de pago
0000000024207 (`ID_CPA04` 58877).

- **No devuelve bytes: devuelve un JSON** (`Content-Type: application/json`) con el PDF en
  base64:

  ```json
  {
    "fileResult": {
      "fileContents": "JVBERi0xLjMK...",
      "contentType": "application/file",
      "fileDownloadName": "OP- 0000000024207.pdf",
      "lastModified": null, "entityTag": null, "enableRangeProcessing": false
    },
    "contentResult": "", "message": null, "exceptionInfo": null, "succeeded": true
  }
  ```

  - El PDF es el mismo que imprime Tango: una página, con el logo de la empresa.
  - Pesa 58 KB, que en base64 son 79 KB.
  - La primera vez tardó 13 s, y la siguiente 7 s.
- **`contentType` dice `application/file`**, no `application/pdf`.
- **`id` es el ID interno del comprobante**, no su número.
  - Se obtiene abriendo la ficha en la web (`/company/13/dashboard/<proceso>`) y eligiendo
    el comprobante: la ficha lo manda en `processresolver/execute` (`GetData`), dentro de
    `data`.
  - **No conviene deducirlo de `tables` del catálogo.** Para 14077 sugería `ID_GVA12_NC`,
    y es `ID_GVA12`.
- **ID inexistente:** `succeeded: false`, `Registro inexistente`.

**Verificación de los 6 procesos.** Se probaron en PRUEBAS FZERO (13), por el connector de
development, el 2026-10-09. Lo que ahí no se pudo cerrar se repitió en FZERO SRL (3), directo
con `scripts/api/leer.py`, el 2026-10-13:

| Proceso | Ficha | `id` | Prueba | Resultado |
| ------- | ----- | ---- | ------ | --------- |
| 14184 | Órdenes de pago (Compras) | `ID_CPA04` | O/P 0000000024207 → 58877 | ✅ `OP- 0000000024207.pdf`, 1 página |
| 14077 | Facturas, créditos y débitos (Ventas) | `ID_GVA12` | FAC A0000200000976 → 14647 | ✅ `FAC-A0000200000976.pdf`, 2 páginas (ORIGINAL y DUPLICADO, con CAE y QR) |
| 14077 | ídem | `ID_GVA12` | N/C A0000200000085 → 14617 | ✅ `N/C-A0000200000085.pdf`, 2 páginas |
| 14105 | Recibos (Ventas) | `ID_GVA12` | REC X0000100001694 → 14643 | ✅ `REC-X0000100001694.pdf`, 1 página |
| 14062 | Cotizaciones (Ventas) | `ID_GVA08` | Empresa 13: 5971, 5970, 5969, 5960, 5950. Empresa 3: 6016 | ❌ "No se pudo obtener el PDF" en las dos empresas. La web tampoco lo genera |
| 14093 | Remitos (Ventas) | — | — | Sin datos en las empresas 13 y 3: no se pudo probar |
| 14154 | Órdenes de compra (Compras) | — | — | Sin datos en las empresas 13 y 3: no se pudo probar |

Lo que hay que tener en cuenta:

- **El nombre del PDF puede traer `/`.** En las notas de crédito Tango lo arma como
  `N/C-A0000200000085.pdf`, porque usa el tipo de comprobante. Usado tal cual como nombre
  de archivo, crea una carpeta o falla. El SDK (`pdf()`) devuelve `nombre`, ya seguro, y
  `nombreOriginal`.
- **Facturas, notas de crédito y recibos comparten `ID_GVA12`.** Pero cada ficha valida el
  tipo:
  - un ID de factura en la ficha de recibos, o al revés, devuelve "No se pudo obtener el
    PDF", no un PDF equivocado;
  - un ID que no existe en la tabla del proceso devuelve "Registro inexistente".
- **Cotizaciones: Tango no genera el PDF, ni por la API ni por la web.** Falla igual en
  PRUEBAS FZERO (13) y en FZERO SRL (3). En la web, "Acciones > Descargar PDF" de la
  ficha también falla, con "No se pudo obtener el archivo" (lo probó el usuario el
  2026-10-13 en la empresa 13).
  - **Qué puede ser:** como pasa en dos empresas, parece algo del servidor Tango: el
    formulario PDF de cotizaciones no está armado, o la ficha tiene una falla.
  - **Qué no es:** una limitación de la API ni del connector.
  - **Para resolverlo:** revisar en Tango la configuración del formulario de
    cotizaciones, o consultar a soporte de Tango.
- **Remitos y órdenes de compra: pendientes, sin prioridad.** Las empresas 13 y 3 no los
  usan, y no parece que se usen en ninguna empresa de este servidor.
  - El método es el mismo que en el resto. Cambian el ID y la información de cada
    comprobante.
  - Lo más probable es que el `id` sea `ID_STA14` (remitos) y `ID_CPA35` (órdenes de compra),
    los IDs propios de sus tablas. **No está verificado.** En recibos, el catálogo apuntaba
    a otro ID y resultó ser `ID_GVA12`.
  - Si alguna vez se usan, se verifican igual que los demás: abrir la ficha, elegir un
    comprobante y tomar el ID que manda.
- **"No se pudo obtener el PDF"** significa que el ID existe pero el PDF no se generó: es
  de otro tipo, o falta configuración. **"Registro inexistente"** significa que el ID no
  existe.
- **Tiempos:** entre 0,5 s y 13 s. La primera vez de cada proceso es la más lenta.

## Errores

Casi todos los errores vuelven con **HTTP 200** y `succeeded: false`. El mensaje
general es siempre "Se detectó una situación inesperada", y el detalle real está en
`exceptionInfo.messages`.

| Caso | Respuesta |
| ---- | --------- |
| Token inválido | **HTTP 401**, problem+json (`title: Unauthorized`) |
| Falta el header `Company` | 200, `Object reference not set to an instance of an object.` |
| Empresa inexistente | 200, `Empresa no encontrada: 999` |
| Proceso inexistente | 200, `Action not found` |
| ID inexistente (`GetById`) | 200, `Registro inexistente` |
| Fecha con formato inválido | 200, `String '...' was not recognized as a valid DateTime.` |
| `filtroSql` inválido | 200, el error de SQL Server (`Incorrect syntax near ...`) |

El connector tiene que mirar `succeeded` y no solo el código HTTP, y devolver el detalle
de `exceptionInfo.messages`.

## Rendimiento

| Consulta | LAN | Túnel |
| -------- | --: | ----: |
| `Get` Proveedores, 100 filas, todas las columnas | 0,8 s | 1,0 s |
| `GetApiLiveQueryData` 10091, un mes | 4–9 s (la primera vez) | 0,5 s |

La primera consulta de un proceso tarda más (6–16 s) y las siguientes son rápidas.
Parece un caché de Tango.

## Para el connector

- **Un endpoint genérico de lectura** cubre todo: proceso, tipo (CRUD o LIVE), filtros,
  rango de fechas y página. Los cuatro endpoints de Tango tienen los mismos parámetros en
  todos los procesos.
- **Paginar del lado del connector,** de a 1.000 filas, para no depender de `GetByFilter`.
- **Filtros estructurados en vez de `filtroSql` libre,** validados contra el catálogo de
  campos.
- **Para LIVE, exigir el rango de fechas** en los procesos que lo usan.
- **Las columnas de un LIVE se definen en Tango,** con una consulta guardada. El connector
  la pide con `customQuery`. Para eso tiene que leer de `GetMenuItems` qué consultas hay y
  de qué proceso es cada una (`extraParams.ID_CONSULTA`).
- **Normalizar las respuestas** (`resultData.list`, `list` en la raíz, `value`) y los
  errores (HTTP 200 con `succeeded: false`).

## Pendiente

- **`customQuery` con el token de otro usuario:** ver si toma una consulta guardada por
  otro usuario. Eso define si cada plataforma puede usar consultas comunes.
- **`GetPdf`.**
- **Qué LIVE usan fechas y cuáles no.** Esto no está en `getapi`: los parámetros son
  siempre los mismos.

## Hallazgos de seguridad

- **El puerto 8003 del VPS responde desde internet:** la API de Tango solo queda protegida
  por el token. Lo ideal es que solo el connector, en el mismo VPS, pueda llegar al túnel.
  No se tocó nada en el VPS.
- **lumba-tango tiene un token de la API de Tango escrito en docs commiteados:**
  `docs/otros/md viejos de procesos/*.md`, en los ejemplos de cURL. No es el token que se
  usa ahora, pero si todavía es válido conviene darlo de baja en Tango. No se modificó
  lumba-tango.
