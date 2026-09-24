# Plantillas de equipo (contratación masiva) — Fase 0: relevamiento y plan

**Estado: propuesta. No está programado nada. Espera tu OK.**
Fecha: 23/09/2026

---

## 1. Lo que hay hoy

### 1.1 La pantalla y el modal

| Qué | Dónde |
|---|---|
| Pantalla "Solicitud de Contratación" | `frontend/src/apps/mobile/src/views/UserHistory.tsx` (604 líneas) |
| Tabs Historial / Por vencer | `useState<"historial" \| "por_vencer">` (`:78`), render en `:341-353` |
| Navegación del móvil | **No hay react-router**: es un `useState<ViewType>` en `App.tsx:27` y un `case` en `:124` |
| El modal del "+" | `components/UserRegistrationModal.tsx` — **3.419 líneas** |
| "Renovar" | `UserHistory.tsx:132-136`; la plantilla la arma **el server** en `services/contratosPorVencer.ts:238-262` |

**El dato que condiciona todo el diseño de UI: los 11 sub-pickers están *inline* dentro del modal.** No son componentes. Persona, Rol/es, Tipo de contrato, Convenio, Categoría, Área y turno, Motivo, ¿A quién reemplaza?, Proyecto: todos son bloques de JSX dentro del mismo archivo, apoyados en un único `formData` (`:252-294`) y ~20 `useEffect` de cascada. Hoy no se puede reutilizar ninguno sin extraerlo primero.

De los pickers, dos ya resuelven lo que necesitamos: el de **Rol/es** ya es multi-selección real (checkbox, no cierra al elegir) y sirve de molde; y `CustomMultiDatePicker` ya es multi-fecha con bloqueo de días pasados. El de **Persona es simple y sin paginado**: `page: 1` está fijo (`:698`) y muestra 50 de ~1574.

### 1.2 Dónde vive el cálculo

Casi todo **ya está extraído** en un módulo puro del frontend: `frontend/src/utils/jornadas.ts` (238 líneas, 9 funciones exportadas, **sin un solo test**).

| Qué | Función |
|---|---|
| Jornadas del calendario (día por día, no semanas × días) | `jornadasDelCalendario` `:81` |
| Período de cálculo (indeterminado ⇒ mes completo del alta) | `periodoDeCalculo` `:51` |
| Prorrateo mensual por días hábiles **marcados** | `mesesEquivalentes` `:165` (`meses += jornadas / habiles`) |
| Los cuatro importes cruzados | `derivarImportes` `:213` |
| Validación del ajuste manual | `erroresDeJornadas` `:121`, `hayAjuste` `:117` |
| Escala × multiplicador | `importePorJornadaDeCategoria` (`utils/seleccionConvenioCategoria.ts:289`) |

El **multiplicador** vive en el tipo de contrato: `Contrato.data.multiplicadorDiario` (`server/src/models/Contrato.ts:85`). Hoy sólo "Jornada" lo tiene ≠ 1 (**1.5**); el resto está en 0, que la función lee como 1.

El **recálculo cruzado** es un ancla: al editar Mensual o Total, ese valor queda fijo y los otros se derivan; al editar Jornada o Semana, se emite la jornada y el efecto la convierte en ancla mensual. Vive en `components/contratacion/ImportesDelContrato.tsx:61-118`, **enredado con React** (`useState` + `useRef` + dos `useEffect`).

Tres cosas más que encontré y que importan para este trabajo:

1. **El server NUNCA recalcula.** `POST /users` guarda `dailyRate` y `workdaysCount` tal como llegan, y la aprobación los copia al contrato. No hay una sola validación de importes ni de jornadas del lado del servidor.
2. **El escritorio no aplica el multiplicador.** `importePorJornadaDeCategoria` no aparece en `ProjectTeamPage.tsx`: un contrato "Jornada" muestra ahí una diferencia del ~50 % contra la escala.
3. **Hay tres reimplementaciones parciales** de las mismas cuentas (`SolicitudDetalleModal.tsx:245-249`, `ProjectTeamPage.tsx:620`, `server/src/routes/projects.ts:3023-3027`, esta última con un comentario que admite la duplicación).

### 1.3 El backend, y la sorpresa

**Una solicitud de contratación no es una colección propia: es un `User` con `metadata.isSolicitud: true`.** Está dicho en el código (`server/src/routes/users.ts:1366-1370`). El contenido real viaja dentro de `metadata` (~30 campos), la persona real va en `metadata.solicitudUserId`, y al aprobarse el mismo documento **se convierte en el usuario**.

- **Endpoint**: `POST /api/v1/users` (`routes/users.ts:1574`). Permiso: con `isSolicitud` alcanza `MOBILE_USERS`.
- **Validación**: `metadata: z.any()` — el server **no valida nada** de la solicitud. Lo único que exige es área y turno (`:1587-1594`) y que el CUIT no esté duplicado.
- **Estados**: `pendiente | aprobada | rechazada | cancelada`, en `metadata.solicitudStatus`.
- **Efectos al crear** (todos síncronos, sin transacción): `save`, consulta al padrón de ARCA *sólo si* `validarConArca: true`, upsert de `RenovacionContrato` si es renovación, notificación in-app a los responsables, `Tenant.userIds` + `usage.users.current++`.
- **NO** se crea contrato al pedir: eso ocurre al aprobar (`POST /projects/:id/assign-member`).
- **Superposición de fechas: no se valida en ningún lado.** Lo único que existe es un choque de *turno* al aprobar, sólo contra OTROS proyectos, que devuelve 409.

### 1.4 Infraestructura

- **SweetAlert2 11.23**, con estilos globales propios en `index.css:118-160` (dark por defecto). El wrapper `utils/sweetAlert.ts` tiene `confirm`, `loading`, `close`, `warning`… pero **no un modal con `html` propio**: hay que agregarle uno.
- **Estado**: zustand (7 stores). `@tanstack/react-query` está instalado pero lo usa **un solo archivo**: no es el patrón de la casa.
- **ORM**: Mongoose. **No hay framework de migraciones**: son ~95 scripts con el triplete `:dry` / aplicar / `:revertir` y respaldo JSON.
- **Transacciones**: existen en **un solo lugar** (`routes/centrosCosto.ts:293-311`), con degradación explícita si el Mongo no es replica set. Atlas sí las soporta.
- **Idempotencia**: no existe como tal. Lo más parecido es el índice único + upsert de `RenovacionContrato`.
- **Tests: no hay infraestructura de componentes ni de integración.** Los 10 del frontend y todos los del server son `node:test` sobre **funciones puras**, sin jsdom ni Mongo. **Esto cambia la Fase 3** (ver §6).

---

## 2. Las cinco decisiones que te pido

### D1 · Los integrantes: ¿colección aparte o embebidos?

Pediste `team_templates` + `team_template_members`. **Propongo embeberlos** en el documento de la plantilla, con `_id` propio por integrante.

**Por qué**: una plantilla se lee y se escribe entera, los integrantes no tienen vida propia fuera de ella, el orden es inherente al array y así una edición es una sola escritura atómica (sin transacción para mantener las dos colecciones alineadas). Con ~10-50 personas por equipo, el documento queda chico.

**En contra**: si algún día querés historial por integrante o buscar "en qué plantillas está Fulano" sin recorrer todas, una colección aparte es mejor. Se puede migrar después.

### D2 · Dónde vive la lógica compartida de cálculo

Es el punto más delicado. Hoy el cálculo está **sólo en el frontend** y el server no recalcula nada. Para que `preview` y `bulk` usen *exactamente* la misma lógica hay que poder importarla de los dos lados.

- **Opción A (recomendada)**: el módulo canónico pasa a `server/src/utils/jornadas.ts` (ya hay precedente de util puro y testeado ahí: `escalaCategoria.ts`), y el **frontend lo importa con un alias de Vite**. Una sola copia, sin tocar el layout del `dist` del server.
- **Opción B**: carpeta `shared/` en la raíz, incluida por los dos `tsconfig`. Más "correcto" conceptualmente, pero **toca el `rootDir` del server**, y eso cambia la estructura de `server/dist` — que es lo que se commitea y se despliega. Riesgo real de romper el deploy.
- **Opción C**: dejar el cálculo en el front y que `preview` sea sólo una validación del server. Contradice tu pedido ("misma lógica, sin duplicarla").

Voy con **A** salvo que me digas otra cosa.

### D3 · Qué garantiza que una solicitud masiva sea idéntica a una individual

Pediste payload, estados, circuito y notificaciones idénticos. La única forma de **garantizarlo** (y no de prometerlo) es que los dos caminos llamen al mismo constructor:

> Extraer de `UserRegistrationModal.tsx:1730-1803` una función pura `armarPayloadDeSolicitud(datos) → submitData`, usarla en el formulario individual **y** en el bulk, y escribir un test que le pase los mismos datos a los dos caminos y compare el resultado campo por campo.

Sin eso, "idéntico" es una intención que se rompe el día que alguien agregue un campo al modal.

### D4 · El nombre de la tab

**"Equipos" ya existe en el móvil**: `MOBILE_TEAMS` ("Mis equipos") es la pantalla de áreas y turnos a cargo, en la barra de abajo. Dos cosas distintas con el mismo nombre en la misma app se van a confundir.

Propongo **"Plantillas"** y un permiso nuevo `mobile_hiring_templates:view` con `dentroDe: MOBILE_USERS` — el mecanismo que el repo ya usa para meter una pestaña dentro de la pantalla de otro permiso (así se agregó "Cumplimiento" dentro de Novedades). Hay que espejarlo en `server/src/utils/permisosMobile.ts`.

### D5 · Cuántos pickers extraer

Extraer los 11 de un archivo de 3.419 líneas es el trabajo más riesgoso de todo esto (y el archivo no está formateado con Prettier, así que cualquier reformateo mete ruido en el diff).

Propongo extraer **sólo dos**: **Persona** (que además necesita modo múltiple y paginado) y **Categoría** (que se elige por integrante). El resto de los valores de la plantilla —proyecto, empresa, tipo de contrato, área y turno— se eligen **una vez por plantilla**, y para eso alcanzan selects propios más simples en la pantalla nueva, sin tocar el modal individual.

---

## 3. Modelo de datos propuesto

### `PlantillaEquipo` (colección `plantillas-equipo`)

| Campo | Tipo | Nota |
|---|---|---|
| `tenantId`, `nombre` | ObjectId, string | único por `(tenantId, projectId, nombre)` |
| `projectId` | ref Project | la plantilla pertenece a un Cliente\|Proyecto |
| `empresaContratoId` | ref Company | define el convenio |
| `convenioId` | ref Convenio | derivado de la empresa, guardado para detectar cambios |
| `contratoId` | ref Contrato | tipo de contrato |
| `areaShiftAssignments` | `[{areaId, shiftIds[]}]` | **misma forma que la solicitud**, para no traducir nada |
| `inTime` / `outTime` | string | horario por defecto |
| `diasSemana` / `diasPorSemana` / `diasRotativos` | number[] / number / bool | |
| `comentarios` | string | por defecto de cada solicitud |
| `integrantes[]` | subdocumento | ver abajo |
| `activo`, `creadoPor`, timestamps | | |
| `ultimaContratacionEl` / `ultimoLoteId` | Date / ref | para la tarjeta de la lista |

**`integrantes[]`**: `_id`, `userId` (ref User), `rolesFrame[]` (ref RoleFrame), `orden`, y los overrides opcionales (`null` = usa el valor de la plantilla): `categoriaSatId`, `inTime`, `outTime`, `dailyRateManual`, `comentarios`. Más `reemplazadoDePersonaId` y `reemplazadoEl` (informativo).

Reglas: **no guarda fechas ni importes calculados**; una persona no puede estar dos veces (validación en el server, no índice: es un array).

### `LoteContratacion` (colección `lotes-contratacion`)

`tenantId`, `plantillaEquipoId`, `projectId`, `nombrePlantilla` (copia congelada), `idempotencyKey`, `creadoPor`, `solicitudIds[]`, `totales {personas, jornadas, importe}`, `estado`, timestamps.

**Índice único `(tenantId, idempotencyKey)`** — es el mecanismo de idempotencia, calcado del patrón que ya funciona en `RenovacionContrato`. El doble tap choca contra el índice y devuelve el lote ya creado en vez de duplicarlo.

Y en cada solicitud: `metadata.loteId` + `metadata.plantillaEquipoId`, que es lo que permite agrupar en Historial.

---

## 4. Backend

**Router nuevo** `server/src/routes/plantillasEquipo.ts`, montado en `/api/v1/plantillas-equipo`. Permiso: el mismo `MOBILE_USERS` que ya autoriza a pedir un alta.

- `GET /` (por proyecto) · `POST /` · `GET /:id` · `PUT /:id` · `DELETE /:id` · `POST /:id/duplicar`
- `POST /:id/integrantes` · `PUT /:id/integrantes/:integranteId` · `DELETE /:id/integrantes/:integranteId` · `POST /:id/integrantes/:integranteId/reemplazar`
- **`POST /:id/preview`** — recibe fechas/días, overrides puntuales y exclusiones; devuelve por integrante las jornadas, los cuatro importes, y `errores[]` / `advertencias[]`. **No escribe nada.**
- **`POST /:id/contratar`** — recibe las filas ya confirmadas + `idempotencyKey`; revalida **todo** del lado del server y crea las N solicitudes.

**Servicios y utils nuevos** (todos puros y testeables, separados de Express y de Mongoose):

| Archivo | Qué |
|---|---|
| `server/src/utils/jornadas.ts` | el módulo compartido (D2), con **tests propios que hoy no existen** |
| `server/src/utils/payloadDeSolicitud.ts` | `armarPayloadDeSolicitud()` (D3) |
| `server/src/utils/planDeLote.ts` | **el corazón**: recibe plantilla + integrantes + fechas + overrides + contexto (categorías, contratos vigentes) y devuelve las filas con sus importes, errores y advertencias. Sin Mongo |
| `server/src/services/plantillasEquipo.ts` | lo que toca la base: resolver el contexto, ejecutar el plan, escribir |

**Validaciones por integrante** (las mismas en preview y en contratar, porque las hace la misma función):
obligatorios del formulario individual · categoría válida para el convenio **y** el rol (reusa `categoriasOfrecidas`) · reemplazo con motivo y persona del equipo · persona inactiva o borrada = **error** · **contrato vigente superpuesto = advertencia, no bloqueo** (es lo que hace hoy el alta individual: no valida nada; bloquear sería endurecer el flujo actual sin pedirlo).

**Transacción**: `withTransaction` para los N inserts + el lote, con la misma degradación explícita de `centrosCosto.ts:293`. Los efectos posteriores (notificación, contadores del tenant) van **después del commit**: si fallan, no deben tirar abajo altas ya creadas. Si la sesión no se puede abrir, el endpoint **rechaza** en vez de crear a medias.

**Dos bombas del alta individual que hay que desactivar para el masivo:**

1. El email placeholder es `solicitud_${Date.now()}@pending.com` y la unicidad se chequea **a mano** (`users.ts:1605`), no con un índice. En un lote, dos altas en el mismo milisegundo colisionan. → sufijo por posición + fragmento aleatorio.
2. El `isActive: false` que manda el cliente **lo descarta Zod**, y `metadata.activo` tiene `default: true`: cada solicitud pendiente cuenta como usuario activo del tenant y suma en `usage.users.current`. En lotes de 20 esto se nota. → hay que decidir si se corrige (afecta también al alta individual) o se replica tal cual.

---

## 5. Frontend

**Pantalla**: tab "Plantillas" dentro de "Solicitud de Contratación" (`UserHistory.tsx`), igual que las otras dos.

**Componentes nuevos** (en `frontend/src/apps/mobile/src/components/plantillas/`):

| Componente | Qué |
|---|---|
| `PlantillasTab.tsx` | lista de plantillas del proyecto + acciones |
| `PlantillaEditor.tsx` | valores comunes + integrantes (modal full-height) |
| `IntegranteCard.tsx` | nombre, roles, categoría, horario, badge **"personalizado"** y "volver al valor del equipo" |
| `ContratarEquipoModal.tsx` | fechas → filas con exclusión/overrides/reemplazo → preview → confirmar |
| `ResumenDeLote.tsx` | arma el `html` del Swal de confirmación |

**Extraídos del modal individual** (a `components/contratacion/pickers/`): `PersonaPickerModal` (con `multiple` y **paginado**, que hoy no tiene) y `CategoriaPickerModal`.

**En `sweetAlert.ts`**: una función nueva `resumenLote({ titulo, html, confirmar })` — hoy no hay forma de mostrar un Swal con HTML propio sin llamar a `Swal.fire` suelto y perder el estilo compartido.

**En el modal individual**: un botón "Guardar como template" al lado de "Enviar Solicitud". Es el único cambio que recibe ese archivo además de la extracción de los dos pickers.

---

## 6. Fase 3: por qué hay que replantearla

Pediste tests del endpoint bulk (transacción e idempotencia) y un test de que bulk == individual. **En este repo no hay infraestructura para tests de integración**: ni Mongo de prueba, ni supertest, ni jsdom. Todos los tests existentes son funciones puras con `node:test`.

Dos caminos:

- **6.a (recomendado)**: diseñar para que lo importante sea puro y testearlo de verdad, sin infra nueva.
  - `jornadas.test.ts` — **primero**, antes de mover nada: hoy 9 funciones de plata sin un solo test.
  - `planDeLote.test.ts` — multiplicador, Jornada con días sueltos, prorrateo, override de plantilla, override puntual, cambio de escala, superposición, reemplazo inválido.
  - `payloadDeSolicitud.test.ts` — **el test de "bulk == individual"**, comparando los dos payloads campo por campo.
  - La transacción y la idempotencia se verifican **a mano contra la base de desarrollo**, documentado paso a paso.
- **6.b**: montar `mongodb-memory-server` + supertest. Da tests reales del endpoint, pero es infraestructura nueva para todo el repo y se lleva buena parte del tiempo de la feature.

Voy con **6.a** salvo que me digas que querés la infra.

---

## 7. Archivos a tocar

**Nuevos — server**: `models/PlantillaEquipo.ts`, `models/LoteContratacion.ts`, `routes/plantillasEquipo.ts`, `services/plantillasEquipo.ts`, `utils/planDeLote.ts` (+test), `utils/payloadDeSolicitud.ts` (+test), `utils/jornadas.ts` (+test).

**Nuevos — frontend**: `api/plantillasEquipo.ts`, `components/plantillas/` (5 componentes), `components/contratacion/pickers/` (2 pickers extraídos).

**Modificados — server**: `server.ts` (montar el router), `utils/permisosMobile.ts` (permiso nuevo), `routes/users.ts` (email único por lote; y la decisión sobre `metadata.activo`).

**Modificados — frontend**: `views/UserHistory.tsx` (tab + agrupación por lote en Historial), `components/UserRegistrationModal.tsx` (usar los pickers extraídos + "Guardar como template"), `utils/permisosMobile.ts`, `utils/sweetAlert.ts`, `vite.config.ts` (alias del módulo compartido), `utils/jornadas.ts` → re-export del canónico.

---

## 8. Orden de trabajo propuesto

1. **Fase 1a — red de seguridad**: `jornadas.test.ts` sobre el código actual, sin mover nada. Si algo se rompe después, se nota acá.
2. **Fase 1b — módulo compartido**: mover el cálculo (D2) + `armarPayloadDeSolicitud` (D3) + su test de equivalencia. El formulario individual sigue funcionando igual, y eso queda probado.
3. **Fase 1c — modelo y endpoints**: modelos, CRUD, `preview`, `contratar` con transacción e idempotencia.
4. **Fase 2 — móvil**: pickers extraídos, tab, editor, contratar, Swal, agrupación en Historial.
5. **Fase 3 — verificación**: los tests puros + la prueba manual del guión que escribiste.

Commits chicos por fase, como pediste.

---

## 9. Lo que queda con dudas

1. **`metadata.activo: true` en solicitudes pendientes** (§4): ¿lo corrijo para todos o lo replico tal cual en el masivo?
2. **La superposición**: hoy no se valida en ningún lado. ¿Advertencia sólo en el masivo, o la agrego también al alta individual?
3. **El multiplicador en el escritorio**: `ProjectTeamPage` no lo aplica y muestra ~50 % de diferencia en contratos "Jornada". ¿Entra en este trabajo o va aparte?
4. **`validarConArca`**: si alguna vez se prende para el alta masiva, son N llamadas SOAP sincrónicas dentro del request. Propongo dejarlo explícitamente apagado en el bulk.
5. **Límite de integrantes por lote**: propongo 50, con error claro por encima. Decime si es poco.
