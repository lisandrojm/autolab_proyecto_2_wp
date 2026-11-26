# Pedido «Cambio de turno»

Tipo de pedido **de sistema** (26/11/2026): existe en todos los tenants, no se borra y no cambia de tipo de dato (ver [`entidades_sistema_por_defecto.md`](entidades_sistema_por_defecto.md), sección 8). La persona pide pasar de su turno actual a otro turno **de la misma área (y sede)** de un proyecto, desde una fecha y, si el tipo lo permite, hasta otra.

## 1. Dónde vive el turno de una persona

No en `User.metadata.areaShiftAssignments` (eso es la solicitud de contratación) ni en `PATCH /user-projects/:id` (desactivado, 410). El turno vigente de una persona en un proyecto es **`Project.teamConfig` con el contrato que rige superpuesto** (regla del 12/11/2026, `services/equipoSegunContratos.ts`). Todo lo que lee «dónde está hoy» usa esa lectura (`filaSegunContratos` / `superponerContratos`), y lo único que escribe un cambio es **`services/areasDeMiembro.ts`** (`asignarAreasDeMiembro`): fila del equipo por persona, rastro en `historial_equipo` y el área/turno del contrato que rige. Es la misma escritura que la Jerarquía del panel y que «Cambiar de turno» en Equipos de la app.

El supervisor de la persona **no se asigna**: es quien tiene esa área y turno en `coordinatorAssignments`. Al moverla de turno pasa sola al supervisor del turno nuevo.

## 2. Archivos

| Qué | Dónde |
|---|---|
| Constantes, reglas por defecto, tipo del pedido, helpers de fechas (server y front) | `server/src/compartido/cambioDeTurno.ts` |
| Mover de turno dentro de la fila (pura) | `cambiarTurnoEnFila` en `server/src/compartido/areaTurno.ts` |
| Modelo del tipo | `server/src/models/OrderConfig.ts` (`isSystem`, `systemKey`, `categoryType: "cambio_turno"`, `config.reglasCambioTurno`) |
| Init del tipo y su plantilla | `server/src/services/orderConfigInitService.ts` |
| Protecciones de la API del tipo | `server/src/services/tiposDePedidoSistema.ts` + `routes/orderConfig.ts` |
| Validaciones y contexto | `server/src/services/cambioDeTurno.ts` (`validarCambioDeTurno` pura, `contextoDeCambioDeTurno`, `contextoParaPedir`, `fotoDeCambioDeTurno`) |
| Acción al aprobar, aplicar y revertir | `server/src/services/pedidoCambioDeTurno.ts` |
| Cron diario | `server/src/services/cambioTurnoCronService.ts` (registrado en `server.ts`) |
| Endpoints | `routes/orders.ts` (`GET /orders/cambio-turno/contexto`, `POST /orders/validate-cambio-turno`, `POST /orders`), `routes/hr-management.ts` y `routes/hr-admin.ts` (approve, mark-signed) |
| PDF | código `cambioTurno` (`models/Pdf.ts`, `routes/pdfs.ts`), variables en `utils/pdfVariableReplacer.ts` |
| Front admin | `components/orders/OrderTypesTab.tsx`, `OrderCategoryForm.tsx`, `CambioTurnoDetails.tsx`, `pages/OrdersPage.tsx` |
| Front móvil | `apps/mobile/src/components/CambioTurnoInput.tsx`, `DynamicCategoryInput.tsx`, `views/Orders.tsx`, `OrderDetailModal.tsx`, `views/Aprobaciones.tsx` |
| Tests | `npm run test:cambio-turno` (`compartido/areaTurno.test.ts`, `services/tiposDePedidoSistema.test.ts`, `services/cambioDeTurno.test.ts`) |

## 3. Datos del pedido

`Order.dynamicValue` (forma `PedidoCambioTurno`, validada con zod en `pedidoCambioTurnoSchema`):

```
projectId, areaId, sedeId (fila: null = sin sede), shiftActualId, shiftSolicitadoId,
fechaDesde "YYYY-MM-DD", fechaHasta "YYYY-MM-DD" | null (null = permanente), motivo
```

`Order.metadata.cambioTurno` (lo guarda el server al pedir; nombres para el detalle y el PDF, y qué pasó después):

```
proyectoNombre, areaNombre, sedeNombre, turnoActualNombre, turnoSolicitadoNombre,
aplicado: { el, por } | null, revertido: { el, nota } | null, fallo: { el, errores } | null
```

## 4. Reglas (`validarCambioDeTurno`, todas obligatorias en el server)

Devuelve **todos** los errores, con código estable y mensaje para la persona:

| Código | Regla |
|---|---|
| `fila_inexistente` | el área (o su sede) no está en `areasConfig` del proyecto |
| `sin_turno_actual` / `turno_actual_distinto` | la persona tiene turno en esa fila hoy, y es el que dice el pedido |
| `turno_destino_inexistente` / `turno_fuera_del_area` / `mismo_turno` | el destino existe, es de esa fila y es distinto del actual |
| `fecha_desde_invalida` / `anticipacion_insuficiente` | `fechaDesde` ≥ hoy (Argentina, `hoyArgentina`) + `diasAnticipacion` |
| `fecha_hasta_invalida` / `temporal_no_permitido` | `fechaHasta` ≥ `fechaDesde`; sólo si `permitirTemporal` |
| `motivo_requerido` | motivo no vacío |
| `pedido_superpuesto` | otro pedido de cambio de turno de la persona en `pending`, `pre_approved` o `approved` que se pise en fechas (uno permanente pisa todo lo posterior) |
| `vacaciones_superpuestas` / `licencia_superpuesta` | `Vacation` en `approved`/`delivered`, o pedido «fecha» con rango en `approved`/`delivered` |
| `cupo_excedido` | con `cupoMaximoPorTurno`, cuántas filas del equipo ya tienen el turno de destino |

Reglas configurables en el tipo (`config.reglasCambioTurno`): `diasAnticipacion` (3), `permitirTemporal` (true), `cupoMaximoPorTurno` (null = sin tope). Se editan en Pedidos → Tipos de Pedidos → el tipo de sistema.

`compromisosDePersona` / `superposiciones` (contratos y solicitudes) **no** se usan: no miran vacaciones ni licencias.

## 5. Flujo

1. **Móvil, antes de pedir.** `GET /orders/cambio-turno/contexto` devuelve los proyectos donde la persona tiene turno hoy, cada fila de área con su turno actual y los turnos a los que puede pasar, las reglas y la primera fecha válida. El teléfono no calcula nada.
2. **Mientras completa.** `POST /orders/validate-cambio-turno` devuelve la misma lista de errores que daría el envío (nunca 422); `CambioTurnoInput` la muestra debajo del formulario.
3. **Pedir.** `POST /orders` con `categoryId` del tipo: zod sobre `dynamicValue` (400 si está mal formado), reglas (**422** con `{ error, errores: [{codigo, mensaje}] }`), y se guarda el pedido normalizado más `metadata.cambioTurno`. Estado `pending`; si el tipo firma, `signatureStatus: "pending"`.
4. **Preaprobar.** Como cualquier pedido: genera el PDF con la plantilla del tipo (`cambioTurno`).
5. **Aprobar** (`PUT /hr-management/orders/:id/approve` desde el panel, `PUT /hr-admin/orders/:id/approve` desde la app). Se **revalida** (`revalidarAlAprobar`, sin la anticipación: una aprobación tardía no la cumple). Si falla, **422** y el pedido **no** queda aprobado. Si pasa, se marca aprobado y, si corresponde (ver 6), se aplica **antes de guardar el pedido**.
6. **Cuándo se aplica.** No el día de la aprobación sino **cuando llega `fechaDesde`**: con 3 días de anticipación obligatorios, aplicar al aprobar movería a la persona antes de la fecha que pidió.
   - Sin firma y con `fechaDesde` ≤ hoy: en la aprobación misma.
   - Con `fechaDesde` futura: el cron diario, ese día.
   - Con firma: recién cuando la firma está confirmada (`PUT /hr-management/orders/:id/mark-signed`); `notify-signature-completed` sólo avisa a los admins, no cambia nada.
7. **Aplicar** (`aplicarSiCorresponde`): revalida (sin anticipación), mueve con `cambiarTurnoEnFila` + `asignarAreasDeMiembro` (origen `pedido-cambio-turno`, payload con el número de pedido), anota `metadata.cambioTurno.aplicado` y avisa a la persona por notificación. **Idempotente por estado**: si ya está en el destino, se da por aplicado; si no está ni en el origen ni en el destino, se anota `fallo` (y se avisa una sola vez), y el cron vuelve a intentar cada día.
8. **Revertir** (`revertirSiCorresponde`): con `fechaHasta` vencida y el cambio aplicado, el cron devuelve a la persona a su turno original y anota `revertido`. Si ya no estaba en el turno pedido (alguien la movió), se anota sin tocar el equipo y no se insiste.
9. **Cron** (`cambioTurnoCronService.ts`): cada 30 minutos, corre una vez por día (hora Argentina) `barridoDiarioDeCambiosDeTurno`. Apagado con `SIN_TAREAS_PROGRAMADAS=true`.

«Transaccional» en este orden: primero el equipo, después el pedido. Si lo primero falla, el pedido no cambia de estado; si falla lo segundo, el próximo intento encuentra a la persona ya movida y sólo completa el pedido.

## 6. PDF

Plantilla `cambioTurno` («Solicitud de cambio de turno»), creada por el init y asignada al tipo. Variables, además de las comunes: `{{proyecto}}`, `{{area}}`, `{{turnoActual}}`, `{{turnoSolicitado}}`, `{{fechaDesde}}`, `{{fechaHasta}}`, `{{vigencia}}` («desde el … hasta el …» o «desde el …, de forma permanente») y `{{motivo}}`.

## 7. Qué ve cada uno

- **Panel → Pedidos**: el detalle muestra proyecto, área, turno actual → solicitado, desde/hasta, motivo y qué pasó con el cambio (pendiente de aplicar el X / aplicado / revertido / no se pudo aplicar). Aprobar con 422 muestra los motivos.
- **App → Pedidos**: lo mismo en el detalle; el formulario sólo aparece si el tipo está activo (como los demás).
- **App → Equipos** (coordinador del proyecto): la persona aparece en el turno nuevo cuando el cambio se aplica, y en `historial_equipo` queda el origen `pedido-cambio-turno`.

## 8. Deploy

Server (`git pull`, `forever restart f-7-`): al arrancar crea el tipo y la plantilla en cada tenant. Frontend: build. Lo que **no** se probó contra la base real: el circuito completo (pedir, aprobar, cron) con datos reales; sólo tests puros y type-check.
