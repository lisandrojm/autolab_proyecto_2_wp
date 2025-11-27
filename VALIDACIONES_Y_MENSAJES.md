# Validaciones y Mensajes del Sistema

## Validaciones Frontend (App Móvil)

### 1. Validación de Categoría

**Condición:** Usuario no ha seleccionado ninguna categoría
**Validación:** Campo `required` en el select
**Mensaje:** (Mensaje nativo del navegador)

---

### 2. Validación de Título

**Condición:** Campo vacío
**Validación:** `required` + `minLength: 1`
**Mensaje:** (Mensaje nativo del navegador)

---

### 3. Validación de Descripción

**Condición:** Campo vacío
**Validación:** `required` + `minLength: 1`
**Mensaje:** (Mensaje nativo del navegador)

---

### 4. Validación de Campo Dinámico según Tipo

#### Tipo: Fecha

**Condición:** No se seleccionó fecha
**Validación:** `required` en input tipo date
**Mensaje:** (Mensaje nativo del navegador)

#### Tipo: Dinero

**Condición:** Monto inválido o negativo
**Validación:** `required` + `min: 0` + `step: 0.01`
**Mensaje:** (Mensaje nativo del navegador)

#### Tipo: Objeto

**Condición:** Campo vacío
**Validación:** `required` + texto
**Mensaje:** (Mensaje nativo del navegador)

#### Tipo: Otros

**Condición:** Campo vacío
**Validación:** `required` + textarea
**Mensaje:** (Mensaje nativo del navegador)

---

### 5. Validación de Plazo en Días

**Condición:** Valor fuera del rango 1-365

```typescript
<input type="number" min="1" max="365" required value={futureActionPlazoDias || ""} onChange={(e) => onFutureActionPlazoDiasChange?.(parseInt(e.target.value) || 0)} />
```

**Mensajes:**

- Campo vacío: "Por favor, rellena este campo"
- Menor a 1: "El valor debe ser mayor o igual que 1"
- Mayor a 365: "El valor debe ser menor o igual que 365"

**Preview Visual:**

```
✓ Fecha límite: 25 de noviembre de 2025
```

Aparece automáticamente cuando el usuario ingresa un valor válido.

---

### 6. Validación de Fecha Límite

**Condición:** Fecha anterior a hoy

```typescript
<input type="date" required min={new Date().toISOString().split("T")[0]} value={futureActionFechaLimite || ""} />
```

**Mensaje:** "El valor debe ser mayor o igual que [fecha de hoy]"

---

### 7. Validación de Documento Requerido

**Condición:** Campo vacío para tipo "presentacionDocumento"

```typescript
<input type="text" required value={futureActionDocumento || ""} placeholder="Ej: DNI escaneado, Certificado médico..." />
```

**Mensaje:** "Por favor, rellena este campo"

---

### 8. Validación de Checkbox Obligatorio

**Condición:** Checkbox no marcado cuando `requiresAction = true`

```typescript
<input type="checkbox" checked={actionCompleted} onChange={(e) => onActionCompletedChange(e.target.checked)} required />
```

**Mensaje Visual (antes de enviar):**

```
⚠️ Debes marcar este compromiso para continuar
```

**Mensaje al intentar enviar:**
"Marca esta casilla si deseas continuar"

---

## Validaciones Backend (API)

### 1. Validación de Schema Zod

```typescript
const createOrderSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().default("other"),
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  subcategoryLabel: z.string().optional(),
  actionCompleted: z.boolean().optional(),
  dynamicValue: z.any().optional(),
  amount: z.number().min(0).optional(),
  photoUrl: z.string().optional(),
  futureActionPlazoDias: z.number().min(1).max(365).optional(),
  futureActionFechaLimite: z.string().optional(),
  futureActionDocumento: z.string().optional(),
});
```

**Errores posibles:**

```json
{
  "error": "Invalid data",
  "details": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "number",
      "inclusive": true,
      "exact": false,
      "message": "Number must be greater than or equal to 1",
      "path": ["futureActionPlazoDias"]
    }
  ]
}
```

---

### 2. Validación de Categoría Activa

**Condición:** Categoría no existe o está inactiva

```typescript
const category = await OrderCategory.findOne({
  _id: data.categoryId,
  tenantId: req.tenantObjectId,
  isActive: true,
});

if (!category) {
  res.status(400).json({ error: "Invalid or inactive category" });
  return;
}
```

**Respuesta Error:**

```json
{
  "error": "Invalid or inactive category"
}
```

---

### 3. Validación de Subcategoría

**Condición:** Subcategoría no existe en la configuración de la categoría

```typescript
if (data.subcategoryId && category.config?.subtipos) {
  const subtypeExists = category.config.subtipos.some((st: any) => st.id === data.subcategoryId);
  if (!subtypeExists) {
    res.status(400).json({ error: "Invalid subcategory for this category" });
    return;
  }
}
```

**Respuesta Error:**

```json
{
  "error": "Invalid subcategory for this category"
}
```

---

### 4. Validación de Tipo de Archivo (Foto)

**Condición:** Archivo no es una imagen válida

```typescript
fileFilter: (_req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error("Solo se permiten imágenes (jpeg, jpg, png, gif, webp)"));
};
```

**Respuesta Error:**

```json
{
  "error": "Solo se permiten imágenes (jpeg, jpg, png, gif, webp)"
}
```

---

### 5. Validación de Tamaño de Archivo

**Condición:** Archivo mayor a 10MB

```typescript
limits: {
  fileSize: 10 * 1024 * 1024;
}
```

**Respuesta Error:**

```json
{
  "error": "File too large"
}
```

---

## Mensajes de Éxito

### Frontend

Cuando el pedido se crea exitosamente, el formulario:

1. Se cierra automáticamente
2. Limpia todos los campos
3. Agrega el nuevo pedido al inicio de la lista
4. No muestra mensaje explícito (el nuevo item en la lista es la confirmación visual)

### Backend

**Respuesta de Éxito:**

```json
{
  "_id": "673abc...",
  "tenantId": "670xyz...",
  "userId": "671def...",
  "title": "Laptop Dell XPS 15",
  "description": "Necesito una laptop para trabajar en el nuevo proyecto",
  "category": "Solicitud de Equipo",
  "categoryId": "673abc...",
  "dynamicValue": "Laptop Dell XPS 15, 16GB RAM, 512GB SSD",
  "actionCompleted": true,
  "status": "pending",
  "requestedAt": "2025-11-15T10:30:00.000Z",
  "createdAt": "2025-11-15T10:30:00.000Z",
  "updatedAt": "2025-11-15T10:30:00.000Z"
}
```

---

## Mensajes Informativos en la UI

### 1. Para Plazo en Días

```
ℹ️ El sistema calculará automáticamente la fecha límite
```

Color: Gris claro (`text-slate-500`)

**Cuando hay valor válido:**

```
✓ Fecha límite: 25 de noviembre de 2025
```

Color: Verde (`text-green-600`)

---

### 2. Para Vencimiento Sistema

```
ℹ️ El sistema define automáticamente este plazo según reglas internas
```

Color: Gris claro (`text-slate-500`)

---

### 3. Para Vencimiento Interno

```
⚠️ Un área interna debe evaluar y asignar una fecha de vencimiento.
   El pedido quedará en estado "En Revisión" hasta que se cargue
   la fecha límite.
```

Color: Amarillo (`bg-yellow-50`, `text-yellow-900`)
Estilo: Fondo amarillo suave con borde amarillo

---

### 4. Para Sin Vencimiento

```
ℹ️ No tiene fecha límite, pero debe ser gestionada y marcada
   como cumplida manualmente.
```

Color: Azul (`bg-blue-50`, `text-blue-900`)
Estilo: Fondo azul suave con borde azul

---

### 5. Para Checkbox Obligatorio (no marcado)

```
⚠️ Debes marcar este compromiso para continuar
```

Color: Ámbar (`text-orange-600`)
Tamaño: Pequeño (`text-xs`)

---

## Resumen de Estados de Validación

| Campo          | Validación Frontend   | Validación Backend    | Mensaje Visual                 |
| -------------- | --------------------- | --------------------- | ------------------------------ |
| Título         | required              | minLength: 1          | Nativo del navegador           |
| Descripción    | required              | minLength: 1          | Nativo del navegador           |
| Categoría      | required              | Existe y activa       | "Invalid or inactive category" |
| Subcategoría   | required (si hay)     | Existe en config      | "Invalid subcategory..."       |
| Campo Dinámico | required (según tipo) | z.any()               | Nativo del navegador           |
| Plazo Días     | min: 1, max: 365      | min: 1, max: 365      | "Number must be..."            |
| Fecha Límite   | min: hoy              | ISO string            | Nativo del navegador           |
| Documento      | required (si aplica)  | string                | Nativo del navegador           |
| Checkbox       | required              | boolean               | "Debes marcar este compromiso" |
| Foto           | image/\*              | jpeg/jpg/png/gif/webp | "Solo se permiten imágenes..." |
| Tamaño Foto    | -                     | max: 10MB             | "File too large"               |

---

## Experiencia de Usuario (UX)

### Estados de Carga

1. **Cargando categorías:**

   ```
   Cargando categorías...
   ```

   Mostrado en el select mientras se obtienen las categorías del backend.

2. **Sin categorías disponibles:**

   ```
   ❌ No hay categorías disponibles. Contacta al administrador.
   ```

   Fondo rojo suave, texto rojo.

3. **Enviando formulario:**

   ```
   Botón: "Enviando..."
   Estado: disabled
   ```

4. **Error al enviar:**
   ```
   ⚠️ [Mensaje de error del backend]
   ```
   Alert box rojo en la parte superior del formulario.

### Feedback Visual Positivo

- ✓ **Verde**: Confirmación de fecha calculada correctamente
- ✓ **Animación**: Smooth scroll al crear el pedido
- ✓ **Lista actualizada**: El nuevo pedido aparece arriba instantáneamente

### Feedback Visual de Advertencia

- ⚠️ **Amarillo**: Campo obligatorio no completado
- ⚠️ **Amarillo**: Información importante sobre vencimiento interno

### Feedback Visual de Error

- ❌ **Rojo**: Categoría no disponible
- ❌ **Rojo**: Error de red o del servidor
- ❌ **Rojo**: Archivo no válido o muy grande

---

## Testing de Validaciones

### Test 1: Enviar formulario vacío

**Resultado esperado:** No se envía, muestra errores nativos en campos obligatorios

### Test 2: Plazo en días = 0

**Resultado esperado:** Error: "El valor debe ser mayor o igual que 1"

### Test 3: Plazo en días = 400

**Resultado esperado:** Error: "El valor debe ser menor o igual que 365"

### Test 4: Fecha límite = ayer

**Resultado esperado:** Error: "El valor debe ser mayor o igual que [hoy]"

### Test 5: Checkbox no marcado

**Resultado esperado:** No se envía, mensaje: "Marca esta casilla si deseas continuar"

### Test 6: Archivo de 15MB

**Resultado esperado:** Error del frontend: "La imagen debe ser menor a 10MB"

### Test 7: Archivo PDF en lugar de imagen

**Resultado esperado:** Error del backend: "Solo se permiten imágenes..."

### Test 8: Categoría válida con datos correctos

**Resultado esperado:** ✅ Pedido creado, FutureAction creada, formulario cerrado, lista actualizada

---

## Conclusión

El sistema implementa **validaciones en múltiples capas**:

1. **HTML5 native validation** - Primera línea de defensa
2. **React state validation** - Feedback visual inmediato
3. **Zod schema validation** - Validación robusta en backend
4. **Business logic validation** - Reglas de negocio específicas

Esto garantiza:

- ✅ Datos consistentes en la base de datos
- ✅ Experiencia de usuario clara y sin frustración
- ✅ Seguridad contra datos maliciosos
- ✅ Feedback apropiado en cada etapa del proceso
