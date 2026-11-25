# ADR 0002 — API idéntica a la de Tango, con API key por plataforma

- **Fecha:** 2026-10-08
- **Estado:** Aceptada
- **Reemplaza en parte a:** ADR 0001, en "Endpoints de dominio" y "Errores normalizados
  con `problem+json`".
- **Base:** el proxy de lumba-tango (`server/src/modules/tango/tango.controller.ts` y
  `tango.service.ts`).

## Contexto

- **Qué necesitan las plataformas:** leer procesos de Tango, primero para llenar Excels, y
  más adelante escribir: altas de proveedores, comprobantes.
- **Cómo es la API de Tango:** es genérica. Nueve endpoints (`Get`, `GetById`,
  `GetByFilter`, `GetApiLiveQueryData`, `Create`, `Update`, `Delete`, `Process`, `Custom`,
  más `GetPdf`) sirven para todos los procesos, con los mismos parámetros. El proceso va en
  `?process=`. Ver `docs/tango/api-lectura.md`.
- **Cómo lo resuelve lumba-tango:** un proxy que **no traduce**.
  - `/api/v1/tango/:tenantSlug/:companySlug/*path` se reenvía a
    `http://<túnel>:<puerto>/Api/<path>?<query>`, con el mismo método, la misma query y el
    mismo body.
  - Agrega `ApiAuthorization` (el token del usuario) y `Company`.
  - Devuelve la respuesta de Tango sin cambios.
  - Aparte expone `config/:processId` con metadatos del proceso.
- **Qué proponía ADR 0001:** endpoints de dominio ("buscar proveedor por CUIT") y errores
  propios. Eso obliga a diseñar y mantener una API por caso de uso, y el desarrollador de
  cada plataforma tiene que aprender dos APIs: la de Tango y la del connector.

## Decisión

### La API es la de Tango

El connector expone **los mismos endpoints que Tango, con los mismos parámetros y el
mismo body**, como el proxy de lumba-tango. Para el desarrollador solo cambian la URL y la
autenticación.

```
Tango:      GET http://servertango:17000/Api/GetById?process=3142&id=1
            ApiAuthorization: <token de Tango>
            Company: 13

Connector:  GET https://<connector>/v1/tango/<tenant>/<empresa>/GetById?process=3142&id=1
            X-Api-Key: <key de la plataforma>
```

- **Ruta:** `/v1/tango/:tenantSlug/:companySlug/<Endpoint>`, con la misma forma que en
  lumba-tango. El tenant elige el servidor Tango (el puerto del túnel) y la empresa elige
  el `Company`.
- **Respuesta:** la de Tango, **sin cambios**. Se mantiene `succeeded`, `resultData`, la
  `list` en la raíz de `GetByFilter`, `value` en `GetById`, etc. La documentación de Tango
  y lo relevado en `docs/tango/` valen tal cual.
- **No hay endpoints de dominio.** Cada plataforma arma el request que necesita.

### Lo que agrega el connector

Todo esto ocurre **antes** de llegar a Tango. Si algo falla, el request no sale.

1. **API key por plataforma**, generada en el connector, en reemplazo del JWT de
   lumba-tango.
   - Cada key define a qué tenants y empresas accede, y qué **procesos y endpoints** puede
     usar. Por ejemplo: "lee 3142 y 10091; no escribe".
   - Lo que no está permitido explícitamente se rechaza. Los EXEC peligrosos del
     Administrador (Restaurar empresa 19785, Instalar actualizaciones 3436, Compactar
     3359, Restablecer configuración 3366) no se pueden habilitar.
   - El token de Tango lo pone el connector: es el de la empresa, guardado cifrado. La
     plataforma nunca lo ve.
2. **Validación de escrituras con el schema de Tango.** `Create` y `Update` (229
   procesos) y `Process` y `Custom` (45) traen un JSON Schema en `getapi`, con
   `required`, tipos, `format`, `maxLength` y `additionalProperties: false`. El body se
   valida contra ese schema y, si no cumple, se devuelven los errores por campo.
3. **Resguardos en las lecturas**, sin cambiar los parámetros:
   - **`GetByFilter`:** `filtroSql` obligatorio y con `WHERE`. Se rechazan `;`, comentarios
     y palabras de DDL o DML. Habilitarlo es un permiso aparte de la key, porque es SQL que
     corre en la base de Tango.
   - **`Get` y `GetApiLiveQueryData`:** `pageSize` con un máximo, en principio 1.000.
   - **`GetApiLiveQueryData`:** las fechas se validan con los formatos que acepta Tango
     (`dd/MM/yyyy` o ISO con hora).
4. **Auditoría** de todas las escrituras: qué key, qué proceso, qué body, qué respondió
   Tango.
5. **Concurrencia limitada por servidor Tango y timeouts.** Algunas consultas tardan más
   de 60 s.

### Errores del connector

Cuando el connector rechaza un request, por auth, permisos, schema o resguardos, responde
con el **código HTTP que corresponde** (401, 403, 400, 502, 504) y un body con **la misma
forma que los errores de Tango**:

```json
{
  "succeeded": false,
  "message": "Validación del connector",
  "exceptionInfo": { "messages": ["NOM_PROVEE: es obligatorio"] }
}
```

Así la plataforma maneja una sola forma de error. Los errores de Tango pasan sin cambios,
con HTTP 200 y `succeeded: false`. El connector agrega el header
`X-Connector-Origin: tango | connector` para distinguir de dónde vino la respuesta.

### Metadatos: endpoints de calidad de vida

Salen del **catálogo relevado y versionado en el repo** (`docs/tango/catalogo/<fecha>/`).
`getapi` y `formdefinition` solo funcionan con la sesión web, no con el token de API, así
que no se consultan en tiempo de ejecución. Cuando Tango se actualiza, se vuelve a relevar
con `scripts/catalogo/`.

| Endpoint | Devuelve |
| -------- | -------- |
| `GET /v1/meta/procesos` | Los procesos que la key puede usar: ID, descripción, módulo, tipo (CRUD, LIVE, EXEC, PDF), endpoints |
| `GET /v1/meta/procesos/:id` | El detalle: endpoints con parámetros y valores por defecto, schema de `Create`/`Update`/`Process`, columnas de cada tabla, ID del registro |
| `GET /v1/meta/campos?buscar=cuit` | En qué procesos y tablas está un campo (`campos.csv`) |
| `GET /v1/meta/yo` | La key: tenants, empresas, procesos y endpoints permitidos |
| `GET /v1/docs` | OpenAPI del connector |

Las consultas guardadas de Live (`customQuery`) tampoco se pueden listar con el token.
Hay dos opciones, y se elige al implementarlo:
- registrarlas en el connector con su `ID_CONSULTA` y su proceso;
- o relevarlas desde la web, como el resto del catálogo.

## Consecuencias

### Positivas

- **Una sola API para aprender:** la de Tango. Lo relevado en `docs/tango/` es la
  documentación del connector.
- **Mismo contrato que el proxy de lumba-tango:** lumba-tango podría migrar cambiando la URL
  base y la autenticación.
- **Poco código propio:** proxy, auth, validación y metadatos. No hay un endpoint por caso
  de uso.

### Negativas y costos

- **Las plataformas conviven con las rarezas de Tango:** errores con HTTP 200, `list` en la
  raíz de `GetByFilter`, `GetByFilter` sin paginación. Se documentan; no se esconden.
- **`filtroSql` sigue siendo SQL que manda el cliente.** Los resguardos lo acotan pero no
  lo vuelven seguro. Por eso es un permiso explícito de la key.
- **Los schemas y los metadatos dependen del catálogo relevado.** Si Tango se actualiza y no
  se vuelve a relevar, el connector puede validar contra un schema viejo.
