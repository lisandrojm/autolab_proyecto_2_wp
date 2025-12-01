# Módulo Bonus Dev - Ejemplo de Adaptación

Este es un **ejemplo completo** de cómo adaptar el template de VacationsDev para crear un nuevo módulo (Bonos).

## 📁 Archivos Creados

```
frontend/src/
├── mocks/
│   └── bonusDev/
│       └── bonusDev.mock.json       # Mock JSON adaptado
└── pages/
    └── BonusDev/
        ├── BonusDevPage.tsx         # Componente adaptado
        └── README.md                # Esta documentación
```

## 🔄 Cambios Realizados vs VacationsDev

### 1️⃣ **Mock JSON (bonusDev.mock.json)**

**Cambios principales:**
- ✅ `days` → `amount` (días por monto en pesos)
- ✅ `daysRequested` → `amount` en records
- ✅ Agregado `percentage` en rules (porcentaje adicional)
- ✅ Agregado `performanceScore` en records
- ✅ Agregado `period` en records (Q4 2024, Año 2025, etc)
- ✅ Agregado `rejectionReason` en records
- ✅ Balance: `assignedDays/used/remaining` → `totalReceived/currentYear/lastBonus`
- ✅ Settings: agregado `bonusType` (performance, annual, quarterly, project)

### 2️⃣ **Componente (BonusDevPage.tsx)**

**Cambios en interfaces:**
```typescript
// ANTES (Vacations)
interface VacationRecord {
  daysRequested: number;
  startDate: string;
  endDate: string;
}

// DESPUÉS (Bonus)
interface BonusRecord {
  amount: number;
  performanceScore?: number;
  period: string;
  rejectionReason?: string;
}
```

**Cambios en UI:**
- ✅ Icono: `faCalendar` → `faAward`
- ✅ Título: "Vacaciones" → "Bonos"
- ✅ Tab Reglas: columna "Días" → "Monto" + columna "%" adicional
- ✅ Tab Gestión: muestra monto en verde con `$` y score con icono de award
- ✅ Tab Balance: muestra totales recibidos y último bono con fecha
- ✅ Tab Config: agregado selector "Tipo de Bono"
- ✅ Modales: campos adaptados (monto y porcentaje)

### 3️⃣ **Rutas**

Agregada ruta en `App.tsx`:
```tsx
<Route path="/bonus-dev" element={<BonusDevPage />} />
```

## 🎯 Comparación Visual

### Tab Reglas

**Vacaciones:**
| Cargo | Nivel | Días | Estado | Acciones |

**Bonos:**
| Cargo | Nivel | Monto | % | Estado | Acciones |

### Tab Gestión

**Vacaciones:**
- Muestra: nombre, motivo, fechas (inicio-fin), días solicitados
- Estado: aprobada/pendiente/rechazada

**Bonos:**
- Muestra: nombre, monto ($), motivo, período, performance score
- Estado: aprobado/pendiente/rechazado
- Extra: muestra motivo de rechazo si aplica

### Tab Balance

**Vacaciones:**
- Días asignados
- Días usados
- Días disponibles
- Barra de progreso (% usado)

**Bonos:**
- Total recibido histórico
- Total este año
- Último bono recibido
- Fecha del último bono
- Barra de progreso (% del año vs histórico)

## 🚀 Cómo Acceder

### Vacaciones Dev
```
http://localhost:5173/vacations-dev
```

### Bonos Dev
```
http://localhost:5173/bonus-dev
```

## 📝 Pasos para Crear Tu Propio Módulo

### 1. Copiar archivos base
```bash
cp -r frontend/src/mocks/vacationsDev frontend/src/mocks/tuModuloDev
cp -r frontend/src/pages/VacationsDev frontend/src/pages/TuModuloDev
```

### 2. Renombrar archivos
```bash
mv frontend/src/mocks/tuModuloDev/vacationsDev.mock.json \
   frontend/src/mocks/tuModuloDev/tuModuloDev.mock.json

mv frontend/src/pages/TuModuloDev/VacationsDevPage.tsx \
   frontend/src/pages/TuModuloDev/TuModuloDevPage.tsx
```

### 3. Adaptar mock JSON
- Cambiar nombres de campos según tu módulo
- Agregar/quitar campos específicos
- Ajustar datos de ejemplo

### 4. Adaptar componente TypeScript
- Actualizar interfaces
- Cambiar import del JSON
- Ajustar títulos e iconos
- Modificar columnas de tablas
- Adaptar modales y formularios

### 5. Agregar ruta
```tsx
import { TuModuloDevPage } from "./pages/TuModuloDev/TuModuloDevPage";

<Route path="/tu-modulo-dev" element={<TuModuloDevPage />} />
```

## 💡 Ideas de Módulos Adicionales

### Capacitaciones Dev
- Rules: horas de capacitación por cargo/nivel
- Records: solicitudes de cursos
- Balance: horas completadas vs asignadas

### Horas Extra Dev
- Rules: tarifa por hora por cargo/nivel
- Records: solicitudes de horas extra
- Balance: horas trabajadas y monto acumulado

### Licencias Dev
- Rules: días de licencia por cargo/nivel/tipo
- Records: solicitudes de licencias (médica, estudio, etc)
- Balance: días usados por tipo de licencia

### Reconocimientos Dev
- Rules: puntos por cargo/nivel
- Records: reconocimientos otorgados
- Balance: puntos acumulados canjeables

## 🎨 Personalización

### Cambiar colores de estado
```typescript
const mapStatusToStatusType = (status: string) => {
  switch (status) {
    case "pending":
      return "bonus_pendiente"; // Crear en StatusBadge
    case "approved":
      return "bonus_aprobado";
    // ...
  }
};
```

### Agregar columnas a reglas
```typescript
interface Rule {
  id: string;
  positionId: string;
  levelId: string;
  amount: number;
  frequency: "monthly" | "quarterly" | "annual"; // 🆕
  active: boolean;
}
```

### Agregar validaciones
```typescript
const addRule = () => {
  if (formData.amount < 1000) {
    sweetAlert.error("Error", "El monto mínimo es $1,000");
    return;
  }
  // ...
};
```

## ⚠️ Recordatorios

- ✅ Siempre actualizar interfaces TypeScript
- ✅ Mantener consistencia en nombres de campos
- ✅ Validar datos antes de crear/editar
- ✅ Usar confirmaciones antes de eliminar
- ✅ Mantener dark mode en todos los componentes
- ✅ Mobile-first responsive

---

**Creado**: Diciembre 2025
**Basado en**: Template VacationsDev
**Propósito**: Ejemplo de adaptación del template para módulo de Bonos
