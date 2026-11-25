# Alta y modificación de proveedores (3142) con CUIT y CBU

Relevado el 2026-10-16 en PRUEBAS FZERO (13), con aprobación del usuario para escribir.
Se crearon dos proveedores de prueba, uno desde la web (5685) y otro por la API (5686). **Se
borraron los dos** y se verificó que no quedó ninguno.

Lo necesita comprobantes-to-tango: dar de alta un proveedor **a partir del CUIT**, como en la
web, y cargarle o cambiarle el **CBU**.

Antecedente: `api-escritura.md` y `proveedores-arca.md`, de una sesión anterior. Están en el
historial de git, en el commit `16e60cb`.

## Cómo lo hace la web

1. **Proveedores > Nuevo** llama a `processresolver/execute` con el método
   **`GetDefaultValues`**:

   ```json
   { "processNumber": "3142", "method": "GetDefaultValues",
     "data": { "defaultParams": null, "context": { "companyId": 13 } } }
   ```

   Devuelve 146 campos en `data`, con:
   - **el próximo código** (`codigo: "006384"`): Tango sí lo calcula, en la web;
   - el tipo de documento 26 (C.U.I.T.) y la categoría de IVA 1;
   - `CALCU_RET` S, `CITI_OPERA` O, `CITI_TIPO` B, `NUM_AUTOMA` N, `MON_CTE_HA` S;
   - las referencias de comprobantes y la fecha de alta.

2. **Al escribir el CUIT** se llama al método **`ActualizaAutomaticamenteCuit`**. Es la
   consulta a ARCA, del lado del servidor de Tango:

   ```json
   { "processNumber": "3142", "method": "ActualizaAutomaticamenteCuit", "data": {
       "iD_CPA01": -1, "iD_TIPO_DOCUMENTO_GV": 26, "n_CUIT": "30-50279317-5",
       "noM_PROVEE": null, "domicilio": null, "localidad": null, "c_POSTAL": null, "orden": null,
       "noM_FANT": null, "iD_CPA57": null, "iD_CATEGORIA_IVA_COND_IVA": 1, "calcU_RET": "S",
       "codigo": "006385", "domiciliO_COMERCIAL": null, "n_IVA": null, "retenciones": [],
       "confirmA_ACTUALIZACION_AFIP": false, "cpA57": null } }
   ```

   Devuelve:
   - `noM_PROVEE`, `noM_FANT` y `orden`;
   - `domicilio`, `domiciliO_COMERCIAL`, `localidad`, `c_POSTAL` e `iD_CPA57` (provincia);
   - `n_IVA` (actividad) e `iD_CATEGORIA_IVA_COND_IVA`, con su descripción en
     `categoriA_IVA`;
   - `calcU_RET`, `ivA_L` y `letrA_HABI_ARGENTINA`;
   - `retenciones` (sub-tabla, vacía en las pruebas);
   - **`cuiT_DUPLICADO`**.

   El botón "Actualizar" llama a `ActualizaConBoton`, que hace lo mismo.

3. **Al escribir el CBU** se llama a `SetCBU_Modificado`, que solo marca
   `cbU_MODIFICADO: true`. **No valida el CBU.**

4. **Para guardar,** la web exige además:
   - **Impuestos > Código de clasificación** (`ID_CLASIFICACION_RETENCION`), cuando aplica
     retenciones. En todas las empresas solo existe 1, "SIN CLASIFICAR".
   - **Resoluciones > RG 3685:** el tipo de operación y el comprobante AFIP, porque "Genera
     información" viene tildado por defecto.

   Después llama a `ConfirmationsProveedores` y a `Save`, ambos internos.

**RG 3685: lo que tienen los proveedores dados de alta en 2026 en la empresa 13.** Depende
de la categoría de IVA:

| Categoría IVA | Tipo de operación (`ID_OPERACION_AFIP_RG_3685_TIPO_OPERACION_COMPRAS`) | Comprobante AFIP (`ID_TIPO_COMPROBANTE_AFIP_RG_3685_COMPROBANTE_COMPRAS`) | Proveedores |
| ------------- | ---------------------- | ----------------------- | --: |
| 1 (RI) | 8 = "0 - Operaciones gravadas" | 1 = "001 - Facturas A" | 8 |
| 4 | 12 | 11 = "011 - Facturas C" | 4 |

## Qué hace la API pública

| Prueba | Resultado |
| ------ | --------- |
| `Create` solo con `N_CUIT` y `CBU` | Rechazo: `El campo ID_CPA57 es requerido`. **La API no consulta ARCA ni completa nada** |
| `Create` con los valores por defecto (`GetDefaultValues`), los datos de ARCA (`ActualizaAutomaticamenteCuit`), la clasificación 1 y el RG 3685 según la categoría | **Creó el proveedor.** Comparado campo por campo con el alta de la web: **0 diferencias** en todo lo que no es propio de cada proveedor. Sub-tablas iguales |
| `Update` parcial (`ID_CPA01` + `CBU`) | Rechazo: `El campo ID_CPA57 es requerido`. `Update` reemplaza el registro completo |
| `Update` completo (`GetById`, cambio, `Update`) | OK. **Solo cambiaron** `CBU` y `DESCRIPCION_CBU` |

**Cómo se arma el cuerpo del `Create`:**
- Las claves de la web, pasadas a mayúsculas, son los campos de la API (`iD_CPA57` →
  `ID_CPA57`). Se mandan solo las que están en el schema de `Create` y que no son listas ni
  objetos.
- Además: `COD_CPA01` (el `codigo` de los defaults), `N_CUIT`, `CBU` y los dos campos del
  RG 3685. En la prueba se mandó también `ID_CLASIFICACION_RETENCION`; el connector no lo
  manda, porque crea con `CALCU_RET = 'N'` (ver más abajo).

## Lo que Tango no controla (lo tiene que hacer el connector)

| Caso | `ActualizaAutomaticamenteCuit` responde |
| ---- | --------------------------------------- |
| CUIT ya cargado | `cuiT_DUPLICADO: true`, y **igual trae los datos** |
| CUIT con el dígito verificador mal | `succeeded: true` **sin datos**, sin error |
| CUIT que no existe en ARCA | Igual: `succeeded: true` sin datos |
| CUIT sin guiones (`30502793175`) | ARCA lo encuentra, pero **`cuiT_DUPLICADO` da `false` aunque exista** con guiones. Hay que normalizar a `XX-XXXXXXXX-X` |

- **CBU:** Tango no valida el formato ni los dígitos verificadores.
- **Código del proveedor:** `GetDefaultValues` propone el próximo, pero Tango no reserva ni
  controla que sea único. Si dos altas piden el código a la vez, reciben el mismo.

## Cómo quedó en el connector (ADR 0004)

Endpoints propios, como los del ADR 0003. **No son idénticos a Tango:** combinan la sesión
web, para los defaults y ARCA, con la API pública, para escribir.

```
POST  /v1/tango/:tenant/:empresa/proveedores/vista-previa  { cuit, cbu?, descripcionCbu?, codigoProvincia? }
POST  /v1/tango/:tenant/:empresa/proveedores               ídem
PATCH /v1/tango/:tenant/:empresa/proveedores/:id           { cbu?, descripcionCbu? }
```

**Alta**, en este orden:
1. Validar y normalizar el CUIT (`XX-XXXXXXXX-X`, dígito verificador) y el CBU (22 dígitos y
   verificadores). Campos desconocidos: 400.
2. Tomar un lock por tenant y empresa: dos altas a la vez no toman el mismo código.
3. Buscar el CUIT por `GetByFilter`: si ya está, 409 con el ID, código y razón social.
4. Pedir `GetDefaultValues` y `ActualizaAutomaticamenteCuit` por la sesión web. ARCA sin razón
   social: 422. `cuiT_DUPLICADO`: 409.
5. Armar el cuerpo con los defaults y ARCA (solo los campos que acepta `Create`) y las reglas:
   - **Retenciones:** `CALCU_RET = 'N'` ("Aplica retenciones en los pagos realizados"
     destildado) y sin `ID_CLASIFICACION_RETENCION`. Si ARCA trajo retenciones, va un aviso.
   - **RG 3685:** el primero de cada lista (`OperacionAfipComprasLookup` y
     `TipoComprobanteAfipHabilitadoCompraLookup`) de esa empresa. Son sugerencias.
   - **Provincia:** la de ARCA, o `codigoProvincia` (código de Tango, proceso 2728), que gana
     y avisa si difiere. Sin ninguna de las dos, falta `ID_CPA57`.
6. Controlar los obligatorios. Si falta alguno, 422 con cada campo y cómo resolverlo; la
   vista previa los devuelve en `faltantes`, sin error.
7. Controlar que el código propuesto esté libre (409 si no) y llamar a `Create`. Si Tango
   rechaza: 502 con su mensaje.
8. Auditar (ok o error) y devolver el proveedor con `GetById`.

**CBU:** `GetById`, cambiar `CBU` y `DESCRIPCION_CBU`, y `Update` completo. Auditado.

**Cortes:** si el `Create` o el `Update` no responden bien (timeout, HTTP de error, no JSON),
no se sabe si Tango guardó. Se audita como `desconocido` y el error lo dice, con cómo
verificarlo. Si Tango confirma pero no devuelve el ID, se busca por CUIT y el alta responde
201 igual.

**Duplicados:** el CUIT se busca con y sin guiones (`REPLACE(N_CUIT, '-', '')`).

**Locks:** las altas y los cambios de CBU de una misma empresa van de a uno. Un cambio hecho en
la web entre el `GetById` y el `Update` se pierde: Tango no tiene control de concurrencia.

**Sin reintentos automáticos:** ni el connector ni el SDK repiten una escritura. Un alta que
dio timeout pudo haberse guardado; repetirla da 409 por CUIT.

**Queda abierto:**
- **RG 3685 de otras categorías de IVA:** se toma igual el primero de cada lista. Con un
  consumidor final, Tango lo aceptó (prueba del 2026-10-19); exento no se probó.
- **Retenciones de ARCA:** no se cargan (va `CALCU_RET = 'N'`); solo se avisa.

## Prueba real (2026-10-19, empresa 13, por el connector de development)

| Caso | Resultado |
| ---- | --------- |
| CUIT de persona física, consumidor final, sin provincia en ARCA | Vista previa: falta `ID_CPA57`. Alta sin `codigoProvincia`: 422 que lo pide |
| El mismo con `codigoProvincia: "01"` y CBU | 201, ID 5687, código 006386, `ID_CPA57` 24, `CALCU_RET` N, RG 3685 8 y 1 |
| PATCH del CBU y descripción, y después con `null` | 200; los dos cambios quedaron |
| Repetir el alta | 409 con el proveedor 5687 |
| CUIT de empresa con provincia en ARCA (30-50279317-5) | 201, ID 5688, `ID_CPA57` 23 (Córdoba) |
| Auditoría | 4 filas `ok`, plataforma comprobantes-to-tango |

Los dos proveedores de prueba se borraron con `Delete` y se verificó que no quedó ninguno.

## Proveedores del exterior (2026-10-28)

Ver la ampliación del ADR 0004. Lo relevado (solo lectura, PRUEBAS FZERO, sonda
`scripts/web/sonda-proveedores-exterior.ts`):

| Lista de la ficha | Campos | Lo que usa el connector |
| ----------------- | ------ | ----------------------- |
| `OperacionAfipComprasLookup` (8) | `iD_OPERACION_AFIP_COMPRAS`, `coD_…`, `desC_…` | X Importaciones del exterior (ID 13) |
| `TipoComprobanteAfipHabilitadoCompraLookup` (103, de a 100) | `iD_TIPO_COMPROBANTE_AFIP`, `coD_…`, `letrA_COMPROBANTE` | 019 Facturas de exportación, letra E (ID 18); 020 y 021 son las notas |
| `CategoriaIvaExcluyeExeSncLookup` (9) | `iD_CATEGORIA_IVA`, `coD_CATEGORIA_IVA` | EX Exento (ID 5), RI (ID 1) |
| `ProvinciasComprasHiddenPaisesLookup` (25) | `iD_CPA57`, `coD_CPA57`, `noM_PROVIN` | 99 Exterior (ID 25); el connector usa el proceso 2728, como el alta nacional |

Los proveedores del exterior que ya había en FZERO, 2030 y GRINI (98 registros) tienen provincia 99, tipo de
documento C.U.I.T. y, casi todos, comprobante 099 y CITI O: no el modelo.

### Prueba real del exterior (2026-10-29, empresa 13, por el connector de development)

| Caso | Resultado |
| ---- | --------- |
| Vista previa "Prueba Exterior LLC", CUIT país 55-00000212-6, EX | Código propuesto 006390; sin duplicado |
| Alta | 201, código 006390: provincia 99, EX, X, 019, CITI I y B, `CALCU_RET` N, tipo de documento C.U.I.T.; ningún otro campo distinto de un alta del exterior existente |
| PATCH al modelo de Cloudflare Inc. (006242: 099, CITI O, retenciones S) | 3 campos cambiados (019, I, N); la categoría RI quedó; comparado campo por campo con su copia de FZERO, nada más cambió |

El proveedor de prueba 006390 quedó en PRUEBAS FZERO.
