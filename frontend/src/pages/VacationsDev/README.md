# Template de Módulo Dev - Vacaciones

Este es un **template completo y funcional** para crear módulos de desarrollo basados en el módulo de Vacaciones, sin necesidad de backend ni base de datos.

## 📁 Estructura de Archivos

```
frontend/src/
├── mocks/
│   └── vacationsDev/
│       └── vacationsDev.mock.json    # Datos mock del módulo
└── pages/
    └── VacationsDev/
        ├── VacationsDevPage.tsx      # Componente principal
        └── README.md                 # Esta documentación
```

## 🎯 Características Implementadas

### ✅ Mock JSON Completo
- **settings**: Configuración del módulo (enabled, visibleTo, requireApproval)
- **catalog**: Catálogo de cargos y niveles
- **rules**: Reglas de asignación (cargo + nivel + días)
- **records**: Solicitudes de vacaciones
- **balances**: Balance de días por usuario

### ✅ 5 Tabs Funcionales

1. **Configuración**
   - Toggle enabled/disabled
   - Selector de visibilidad (collaborators, coordinators, both)
   - Checkbox de "Requiere aprobación"
   - Botón "Guardar configuración"

2. **Reglas**
   - Tabla con todas las reglas configuradas
   - Modal para agregar/editar reglas
   - Validación: no permite duplicados posición/nivel
   - Acciones: editar, eliminar

3. **Catálogo**
   - Sub-tabs: Cargos y Niveles
   - Grid de cards (estilo PositionsPage/LevelsPage)
   - Modal para crear/editar
   - Acciones: editar, eliminar

4. **Gestión**
   - Lista de solicitudes estilo Vacations.tsx mobile
   - StatusBadges con iconos y colores
   - Botones "Aprobar" / "Rechazar" para solicitudes pendientes
   - Actualización in-memory sin backend

5. **Balance**
   - Cards mostrando balance de usuarios
   - Días asignados / usados / disponibles
   - Barra de progreso visual

### ✅ Funcionalidades CRUD

Todas las operaciones funcionan **in-memory** (sin backend):
- ✅ Crear reglas, cargos, niveles
- ✅ Editar elementos existentes
- ✅ Eliminar con confirmación (SweetAlert)
- ✅ Aprobar/Rechazar solicitudes
- ✅ Validaciones básicas

### ✅ UI Consistente

- Mismo estilo visual que el módulo de Vacaciones
- Cards con sombra suave
- Botones primarios con hover states
- Inputs estándar con focus rings
- Modales idénticos a los del módulo real
- StatusBadges reutilizados
- Dark mode completo
- Mobile-first responsive

## 🚀 Cómo Usar Este Template

### Opción 1: Usar el Módulo Vacaciones Dev Tal Cual

1. Agregar ruta al router:

```tsx
import { VacationsDevPage } from "./pages/VacationsDev/VacationsDevPage";

// En tu router:
<Route path="/vacations-dev" element={<VacationsDevPage />} />
```

2. Acceder a `/vacations-dev` en el navegador

### Opción 2: Crear un Nuevo Módulo Basado en Este Template

#### Paso 1: Copiar Archivos

```bash
# Copiar estructura
cp -r frontend/src/mocks/vacationsDev frontend/src/mocks/bonusDev
cp -r frontend/src/pages/VacationsDev frontend/src/pages/BonusDev

# Renombrar archivos
mv frontend/src/mocks/bonusDev/vacationsDev.mock.json frontend/src/mocks/bonusDev/bonusDev.mock.json
mv frontend/src/pages/BonusDev/VacationsDevPage.tsx frontend/src/pages/BonusDev/BonusDevPage.tsx
```

#### Paso 2: Adaptar el Mock JSON

Editar `frontend/src/mocks/bonusDev/bonusDev.mock.json`:

```json
{
  "settings": {
    "enabled": true,
    "visibleTo": "collaborators",
    "bonusType": "annual",
    "extraConfig": {}
  },

  "catalog": {
    "positions": [...],
    "levels": [...]
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
      "userId": "usr-201",
      "userName": "Juan Pérez",
      "amount": 5000,
      "reason": "Bono anual por desempeño",
      "status": "approved",
      "createdAt": "2025-01-02T10:22:11"
    }
  ],

  "balances": [
    {
      "userId": "usr-201",
      "userName": "Juan Pérez",
      "totalReceived": 15000,
      "currentYear": 5000
    }
  ]
}
```

#### Paso 3: Adaptar el Componente

En `frontend/src/pages/BonusDev/BonusDevPage.tsx`:

1. **Cambiar imports:**
```tsx
import mockDataImport from "../../mocks/bonusDev/bonusDev.mock.json";
```

2. **Adaptar interfaces:**
```tsx
interface BonusRecord {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}
```

3. **Cambiar título y subtítulo:**
```tsx
<PageLayout
  title="Bonos - Módulo Dev"
  subtitle="Módulo de desarrollo con datos simulados (sin backend)"
  faIcon={{ icon: faDollarSign }}
>
```

4. **Adaptar campos según necesidad:**
   - Cambiar "días" por "monto" en reglas
   - Ajustar campos de formularios
   - Modificar columnas de tablas

#### Paso 4: Agregar Ruta

```tsx
import { BonusDevPage } from "./pages/BonusDev/BonusDevPage";

<Route path="/bonus-dev" element={<BonusDevPage />} />
```

## 🎨 Componentes UI Reutilizados

El template usa estos componentes existentes:
- `PageLayout`: Layout principal con header
- `Card`: Tarjetas con header/footer
- `StatusBadge`: Badges con iconos y colores
- `sweetAlert`: Alertas y confirmaciones

## 📝 Notas Importantes

### ✅ Lo que SÍ hace:
- Funciona completamente in-memory
- Permite probar UI/UX sin backend
- Mantiene estado durante la sesión
- Valida duplicados en reglas
- Confirmaciones antes de eliminar
- StatusBadges con estados visuales

### ❌ Lo que NO hace:
- No persiste datos (refresco = reset)
- No conecta con MongoDB
- No usa axios/APIs reales
- No autentica usuarios
- No valida roles/permisos

## 🔄 Flujo de Trabajo Recomendado

1. **Desarrollo**: Usar el módulo Dev para prototipar UI/UX
2. **Testing**: Probar flujos de usuario sin backend
3. **Aprobación**: Validar con cliente/equipo
4. **Integración**: Crear módulo real conectado a backend
5. **Migración**: Reemplazar mocks por APIs reales

## 💡 Tips y Mejores Prácticas

### Validaciones
```tsx
// Siempre validar antes de crear
if (!formData.name) {
  sweetAlert.error("Error", "El nombre es requerido");
  return;
}
```

### Confirmaciones
```tsx
// Siempre confirmar antes de eliminar
const result = await sweetAlert.confirm(
  "¿Eliminar?",
  "¿Estás seguro?"
);
if (result.isConfirmed) {
  // eliminar
}
```

### Estados
```tsx
// Usar estados tipados
const [items, setItems] = useState<Item[]>(mockData.items);
```

## 🚨 Troubleshooting

### Error: "Cannot find module"
- Verificar que la ruta del mock JSON sea correcta
- Usar rutas relativas: `../../mocks/...`

### Los cambios no se reflejan
- Asegurarse de usar `setItems([...items, newItem])`
- No mutar estado directamente

### Modal no se cierra
- Verificar que se llame `setShowModal(false)`
- Limpiar `editingItem` y `formData`

## 📚 Recursos Adicionales

- Ver módulo de Vacaciones mobile: `frontend/src/apps/mobile/src/views/Vacations.tsx`
- Ver PositionsPage: `frontend/src/pages/PositionsPage.tsx`
- Ver LevelsPage: `frontend/src/pages/LevelsPage.tsx`
- Ver StatusBadge: `frontend/src/components/ui/StatusBadge.tsx`

---

**Creado**: Diciembre 2025
**Basado en**: Módulo de Vacaciones (RRHH App)
**Propósito**: Template reutilizable para módulos de desarrollo sin backend
