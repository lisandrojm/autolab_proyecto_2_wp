# Catálogo de procesos de Tango

Mapeo de los procesos de Tango Gestión: qué hay en cada módulo, cuáles son web y qué API
expone cada uno. Cada relevamiento queda en una carpeta con su fecha, así se pueden comparar
después de una actualización de Tango.

| Relevamiento                 | Versión de Tango | Empresa             | Alcance        |
| ---------------------------- | ---------------- | ------------------- | -------------- |
| [2026-10-08](2026-10-08/)    | 25.01.000.4263   | PRUEBAS FZERO (13)  | Menús (base)   |

El relevamiento anterior, manual, está en lumba-tango (`docs/tango-gestion/`, abril a junio
de 2026).

## Cómo se obtiene el menú

La web de Tango (`http://servertango:17000`) carga el menú de cada módulo con:

```
POST /Module/GetMenuItems
Content-Type: application/json
Authorization, ApplicationAuthorization, User   ← los pone la sesión web

{ "clientDescriptor": "<de la sesión>", "module": <id de módulo> }
```

- Es un endpoint de la **web** de Tango, no de la API pública (`/Api/...`). Necesita una
  sesión iniciada en el navegador; no se usa el token de API.
- **La respuesta viene en Latin-1.** Si se lee con `fetch().json()` los acentos pueden
  romperse; hay que verificar que no queden caracteres `U+FFFD`.

### IDs de módulo

| Módulo              | ID    | Módulo             | ID    |
| ------------------- | ----- | ------------------ | ----- |
| Ventas              | 10023 | Sueldos            | 8     |
| Stock               | 10002 | Control de personal| 9     |
| Compras             | 10003 | Procesos generales | 11    |
| Tesorería           | 10005 | Live               | 53    |
| Cash Flow           | 10006 | Administrador      | 51    |
| Contabilidad        | 6     | Aplicaciones nexo  | 10026 |

### Pasos

1. Iniciar sesión en la web de Tango y entrar a un módulo. Eso dispara `GetMenuItems`.
2. Desde la consola de la página, repetir el request para cada módulo con los mismos
   encabezados y el mismo `clientDescriptor`. Armar un JSON
   `{ capturedAt, company, tangoVersion, modules: [{ name, module, menuItems, ... }] }` y
   descargarlo.
3. `python scripts/catalogo/menus.py <export.json> docs/tango/catalogo/<fecha>` genera:
   - `menu/NN-Modulo.json`: la respuesta de cada módulo, sin cambios;
   - `procesos.csv`: una fila por proceso del menú;
   - `meta.json`: fecha, empresa y versión de Tango.

## Campos de cada ítem de menú

| Campo          | Qué es                                                                   |
| -------------- | ------------------------------------------------------------------------ |
| `menuId`       | ID del nodo en el menú. `parentId` apunta al nodo padre.                 |
| `accessNumber` | **ID del proceso.** Es el `process` que usa la API (`Api/Get?process=`). En las carpetas es un número interno. |
| `isProcess`    | `true` si es un proceso; `false` si es una carpeta.                      |
| `path`         | Ruta del menú, p. ej. `Compras\Archivos\Actualizaciones`.                |
| `migrated`     | `true` si el proceso tiene versión web. Ver la nota en el relevamiento.  |
| `level`, `levelOrder`, `moduleNumber`, `url` | Nivel, orden, módulo; `url` vino siempre `null`. |

## Tipos de proceso

Se determinan por los endpoints que devuelve `getapi`, en este orden:

| Tipo     | Endpoints                                                     | Uso                                        |
| -------- | ------------------------------------------------------------- | ------------------------------------------ |
| **CRUD** | `Create`, `Update`, `Delete`, `Get`, `GetById`, `GetByFilter` | Altas, bajas, modificaciones y consultas   |
| **LIVE** | `GetApiLiveQueryData`                                         | Consultas e informes                       |
| **EXEC** | `Process`, `Custom`                                           | Procesos que ejecutan una acción: masivos, depuraciones, generaciones |
| **PDF**  | `GetPdf`                                                      | Devuelve el PDF de un comprobante (fichas Live) |

Para cada tipo se guarda:
- **CRUD:** `<id>-api.json` (getapi), `<id>-form.json` (formdefinition) y `<id>-data.json` (getdata).
- **LIVE, EXEC y PDF:** `<id>-api.json`.
