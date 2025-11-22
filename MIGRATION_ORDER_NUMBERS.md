# Migración de Números de Pedido (Order Numbers)

## ✅ Implementación Completada

Se ha implementado exitosamente el sistema de numeración correlativa para pedidos con el formato `TENANTPREFIX-000001`.

---

## 📋 Cambios Realizados

### 1. Backend

#### **Nuevo Modelo: OrderCounter**
- **Archivo**: `server/src/models/OrderCounter.ts`
- **Función**: Mantiene el contador secuencial por tenant
- **Método estático**: `getNextSequence(tenantId)` - Operación atómica con `$inc`
- **Características**:
  - Thread-safe (usa `findOneAndUpdate` con `$inc`)
  - Auto-inicialización con `upsert: true`
  - Índice único en `tenantId`

#### **Modelo Order Actualizado**
- **Archivo**: `server/src/models/Order.ts`
- **Cambios**:
  - Nuevo campo: `orderNumber: string` (required, uppercase, index)
  - Nuevo índice único compuesto: `{ tenantId: 1, orderNumber: 1 }`
  - Hook `pre('save')` que genera automáticamente el número
  - Formato: `{TENANT_SLUG_3_CHARS}-{SEQUENCE_6_DIGITS}`
  - Ejemplo: `DEM-000001`, `ACM-000042`, `XYZ-001234`

#### **Búsqueda Mejorada**
- **Archivo**: `server/src/routes/hr-management.ts`
- **Cambios**:
  - Endpoint `GET /orders` ahora acepta parámetro `search`
  - Búsqueda por: `title`, `description`, y **`orderNumber`**
  - Case-insensitive con regex

### 2. Frontend

#### **Interface Actualizada**
- **Archivo**: `frontend/src/api/hrManagement.ts`
- **Cambio**: Agregado campo `orderNumber: string` al interface `Order`

#### **Visualización**
- **Archivo**: `frontend/src/pages/ManageOrdersPage.tsx`
- **Cambios**:
  - Función `getOrderNumber()` ahora usa `order.orderNumber` directamente
  - Actualizada vista de cards para mostrar número correlativo
  - Actualizada vista de tabla (columna "N° Pedido")
  - Actualizado modal de detalles

### 3. Script de Migración

#### **Script de Migración**
- **Archivo**: `server/src/scripts/migrateOrderNumbers.ts`
- **Comandos disponibles**:
  - Desarrollo: `npm run migrate:order-numbers`
  - Producción: `npm run migrate:order-numbers:prod`

---

## 🚀 Instrucciones de Deployment

### **IMPORTANTE: Ejecutar ANTES de hacer deploy del código nuevo**

### Paso 1: Backup de Base de Datos
```bash
# MongoDB Atlas - Hacer backup manual desde el dashboard
# O usando mongodump:
mongodump --uri="mongodb+srv://..." --out=/backup/$(date +%Y%m%d)
```

### Paso 2: Ejecutar Migración (Desarrollo)
```bash
cd server
npm run migrate:order-numbers
```

**Output esperado:**
```
✓ Connected to MongoDB

📋 Found 3 tenants to process

🔄 Processing tenant: Demo Tenant (demo-tenant)
  📌 Prefix: DEM
  ✓ Migrated 15 orders
  ✓ Counter set to: 15

🔄 Processing tenant: ACME Corp (acme-corporation)
  📌 Prefix: ACM
  ✓ Migrated 8 orders
  ✓ Counter set to: 8

🎉 Migration completed successfully!
📊 Total orders migrated: 23
📊 Total tenants processed: 3

✓ Database connection closed
```

### Paso 3: Verificar Migración
```bash
# Conectarse a MongoDB y verificar
use brandme_db

# Verificar que todos los pedidos tengan orderNumber
db.orders.find({ orderNumber: { $exists: false } }).count()
# Debe retornar: 0

# Ver ejemplos de números generados
db.orders.find({}, { orderNumber: 1, title: 1, tenantId: 1 }).limit(10)

# Verificar contadores
db.ordercounters.find({})
```

### Paso 4: Deploy del Código
```bash
# Backend
cd server
npm run build
npm run start:prod

# Frontend
cd frontend
npm run build
# Deploy según tu configuración (Vercel, Netlify, etc.)
```

### Paso 5: Verificación Post-Deploy
1. Crear un nuevo pedido desde la aplicación
2. Verificar que se genera el número correctamente
3. Buscar el pedido por su número
4. Confirmar que la visualización es correcta

---

## 🔍 Formato de Números

### **Estructura**: `PREFIX-NNNNNN`

- **PREFIX**: Primeras 3 letras del `slug` del tenant en MAYÚSCULAS
- **NNNNNN**: Número secuencial con padding de 6 dígitos (000001 a 999999)

### **Ejemplos por Tenant**

#### Tenant: "demo-tenant"
- Slug: `demo-tenant`
- Prefix: `DEM`
- Pedidos:
  - `DEM-000001` (Primer pedido)
  - `DEM-000002` (Segundo pedido)
  - `DEM-000100` (Pedido #100)
  - `DEM-001000` (Pedido #1000)

#### Tenant: "acme-corporation"
- Slug: `acme-corporation`
- Prefix: `ACM`
- Pedidos:
  - `ACM-000001` (Su primer pedido)
  - `ACM-000002` (Su segundo pedido)

#### Tenant: "xyz-company"
- Slug: `xyz-company`
- Prefix: `XYZ`
- Pedidos:
  - `XYZ-000001`

---

## 🧪 Testing

### Tests Manuales

1. **Crear nuevo pedido**
   - Ir a "Admin GENERAL" → "Pedidos"
   - Crear un nuevo pedido
   - Verificar que aparece con número en formato correcto
   - Ejemplo: `#DEM-000016`

2. **Búsqueda por número**
   - Usar el buscador de pedidos
   - Buscar por número completo: `DEM-000001`
   - Buscar por número parcial: `000001` o `DEM`
   - Verificar que encuentra los pedidos correctos

3. **Verificar en diferentes vistas**
   - Vista de cards: Debe mostrar número en la parte superior
   - Vista de tabla: Columna "N° Pedido" debe mostrar el número
   - Modal de detalles: Debe mostrar "Nº Pedido: #DEM-000001"

4. **Múltiples tenants**
   - Cambiar de tenant (si tienes acceso multi-tenant)
   - Verificar que cada tenant tiene su propia secuencia
   - Un tenant con prefijo ACM debe tener ACM-000001, etc.

### Tests de Concurrencia

```bash
# Crear múltiples pedidos simultáneamente para verificar atomicidad
# Los números deben ser únicos y secuenciales sin duplicados
```

---

## 🐛 Troubleshooting

### Problema: "orderNumber is required"
**Causa**: Intentando crear pedido antes de ejecutar migración o el hook no se ejecuta.
**Solución**:
1. Verificar que el hook pre('save') esté en Order.ts
2. Ejecutar migración para pedidos existentes
3. Verificar que OrderCounter.ts esté importado correctamente

### Problema: Error de duplicación (E11000)
**Causa**: Muy raro, puede ocurrir en alta concurrencia extrema.
**Solución**: El sistema usa operaciones atómicas, esto no debería ocurrir. Si ocurre:
1. Verificar que el índice único está creado correctamente
2. Verificar logs del servidor
3. Considerar agregar retry logic en el endpoint POST

### Problema: Números no secuenciales después de migración
**Causa**: La migración se ejecutó múltiples veces.
**Solución**:
1. Hacer backup
2. Limpiar la base de datos
3. Ejecutar migración solo UNA vez

### Problema: Prefijo incorrecto
**Causa**: El slug del tenant tiene menos de 3 caracteres o está vacío.
**Solución**:
1. Verificar que todos los tenants tengan un slug válido
2. El hook usa `slice(0, 3)` que funciona incluso con slugs cortos
3. Si el slug es "ab", el prefijo será "AB-"

---

## 📊 Capacidad del Sistema

- **Por tenant**: Hasta 999,999 pedidos (6 dígitos)
- **Si se necesita más**: Modificar el padding de 6 a 7 u 8 dígitos
- **Escalabilidad**: El sistema usa operaciones atómicas, soporta alta concurrencia

---

## 🔒 Seguridad

- ✅ El `orderNumber` NO se puede modificar desde el cliente
- ✅ Se genera automáticamente en el servidor
- ✅ Índice único previene duplicados por tenant
- ✅ Operación atómica previene race conditions

---

## 📝 Notas Adicionales

### ¿Por qué pre('save') y no en el endpoint?
- **Consistencia**: Cualquier forma de crear un Order generará el número
- **Single Responsibility**: El modelo maneja su propia lógica
- **Testeable**: Más fácil de probar

### ¿Por qué OrderCounter separado?
- **Performance**: Una operación atómica por tenant
- **Simplicidad**: Lógica de contador aislada
- **Escalabilidad**: Fácil de optimizar si es necesario

### ¿Qué pasa si falla la generación del número?
- El hook lanzará un error
- El pedido NO se guardará
- Se retornará error 500 al cliente
- Se debe investigar la causa (tenant no existe, etc.)

---

## ✅ Checklist de Deployment

- [ ] Backup de base de datos realizado
- [ ] Script de migración ejecutado en desarrollo
- [ ] Verificación manual de números generados
- [ ] Contadores verificados en `ordercounters` collection
- [ ] Script de migración ejecutado en producción
- [ ] Deploy del backend completado
- [ ] Deploy del frontend completado
- [ ] Prueba de creación de nuevo pedido
- [ ] Prueba de búsqueda por número
- [ ] Verificación visual en todas las vistas
- [ ] Monitoreo de logs por 24-48 horas

---

## 🎉 ¡Implementación Exitosa!

El sistema de numeración correlativa está listo para producción. Los pedidos ahora tienen números profesionales, legibles y únicos por tenant.
