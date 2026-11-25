# Perfiles de factura de compra (fuera de la API)

Relevado el 2026-10-15 en FZERO SRL (empresa 3). Solo lectura.

## Qué son

Son los perfiles con que se registra un comprobante de compra:
- qué campos se **E**ditan, se **M**uestran o se **O**cultan;
- los valores por defecto (condición de compra, depósito, leyenda…);
- permisos como `ALTAPROVEE` (dar de alta proveedores) o `ALTAARTICU`.

La importación por Excel (21397) los usa: si la planilla deja un campo vacío, o si el perfil
lo tiene en Muestra u Oculta, prevalece el valor del perfil.

- **Proceso:** 27, "Compras > Archivos > Carga Inicial > Perfiles > de Factura de Compra".
  Tiene `migrated = 0`: **no tiene versión web ni API**.
- **Tabla:** `CPA128`, con clave `ID_CPA128`. Aparece en las tablas de 21397 y de 21508, que
  tampoco tienen API.
- **Ningún proceso con API los expone.** Se buscó en el catálogo 2026-10-08: tablas,
  columnas de los LIVE y lookups de los forms de los 229 CRUD.
  - 21600 ("Perfiles para el administrador de comprobantes por AI") **es otra cosa**: son
    los perfiles del administrador AI (modelo, período, usuarios).

## Cómo los obtiene la web

Al registrar un comprobante en el **Administrador de comprobantes por AI**, la web abre
`/company/<id>/select-profile/21508` (21508, Revisión de comprobantes). Usa dos endpoints
internos:

1. **La lista:** `GET /processresolver/getprofiles?action=21508`

   ```json
   { "profiles": [ { "key": 3, "displayLabel": "001 - FACTURA CONTADO" }, … ],
     "required": false, "size": 30, "description": "Seleccione un perfil", "succeeded": true }
   ```

   `key` es el `ID_CPA128`. Trae solo el ID y la etiqueta. En FZERO SRL hay 12 perfiles,
   del 001 al 012: FACTURA CONTADO, FACTURA CUENTA CORRIENTE, TARJETA DE CREDITO, …

2. **El perfil completo:** `POST /processresolver/formdefinition`

   ```json
   { "action": "21508", "context": { "selectedProfileId": <ID_CPA128>, "companyId": <empresa> } }
   ```

   El perfil viene en **`wizardGlobalContext.PERFIL_USUARIO`**: la fila completa de
   `CPA128`, con 118 campos. Algunos:

   | Campo | Ejemplo (002 FACTURA CUENTA CORRIENTE) | Qué es |
   | ----- | -------------------------------------- | ------ |
   | `ID_CPA128`, `COD_PERFIL`, `DESCRIPCIO` | 4, `002`, FACTURA CUENTA CORRIENTE | Identificación |
   | `COMP_CONCE`, `COMP_BONIF`, `COMP_DEPOS`, `COMP_LISTA`, … | `E`, `E`, `M`, `E` | Edita, Muestra u Oculta cada campo del comprobante |
   | `CTR_CONDIC`, `COND_DEF`, `D_CONDICIO` | `E`, `O`, 2 | Condición de compra y su valor por defecto. 001 FACTURA CONTADO tiene `D_CONDICIO = 1` |
   | `DEPOSITO` | `01` | Depósito por defecto |
   | `ALTAPROVEE`, `ALTAARTICU` | `true`, `true` | Si permite dar de alta proveedores y artículos |

   Después, la web manda ese mismo objeto como `context.bag.globalContext.PERFIL_USUARIO` en
   los `processresolver/execute` del asistente (`GetWizardSubscriptionData`,
   `GetDefaultValues`).

**Los dos endpoints necesitan la sesión de la web** (headers `Authorization`,
`ApplicationAuthorization`, `User`). Se probó el token de la API pública en
`ApiAuthorization`, `ApplicationAuthorization` y `Authorization`, y Tango responde **401**
en los dos endpoints. **El connector no los puede usar tal como está hoy.**

## Implementación: opción A (ADR 0003)

Se eligió la **opción A**: el connector inicia sesión en la web con un usuario técnico y
expone:
- `GET /v1/tango/:tenant/:empresa/perfiles-de-factura-de-compra`;
- `GET /v1/tango/:tenant/:empresa/perfiles-de-factura-de-compra/:id`.

**Código:** `src/tango-web/`.

**Tests:**
- unidad y e2e contra una web simulada, en `test/tango-web.spec.ts`;
- contrato contra la web real, en `test/contrato/web.contrato.ts`, que se corre con
  `npm run test:contrato`.

## Opciones que se evaluaron

| Opción | Cómo | Contras |
| ------ | ---- | ------- |
| **A. Sesión web en el connector** | El connector inicia sesión en la web de Tango con un usuario técnico, mantiene la sesión y expone, por ejemplo, `GET /v1/tango/:tenant/:empresa/perfiles-compra` y `/:id` | Es otra forma de autenticarse: guardar usuario y contraseña cifrados y renovar la sesión. Son endpoints internos, que pueden cambiar con una actualización de Tango. Requiere un ADR |
| **B. Foto periódica** | Se relevan con la sesión web, como el catálogo (`scripts/catalogo/`), y se guardan por empresa. El connector o la plataforma los sirven desde ahí | No es en vivo: si alguien cambia un perfil en Tango, hay que volver a relevar. Los perfiles cambian poco (12 por empresa) |
| **C. Carga manual en la plataforma** | Configuración → perfiles por empresa | Doble mantenimiento |
