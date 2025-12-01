# Módulo Vacaciones Dev - Template Reutilizable

Módulo completo de desarrollo para gestión de vacaciones con datos simulados (sin backend).

## 📁 Estructura

```
frontend/src/
├── mocks/vacationsDev/
│   └── vacationsDev.mock.json    # Mock JSON con datos
└── pages/VacationsDev/
    ├── VacationsDevPage.tsx      # Componente principal
    └── README.md                 # Esta documentación
```

## 🎯 Características Implementadas

### **4 Tabs Principales**

1. **Configuración** - Gestión del módulo
   - Toggle enabled/disabled con animación
   - Selector de visibilidad (3 opciones)
   - Checkbox "Requiere aprobación"
   - Botón guardar con feedback

2. **Reglas** - CRUD de reglas de vacaciones
   - Tabla responsive con 5 columnas
   - Modal crear/editar con validación
   - No permite duplicados posición/nivel
   - Botones editar y eliminar
   - Estados activo/inactivo

3. **Catálogo** - Gestión de cargos y niveles
   - Sub-tabs: Cargos y Niveles
   - Grid de cards responsive (1/2/3 columnas)
   - Card especial "+" para crear
   - Modal dinámico crear/editar
   - Relación cargo-nivel visible

4. **Gestión y Balance** - Vista unificada
   - **Sección superior**: Solicitudes de vacaciones
     - Lista de cards con información completa
     - StatusBadges con iconos
     - Botones Aprobar/Rechazar para pending
     - Información de aprobación/rechazo con comentarios
   - **Sección inferior**: Tabla de balance de usuarios
     - Días asignados/usados/disponibles
     - Barras de progreso visuales con colores
     - % de utilización calculado

### **Modal Mejorado de Aprobación/Rechazo**

El modal se abre al hacer clic en "Aprobar" o "Rechazar" y muestra:

**Sección 1: Información de la Solicitud**
- Nombre del usuario con badge de estado
- Motivo de la solicitud
- Fechas: inicio - fin
- Total de días solicitados (destacado)
- Fecha de solicitud completa

**Sección 2: Balance del Usuario (integrado)**
- Grid con 3 columnas: Asignados / Usados / Disponibles
- Cálculo dinámico: "Después de aprobar quedarían X días"
- Alerta visual si no tiene suficientes días:
  - Mensaje: "No tiene días suficientes"
  - Detalle: "El usuario necesita X días adicionales"
  - Color rojo con icono de advertencia
- Validación: impide aprobar si no hay días disponibles

**Sección 3: Acciones**
- Textarea para comentarios
  - Opcional para aprobar
  - **Obligatorio para rechazar**
- Botón "Confirmar Aprobación" (verde) o "Confirmar Rechazo" (rojo)
- Botón "Cancelar" (gris)

### **Validaciones Inteligentes**

✅ Modal de Aprobación:
- Verifica días disponibles antes de aprobar
- Muestra alerta si no hay días suficientes
- Impide aprobación sin días disponibles
- Comentario obligatorio al rechazar
- Actualiza balance automáticamente al aprobar

✅ Campos requeridos verificados en todos los modales
✅ No permite duplicados en reglas
✅ Confirmación antes de eliminar (SweetAlert)
✅ Mensajes de error claros y específicos
✅ Feedback visual inmediato en todas las acciones

## 🎨 Características UI/UX

### **Diseño Consistente**
- Cards con sombra suave y bordes redondeados
- Hover states con transición smooth
- Espaciado uniforme (sistema 4px)
- Tipografía clara y legible

### **Dark Mode Completo**
- Todos los tabs soportan dark mode
- Colores adaptados para legibilidad
- Contraste adecuado en ambos modos
- Transiciones suaves entre modos

### **Responsive Design**
- Mobile-first approach
- Tabs con scroll horizontal en mobile
- Grid adaptativo según viewport
- Modales centrados y scrollables
- Tabla de balance con scroll horizontal

### **Componentes Reutilizados**
- `PageLayout` - Layout consistente
- `Card` - Tarjetas con header/footer
- `StatusBadge` - Badges con iconos
- `SweetAlert` - Alertas y confirmaciones

## 📊 Datos de Ejemplo

### Mock JSON Incluye:
- **3 cargos**: Operario, Administrativo, Gerente
- **4 niveles**: Junior, Senior, Trainee, Especialista
- **5 reglas**: Con días asignados (10-25)
- **4 solicitudes**: Estados variados (approved, pending, rejected)
- **4 balances**: Con días usados/disponibles coherentes

### Campos en VacationRecord:
```typescript
interface VacationRecord {
  id: string;
  userId: string;
  userName: string;
  reason: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  comments?: string;  // Nuevo campo para motivos
}
```

## 🚀 Cómo Usar

### **Acceder al Módulo**

```bash
http://localhost:5173/vacations-dev
```

### **Flujo de Trabajo Típico**

1. **Configurar el módulo** (Tab Configuración)
   - Activar/desactivar
   - Seleccionar visibilidad
   - Configurar aprobaciones

2. **Definir reglas** (Tab Reglas)
   - Crear reglas por cargo/nivel
   - Asignar días de vacaciones
   - Activar/desactivar reglas

3. **Gestionar catálogo** (Tab Catálogo)
   - Crear cargos
   - Crear niveles asociados a cargos

4. **Aprobar solicitudes** (Tab Gestión y Balance)
   - Ver solicitudes pendientes
   - Click en "Aprobar" o "Rechazar"
   - Modal muestra toda la info + balance
   - Validación automática de días disponibles
   - Confirmar con comentario
   - Balance se actualiza automáticamente

## 🔄 Adaptar para Nuevo Módulo

### **Paso 1: Copiar Estructura**

```bash
# Copiar directorios
cp -r frontend/src/mocks/vacationsDev frontend/src/mocks/tuModuloDev
cp -r frontend/src/pages/VacationsDev frontend/src/pages/TuModuloDev

# Renombrar archivos
mv frontend/src/mocks/tuModuloDev/vacationsDev.mock.json \
   frontend/src/mocks/tuModuloDev/tuModuloDev.mock.json

mv frontend/src/pages/TuModuloDev/VacationsDevPage.tsx \
   frontend/src/pages/TuModuloDev/TuModuloDevPage.tsx
```

### **Paso 2: Adaptar Mock JSON**

Cambiar campos según tu caso de uso:

```json
// ANTES (Vacaciones)
"records": [{
  "daysRequested": 5,
  "startDate": "2025-02-01",
  "endDate": "2025-02-05"
}]

// DESPUÉS (Ejemplo: Capacitaciones)
"records": [{
  "hoursRequested": 40,
  "courseName": "React Advanced",
  "provider": "Udemy"
}]
```

### **Paso 3: Actualizar Interfaces TypeScript**

```typescript
// Cambiar en el archivo .tsx
interface Record {
  // ... adaptar campos según tu módulo
}

interface Balance {
  // ... adaptar métricas según tu caso
}
```

### **Paso 4: Actualizar UI**

- Cambiar icono principal (`faCalendar` → tu icono)
- Actualizar títulos y labels
- Modificar columnas de tablas
- Adaptar campos en modales
- Ajustar lógica de validación del modal

### **Paso 5: Agregar Ruta**

En `frontend/src/App.tsx`:

```typescript
import { TuModuloDevPage } from "./pages/TuModuloDev/TuModuloDevPage";

<Route path="/tu-modulo-dev" element={<TuModuloDevPage />} />
```

## 💡 Ejemplos de Adaptación

### **1. Módulo de Horas Extra**

**Cambios en Record:**
- `hoursWorked` en lugar de `daysRequested`
- `date` en lugar de `startDate/endDate`
- `hourlyRate` y `totalAmount`

**Cambios en Balance:**
- `totalHours`, `totalAmount`, `lastPayment`

**Cambios en Modal:**
- Mostrar tarifa/hora y monto total
- Validar horas máximas por mes

### **2. Módulo de Capacitaciones**

**Cambios en Record:**
- `courseName`, `provider`, `duration`
- `cost` en lugar de días

**Cambios en Balance:**
- `budgetAssigned`, `budgetUsed`, `budgetRemaining`

**Cambios en Modal:**
- Mostrar costo del curso
- Validar presupuesto disponible

### **3. Módulo de Bonos**

**Cambios en Record:**
- `amount`, `performanceScore`, `period`
- `percentage` adicional

**Cambios en Balance:**
- `totalReceived`, `currentYear`, `lastBonus`

**Cambios en Modal:**
- Mostrar montos en lugar de días
- Validar score mínimo requerido

## ⚙️ Componentes Clave

### **getUserBalance(userId)**
Función helper que busca el balance de un usuario específico.
Usada en el modal para mostrar información contextual.

### **openApprovalModal(record, action)**
Abre el modal de aprobación/rechazo con:
- Información completa de la solicitud
- Balance actual del usuario
- Cálculo de balance resultante
- Validaciones automáticas

### **confirmApproval()**
Procesa la aprobación/rechazo:
- Valida comentarios (obligatorio para rechazo)
- Valida días disponibles (solo para aprobación)
- Actualiza balance si se aprueba
- Actualiza record con estado y comentarios
- Muestra feedback con SweetAlert

## 🐛 Troubleshooting

### **Modal no se abre**
- Verificar que `showApprovalModal` está en el estado
- Verificar que `selectedRecord` no es null

### **Balance no se actualiza**
- Verificar que los `userId` coinciden
- Verificar que `getUserBalance` retorna el usuario correcto

### **Validación no funciona**
- Verificar cálculo de `remainingAfterApproval`
- Verificar condición `hasEnoughDays`

### **Comentarios no se guardan**
- Verificar que el campo `comments` está en la interface
- Verificar que se pasa `approvalComments` al actualizar el record

## ✅ Checklist de Implementación

Al adaptar este template, verifica:

- [ ] Mock JSON adaptado con estructura correcta
- [ ] Interfaces TypeScript actualizadas
- [ ] Import del JSON correcto en el componente
- [ ] Título e icono actualizados
- [ ] 4 tabs implementados y funcionales
- [ ] Tab "Gestión y Balance" con dos secciones
- [ ] Modal de aprobación/rechazo con 3 secciones
- [ ] Validaciones en modal funcionando
- [ ] Balance se actualiza al aprobar
- [ ] Comentarios se guardan correctamente
- [ ] Funciones CRUD completas
- [ ] Dark mode funciona en todo
- [ ] Responsive verificado
- [ ] Ruta agregada en App.tsx
- [ ] Sin errores en consola

## 📚 Lo que SÍ hace

✅ Gestión completa de solicitudes (CRUD)
✅ Validación de días disponibles antes de aprobar
✅ Cálculo automático de balance resultante
✅ Modal informativo con toda la información relevante
✅ Actualización automática de balances
✅ Comentarios obligatorios al rechazar
✅ Prevención de errores (no aprobar sin días)
✅ Estados visuales claros con badges
✅ Dark mode completo
✅ Mobile responsive
✅ Feedback inmediato en todas las acciones

## 📚 Lo que NO hace

❌ **No** persiste datos (solo in-memory)
❌ **No** conecta con backend real
❌ **No** tiene autenticación real
❌ **No** valida roles específicos
❌ **No** envía notificaciones
❌ **No** genera reportes
❌ **No** tiene historial de cambios

---

## 🎉 Mejoras Implementadas

### **Versión Actual (Refactorizada)**

✨ **Tab único "Gestión y Balance"** en lugar de dos tabs separados
✨ **Modal mejorado** con 3 secciones informativas
✨ **Validación inteligente** de días disponibles
✨ **Cálculo en tiempo real** del balance resultante
✨ **Alertas visuales** para casos de error
✨ **Comentarios persistidos** en la solicitud
✨ **Actualización automática** de balances al aprobar

### **Ventajas del Diseño Actual**

1. **Menos navegación**: Todo en una vista
2. **Decisión informada**: Ver balance antes de aprobar
3. **Prevención de errores**: Validaciones automáticas
4. **Feedback contextual**: Mensajes específicos según caso
5. **Flujo natural**: Ver solicitud → ver balance → decidir

---

**Creado**: Diciembre 2025
**Versión**: 2.0 (Refactorizada)
**Propósito**: Template reutilizable para módulos de gestión con aprobaciones
**Estado**: ✅ Producción Ready
