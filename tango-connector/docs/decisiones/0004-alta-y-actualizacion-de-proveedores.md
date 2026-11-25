# ADR 0004 — Alta y actualización de proveedores (primeras escrituras)

- **Fecha:** 2026-10-19
- **Estado:** Aceptada
- **Relevamiento:** `docs/tango/alta-proveedores.md` (pruebas en PRUEBAS FZERO del 2026-10-16)
- **Complementa a:** ADR 0002 (API idéntica a Tango) y ADR 0003 (sesión web)

## Contexto

comprobantes-to-tango tiene que dar de alta proveedores **a partir del CUIT**, como se hace en
la web, y cargarles o cambiarles el **CBU**.

- **En la web,** Tango completa el alta con los valores por defecto (`GetDefaultValues`) y con
  los datos de ARCA (`ActualizaAutomaticamenteCuit`). Las dos cosas son internas de la web.
- **La API pública** (`Create`) guarda lo que se le manda y no completa nada.
- **Un `Create` armado con defaults, ARCA y los obligatorios** dio 0 diferencias contra un alta
  hecha en la web.
- **`Update` reemplaza el registro completo.**
- **Tango no controla:** CUIT inválido o sin datos en ARCA (responde OK y vacío), CUIT sin
  guiones (falla el control de duplicados), CBU, ni que el código del proveedor sea único.

**Definiciones del usuario (2026-10-19):**
- **"Aplica retenciones en los pagos realizados"** va **destildado** (`CALCU_RET = N`). Así no
  hacen falta "Código de clasificación" ni los campos que le siguen.
- **RG 3685:** "Código de tipo de operación" y "Código de comprobante AFIP" son sugerencias.
  Se usa siempre **el primero de cada lista**.
- **"Código de provincia"** es obligatorio, y a veces ARCA no lo trae.
- **El diseño parte del CUIT, suma lo de ARCA y aplica estas reglas.** Tiene que avisar siempre
  qué obligatorios faltan y manejar bien los errores, por ejemplo que ARCA no devuelva datos.

## Decisión

### Endpoints propios del connector

A diferencia del ADR 0002, no son idénticos a Tango. Combinan la sesión web (ADR 0003), para
defaults, ARCA y listas, con la API pública, para escribir.

| Endpoint | Qué hace | Permiso de la key |
| -------- | -------- | ----------------- |
| `POST /v1/tango/:tenant/:empresa/proveedores/vista-previa` | Arma el alta sin escribir: lo que se mandaría a Tango, los obligatorios que faltan y los avisos | `3142:AltaDeProveedor` |
| `POST /v1/tango/:tenant/:empresa/proveedores` | Da de alta el proveedor | `3142:AltaDeProveedor` |
| `PATCH /v1/tango/:tenant/:empresa/proveedores/:id` | Cambia el CBU y su descripción (`GetById` + `Update` completo) | `3142:ActualizarProveedor` |

**Cuerpo:** `{ cuit, cbu?, descripcionCbu?, codigoProvincia? }`. En el `PATCH`, solo `cbu` y
`descripcionCbu`.

- **`codigoProvincia`** es el código de Tango (`COD_CPA57`: `00` Capital Federal, `01` Buenos
  Aires, …). Se lee del proceso 2728. Si viene, tiene prioridad sobre lo de ARCA.

### El alta, paso a paso

1. **Validar lo que manda la plataforma** (400):
   - el CUIT, con dígito verificador, normalizado a `XX-XXXXXXXX-X`;
   - el CBU: 22 dígitos y los dos dígitos verificadores;
   - la descripción del CBU: hasta 30 caracteres.
2. **Lock por tenant y empresa:** las altas de una misma empresa van de a una, así dos no toman
   el mismo código. Vale para una instancia del connector, que es como corre (PM2 en `fork`).
3. **CUIT duplicado** (409, con el ID y el código del existente): se busca por la API
   (`GetByFilter`).
4. **Valores por defecto:** `GetDefaultValues`. Traen el próximo código.
5. **Datos de ARCA:** `ActualizaAutomaticamenteCuit`.
   - **Sin datos** (sin razón social): 422 "ARCA no devolvió datos para el CUIT".
   - **`cuiT_DUPLICADO`:** 409.
6. **Provincia:** `codigoProvincia` si viene; si no, la de ARCA.
   - **Ni una ni otra:** 422, que pide `codigoProvincia`.
   - **`codigoProvincia` desconocido:** 400.
7. **Reglas fijas:**
   - `CALCU_RET = N`, sin clasificación ni retenciones. Si ARCA sugiere retenciones, va un aviso.
   - RG 3685: el primero de `OperacionAfipComprasLookup` y de
     `TipoComprobanteAfipHabilitadoCompraLookup` (`processresolver/getdatalookup`).
8. **Obligatorios:** se controlan **antes** de llamar a Tango. Si falta alguno, 422 con la lista
   y qué hacer con cada uno. Son:
   - los 10 relevados: `COD_CPA01`, `NOM_PROVEE`, `ID_CPA57`, `ID_TIPO_DOCUMENTO_GV`,
     `ID_CATEGORIA_IVA_COND_IVA`, `EDITA_COMPROBANTE_REFERENCIA_REMITO`, `MON_CTE_HA`,
     `NUM_AUTOMA`, `CITI_OPERA`, `CITI_TIPO`;
   - `N_CUIT`;
   - los dos del RG 3685.
9. **Código libre:** se verifica que el código propuesto no exista. Si existe, 409.
10. **Alta:** `Create` por la API pública.
    - **Error de Tango:** 502, con su detalle.
11. **Verificación:** `GetById`. La respuesta es `201 { id, codigo, proveedor, avisos }`.

### Auditoría

Cada escritura, salga bien o mal, queda en la tabla `auditoria_escrituras`, con:
- la key y la plataforma;
- el tenant y la empresa;
- la operación;
- el ID del registro;
- el cuerpo que se mandó;
- el resultado y el mensaje.

Los datos van **completos**: son datos fiscales y bancarios de proveedores, no secretos de
acceso. La tabla queda solo en la base del connector.

### Lo que no cambia

- **El `Create`, `Update` y `Delete` genéricos del proxy** (ADR 0002) siguen deshabilitados.
- **Las escrituras pasan solo por estos endpoints,** que validan y auditan.

## Consecuencias

- **La plataforma da de alta con el CUIT y, cuando ARCA no trae la provincia, con su código.**
  La vista previa le permite mostrar los datos y pedir lo que falte antes de dar el alta.
- **Depende de endpoints internos de la web:**
  - `GetDefaultValues`;
  - `ActualizaAutomaticamenteCuit`;
  - `getdatalookup`.

  Los tests de contrato tienen que cubrirlos.
- **El lock es por proceso.** Si algún día corre más de una instancia, hace falta un lock
  compartido, por ejemplo en Postgres.

## Ampliación (2026-10-28): proveedores del exterior

comprobantes-to-tango ingresa invoices de proveedores del exterior. Tienen un **CUIT país** de ARCA (lo
comparten muchos, ej. 55-00000212-6 Estados Unidos, persona jurídica) y **ARCA no tiene datos** de él.
Hacía falta darlos de alta sin ARCA y corregir los existentes (casi todos fuera del modelo).

- **`POST proveedores/exterior`** (y `exterior/vista-previa`), permiso `3142:AltaDeProveedor`. Cuerpo
  `{ cuitPais, razonSocial, categoriaIva?, cbu?, descripcionCbu? }`. Sin `ActualizaAutomaticamenteCuit`:
  defaults de Tango, la razón social (también `NOM_FANT` y `ORDEN`, como las altas que ya había) y el
  **modelo del exterior**: provincia 99 Exterior, RG 3685 **X** y **019**, CITI **I** y **B**, `CALCU_RET`
  N, categoría de IVA **EX** (por defecto) o **RI**.
  - El CUIT país se valida por prefijo (50, 51, 55), **sin dígito verificador**: la tabla de ARCA tiene
    algunos que no lo cumplen y son los que se usan.
  - **Duplicado (409):** el mismo CUIT país con la misma razón social, sin mayúsculas, acentos,
    puntuación ni forma societaria (`razonSocialClave`, la misma regla que comprobantes-to-tango).
- **`PATCH proveedores/:id`** acepta además `operacionAfip`, `comprobanteAfip` y `categoriaIva` **por su
  código** (el connector los traduce al ID de la empresa con las listas de la ficha:
  `OperacionAfipComprasLookup`, `TipoComprobanteAfipHabilitadoCompraLookup`,
  `CategoriaIvaExcluyeExeSncLookup`, leídas enteras de a páginas y guardadas una hora), `citiOpera`,
  `citiTipo`, `aplicaRetenciones: false` y `habilitado`. **Sin cambios reales no escribe;** la respuesta
  y la auditoría tienen solo lo que cambió (`cambios`).
- Los códigos e IDs de las listas se relevaron en PRUEBAS FZERO con
  `scripts/web/sonda-proveedores-exterior.ts` (solo lectura): X = 13, 019 = 18, EX = 5, RI = 1, provincia
  99 = 25. El connector no usa IDs fijos: los lee en cada empresa.
- **Habilitado** no está en el schema de `Update` (Tango lo ignora y respondía OK): es no tener **fecha de
  inhabilitación** (`FECHA_INHA`). `habilitado: false` pone la de hoy (si no tenía); `true`, la borra
  (2026-10-29). **Después de cada `Update` se relee el registro:** si un campo pedido no quedó, 502 "Tango no
  guardó" con cuál, auditado como error.
- **Documento duplicado:** una empresa que controla el tipo y número de documento duplicado (2030 SRL Gestion)
  rechaza el `Update` de un proveedor cuyo CUIT tiene otro, aunque no se cambie el CUIT ("El Tipo y Nro. de
  documento ya existe"). Con un CUIT país (que comparten muchos) pasa siempre: ese control tiene que estar
  desactivado en la empresa.
