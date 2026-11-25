# Órdenes de pago de un comprobante de compra (pedido de comprobantes-to-tango)

Relevado el 2026-10-19 en 2030 SRL Gestion (empresa 8), para comprobantes-to-tango. Solo lectura.

comprobantes-to-tango tiene que pasar un comprobante de **Cargado** a **Con orden de pago**. Para
eso, dado un comprobante de compra ya cargado (`ID_CPA04` de la factura), necesita:

1. **Las órdenes de pago que lo cancelan.** Casi siempre es una, pero puede ser más de una (pagos
   parciales).
2. **De cada orden de pago:**
   - el comprobante de origen (qué factura cancela y por cuánto);
   - la fecha;
   - el proveedor;
   - la nota (observaciones) y la leyenda;
   - el monto;
   - la **cuenta con la que se pagó**, para validarla contra la cuenta vinculada al perfil en la
     plataforma;
   - el **PDF**, que es lo más importante.

## Lo que ya se probó

Todo con la key `comprobantes-to-tango`, contra el connector de development.

| Proceso | Qué es | Estado |
| ------- | ------ | ------ |
| **14184** Ficha Live de órdenes de pago | Solo `GetPdf` (no tiene Get, GetById ni Live) | **Funciona**: `getPdf(14184, idCpa04DeLaOP)` devuelve `fileResult.fileContents` (base64) y `fileDownloadName` (`OP- 0000100000795.pdf`). `contentResult` viene vacío. |
| **14162** Ficha Live de facturas, créditos y débitos | Tiene la pestaña "Comprobantes relacionados" (`LIVE_FN_ComprasFacCreDeb_ComprobantesRelacionados`) | **Sin API** (404 en el connector: no figura en el catálogo). |
| **17699** Consulta de órdenes de pago (Live) | Una fila por OP: `COD_PROVEEDOR`, `RAZON_SOCIAL`, `TIPO_DE_COMPROBANTE` (`O/P`), `NUMERO_DE_COMPROBANTE`, `FECHA_DE_EMISION`, `NROINTERNO_OP`, `ESTADO` (`IMP`), `ID_CPA01`, `ID_CPA04` | **Funciona.** Filtra por fechas. **No dice qué factura cancela.** |
| **17698** Pagos realizados (Live) | Por proveedor y fecha, con `TOTAL_MON_CTE` | Funciona, pero sin la OP ni la factura. |

El catálogo dice que la ficha 14184 tiene estas tablas. En la API solo están dentro del PDF:

- `ORDEN_PAGO`: `T_COMP`, `N_COMP`, `FECHA`, `PROVEEDOR`, `RAZON_SOCI`, `MONEDA`, `TOTAL_CTE` /
  `TOTAL_EXT`, `ESTADO_CTE`, `LEYENDA_1`…`LEYENDA_5`, `OBSERVACIONES_COMERCIALES`,
  `OTRAS_OBSERVACIONES`, `CLASIFICACION`, datos de ingreso y modificación.
- `VALORES`: `CUENTA`, `DESCRIPCION`, `OPERACION`, `DEBE_CTE` / `HABER_CTE`. Es **la cuenta con la
  que se pagó**.
- `IMPUTACIONES`: `ID_CPA04_FACCREDEB` (la factura), `TIPO_COMPROBANTE`, `NRO_COMPROBANTE`,
  `FECHA_VENCIMIENTO`, `ESTADO`, `TOTAL_CANCELADO_CTE` / `_EXT`.
- `LIVE_FN_OrdenPago_ComprobantesRelacionados`, `RETENCIONES`, `DOCUMENTOS` y `TOTALES`.

## Lo que se pide al connector

Las lecturas que faltan salen de la web, con la sesión web (ADR 0003), como los perfiles y los
centros de costo. Son **solo lectura**.

### 1. Órdenes de pago de una factura

`GET /tango/{tenant}/{empresa}/facturas-de-compra/{idCpa04}/ordenes-de-pago`

En el SDK: `ordenesDePagoDeFacturaDeCompra(idCpa04)`.

- **Fuente:** los comprobantes relacionados de la ficha 14162
  (`LIVE_FN_ComprasFacCreDeb_ComprobantesRelacionados`).
- **Devuelve una lista de:**
  `{ idCpa04, tipo: 'OP', numero: '0000100000795', fecha, estado, importeCancelado }`.
- **Si la ficha no da el importe cancelado:** que venga de la ficha de la OP (endpoint 2).
- **Si la pestaña no se puede leer:**
  - Alternativa: 17699 por proveedor y fechas (desde la emisión de la factura), y después la ficha
    de cada OP para quedarse con las que tienen la factura en `IMPUTACIONES`.
  - Avisar si es la que se usa: es más lenta y depende del rango de fechas.

### 2. Ficha de una orden de pago, con datos estructurados

`GET /tango/{tenant}/{empresa}/ordenes-de-pago/{idCpa04}`

En el SDK: `ordenDePago(idCpa04)`.

**Fuente:** la ficha 14184, sus pestañas como JSON (no el PDF).

```ts
{
  idCpa04: number;
  tipo: string;            // T_COMP, ej. 'OP'
  numero: string;          // N_COMP, ej. '0000100000795'
  fecha: string;           // 'YYYY-MM-DD'
  estado: string;          // 'IMP'
  proveedor: { idCpa01: number; codigo: string; razonSocial: string; cuit?: string };
  moneda: string;
  total: number;           // TOTAL_CTE
  totalExt?: number;
  leyendas: string[];      // LEYENDA_1..5, sin vacías
  observaciones: { comerciales: string | null; otras: string | null };
  valores: { cuenta: string; descripcion: string; operacion: string; debe: number; haber: number }[];
  imputaciones: {
    idCpa04Factura: number; // ID_CPA04_FACCREDEB
    tipo: string;           // 'FAC'
    numero: string;         // 'C0000200000017'
    vencimiento: string | null;
    estado: string;
    cancelado: number;      // TOTAL_CANCELADO_CTE
  }[];
  retenciones: { retencion: string; certificado: string; fecha: string; importe: number }[];
  documentos: unknown[];
  totales: { concepto: string; importe: number }[];
  comprobantesRelacionados: { tipo: string; numero: string; fecha: string }[];
}
```

### 3. PDF de la orden de pago

**Ya funciona por la API pública:** `getPdf(14184, idCpa04)`. Para que sea cómodo:

- **Helper en el SDK:** `pdfDeOrdenDePago(idCpa04)`, que devuelva
  `{ nombre: 'OP- 0000100000795.pdf', contenido: Buffer }` (o lo que use `pdf()` hoy).
- **Si "Apertura" de la ficha web da un PDF distinto o más completo** que el de la API, decidir
  cuál usar y contarlo.

### Permisos de la key `comprobantes-to-tango`

Hay que sumar los dos endpoints nuevos (lectura). `GetPdf` de 14184 y el Live 17699 ya andan con
la key actual.

## Caso de prueba (real, solo lectura)

**Empresa 8** (2030 SRL Gestion), proveedor **005239 PELLEGRINI HERNAN MARCELO** (`ID_CPA01` 4516,
CUIT 20-26116576-8).

**Factura** `ID_CPA04` **1785**:

- FAC **C0000200000017**, emitida el 06/10/2026.
- Total **6.000.000** ARS.
- Leyenda "195-PELLEGRINI HERNAN-017". En comprobantes-to-tango es el registro #2, ya en "Cargado".

**Esperado para la factura 1785:** una sola orden de pago, la de `ID_CPA04` **1787**:

- O/P **0000100000795**, del **07/10/2026**, estado `IMP`, total **6.000.000** ARS.
- **Imputación:** FAC C0000200000017, vencimiento 05/11/2026, cancelado 6.000.000.
- **Valores:** cuenta **1010010201 BANCO GALICIA**, 6.000.000.
- **Datos de la cuenta del PDF:** CBU 0070033730004014288363 (el del proveedor), emitida en pesos.

**Control negativo:** la OP `ID_CPA04` **1793** (O/P 0000100000798, 15/10/2026, 2.000.000) es del
mismo proveedor pero cancela **otra** factura (FAC C0000200000018). **No** tiene que aparecer
entre las órdenes de pago de la 1785.

**Leyenda y observaciones:** el PDF de la 1787 no muestra ninguna. Verificar en la ficha web si
están vacías, y devolverlas tal cual.

## Para el endpoint de pruebas

- Comparar el JSON de `ordenDePago(1787)` con el PDF (`getPdf(14184, 1787)`).
- `ordenesDePagoDeFacturaDeCompra(1785)` tiene que devolver `[1787]`.
- Medir tiempos, como en los otros relevamientos.
- Documentar las pestañas y campos reales en este archivo, como en
  [imputacion-comprobante-compra.md](imputacion-comprobante-compra.md).

## Cómo quedó en el connector (2026-10-19)

Relevado con la sesión web del connector, solo lectura, en 2030 SRL Gestion (8).

### La fuente: `GetData` de cada ficha

La web carga una ficha Live con **un solo pedido**, que trae la cabecera y todas las pestañas:

```
POST /processresolver/execute
{ "processNumber": "14184", "method": "GetData", "data": { "iD_CPA04": 1787 } }
```

| Ficha | Tarda | Tamaño | Lo que se usa |
| ----- | ----- | ------ | ------------- |
| **14162** (factura 1785) | 1,5–2,8 s | 177 KB | `t_COMP`, `comprobanteS_RELACIONADOS[].iD_CPA04_OP` |
| **14184** (OP 1787) | 0,3–2 s | 2,4 KB | Todo, ver abajo |

- **14162 pesa** porque trae los adjuntos del comprobante (`datoS_ADJUNTOS_FAC_COMPRAS`, con el
  PDF de la factura en hex en `archivO_BINARIO`). No se encontró cómo pedir una sola pestaña.
  **Riesgo:** una factura con un adjunto de varios MB da una respuesta del doble, con el límite
  de la sesión web (`TANGO_WEB_TIMEOUT_MS`). No se midió con una factura pesada; si da 504, la
  alternativa es 17699 por proveedor y fechas.
- **`comprobanteS_RELACIONADOS` de 14162:** `{ tipo: "Orden de pago", fecha, numero: "O/P -  0000100000795",
  sucursal, iD_CPA04_OP: 1787, iD_CPA04_FACCREDEB: null, iD_CPA35, iD_CPA110, iD_STA14 }`.
  En una OP, la misma pestaña trae la factura en `iD_CPA04_FACCREDEB`.
- **ID inexistente:** `succeeded: true` con `data: { triggerToExecuteGetData: true }`, sin
  `t_COMP`. El connector responde 404.
- **Tipo cruzado:** cada ficha abre cualquier `ID_CPA04`. 14184 con la factura 1785 devuelve la
  factura (`t_COMP: "FAC"`), sin error. El connector controla `t_COMP` (`O/P` en 14184, distinto
  en 14162) y responde 404.
- **Por eso no hizo falta la alternativa por 17699.**

### Campos de 14184

Cabecera:
- `t_COMP` (`O/P`), `n_COMP` (`" 0000100000795"`, con espacio adelante), `t_COMP_IN_C` (`OP`),
  `n_COMP_IN_C`;
- `fecha`, `fechA_CONTABLE` (`2026-10-07T00:00:00`), `estadO_CTE` / `estadO_EXT` (`IMP`);
- `iD_CPA01`, `proveedoR_RAZON_SOCI` (`"005239 - PELLEGRINI HERNAN MARCELO"`). **No trae el
  CUIT:** el connector lo lee, con el CBU, de 3142 por la API;
- `moneda` (`"CTE (Cotización: 1505.0000000)"`), `totaL_CTE`, `totaL_EXT`, `clasificacion` (`" - "`);
- `leyendA_1`…`leyendA_5`, `observacioneS_COMERCIALES`, `otraS_OBSERVACIONES`: en la 1787,
  todas `""`. La ficha web confirma que están vacías;
- `fechA_INGRESO` (`"07/10/26 - 15:23"`), `usuariO_INGRESO`, `terminaL_INGRESO`.

Pestañas (listas):
- `valores`: `cuenta` (número), `descripcion`, `operacion`, `debE_CTE`, `habeR_CTE`, `debE_EXT`,
  `habeR_EXT`. Es el asiento: en la 1787, `2010010101 PROVEEDORES` en el debe y
  `1010010201 BANCO GALICIA` en el haber. **La cuenta con que se pagó es la del haber**: el
  connector la devuelve en `pagadoCon`;
- `imputaciones`: `iD_CPA04_FACCREDEB`, `tipO_COMPROBANTE`, `nrO_COMPROBANTE`, `fechA_VENCIMIENTO`,
  `estado` (`CAN`), `moneda`, `totaL_CANCELADO_CTE`, `totaL_CANCELADO_EXT`;
- `retenciones` (`retencion`, `nrO_CERTIFICADO`, `fecha`, `importe`, `certificadO_RELACIONADO`),
  `documentos`: vacías en la 1787. Los nombres salen de la definición de la ficha; sin un
  ejemplo con datos, no están probados;
- `totales`: `concepto`, `importe`, `importE_EXT`;
- `comprobanteS_RELACIONADOS`.

### Endpoints

| Endpoint | SDK | Permiso de la key |
| -------- | --- | ----------------- |
| `GET /v1/tango/<tenant>/<empresa>/facturas-de-compra/:idCpa04/ordenes-de-pago` | `ordenesDePagoDeFacturaDeCompra(id)` | `14162:OrdenesDePagoDeFacturaDeCompra` |
| `GET /v1/tango/<tenant>/<empresa>/ordenes-de-pago/:idCpa04` | `ordenDePago(id)` | `14184:OrdenDePago` |
| `GET …/GetPdf?process=14184&id=…` (la API de Tango) | `pdfDeOrdenDePago(id)` | `*:GetPdf` |

- **La lista de una factura** lee 14162 y después la ficha 14184 de cada OP, de a 4, con un tope
  total de 150 s (504 si se pasa). `importeCancelado` (e `importeCanceladoExt`) es la suma de sus
  imputaciones a esa factura. Sale ordenada por fecha.
  - **Anuladas** (`estado: "ANU"`): vienen con `anulada: true` e `importeCancelado: 0`. No se vio
    ninguna real: el código de estado es el de la definición de Tango.
  - **Un relacionado que no existe más o que no es una O/P** se saltea y queda en el log. No da
    404: la factura sí existe.
- **`pagadoCon`** son todas las cuentas del haber de `valores`. Con retenciones o diferencias de
  cambio, sus cuentas también aparecen; para validar la cuenta de pago, buscarla entre ellas.
- **CUIT y CBU del proveedor** salen de 3142 por la API, **solo si la key tiene
  `3142:GetById`** (son datos bancarios). Tienen un tope de 8 s: si la API tarda o falla, la OP
  sale sin ellos. El CBU es el **actual** del proveedor, el que imprime el PDF, no necesariamente
  el del día del pago.
- **Importes:** si un importe obligatorio no viene como número, 502 ("la web de Tango cambió"), no 0.
- **Cotización:** acepta `1505.0000000`, `1.505,25` y `1505,5`; sin cotización, `null`.
- **Diferencias con el pedido:**
  - `tipo` es `O/P`, como lo da Tango, no `OP`;
  - se agregan `anulada`, `importeCanceladoExt`, `fechaContable`, `cotizacion`, `pagadoCon`,
    `proveedor.cbu`, `ingreso` (con la fecha tal cual la muestra Tango), y los `_EXT` de valores,
    imputaciones y totales;
  - `retenciones` usa `certificado` y suma `certificadoRelacionado`.
- **PDF:** se usa el de la API. Es el mismo formulario de la ficha (una página, 60 KB), y todo lo
  que muestra coincide con el JSON de la 1787. "Datos de la cuenta" es el CBU del proveedor, que
  también va en `proveedor.cbu`. **No se comparó con "Apertura" de la ficha web**, porque la sesión
  del navegador estaba vencida.

### Prueba real (2026-10-19, por el connector de development, key comprobantes-to-tango)

| Llamada | Resultado | Tiempo |
| ------- | --------- | -----: |
| `ordenesDePagoDeFacturaDeCompra(1785)` | `[1787]`, `importeCancelado` 6.000.000; la 1793 no aparece | 10,7 s (abrió la sesión web de la empresa 8) |
| `ordenesDePagoDeFacturaDeCompra(1792)` | `[1793]`, 2.000.000 | 0,9 s |
| `ordenDePago(1787)` | Como el pedido; `pagadoCon` 1010010201 BANCO GALICIA 6.000.000; leyendas y observaciones vacías | 2,0 s |
| `pdfDeOrdenDePago(1787)` | `OP- 0000100000795.pdf`, 60 KB | 6,8 s |
| `ordenDePago(1785)` (una factura) | 404 "no es una orden de pago (es FAC)" | 0,4 s |
| `ordenDePago(2000000000)` | 404 | 0,3 s |

## Comprobantes relacionados y notas (C1, 2026-10-25)

Pedido de comprobantes-to-tango para las notas de crédito y débito (su `docs/procesos/09-notas-y-pagos.md`,
C1): saber si una nota está imputada a su factura y cuánto le queda a la factura. Relevado con la sesión
web del connector, solo lectura, en 2030 SRL Gestion (8) y FZERO SRL (3).

### Lo que trae la ficha 14162

`comprobanteS_RELACIONADOS` lista la imputación **en los dos sentidos**:

| Ficha de | Relacionados |
| -------- | ------------ |
| Factura 1004 (PICK UP ART, $ 1.815.000), anulada por dos N/C | `N/C - A0000100000011` (`iD_CPA04_FACCREDEB` 1005) y `N/C - A0000100000012` (1031) |
| N/C 1005 | `FAC - A0000100000066` (1004) |
| Factura 59846 (PEREZ ADRIANA, $ 999.369,15): N/C de $ 813.000 y OP por $ 186.369,15 | la N/C 59847 y la O/P 0000000024666 (`iD_CPA04_OP` 59849) |
| Factura 57701 (SENCINET, $ 539.484): N/D de $ 18.900 | la N/D 57702 y la O/P 0000000023639 (57708), que imputa **solo la factura** por $ 558.384 (total + N/D) |
| N/D 57977 (SENCINET, $ 20.100), sin imputar | ninguno |

- **Sin importe** por relacionado: la ficha no dice cuánto se imputó. `tipo` es un texto con
  acentos rotos (`Nota de cr\ufffddito`): el tipo sale del número (`N/C - …`).
- **Estado** (`estadO_CTE`): factura `PEN` (con saldo), `CAN` (cancelada, por OP o por notas), `PAG`
  (visto en FREUND: factura de $ 306.000 y N/C de $ 306.000,01); nota `IMP` (imputada) o `CTA` (a
  cuenta: sin imputar).
- `vencimientos`: `importE_CTE` y `estadO_CTE` (`Pendiente` / `Pagado`), sin el saldo.
- El total es `totaL_CTE_VALUE`, positivo también en las notas.
- Cada ficha tarda 0,4–3 s (la primera de cada empresa abre la sesión web).

### El saldo: Live 17696 (Pagos a realizar)

`GetApiLiveQueryData process=17696 fromDate=dd/mm/aaaa toDate=dd/mm/aaaa`: una fila por vencimiento
**pendiente** de cada factura, con `ID_CPA04`, `TIPO_DE_COMPROBANTE`, `NRO_COMPROBANTE`,
`FECHA_DE_VENCIMIENTO` y `TOTAL_PENDIENTE_CTE` / `_EXT` (el saldo, con las notas y las OP ya aplicadas),
además de datos de contacto del proveedor (no se usan). Una factura cancelada no aparece.

- Factura 56622 (FZERO): total $ 328.668,39, OP por $ 315.626 → en 17696, $ 13.042,39. Coincide.
- Todas las pendientes de una empresa en un pedido: 584 filas en FZERO (5,7 s), 21 en 2030 SRL.
- Es la API pública (no la web): no necesita un endpoint nuevo.

### Endpoint

`GET /v1/tango/<tenant>/<empresa>/facturas-de-compra/:idCpa04/relacionados`, en el SDK
`relacionadosDeComprobanteDeCompra(id)`, permiso `14162:ComprobantesRelacionadosDeCompra`:

```ts
{
  idCpa04, tipo: 'FAC' | 'N/C' | 'N/D' | …, numero, fecha, estado,   // PEN, CAN, PAG, IMP, CTA
  proveedor: { idCpa01, codigo, razonSocial }, moneda, cotizacion, total, totalExt,
  vencimientos: [{ fecha, importe, estado }],
  relacionados: [{ tipo: 'O/P' | 'FAC' | 'N/C' | 'N/D', numero, fecha, idCpa04, ordenDePago }],
}
```

404 si no existe o si es una O/P; un relacionado sin ID se saltea (log).
