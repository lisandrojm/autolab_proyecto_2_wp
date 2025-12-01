# 📚 Guía Completa: Sistema de Módulos Dev Templates

Sistema completo de templates para crear módulos de desarrollo sin backend, basado en el módulo de Vacaciones de la app de RRHH.

## 🎯 ¿Qué es esto?

Un **sistema de templates reutilizables** que permite crear rápidamente módulos de desarrollo completos y funcionales, con UI/UX consistente, sin necesidad de backend ni base de datos.

### ✅ Incluye:
- Mock JSON con datos de ejemplo
- Componentes React con TypeScript
- 5 tabs funcionales (Configuración, Reglas, Catálogo, Gestión, Balance)
- CRUD completo in-memory
- Validaciones y confirmaciones
- Dark mode completo
- Mobile-first responsive

### ❌ NO incluye:
- Conexión a MongoDB
- APIs reales
- Autenticación
- Persistencia de datos

---

## 📁 Estructura de Archivos

```
frontend/src/
├── mocks/
│   ├── vacationsDev/              # ✅ Template Base
│   │   └── vacationsDev.mock.json
│   └── bonusDev/                  # ✅ Ejemplo Adaptado
│       └── bonusDev.mock.json
│
└── pages/
    ├── VacationsDev/              # ✅ Template Base
    │   ├── VacationsDevPage.tsx
    │   └── README.md
    └── BonusDev/                  # ✅ Ejemplo Adaptado
        ├── BonusDevPage.tsx
        └── README.md
```

---

## 🚀 Módulos Disponibles

### 1️⃣ VacationsDev (Template Base)
**Ruta:** `/vacations-dev`

**Características:**
- Gestión de días de vacaciones por cargo/nivel
- Solicitudes con estados (pending, approved, rejected)
- Balance de días asignados/usados/disponibles
- Configuración de visibilidad y aprobaciones

**Campos principales:**
- `days`: días de vacaciones
- `daysRequested`: días solicitados
- `startDate` / `endDate`: fechas de vacaciones

### 2️⃣ BonusDev (Ejemplo Adaptado)
**Ruta:** `/bonus-dev`

**Características:**
- Gestión de bonos económicos por cargo/nivel
- Solicitudes con montos y performance score
- Balance de bonos históricos y actuales
- Configuración de tipos de bono

**Campos principales:**
- `amount`: monto del bono en pesos
- `percentage`: porcentaje adicional
- `performanceScore`: score de desempeño
- `period`: período del bono (Q4 2024, Año 2025, etc)

---

## 🎨 Estructura de un Módulo

### Mock JSON (`mocks/<moduleName>/<moduleName>.mock.json`)

```json
{
  "settings": {
    "enabled": true,
    "visibleTo": "collaborators",
    "requireApproval": true,
    "extraConfig": {}
  },

  "catalog": {
    "positions": [
      { "id": "pos-1", "name": "Cargo 1", "description": "..." }
    ],
    "levels": [
      { "id": "lvl-1", "name": "Nivel 1", "positionId": "pos-1", "description": "..." }
    ]
  },

  "rules": [
    {
      "id": "rule-1",
      "positionId": "pos-1",
      "levelId": "lvl-1",
      "amount": 5000,
      "active": true
    }
  ],

  "records": [
    {
      "id": "rec-1",
      "userId": "usr-1",
      "userName": "Juan Pérez",
      "reason": "Motivo",
      "status": "approved",
      "createdAt": "2025-01-01T10:00:00"
    }
  ],

  "balances": [
    {
      "userId": "usr-1",
      "userName": "Juan Pérez",
      "totalReceived": 10000,
      "currentYear": 5000
    }
  ]
}
```

### Componente Principal (`pages/<ModuleName>Dev/<ModuleName>DevPage.tsx`)

**Secciones obligatorias:**

1. **Imports y Tipos**
```typescript
import mockDataImport from "../../mocks/<moduleName>/<moduleName>.mock.json";

interface Settings { ... }
interface Position { ... }
interface Level { ... }
interface Rule { ... }
interface Record { ... }
interface Balance { ... }
```

2. **Estados**
```typescript
const [activeTab, setActiveTab] = useState<TabType>("config");
const [settings, setSettings] = useState<Settings>(mockDataImport.settings);
// ... más estados
```

3. **Funciones CRUD**
```typescript
const addRule = () => { ... }
const deleteRule = async (id: string) => { ... }
const approveRecord = (id: string) => { ... }
const rejectRecord = (id: string) => { ... }
```

4. **Render con Tabs**
```typescript
return (
  <PageLayout title="..." subtitle="..." faIcon={...}>
    {/* Tab Navigation */}
    <TabButton tab="config" ... />
    <TabButton tab="rules" ... />

    {/* Tab Content */}
    {activeTab === "config" && <ConfigTab />}
    {activeTab === "rules" && <RulesTab />}
    ...
  </PageLayout>
);
```

---

## 🛠️ Cómo Crear un Nuevo Módulo

### Paso 1: Copiar Template Base

```bash
# Crear directorios
mkdir -p frontend/src/mocks/tuModuloDev
mkdir -p frontend/src/pages/TuModuloDev

# Copiar archivos
cp frontend/src/mocks/vacationsDev/vacationsDev.mock.json \
   frontend/src/mocks/tuModuloDev/tuModuloDev.mock.json

cp frontend/src/pages/VacationsDev/VacationsDevPage.tsx \
   frontend/src/pages/TuModuloDev/TuModuloDevPage.tsx
```

### Paso 2: Adaptar Mock JSON

**Ejemplo: Cambiar de "días" a "horas"**

```json
// ANTES (Vacations)
"rules": [
  {
    "id": "rule-1",
    "positionId": "pos-1",
    "levelId": "lvl-1",
    "days": 14,
    "active": true
  }
]

// DESPUÉS (Capacitaciones)
"rules": [
  {
    "id": "rule-1",
    "positionId": "pos-1",
    "levelId": "lvl-1",
    "hours": 40,
    "category": "technical",
    "active": true
  }
]
```

### Paso 3: Adaptar Interfaces TypeScript

```typescript
// ANTES (Vacations)
interface Rule {
  id: string;
  positionId: string;
  levelId: string;
  days: number;
  active: boolean;
}

// DESPUÉS (Capacitaciones)
interface Rule {
  id: string;
  positionId: string;
  levelId: string;
  hours: number;
  category: "technical" | "soft-skills" | "leadership";
  active: boolean;
}
```

### Paso 4: Actualizar Import del JSON

```typescript
// Cambiar la ruta del import
import mockDataImport from "../../mocks/tuModuloDev/tuModuloDev.mock.json";
```

### Paso 5: Actualizar Títulos e Iconos

```typescript
// PageLayout
<PageLayout
  title="Capacitaciones - Módulo Dev"
  subtitle="Módulo de desarrollo con datos simulados"
  faIcon={{ icon: faGraduationCap }}
>
```

### Paso 6: Adaptar Tablas y Formularios

```typescript
// Tab Reglas - Tabla
<thead>
  <tr>
    <th>Cargo</th>
    <th>Nivel</th>
    <th>Horas</th>  {/* Cambio aquí */}
    <th>Categoría</th>  {/* Nuevo campo */}
    <th>Estado</th>
    <th>Acciones</th>
  </tr>
</thead>

// Modal - Formulario
<input
  type="number"
  value={formData.hours || ""}  {/* Cambio aquí */}
  onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
  placeholder="40"
  label="Horas de capacitación"
/>
```

### Paso 7: Agregar Ruta

**En `frontend/src/App.tsx`:**

```typescript
// 1. Import
import { TuModuloDevPage } from "./pages/TuModuloDev/TuModuloDevPage";

// 2. Ruta
<Route
  path="/tu-modulo-dev"
  element={
    <ProtectedRoute>
      <TuModuloDevPage />
    </ProtectedRoute>
  }
/>
```

### Paso 8: Probar

```bash
# Acceder en el navegador
http://localhost:5173/tu-modulo-dev
```

---

## 📊 Casos de Uso Reales

### 1. Módulo de Horas Extra

**Mock JSON:**
```json
{
  "rules": [
    {
      "id": "rule-1",
      "positionId": "pos-1",
      "levelId": "lvl-1",
      "hourlyRate": 150,
      "maxHoursPerMonth": 40,
      "active": true
    }
  ],
  "records": [
    {
      "id": "rec-1",
      "userId": "usr-1",
      "userName": "Pedro Gómez",
      "date": "2025-01-15",
      "hours": 8,
      "totalAmount": 1200,
      "status": "approved"
    }
  ]
}
```

**Tab Reglas:** Cargo | Nivel | Tarifa/hora | Max horas/mes | Estado

**Tab Gestión:** Muestra fecha, horas trabajadas, monto total

**Tab Balance:** Horas totales, monto acumulado mes, histórico

### 2. Módulo de Capacitaciones

**Mock JSON:**
```json
{
  "rules": [
    {
      "id": "rule-1",
      "positionId": "pos-1",
      "levelId": "lvl-1",
      "hours": 40,
      "budget": 5000,
      "category": "technical",
      "active": true
    }
  ],
  "records": [
    {
      "id": "rec-1",
      "userId": "usr-1",
      "userName": "María López",
      "courseName": "React Advanced",
      "provider": "Udemy",
      "hours": 20,
      "cost": 2500,
      "status": "pending"
    }
  ]
}
```

**Tab Reglas:** Cargo | Nivel | Horas | Presupuesto | Categoría | Estado

**Tab Gestión:** Muestra curso, proveedor, horas, costo

**Tab Balance:** Horas completadas, presupuesto usado/disponible

### 3. Módulo de Reconocimientos

**Mock JSON:**
```json
{
  "rules": [
    {
      "id": "rule-1",
      "positionId": "pos-1",
      "levelId": "lvl-1",
      "points": 100,
      "maxPerMonth": 500,
      "active": true
    }
  ],
  "records": [
    {
      "id": "rec-1",
      "userId": "usr-1",
      "userName": "Carlos Ruiz",
      "achievement": "Proyecto completado a tiempo",
      "points": 100,
      "givenBy": "Manager",
      "status": "approved"
    }
  ]
}
```

**Tab Reglas:** Cargo | Nivel | Puntos | Max/mes | Estado

**Tab Gestión:** Muestra logro, puntos otorgados, quien los dio

**Tab Balance:** Puntos totales, canjeables, histórico

---

## 🎨 Componentes UI Reutilizables

### PageLayout
```typescript
import { PageLayout } from "../../components/ui/PageLayout";

<PageLayout
  title="Tu Título"
  subtitle="Tu subtítulo"
  faIcon={{ icon: faIcon }}
>
  {/* contenido */}
</PageLayout>
```

### Card
```typescript
import { Card } from "../../components/ui/Card";

<Card
  header={{ title: "Título", subtitle: "Subtítulo", icon: faIcon }}
  footer={{
    actions: [
      { icon: faEdit, onClick: handleEdit, title: "Editar" },
      { icon: faTrash, onClick: handleDelete, title: "Eliminar" }
    ]
  }}
>
  {/* contenido */}
</Card>
```

### StatusBadge
```typescript
import { StatusBadge } from "../../components/ui/StatusBadge";

<StatusBadge
  type="vacaciones_aprobada"
  size="sm"
/>
```

### SweetAlert
```typescript
import { sweetAlert } from "../../utils/sweetAlert";

// Éxito
sweetAlert.success("Título", "Mensaje");

// Error
sweetAlert.error("Título", "Mensaje");

// Confirmación
const result = await sweetAlert.confirm("Título", "Mensaje");
if (result.isConfirmed) {
  // hacer algo
}
```

---

## ⚠️ Mejores Prácticas

### ✅ DO (Hacer)

1. **Validar datos antes de crear/editar**
```typescript
if (!formData.name) {
  sweetAlert.error("Error", "El nombre es requerido");
  return;
}
```

2. **Confirmar antes de eliminar**
```typescript
const result = await sweetAlert.confirm("¿Eliminar?", "¿Estás seguro?");
if (result.isConfirmed) {
  // eliminar
}
```

3. **Mantener consistencia en nombres**
```typescript
// Interfaces en singular
interface Position { ... }
interface Level { ... }

// Arrays en plural
const [positions, setPositions] = useState<Position[]>([]);
const [levels, setLevels] = useState<Level[]>([]);
```

4. **Usar tipos TypeScript**
```typescript
type TabType = "config" | "rules" | "catalog" | "management" | "balance";
const [activeTab, setActiveTab] = useState<TabType>("config");
```

### ❌ DON'T (No hacer)

1. **No mutar estado directamente**
```typescript
// ❌ MAL
settings.enabled = true;

// ✅ BIEN
setSettings({ ...settings, enabled: true });
```

2. **No olvidar limpiar modales**
```typescript
// Siempre al cerrar modal
setShowModal(false);
setEditingItem(null);
setFormData({});
```

3. **No hardcodear valores**
```typescript
// ❌ MAL
if (user.role === "admin") { ... }

// ✅ BIEN
const positions = mockDataImport.catalog.positions;
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module"
**Causa:** Ruta incorrecta en import del JSON

**Solución:**
```typescript
// Verificar ruta relativa
import mockDataImport from "../../mocks/tuModulo/tuModulo.mock.json";
```

### Los cambios no se reflejan
**Causa:** Estado no actualizado correctamente

**Solución:**
```typescript
// Usar spread operator
setItems([...items, newItem]);

// No mutar directamente
// ❌ items.push(newItem);
```

### TypeScript errors
**Causa:** Interfaces no actualizadas

**Solución:**
```typescript
// Actualizar todas las interfaces cuando cambies campos
interface Rule {
  id: string;
  positionId: string;
  levelId: string;
  amount: number;  // ← Asegúrate que coincida con JSON
  active: boolean;
}
```

---

## 📚 Recursos Adicionales

### Archivos de Referencia
- Template base: `frontend/src/pages/VacationsDev/`
- Ejemplo adaptado: `frontend/src/pages/BonusDev/`
- Componentes UI: `frontend/src/components/ui/`
- Utilidades: `frontend/src/utils/`

### Documentación Relacionada
- README VacationsDev: instrucciones detalladas del template
- README BonusDev: ejemplo de adaptación paso a paso
- StatusBadge: componente para badges de estado
- PageLayout: componente para layout de páginas

---

## 📝 Checklist de Implementación

Al crear un nuevo módulo, verifica:

- [ ] Mock JSON creado con estructura completa
- [ ] Interfaces TypeScript definidas
- [ ] Import del JSON correcto
- [ ] Título e icono actualizados
- [ ] 5 tabs implementados
- [ ] Funciones CRUD funcionando
- [ ] Validaciones agregadas
- [ ] Confirmaciones antes de eliminar
- [ ] Modales con formularios completos
- [ ] Ruta agregada en App.tsx
- [ ] Dark mode funciona
- [ ] Responsive en mobile
- [ ] Sin errores en consola
- [ ] README creado con documentación

---

**Creado**: Diciembre 2025
**Autor**: Template System
**Propósito**: Sistema completo de templates para módulos dev sin backend
**Versión**: 1.0
