# Baja, modificación y anulación de una relación laboral en ARCA

Cómo se operan desde WeProdu los tres íconos que ARCA muestra en Relaciones Laborales → Modificaciones y Bajas (`Modificaciones.aspx`), y cómo correrlo en seco.

## Qué es

Tres operaciones distintas sobre una relación ya dada de alta, cada una con sus reglas y plazos:

| Operación | Qué hace en ARCA | Qué pide | Dónde se confirma |
|---|---|---|---|
| **Baja** | registra la fecha de fin y el motivo | fecha de fin, situación de baja (tabla de ARCA), fecha de telegrama si es renuncia | «Confirmar» de `RegistraBaja.aspx` |
| **Modificación** | cambia datos ya informados (fechas, retribución, modalidad, situación de revista, códigos) | los campos que cambian; lo demás no se toca | «Confirmar» de `ModificaAlta.aspx` |
| **Anulación** | anula el alta (si la relación no tiene baja) o la baja (si la tiene) | qué se anula | el ícono mismo, con el diálogo de ARCA |

ARCA habilita o no cada ícono por relación. Un ícono deshabilitado es un rechazo por regla de ARCA: el motor lo informa y no toca nada.

## Dónde vive

- Motor (Playwright, en el servidor): `frontend/tools/modificaciones-arca.mjs`. Archivo aparte del de altas, con su propia lista blanca de clicks y su propio escaneo (`modificaciones-arca.test.mjs`). Importa del motor de altas sólo lo que no aprieta nada.
- Reglas puras (plan, idempotencia, avisos): `server/src/services/arca/reglasOperacionRelacion.ts`.
- Corrida (candado, sesión, log, marca en el contrato): `server/src/services/arca/corridaOperacionRelacion.ts`; el núcleo `ejecutarOperacion` se prueba con un ARCA simulado.
- Contexto y plan desde la base: `server/src/services/arca/operacionRelacion.ts`.
- Rutas: `server/src/routes/arcaOperaciones.ts` (`/api/v1/arca/operaciones/*`).
- Tabla de situaciones de baja: modelo `ArcaSituacionBaja`, ruta `/api/v1/arca/situaciones-baja`, página Configuración → ARCA → Situaciones de Baja. Se siembra con `npm run arca:situaciones-baja` desde el fixture relevado.
- Pantalla: en «Todos los contratos» (gestor de contratos de la persona), el enlace **Relación en ARCA** debajo de cada tarjeta con alta presentada. El registro, en Presentaciones ARCA → pestaña **Bajas y modificaciones**.

## Marcas en el contrato

Tres subdocumentos, con la misma forma que `altaArcaPresentada`: `bajaArcaPresentada`, `modificacionArcaPresentada`, `anulacionArcaPresentada`. Cada uno guarda `resultado` (`presentada`, `indeterminado`, `fallida`, `presentando`, `anulada`), `clase` (`regla_arca` o `navegacion` cuando falló), `motivo`, `acuse` (C.B.T., C.A.T., número de transacción si ARCA lo mostró), `payload` (exactamente lo enviado), `relacion` (como ARCA la mostraba antes) y `logId`.

Una anulación del alta confirmada pone `altaArcaPresentada.resultado = "anulada"`: deja de trabar otras altas de la persona, no entra en la presentación automática, y el contrato queda habilitado para anularse en WeProdu. Una anulación de la baja pone `bajaArcaPresentada.resultado = "anulada"`.

Las fechas del contrato en WeProdu **no se tocan** por ninguna operación: eso lo decide una persona.

`bajaArca` (sin «Presentada») es otra cosa: la baja que ARCA informó y la sincronización copió al contrato.

## Idempotencia

Dos capas:

1. El plan no deja arrancar si ya hay una marca `presentada`, `presentando` o `indeterminado` de la misma operación, ni si el espejo de Relaciones Laborales ya muestra el resultado (la baja con esa fecha, los valores pedidos).
2. El motor relee la relación en vivo antes de operar. Si ya tiene esa baja, devuelve `ya_hecha` y no toca nada.

Lo que quedó `indeterminado` no se reintenta: se mira en ARCA. El resultado de una operación se lee volviendo a buscar la relación en el listado, nunca se supone.

## Errores

- `regla_arca`: ARCA rechazó (texto literal en `motivo`) o no habilita el ícono. Reintentar no cambia nada.
- `navegacion`: la sesión se cayó, la pantalla no era la esperada, ARCA no contestó. Se puede reintentar sin tocar nada.
- `indeterminado`: se confirmó y no se pudo leer el resultado. Mirar en ARCA antes de hacer nada.

La pantalla las pinta distinto; el registro guarda la pantalla de ARCA anonimizada.

## En seco

Es el modo por defecto, en tres niveles:

1. **Plan** (`POST /arca/operaciones/plan`, botón «Ver plan»): qué se mandaría y si se puede, con la base y el espejo. No abre ARCA.
2. **Seco contra ARCA** (`POST /arca/operaciones/corrida` sin `confirmar`, botón «Probar en seco»): entra, verifica el CUIT de la empleadora en pantalla, lee la relación, completa el formulario, informa exactamente lo escrito y aprieta «Cancelar». Nada queda en ARCA. En la anulación sólo se mira si el ícono está habilitado.
3. **Real** (`confirmar: true`, botón «Enviar a ARCA», habilitado sólo después de probar en seco): confirma. `ARCA_ALTAS_EN_SECO=true` lo vuelve a dejar en seco aunque se pida.

### Desde la línea de comandos

```bash
cd server
# sólo el plan
./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/operarRelacionArca.ts \
  --tenant <slug> --op baja --up <userProjectId> --key <contratoKey> --situacion 99 --fecha-fin 2026-11-30
# en seco contra ARCA (completa y cancela)
... --arca
# de verdad
... --arca --enviar

# modificación y anulación
... --op modificacion --cambio fechaFin=2026-12-15 --cambio retribucion=1500000 --arca
... --op anulacion --que alta --arca
```

En el VPS, `NODE_ENV=production node dist/scripts/operarRelacionArca.js …`.

## Lo relevado y lo que falta

Relevado el 20/11/2026 con `server/src/scripts/reconocerModificacionesArca.ts` (sólo lectura; fixtures 04 a 07 en `server/src/services/arca/fixtures/`):

- la búsqueda por CUIL (`inputCuil_txtCuil`, `btnContinuar`), el listado de tarjetas con los tres íconos y su estado habilitado, el paginador;
- el formulario de baja (`RegistraBaja.aspx`): fecha de fin, motivo con autocompletar sobre `window.l_SBV` (34 situaciones), fecha de telegrama, Cancelar y Confirmar;
- el formulario de modificación (`ModificaAlta.aspx`): los datos precargados, cada código en un autocompletar con su oculto `*_AutocompleteValue`.

Falta ver con una operación real:

- la pantalla que ARCA muestra **después** de cada «Confirmar» (el motor la guarda en el registro y confirma releyendo el listado);
- qué pasa al apretar el ícono de **anular** (estaba deshabilitado en la relación de prueba: la relación ya había empezado). Si abre una pantalla desconocida, el motor no toca nada más y la guarda.

Para relevar de nuevo:

```bash
cd server
./node_modules/.bin/dotenv -e .env.production -v TENANT=<slug> -v EMPRESA_CUIT=<cuit> \
  -v UP=<userProjectId>:<contractIndex> -v ABRIR=modificar,baja -v SALIDA=<carpeta> \
  -- ./node_modules/.bin/tsx src/scripts/reconocerModificacionesArca.ts
```

Nunca aprieta un botón que confirme ni el ícono de anular.

## Tests

```bash
cd frontend && npm run test:arca:modificaciones   # el motor: cinco clicks exactos, guardas, lectores contra fixtures
cd server && npm run test:arca-operaciones        # las reglas y la corrida con un ARCA simulado
```
