# Escritura por la API pública de Tango

Cómo se escribe en Tango por la API pública: `Create`, `Update` y `Delete`. El caso
probado es **Proveedores (3142)**, el que necesita el Excel.

- **Probado el 2026-10-08** contra Tango 25.01.000.4263, empresa de prueba PRUEBAS FZERO
  (13), con aprobación del usuario.
- Se crearon 6 proveedores de prueba (IDs 5679 a 5684) y **se borraron los 6**. Se
  verificó que no quedó ninguno.
- **Script:** `python scripts/api/escribir.py <Create|Update|Delete> --company N
  process=<id> [id=<id>] [--body archivo.json]`. La empresa es obligatoria.
- Para lectura, ver `api-lectura.md`.

## Endpoints

| Endpoint | Método | Parámetros | Body |
| -------- | ------ | ---------- | ---- |
| `Api/Create` | POST | `process` | El registro (JSON) |
| `Api/Update` | PUT | `process` | El registro **completo**, con su ID |
| `Api/Delete` | DELETE | `process, id` | — |

Encabezados: los mismos que en lectura (`ApiAuthorization`, `Company`), más
`Content-Type: application/json`.

**Respuesta de una escritura que sale bien:**

```json
{ "savedId": 5679, "recordAffectedCount": 3, "succeeded": true, "message": null,
  "exceptionInfo": null, "savedConcurrencyToken": null, "savedRecord": null,
  "recordPosition": -1, "printingDestinationModel": null, "file": null }
```

- **`savedId`:** el ID del registro (`ID_CPA01`). En `Delete` vuelve siempre 0, igual
  que vio lumba-tango (`tango.service.ts`, `notifyRecordSaved`).
- **Los errores** vuelven como en lectura: HTTP 200, `succeeded: false`, y el detalle en
  `exceptionInfo.messages`. Por ejemplo, `El campo NOM_PROVEE es requerido`.

## Proveedores (3142)

### El schema de `getapi` no alcanza

`getapi` trae un JSON Schema para `Create` y `Update` (tabla `CPA01`, 91 campos). Tango
**no lo aplica tal cual**:

| El schema dice | Tango hace |
| -------------- | ---------- |
| Obligatorios: `COD_CPA01`, `NOM_PROVEE` | **Exige 10 campos** (ver abajo) |
| `additionalProperties: false` | **Ignora los campos desconocidos** y guarda igual |
| `COD_CPA01` es un string | **No controla que sea único:** se dieron de alta dos proveedores con el código 006360 |
| `N_CUIT` es un string de hasta 15 | **No valida el CUIT:** aceptó `ABC`, uno con el dígito verificador mal y uno que ya tenía otro proveedor |
| Las sub-tablas (`CONTACTOS`, `RETENCIONES`, …) son arrays | El schema no define sus campos |

### Campos obligatorios reales del alta

Se encontraron mandando un alta mínima y agregando el campo que Tango pedía, uno por vez:

| Campo | Qué es | Valor usado en la prueba |
| ----- | ------ | ------------------------ |
| `COD_CPA01` | Código del proveedor, hasta 10 caracteres | `006361` |
| `NOM_PROVEE` | Razón social, hasta 60 | `PRUEBA MINIMA - BORRAR` |
| `ID_CPA57` | Provincia | `24` |
| `ID_TIPO_DOCUMENTO_GV` | Tipo de documento | `26` |
| `ID_CATEGORIA_IVA_COND_IVA` | Categoría de IVA | `1` |
| `EDITA_COMPROBANTE_REFERENCIA_REMITO` | | `N` |
| `MON_CTE_HA` | | `S` |
| `NUM_AUTOMA` | | `N` |
| `CITI_OPERA` | | `O` |
| `CITI_TIPO` | | `B` |

Los valores salen del body de alta que funcionó en lumba-tango (`docs/otros/md viejos de
procesos/3142-Proveedores.md`, "JSON APTO PARA ALTA DE PROVEEDOR"). Ese body sigue
siendo compatible con el schema actual. Solo le faltan `E_MAIL_OP` e
`ID_CLASIFICACION_RETENCION`, que son nuevos y opcionales.

**Lo que Tango completa si no viene en el alta:**

| Campo | Valor por defecto |
| ----- | ----------------- |
| `FECHA_ALTA` | La fecha de hoy |
| `LETRA_HABI` | `A` |
| `INF_IVA` | `S` |
| `RG_3685_GENERA_INFORMACION` | `true` |
| `DEFECTO_COMPROBANTE_REFERENCIA_FACTURA` | `REM` |
| `CALCU_RET` | `S`, es decir **calcula retenciones**. El body de lumba-tango manda `N`. |

Hay que decidir estos valores a propósito, sobre todo `CALCU_RET`.

### Código del proveedor

Tango no lo genera ni controla que sea único. lumba-tango calcula el próximo así
(`ActionTextboxInput.tsx`):

```
GetByFilter?process=3142&view=Vista Predeterminada
  &filtroSql=WHERE ISNUMERIC(COD_CPA01) = 1 AND CAST(COD_CPA01 AS INT) =
             (SELECT MAX(CAST(COD_CPA01 AS INT)) FROM CPA01 WHERE ISNUMERIC(COD_CPA01) = 1)
```

En la prueba devolvió `006359`, así que el próximo es `006360`, con el mismo ancho.

Que el código sea único lo tiene que asegurar quien da el alta. Si dos plataformas dan de
alta a la vez, pueden calcular el mismo código.

### `Update` reemplaza el registro completo

- **Update parcial:** con el ID, el código, el nombre y un teléfono, Tango responde `El
  campo ID_CPA57 es requerido`. No hace un merge con lo que ya está guardado.
- **Lo que funciona:** `GetById`, cambiar los campos y mandar el `value` completo a
  `Update`. Así se cambió `NOM_FANT` sin tocar nada más.

### `Delete`

- `Delete?process=3142&id=<ID_CPA01>` responde `succeeded: true` con `savedId: 0`.
- Si el ID no existe: `Registro inexistente`.
- **No se probó** borrar un proveedor con movimientos. Es esperable que Tango lo impida.

## Para el connector

Según el ADR 0002, el request y la respuesta son los de Tango. Esto es lo que el connector
valida antes de mandar el request:

- **Schema estricto:** el connector rechaza los campos desconocidos. Tango los ignora en
  silencio, y un campo mal escrito (`NOM_PROVEDOR`) se perdería sin aviso.
- **CUIT en las altas de 3142:** el connector valida el formato (`XX-XXXXXXXX-X`), el
  dígito verificador y que no exista otro proveedor con el mismo CUIT. Tango no controla
  nada de eso.
- **Obligatorios reales:** al schema de `getapi` se le suma una lista de obligatorios
  relevada por proceso. Para 3142 son los 10 de arriba. Esa lista es catálogo del connector
  y se versiona con el relevamiento.
- **Código único en las altas de 3142:** antes del `Create`, el connector verifica con
  `GetByFilter` que `COD_CPA01` no exista. Además, serializa las altas de un mismo proceso
  y empresa, para que dos plataformas no tomen el mismo código.
- **`Update`:** se documenta que hay que mandar el registro completo. Un "merge" sería una
  traducción, y queda fuera del ADR 0002. Si hace falta, se agrega como endpoint de
  calidad de vida aparte.
- **Auditoría:** cada escritura queda registrada con la key, el proceso, el body y el
  `savedId`.

## Pendiente

- Probar las sub-tablas (`CONTACTOS`, `RETENCIONES`, …) en el alta y en el `Update`.
- Probar `Delete` de un proveedor con movimientos.
- Relevar los obligatorios reales de los otros CRUD que se vayan a habilitar.
