# ADR 0003 — Sesión web de Tango para datos que la API no expone

- **Fecha:** 2026-10-15
- **Estado:** Aceptada e implementada (opción A en `docs/tango/perfiles-factura-compra.md`). En
  development funciona con el usuario habitual del administrador de Tango; ver las pruebas de convivencia.
- **Complementa a:** ADR 0002. La API idéntica a Tango sigue siendo el camino principal.

## Contexto

- **Hay datos que solo existen en la web de Tango.** El primero son los **perfiles de
  factura de compra** (`CPA128`, proceso 27), que necesita comprobantes-to-tango: definen
  qué completa Tango al importar el Excel.
  - **La web los obtiene con endpoints internos:** `processresolver/getprofiles` y
    `processresolver/formdefinition`.
  - **Esos endpoints exigen la sesión web.** Con el token de la API pública responden 401.
- **Así arma la sesión la web** (bundle `main-*.js`, Tango 25.01.000.4263):
  1. `POST /Authentication/SignIn` con `{username, password, loginType: 0}` (0 = usuario
     Tango). Devuelve `userHash`, `userName` y `companies`.
  2. `POST /Authentication/SelectCompany` con `{userHash, companyID}` y los headers
     `userHash` y `userName`. Devuelve el **`clientDescriptor`**. La sesión queda atada a esa
     empresa.
  3. Todos los requests llevan:
     - `Authorization: <clientDescriptor>`;
     - `User: <userHash>`, que después de elegir empresa es `0`;
     - `ApplicationAuthorization`, una **constante del bundle** (`EX.get()`);
     - las cookies (`withCredentials`).
  4. **Sesión vencida:** la respuesta trae `{"invalidSession": true}`.
  5. Además existen `Authentication/Alive`, `SignOut`, `ChangeCompany` y `KillSessionByUser`.
- **Terminales:** la web controla licencias por terminal (`hasExceededTerminals`,
  `userHasActiveTerminal`). Si se inicia sesión con un usuario que ya tiene una terminal
  activa, se puede desconectar a esa persona.

## Decisión

### Sesión del connector

- **Una sesión por empresa,** con un **usuario técnico de Tango** dedicado al connector.
  - Nunca el usuario de una persona: por las terminales, y para poder auditarlo.
- **Credenciales por tenant** (servidor Tango): usuario y contraseña **cifrados** en la base,
  igual que el token de la API. Se cargan con el CLI desde variables de entorno, nunca como
  argumento.
- **`ApplicationAuthorization` se lee del bundle de la web** al iniciar sesión: se baja
  `/main-*.js` y se extrae la constante, que queda en memoria. Si Tango se actualiza, se
  toma la nueva sola.
- **La sesión se abre cuando hace falta** y se reutiliza mientras sirva.
  - Ante `invalidSession` o un 401, se inicia sesión de nuevo **una vez** y se reintenta.
  - Dos requests simultáneos no inician sesión dos veces.
  - Al apagar el servicio se hace `SignOut`.

### Qué se expone

- **No hay un proxy genérico a los endpoints internos.** Cada dato se expone como un
  endpoint propio del connector, solo de lectura, con su forma documentada. A diferencia del
  ADR 0002, **no es idéntico a Tango**: no hay un endpoint público de Tango que copiar.
- **Primer endpoint:**

  | Endpoint | Devuelve | Origen en Tango |
  | -------- | -------- | --------------- |
  | `GET /v1/tango/:tenant/:empresa/perfiles-de-factura-de-compra` | `[{ id, codigo, descripcion }]` | `getprofiles?action=21508` |
  | `GET /v1/tango/:tenant/:empresa/perfiles-de-factura-de-compra/:id` | El perfil completo: la fila de `CPA128` tal cual (118 campos) | `formdefinition` de 21508 con `selectedProfileId`, en `wizardGlobalContext.PERFIL_USUARIO` |
| `GET /v1/tango/:tenant/:empresa/centros-de-costo-de-comprobantes-de-compra?idCpa04=…` | Centros de costo (auxiliares) imputados en comprobantes de compra | `processresolver/execute` de -14024, `GetPagedDataGrid` (ver `docs/tango/imputacion-comprobante-compra.md`). Permiso `-14024:CentrosDeCostoDeComprobantesDeCompra`. Agregado 2026-10-15 |

- **Permiso:** la key tiene que tener el endpoint `PerfilesDeFacturaDeCompra` en el
  proceso 27, por ejemplo `--procesos "*:Get,…;27:PerfilesDeFacturaDeCompra"`. El comodín
  `*` no lo habilita solo.

### Capa de tests

Como son endpoints internos, que Tango puede cambiar sin aviso:

1. **Tests de unidad con respuestas grabadas** (anonimizadas) de `SignIn`, `SelectCompany`,
   `getprofiles` y `formdefinition`. Cubren la extracción, el reintento ante
   `invalidSession` y la forma de la respuesta.
2. **Tests de contrato contra Tango real** (`npm run test:contrato`, opcional, con
   credenciales). Verifican que:
   - el bundle sigue teniendo la constante;
   - `SignIn` y `SelectCompany` siguen devolviendo `userHash` y `clientDescriptor`;
   - `getprofiles` devuelve `profiles[].key/displayLabel`;
   - `formdefinition` trae `wizardGlobalContext.PERFIL_USUARIO` con `ID_CPA128`,
     `COD_PERFIL` y `DESCRIPCIO`.

   Se corren después de cada actualización de Tango y antes de cada deploy.

## Pruebas de convivencia (2026-10-15)

Se probó si el connector puede usar **el mismo usuario que una persona**, que en este caso
fue el usuario habitual de quien administra Tango. Las pruebas se hicieron con
`scripts/web/sonda-sesiones.ts`, desde la PC de desarrollo, y con el connector de
development desde el VPS.

| Escenario | Resultado |
| --------- | --------- |
| La persona está conectada y el connector inicia sesión (empresas 13 y 3) | Conviven; la sesión de la persona sigue válida |
| La persona cierra sesión y entra de nuevo en dos ventanas, con el connector conectado | Las sesiones del connector siguen válidas (sin volver a loguear) |
| Seis sesiones más del connector a la vez (13, 13, 13, 3, 3, 8) | Sin límite ni `hasLicenseError` |
| El connector hace `SignOut` | Cierra solo su sesión; las demás siguen |
| La persona abre un proceso (`RegisterApp`) con el connector conectado | `hasExceededTerminals: false`, `userHasActiveTerminal: false`, sin avisos |
| **Desde el VPS:** el connector inicia sesión y la persona cierra y vuelve a entrar | Conviven, sin avisos. El connector no tuvo que volver a loguear |

- **Terminal:** Tango registra la sesión del connector con la terminal de la máquina que
  la abre. Desde la PC de desarrollo fue `DESKTOP-FEKVQ4C`. **Desde el VPS es
  `SERVERTANGO`**, porque el túnel FRP sale del propio servidor Tango.
- **Las sesiones del connector no llaman a `RegisterApp`** (no abren procesos de la
  interfaz). Por eso no parecen ocupar terminales de aplicación.

**Conclusión:** con este servidor y esta licencia, compartir el usuario **funciona**: no se
pisan las sesiones ni aparecen avisos. Igual se recomienda un usuario técnico, por razones
que no son técnicas:
- **Auditoría:** lo que haga el connector queda a nombre de una persona.
- **Cambio de contraseña:** si la persona la cambia, el connector deja de funcionar hasta
  cargarla de nuevo con `tenant:credenciales-web`.
- **Credenciales personales en el servidor,** aunque estén cifradas.
- **Permisos:** un usuario técnico se limita a lo necesario.
- **Límite de terminales:** no se probó con las terminales de la licencia agotadas. En ese
  caso Tango ofrece cerrar la sesión de un usuario con terminal activa (`KillSessionByUser`),
  y con un usuario compartido podría cortar al connector o a la persona.

## Consecuencias

### Positivas

- La plataforma obtiene los perfiles al momento, por empresa, sin carga manual.
- El mecanismo sirve para otros datos que solo estén en la web.

### Negativas y riesgos

- **Depende de endpoints internos:** pueden cambiar con una actualización de Tango. Los
  tests de contrato lo detectan, pero el endpoint se cae hasta que se ajuste.
- **Se guardan credenciales de un usuario web**, cifradas. El usuario técnico tiene que
  tener solo los permisos necesarios.
- **Ocupa una terminal o licencia** de Tango mientras la sesión está activa. Hay que
  confirmar cuántas hay disponibles.
