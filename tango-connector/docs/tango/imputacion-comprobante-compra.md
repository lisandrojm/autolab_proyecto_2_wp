# Cómo se cargó un comprobante de compra (artículo, leyenda y centro de costo)

Relevado el 2026-10-15 en FZERO SRL (empresa 3), para comprobantes-to-tango. Solo lectura.

comprobantes-to-tango necesita saber, de un comprobante ya cargado en Compras:

- si está cargado y cuál es (`ID_CPA04`);
- el **artículo** usado (es lo que la plataforma llama "cuenta contable");
- la **leyenda**;
- el **centro de costo real**: el auxiliar de la imputación, no el que se escribe en la leyenda.

Los dos primeros y la leyenda salen de la API pública. El centro de costo **no**: hay que
leerlo de la web, como los perfiles (ADR 0003).

## 1. Artículo: Live 10091 (API pública)

"Detalle de comprobantes" (Compras > Consultas > Facturación). La vista por defecto ya trae lo
necesario, no hace falta una consulta guardada.

- **Una fila por renglón de artículo**, con `ID_CPA04`, `NRO_COMPROBANTE`
  (`A0000100000192`), `TIPO_DE_COMPROBANTE` (`FAC`), `FECHA_DE_EMISION`, `RAZON_SOCIAL`,
  `COD_ARTICULO`, `DESCRIPCION`, `CANTIDAD` e `IMPORTE`.
- **Filtra por fecha de emisión.**
- **No trae el CUIT.**
- **Los códigos de artículo coinciden** con los del proceso 87, por ejemplo `CO5000300000`
  EQUIPO PRODUCCION.
- **Tiempo:** unos 16 s para un mes la primera vez, y 1-2 s después.
- **Ya funciona con la key de comprobantes-to-tango.**

## 2. Leyenda: Live 10939 con "Mis consultas" 158 (API pública)

"Detalle por comprobante" (Compras > Consultas > Contabilidad). La vista por defecto no trae
la leyenda.

- Se guardó la consulta **"Plataforma - Detalle por comprobante"**, `ID_CONSULTA` **158**,
  con el usuario de la sesión web.
- Se pide con `customQuery=158`. **Sirve en todas las empresas:** se probó en la 3 y en la 8.
- Trae, **una fila por renglón del asiento**: `ID_CPA04`, `ID_CPA01`, `COD_PROVEEDOR`,
  `NRO_COMPROBANTE`, `COD_CUENTA`, `CUENTA`, `LEYENDA`, `DEBE`, `HABER` y `NRO_RENGLON`.
- **Filtra por fecha contable.**
- **Un `customQuery` inexistente no da error:** devuelve la vista por defecto.

La leyenda es texto libre. Suele empezar con el código del centro de costo, pero **no es
confiable**. Ejemplo: el comprobante 61433 tiene la leyenda "2290-703-AREA FULL-FC-665" y su
centro de costo real es el 703.

## 3. Centro de costo: proceso -14024 (web)

"Detalle por auxiliar". Es el que abre la web al hacer clic en **Auxiliar**, en la columna
Detalle de 10939. Muestra las imputaciones de cada tipo de auxiliar: el centro de costo es el
tipo `CC - CENTROS DE COSTO`.

`POST /processresolver/execute`

Usa los headers de la sesión web, igual que los perfiles. Este body mínimo funciona: se
probó quitando partes del que manda la web.

```json
{
  "processNumber": "-14024",
  "method": "GetPagedDataGrid",
  "data": {
    "pageIndex": 0, "pageSize": 50, "needTotalCount": true, "gridDataMethod": "GetDataGrid",
    "loadOptions": { "skip": 0, "take": 50, "requireTotalCount": true },
    "columns": [ COLUMNAS ]
  },
  "context": {
    "configuration": {
      "filter": { "condition": "AND", "rules": [ { "condition": "OR", "rules": [
        { "field": "axvLiveAsientoComprobanteCp.ID_CPA04", "operator": "equal", "type": "integer",
          "value": 61386, "condition": "OR", "input": "text" }
      ] } ] },
      "selectedColumns": [ COLUMNAS ]
    }
  }
}
```

`COLUMNAS` son objetos `{ field, order, type, sortOrder }`:

- `tipO_AUXILIAR`
- `auxiliar`
- `porC_DE_APROPIACION`
- `debE_CTE`
- `habeR_CTE`
- `iD_CPA04`
- `coD_CUENTA`

Las dos últimas no vienen en la vista de la web, pero se pueden pedir.

**Respuesta.** Viene en `resultData.list`, con una fila por comprobante × cuenta × centro
de costo:

```json
{ "iD_CPA04": 61386, "iD_CUENTA": 22, "coD_CUENTA": "5010050101",
  "iD_TIPO_AUXILIAR": 1, "tipO_AUXILIAR": "CC - CENTROS DE COSTO",
  "iD_AUXILIAR": 747, "auxiliar": "99HUI - 99 - Huidobro",
  "porC_DE_APROPIACION": 100, "debE_CTE": 40949.23, "habeR_CTE": 0 }
```

- **`auxiliar`** es `<código> - <descripción>` del centro de costo, el mismo código que el
  proceso 1656.
- **Si una cuenta se reparte entre varios centros de costo**, sale una fila por cada uno, con
  su `porC_DE_APROPIACION`.
- **Las cuentas sin auxiliar no aparecen.** Es el caso de proveedores e IVA.

**Trampas**

- **No mandar `periodConfiguration`.** La web lo hereda de la consulta de origen (`period: 8`,
  el mes actual) y filtra por fecha contable. Con él, un comprobante de otro mes devuelve una
  lista vacía, **sin error**. Con `period: 0` o con fechas también vino vacío.
- **`selectedColumns` es obligatorio.** Sin él, Tango responde "Value cannot be null.
  (Parameter 'source')".
- **Las reglas necesitan `type`, `condition` e `input`.** Sin ellos, Tango responde "Value
  cannot be null. (Parameter 'value')".
- **Pedir `nrO_COMPROBANTE` lo hace lento:** unos 10 s en lugar de 0,3 s. Alcanza con
  `iD_CPA04`.
- **Ni `in` ni `between` sirven para varios comprobantes:** colgaron la consulta. Para varios,
  se usan varias reglas `equal` con `condition: "OR"`. Con 5 comprobantes tardó unos 0,3 s.

**Probado** con 61566, 61594, 61386, 61264 y 61433 (CC 703 y 99HUI), en septiembre y octubre
de 2026.

## Lo que necesita el connector

> **Implementado el 2026-10-15** tal como se pidió acá.
>
> - **Endpoint:**
>   `GET /v1/tango/:tenant/:empresa/centros-de-costo-de-comprobantes-de-compra?idCpa04=61386,61566[&todos=true]`.
>   Por defecto solo trae los centros de costo; con `todos=true`, todos los tipos de
>   auxiliar.
> - **Permiso:** `-14024:CentrosDeCostoDeComprobantesDeCompra`.
> - **Hasta 50 comprobantes por pedido.** El connector pagina contra Tango de a 500 filas,
>   con un tope de 10 páginas y de 150 s.
> - **Si algo no cierra, responde 502 en vez de devolver datos incompletos:**
>   - si `totalCount` no coincide con las filas recibidas;
>   - si una página se repite;
>   - si aparece un comprobante que no se pidió;
>   - si una fila cambió de forma.
> - **Supuesto:** el tipo de auxiliar de los centros de costo empieza con `CC ` ("CC - CENTROS
>   DE COSTO" en FZERO). Los tipos se definen en cada base de Tango: una empresa con otro
>   código recibiría `[]`. Con `todos=true` se ven todos los tipos.
> - **Código del auxiliar:**
>   - sale de `auxiliar`, que es `<código> - <descripción>`;
>   - sin " - ", el texto entero se toma como código;
>   - para cruzar con el proceso 1656, la clave segura es `idAuxiliar`.
> - **Código:** `src/tango-web/centros-costo-compra.*`.
> - **SDK 0.3.1:** `centrosDeCostoDeComprobantesDeCompra([...])`.
> - **Tests de contrato contra la web real:**
>   - FZERO 61386 → `99HUI` al 100%;
>   - la paginación real (de a 2 filas) coincide con una sola página;
>   - un ID inexistente da lista vacía;
>   - la sesión vencida se reconoce en `execute`.

Un endpoint de la sesión web, igual que los perfiles. Por ejemplo:

```
GET /tango/:tenant/:empresa/centros-de-costo-de-comprobantes-de-compra?idCpa04=61386,61566
→ [ { idCpa04, codCuenta, idAuxiliar, codigo: "99HUI", descripcion: "99 - Huidobro",
      porcentaje, debe, haber } ]
```

- **Permiso:** con un nombre propio, como el de perfiles: por ejemplo
  `-14024:CentrosDeCostoDeComprobantesDeCompra`.
- **Filtro:** dejar solo `tipO_AUXILIAR = "CC - CENTROS DE COSTO"` o devolver todos los tipos
  (se podría hacer con `loadOptions.filter`).
- **Límite:** de IDs por pedido, por ejemplo 50, armando el OR.
- **Test de contrato:** un comprobante conocido (FZERO 61386) debe dar CC `99HUI` al 100%.
