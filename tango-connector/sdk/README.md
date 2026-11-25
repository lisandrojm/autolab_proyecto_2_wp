# @lumba/tango-connector-sdk

Cliente TypeScript del **tango-connector**: la API de Tango Gestión con una API key de
plataforma. Los métodos se llaman como los endpoints de Tango y reciben sus mismos
parámetros. El SDK agrega:
- tipos;
- errores con el detalle real;
- reintentos ante fallas del túnel;
- cancelación;
- helpers para traer todas las páginas.

- **Node 18.17+, del lado del servidor.** No usarlo desde un navegador: la API key quedaría
  expuesta, y además el connector no habilita CORS.
- **Sin dependencias.** Usa el `fetch` global.
- **Solo lectura**, como el connector en esta etapa.

## Instalación

Por ahora se distribuye como tarball:

```bash
# en tango-connector
cd sdk && npm pack        # → lumba-tango-connector-sdk-0.3.1.tgz

# en la plataforma
npm install ../ruta/a/lumba-tango-connector-sdk-0.3.1.tgz
```

Sirve tanto con `require` como con `import`.

## Uso

```ts
import { TangoConnector, ErrorTango, sql, sqlLike } from '@lumba/tango-connector-sdk';

const tango = new TangoConnector({
  url: 'https://www.somoslumba.site/development/tango-connector/v1',
  apiKey: process.env.TANGO_CONNECTOR_API_KEY!,
  tenant: 'servertango',
  empresa: 'pruebas-fzero',
});

// Todos los proveedores, con todas las columnas
const proveedores = await tango.todas(3142);

// Una consulta Live completa, con las columnas de una consulta guardada
const compras = await tango.todasLive(10091, {
  fromDate: '2026-01-01',
  toDate: '2026-12-31',
  customQuery: 157,
});

// Para procesos grandes: de a una página, con progreso y sin todo en memoria
for await (const p of tango.paginas('LIVE', 10091, { fromDate: '2026-01-01', toDate: '2026-12-31' })) {
  console.log(`página ${p.pageIndex + 1}/${p.totalPages}: ${p.filas.length} filas`);
}

// El PDF de una orden de pago (14184, por su ID_CPA04)
const { nombre, bytes } = await tango.pdf(14184, 58877);
await fs.writeFile(nombre, bytes);

// Un proveedor por CUIT (requiere el permiso filtroSql en la key)
const r = await tango.getByFilter(3142, `WHERE N_CUIT = ${sql('30-12345678-9')}`);
const proveedor = r.list?.[0];
```

### Opciones

| Opción | Por defecto | Qué hace |
| ------ | ----------- | -------- |
| `url`, `apiKey`, `tenant`, `empresa` | (obligatorias) | Dónde está el connector y con qué empresa se habla. `empresa` es el slug (`'fzero-srl'`) o el Company ID de Tango (`3`) |
| `lanzarErrores` | `true` | Si es `false`, los métodos de Tango devuelven tal cual las respuestas con `succeeded: false` (ver Errores) |
| `timeoutMs` | `170000` | Timeout por request, incluida la lectura del body. Es menor que el corte de nginx, de 180 s |
| `reintentos` | `{ intentos: 2, esperaMs: 1000 }` | Reintentos ante fallas de red, ante 502 o 504, y ante 503 que no venga del connector (nginx). La espera se duplica en cada intento. `intentos: 0` los desactiva |
| `zonaHoraria` | `America/Argentina/Buenos_Aires` | En qué zona se interpretan los `Date` |
| `maxPaginas` | `10000` | Tope de `paginas()`, por si Tango nunca informara el fin |
| `fetch` | el global | Para inyectar otro `fetch` |

### Los endpoints de Tango

| Método | Endpoint | Devuelve |
| ------ | -------- | -------- |
| `get(process, { pageSize, pageIndex, view, signal })` | `Get` | `resultData.list`, paginado |
| `getById(process, id, { signal })` | `GetById` | `value`: el registro con sus sub-tablas |
| `getByFilter(process, filtroSql, { view, signal })` | `GetByFilter` | `list` **en la raíz**, sin paginar |
| `getApiLiveQueryData(process, { fromDate, toDate, pageSize, pageIndex, customQuery, signal })` | `GetApiLiveQueryData` | `resultData.list`, paginado |
| `getPdf(process, id, { signal })` | `GetPdf` | El PDF en base64 dentro de `fileResult` (ver `pdf()`) |

Las respuestas son las de Tango, sin cambios. Cómo se comporta cada endpoint está en
`docs/tango/api-lectura.md`. Lo más importante:

- **`pageSize`:** el SDK usa **1000** por defecto, que es el máximo del connector. Tango,
  llamado directo, usa 10.
- **`view`:** vacío, que es el valor por defecto, trae todas las columnas.
  `"Vista Predeterminada"` trae solo las de la grilla.
- **Fechas de LIVE:** hay que mandarlas siempre. Sin rango, Tango usa un período por defecto
  que puede devolver 0 filas.
  - Se aceptan `yyyy-MM-dd`, `dd/MM/yyyy` o un `Date`.
  - Un `Date` se toma en `zonaHoraria`, no en la del proceso. Así un VPS en UTC no corre
    el día.
  - `toDate` es inclusive.
- **`customQuery`:** es el `ID_CONSULTA` de una consulta guardada en "Mis consultas" del
  proceso. Así se eligen las columnas de un LIVE. Si la consulta es de otro proceso, Tango
  devuelve 0 filas sin error.
- **`signal`:** un `AbortSignal` para cancelar desde la plataforma. No se manda a Tango.

### Helpers

| Helper | Para qué |
| ------ | -------- |
| `pdf(process, id)` | El PDF de un comprobante como `{ nombre, nombreOriginal, bytes }`. `nombre` es seguro como nombre de archivo (Tango manda `N/C-…` en las notas de crédito). `id` es el ID interno: `ID_CPA04` en órdenes de pago (14184), `ID_GVA12` en facturas, créditos y débitos (14077) y en recibos (14105). Ver `docs/tango/api-lectura.md` |
| `todas(process, params)` | Todas las filas de un CRUD |
| `todasLive(process, params)` | Todas las filas de una consulta Live |
| `paginas('CRUD' \| 'LIVE', process, params)` | Una página por iteración, `{ filas, pageIndex, pageSize, totalCount, totalPages }` |
| `filas(respuesta)` | Las filas de cualquier respuesta: `resultData.list`, `list` o `value` |
| `fechaTango(fecha, zona?)` | `Date` o `yyyy-MM-dd` → `dd/MM/yyyy` |
| `sql(valor, zona?)` | Un valor para `filtroSql`: textos entre comillas con `'` duplicada, números, booleanos como 1/0, `Date` como `'yyyy-MM-ddTHH:mm:ss'` |
| `sqlLike(texto, modo?)` | Un patrón para `LIKE` con `%`, `_` y `[` del texto escapados. `modo`: `contiene` (por defecto), `empieza`, `termina` o `igual` |
| `conEmpresa(empresa, tenant?)` | El mismo cliente, para otra empresa (slug o Company ID) |

**Los helpers de paginación nunca devuelven datos incompletos sin avisar.** Lanzan
`ErrorTango` en estos casos, aunque `lanzarErrores` sea `false`:
- si falla una página;
- si Tango repite una página;
- si `totalCount` cambia mientras se lee: los datos cambiaron, hay que volver a leer.

**`filtroSql` tiene límites:**
- **Tango corta el SQL** si un valor entre comillas tiene `;` o alguna de estas palabras:
  INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, EXEC. El connector rechaza esos valores con
  un 400 que lo explica. Para buscar "CREATE SOLUTIONS SA", usar
  `LIKE ${sqlLike('SOLUTIONS SA')}`.
- **Fuera de las comillas**, el connector rechaza:
  - `;` y comentarios;
  - sentencias de escritura o de control;
  - procedimientos del sistema.

### Perfiles de factura de compra

No están en la API de Tango: el connector los lee de la web, con un usuario técnico
(ADR 0003). La key necesita el permiso `27:PerfilesDeFacturaDeCompra`.

```ts
const perfiles = await tango.perfilesDeFacturaDeCompra();
// [{ id: 3, codigo: '001', descripcion: 'FACTURA CONTADO' }, { id: 4, codigo: '002', … }]

const perfil = await tango.perfilDeFacturaDeCompra(4);
// La fila de CPA128 tal cual (118 campos): COMP_* / CTR_* = 'E' | 'M' | 'O'
// (Edita, Muestra, Oculta), D_CONDICIO, DEPOSITO, LEYENDA, ALTAPROVEE, …
```

Respuestas posibles:

| Caso | Respuesta |
| ---- | --------- |
| Perfil inexistente | 404 |
| El servidor no tiene usuario web | 503, sin reintento |
| La web de Tango cambió de forma | 502 |

### Centros de costo de comprobantes de compra

El centro de costo **real** de un comprobante ya cargado: el auxiliar de la imputación, no
lo que dice la leyenda. Tampoco está en la API de Tango, así que también se lee de la web.
La key necesita el permiso `-14024:CentrosDeCostoDeComprobantesDeCompra`.

```ts
const filas = await tango.centrosDeCostoDeComprobantesDeCompra([61386, 61433]);
// [{ idCpa04: 61386, codCuenta: '5010050101', codigo: '99HUI', descripcion: '99 - Huidobro',
//    porcentaje: 100, debe: 40949.23, haber: 0, … }, …]
```

- **Una fila por comprobante × cuenta × centro de costo.** Si una cuenta se reparte, sale
  una fila por centro, con su `porcentaje`.
- **Las cuentas sin auxiliar no aparecen** (proveedores, IVA).
- **Un comprobante sin imputaciones no devuelve filas,** sin error.
- **Hasta 50 comprobantes por pedido.** Con más, el SDK rechaza el pedido antes de enviarlo; con un arreglo vacío devuelve `[]`.
- **`{ todos: true }`** trae también los demás tipos de auxiliar.
- **El `ID_CPA04`** sale del Live 10091 o del 10939.

### Órdenes de pago

Para pasar un comprobante a "Con orden de pago": qué órdenes de pago cancelan una factura, la
ficha de cada una y su PDF. Las dos primeras se leen de la web (fichas 14162 y 14184); la key
necesita `14162:OrdenesDePagoDeFacturaDeCompra` y `14184:OrdenDePago`. El PDF va por `GetPdf`.

```ts
const ops = await tango.ordenesDePagoDeFacturaDeCompra(1785);
// [{ idCpa04: 1787, tipo: 'O/P', numero: '0000100000795', fecha: '2026-10-07', estado: 'IMP',
//    total: 6000000, importeCancelado: 6000000 }]

const op = await tango.ordenDePago(1787);
// op.pagadoCon → [{ cuenta: '1010010201', descripcion: 'BANCO GALICIA', importe: 6000000 }]
// op.imputaciones → [{ idCpa04Factura: 1785, numero: 'C0000200000017', cancelado: 6000000, … }]

const { nombre, bytes } = await tango.pdfDeOrdenDePago(1787); // 'OP- 0000100000795.pdf'
```

**Relacionados** (notas de crédito y débito): un comprobante con su estado, sus vencimientos, las
órdenes de pago que lo cancelan y los comprobantes imputados (una nota a su factura, la factura de
una nota). Requiere `14162:ComprobantesRelacionadosDeCompra`.

```ts
const f = await tango.relacionadosDeComprobanteDeCompra(1004);
// { tipo: 'FAC', estado: 'CAN', total: 1815000, relacionados: [
//   { tipo: 'N/C', numero: 'A0000100000011', idCpa04: 1005, ordenDePago: false }, … ] }
```

- Los relacionados **no traen importe** (la ficha no lo da). El **saldo pendiente** de cada factura
  sale del Live 17696 (Pagos a realizar, `TOTAL_PENDIENTE_CTE`): las que no están, no tienen saldo.
- `estado`: factura `PEN` (con saldo) o `CAN` (cancelada, por OP o por notas); nota `IMP` (imputada)
  o `CTA` (a cuenta, sin imputar).

- **Varias órdenes por factura** (pagos parciales): una fila por cada una, con lo que cancela de
  esa factura en `importeCancelado` (moneda corriente) e `importeCanceladoExt`.
- **Anuladas:** vienen con `anulada: true` e `importeCancelado: 0`.
- **La cuenta con que se pagó** está en `pagadoCon`: las líneas del haber de `valores` (en el debe
  va la cuenta del proveedor). Con retenciones, sus cuentas también están ahí.
- **CUIT y CBU del proveedor** (`proveedor.cuit`, `proveedor.cbu`): solo si la key tiene
  `3142:GetById`. El CBU es el actual del proveedor.
- **Leyendas y observaciones vacías:** `leyendas: []` y `null`.
- **Errores:** 404 si el ID no existe, o si es de otro tipo (una OP en lugar de una factura, o
  al revés).
- **Tiempo:** unos 2 s por ficha. La lista de una factura lee también la ficha de cada OP.

### Proveedores: alta y CBU

Alta a partir del CUIT: el connector suma ARCA y los valores por defecto de Tango. La key
necesita `3142:AltaDeProveedor` y `3142:ActualizarProveedor`.

```ts
// 1. Vista previa: qué traería ARCA y qué falta, sin escribir.
const previa = await tango.vistaPreviaAltaProveedor({ cuit: '30-50279317-5', cbu: '2850123540000987654324' });
// { listo: false, faltantes: [{ campo: 'ID_CPA57', comoResolver: 'Provincia: …' }], arca: { razonSocial, … }, avisos, cuerpo }

// 2. Alta, con lo que haya faltado.
const { id, codigo, proveedor, avisos } = await tango.altaProveedor({ cuit: '30-50279317-5', cbu: '2850123540000987654324', codigoProvincia: '01' });

// 3. Cambiar el CBU (null lo borra).
await tango.actualizarProveedor(id, { cbu: '2850123540000123456782', descripcionCbu: 'Cuenta nueva' });
```

| Caso | `ErrorTango` |
| ---- | ------------ |
| CUIT, CBU o campos inválidos | 400 |
| CUIT ya cargado (o código tomado) | 409, con el proveedor existente |
| ARCA no trae datos, o falta un obligatorio | 422, con qué falta y cómo resolverlo |
| Tango rechaza la escritura | 502, con el mensaje de Tango |

- **Las escrituras no se reintentan solas.** Un timeout no dice si el alta se guardó: antes de
  repetir, buscar el CUIT (`getByFilter(3142, …)`). Repetirla da 409. La vista previa sí se
  reintenta.
- **`codigoProvincia`** es el código de Tango (`COD_CPA57`, proceso 2728). Mostrar la lista
  cuando la vista previa pida `ID_CPA57`.
- **Retenciones:** se crea con "Aplica retenciones" destildado; si ARCA las trae, va un aviso.

### Metadatos

```ts
await tango.meta.yo();                       // la key: plataforma y permisos
await tango.meta.procesos({ tipo: 'LIVE' }); // procesos que la key puede usar
await tango.meta.proceso(3142);              // endpoints, parámetros, schemas y columnas
await tango.meta.campos('cuit');             // en qué procesos está un campo
```

### Errores

Todos los errores del SDK son `ErrorTango`: de Tango, del connector, de red, por timeout o
por cancelación.

| Propiedad | Qué es |
| --------- | ------ |
| `origen` | `tango`: Tango respondió con error. `connector`: el connector rechazó el request (key, permisos, validación). `red`: no hubo respuesta usable (timeout, sin conexión, 502/503/504). `cancelado`: se abortó con `signal` |
| `status` | El HTTP. Los errores de Tango vienen con **200** |
| `mensajes` | El detalle real: primero `detailMessages`, después `messages`. P. ej. `['Registro inexistente']` |
| `request` | Qué falló: ruta, tenant, empresa y query. Nunca incluye la key. También va en `message`, para los logs |
| `reintentable` | `true` en las fallas de red o del túnel |
| `respuesta` | La respuesta completa, si la hubo |

```ts
try {
  await tango.getById(3142, 999);
} catch (e) {
  if (e instanceof ErrorTango && e.origen === 'tango') console.log(e.mensajes);
}
```

**`lanzarErrores: false`** solo afecta a las respuestas de Tango con `succeeded: false` en
`get`, `getById`, `getByFilter`, `getApiLiveQueryData` y `getPdf`. Esos métodos las
devuelven tal cual. Igual lanzan:
- los errores HTTP (4xx/5xx);
- los rechazos del connector;
- la red y los timeouts;
- los helpers de paginación.

### Paginación y datos que cambian

`paginas`, `todas` y `todasLive` piden por `pageIndex`. Si alguien da de alta o de baja
registros mientras se lee, las páginas se corren. El SDK lo detecta porque cambia
`totalCount`, y lanza error en vez de devolver filas duplicadas o faltantes.
