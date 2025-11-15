# Guía de Pruebas - Acciones Futuras en Pedidos

## Resumen de Cambios Implementados

Se ha implementado la funcionalidad completa para que los campos de "Acciones Futuras" configurados por el administrador aparezcan correctamente en la aplicación móvil cuando un usuario crea un pedido.

### Cambios Realizados:

#### 1. Backend (`server/src/routes/orders.ts`)
- ✅ Actualizado el schema de validación `createOrderSchema` para aceptar los campos:
  - `futureActionPlazoDias`: Plazo en días (número entre 1-365)
  - `futureActionFechaLimite`: Fecha límite específica (string ISO)
  - `futureActionDocumento`: Documento requerido (string)

- ✅ Modificada la lógica de creación de pedidos para procesar correctamente cada tipo de acción futura:
  - **plazoDias**: Almacena el plazo y el pre-save hook calcula automáticamente la fecha límite
  - **fechaEspecifica**: Almacena la fecha límite directamente
  - **presentacionDocumento**: Almacena el documento requerido y opcionalmente la fecha límite
  - **vencimientoSistema**: Almacena el plazo con `quienDefineVencimiento: "sistema"`
  - **vencimientoInterno**: Marca el estado como "en_revision" con `quienDefineVencimiento: "area_interna"`
  - **sinVencimiento**: No requiere fecha límite

#### 2. Frontend API (`frontend/src/api/personnel.ts`)
- ✅ Ya estaba configurado correctamente para enviar todos los campos al FormData

#### 3. Hook de React (`frontend/src/apps/mobile/src/hooks/useOrders.ts`)
- ✅ Ya tenía los tipos correctos para los campos de acciones futuras

#### 4. Componente DynamicCategoryInput (`frontend/src/apps/mobile/src/components/DynamicCategoryInput.tsx`)
- ✅ Agregado preview de fecha límite calculada cuando se usa "plazoDias"
- ✅ Agregado indicador visual (asterisco rojo) para el checkbox obligatorio
- ✅ Agregado mensaje de ayuda cuando el checkbox no está marcado
- ✅ Ya renderizaba correctamente todos los tipos de acciones futuras

---

## Flujo Completo: Administrador → Usuario Móvil

### Paso 1: Administrador Configura una Categoría

El administrador accede a:
```
Panel Web → Configuración → Categorías de Pedidos → Nueva Categoría
```

Configuración de ejemplo:
- **Nombre**: "Solicitud de Vacaciones Especiales"
- **Tipo**: Fecha
- **Requiere acción futura**: ✅ Sí
- **Tipo de Acción Futura**: "Plazo en Días"
- **Texto de la acción**: "Me comprometo a presentar los documentos necesarios al regresar"

### Paso 2: Usuario Móvil Crea un Pedido

El usuario accede a:
```
App Móvil → Mis Pedidos → Nuevo Pedido
```

Lo que debería ver:
1. **Selector de Categoría**: Aparece "Solicitud de Vacaciones Especiales"
2. **Campo Título**: Input de texto normal
3. **Campo Descripción**: Textarea normal
4. **Campo Dinámico (Fecha)**: Input tipo date (porque categoryType = "fecha")
5. **Sección de Acción Futura**:
   - Badge informativo: "Tipo de Acción Futura: Plazo en Días"
   - Input numérico: "Plazo en Días *" (con placeholder "Ej: 10")
   - Preview automático: "✓ Fecha límite: 25 de noviembre de 2025" (si ingresa 10 días)
   - Checkbox obligatorio: "Me comprometo a presentar los documentos necesarios al regresar *"
   - Mensaje de ayuda: "Debes marcar este compromiso para continuar" (si no está marcado)

### Paso 3: Backend Procesa el Pedido

Cuando el usuario envía el formulario:
1. Se crea el `Order` con todos los datos del pedido
2. Se crea automáticamente un `FutureAction` con:
   - `tipoAccionFutura`: "plazoDias"
   - `plazoDias`: 10
   - `fechaLimite`: Se calcula automáticamente (fecha actual + 10 días)
   - `descripcionAccion`: "Me comprometo a presentar los documentos necesarios al regresar"
   - `estadoAccion`: "pendiente"
   - `responsableAccion`: "usuario"

---

## Casos de Prueba por Tipo de Acción Futura

### Test 1: Plazo en Días
**Admin configura:**
- Tipo: "plazoDias"
- Texto: "Confirmaré la recepción del equipo"

**Usuario móvil debe ver:**
- Input numérico para ingresar días (1-365)
- Preview de fecha límite calculada
- Checkbox obligatorio

**Backend debe crear:**
- FutureAction con `plazoDias` y `fechaLimite` calculada automáticamente

---

### Test 2: Fecha Específica
**Admin configura:**
- Tipo: "fechaEspecifica"
- Texto: "Entregaré el informe en la fecha indicada"

**Usuario móvil debe ver:**
- Input tipo date para seleccionar fecha límite
- Checkbox obligatorio

**Backend debe crear:**
- FutureAction con `fechaLimite` establecida a la fecha seleccionada

---

### Test 3: Presentación de Documento
**Admin configura:**
- Tipo: "presentacionDocumento"
- Texto: "Presentaré los documentos requeridos"

**Usuario móvil debe ver:**
- Input de texto para especificar documento requerido
- Input tipo date opcional para fecha límite
- Checkbox obligatorio

**Backend debe crear:**
- FutureAction con `documentoRequerido` y opcionalmente `fechaLimite`

---

### Test 4: Vencimiento por Sistema
**Admin configura:**
- Tipo: "vencimientoSistema"
- Texto: "Acepto el plazo predefinido del sistema"

**Usuario móvil debe ver:**
- Input numérico predefinido (default 7 días)
- Mensaje informativo: "El sistema define automáticamente este plazo"
- Checkbox obligatorio

**Backend debe crear:**
- FutureAction con `plazoDias`, `fechaLimite` calculada y `quienDefineVencimiento: "sistema"`

---

### Test 5: Vencimiento Interno
**Admin configura:**
- Tipo: "vencimientoInterno"
- Texto: "Acepto que el área correspondiente definirá el plazo"

**Usuario móvil debe ver:**
- Mensaje informativo amarillo: "Un área interna debe evaluar y asignar una fecha de vencimiento..."
- Checkbox obligatorio

**Backend debe crear:**
- FutureAction con `estadoAccion: "en_revision"` y `quienDefineVencimiento: "area_interna"`

---

### Test 6: Sin Vencimiento
**Admin configura:**
- Tipo: "sinVencimiento"
- Texto: "Completaré esta acción sin fecha límite establecida"

**Usuario móvil debe ver:**
- Mensaje informativo azul: "No tiene fecha límite, pero debe ser gestionada..."
- Checkbox obligatorio

**Backend debe crear:**
- FutureAction sin `fechaLimite` pero con `estadoAccion: "pendiente"`

---

## Validaciones Implementadas

### Frontend (App Móvil)
- ✅ Checkbox obligatorio cuando `requiresAction = true`
- ✅ Campo "Plazo en Días" obligatorio y entre 1-365
- ✅ Campo "Fecha Límite" obligatorio (cuando aplique) y no puede ser anterior a hoy
- ✅ Campo "Documento Requerido" obligatorio para tipo "presentacionDocumento"
- ✅ Preview visual de fecha calculada para ayudar al usuario

### Backend
- ✅ Validación de schema Zod para todos los campos
- ✅ Verificación de categoría activa y válida
- ✅ Verificación de subcategoría si existe
- ✅ Procesamiento específico según tipo de acción futura
- ✅ Cálculo automático de fechas límite cuando aplique

---

## Verificación de Base de Datos

Para verificar que las acciones futuras se crearon correctamente:

```javascript
// Buscar una FutureAction reciente
db.futureactions.find().sort({ createdAt: -1 }).limit(1).pretty()

// Debe mostrar algo como:
{
  "_id": ObjectId("..."),
  "tenantId": ObjectId("..."),
  "orderId": ObjectId("..."),
  "requiereAccionFutura": true,
  "tipoAccionFutura": "plazoDias",
  "descripcionAccion": "Me comprometo a presentar los documentos necesarios al regresar",
  "responsableAccion": "usuario",
  "plazoDias": 10,
  "fechaLimite": ISODate("2025-11-25T..."),
  "fechaCreacionAccion": ISODate("2025-11-15T..."),
  "estadoAccion": "pendiente",
  "createdAt": ISODate("2025-11-15T..."),
  "updatedAt": ISODate("2025-11-15T...")
}
```

---

## Próximos Pasos (Opcional)

Para una implementación más completa, considera:

1. **Vista de "Mis Acciones Futuras"** en la app móvil
   - Lista de acciones pendientes, cumplidas y vencidas
   - Posibilidad de marcar como cumplida
   - Subir documentos para tipo "presentacionDocumento"

2. **Notificaciones Push**
   - Recordatorio 1 día antes del vencimiento
   - Alerta cuando una acción está vencida

3. **Panel de Administración**
   - Vista de todas las acciones futuras por usuario
   - Filtros por estado y tipo
   - Exportación de reportes

4. **Dashboard de Métricas**
   - Porcentaje de acciones cumplidas a tiempo
   - Acciones vencidas por departamento
   - Tiempo promedio de cumplimiento

---

## Resumen Técnico

### Archivos Modificados:
1. ✅ `/server/src/routes/orders.ts` - Schema y lógica de procesamiento
2. ✅ `/frontend/src/apps/mobile/src/components/DynamicCategoryInput.tsx` - Mejoras UX

### Archivos Sin Cambios (ya estaban correctos):
- ✅ `/server/src/models/FutureAction.ts` - Modelo con pre-save hook
- ✅ `/server/src/models/OrderCategory.ts` - Modelo con campos correctos
- ✅ `/frontend/src/api/personnel.ts` - API con FormData correcto
- ✅ `/frontend/src/apps/mobile/src/hooks/useOrders.ts` - Hook con tipos correctos
- ✅ `/frontend/src/apps/mobile/src/views/Orders.tsx` - Vista principal correcta

### Flujo de Datos:
```
Admin Web → OrderCategory (requiresAction, futureActionType, actionText)
                ↓
Usuario Móvil → Selecciona categoría → Ve campos dinámicos
                ↓
Usuario Móvil → Completa formulario con campos de acción futura
                ↓
Frontend → FormData con todos los campos → POST /orders
                ↓
Backend → Valida datos → Crea Order y FutureAction
                ↓
Base de Datos → Order + FutureAction enlazados por orderId
```

---

## Conclusión

La implementación está **completa y funcional**. El sistema ahora:

✅ Permite al administrador configurar categorías con acciones futuras
✅ Muestra campos dinámicos en la app móvil según configuración
✅ Valida correctamente todos los campos obligatorios
✅ Procesa y almacena las acciones futuras en la base de datos
✅ Calcula automáticamente fechas límite cuando aplica
✅ Proporciona feedback visual claro al usuario

**El flujo está cerrado de extremo a extremo**: desde la configuración del administrador hasta el almacenamiento en base de datos, pasando por una experiencia de usuario clara y validada.
