# Ejemplos Prácticos de Casos de Uso

## Caso 1: Solicitud de Equipo de Trabajo

### Configuración del Administrador:

```
Nombre: Solicitud de Equipo
Tipo: objeto
Requiere Acción Futura: Sí
Tipo de Acción: Plazo en Días
Texto: "Me comprometo a devolver el equipo si resulta defectuoso en el plazo establecido"
```

### Experiencia del Usuario Móvil:

1. Selecciona categoría "Solicitud de Equipo"
2. Ve estos campos:

   ```
   Título del pedido: [Laptop Dell XPS 15]
   Descripción: [Necesito una laptop para trabajar en el nuevo proyecto]
   Especifica el objeto: [Laptop Dell XPS 15, 16GB RAM, 512GB SSD]

   ━━━ Acción Futura ━━━
   Tipo: Plazo en Días

   Plazo en Días: [15]
   ✓ Fecha límite: 30 de noviembre de 2025

   ☑ Me comprometo a devolver el equipo si resulta defectuoso
     en el plazo establecido *
   ```

3. Marca el checkbox y envía

### Resultado en Base de Datos:

```json
Order:
{
  "title": "Laptop Dell XPS 15",
  "description": "Necesito una laptop para trabajar en el nuevo proyecto",
  "category": "Solicitud de Equipo",
  "categoryId": "673abc...",
  "dynamicValue": "Laptop Dell XPS 15, 16GB RAM, 512GB SSD",
  "actionCompleted": true,
  "status": "pending"
}

FutureAction:
{
  "orderId": "673xyz...",
  "tipoAccionFutura": "plazoDias",
  "descripcionAccion": "Me comprometo a devolver el equipo si resulta defectuoso en el plazo establecido",
  "plazoDias": 15,
  "fechaLimite": "2025-11-30T00:00:00.000Z",
  "estadoAccion": "pendiente",
  "responsableAccion": "usuario"
}
```

---

## Caso 2: Solicitud de Reembolso de Gastos

### Configuración del Administrador:

```
Nombre: Reembolso de Gastos
Tipo: dinero
Requiere Acción Futura: Sí
Tipo de Acción: Presentación de Documento
Texto: "Adjunto comprobantes de gastos válidos"
```

### Experiencia del Usuario Móvil:

1. Selecciona categoría "Reembolso de Gastos"
2. Ve estos campos:

   ```
   Título del pedido: [Gastos de viaje cliente ABC]
   Descripción: [Viaje a Monterrey para reunión con cliente]
   Monto ($): [2500.00]

   ━━━ Acción Futura ━━━
   Tipo: Presentación de Documento

   Documento Requerido: [Facturas y tickets de transporte]
   Fecha Límite (Opcional): [2025-11-20]

   ☑ Adjunto comprobantes de gastos válidos *
   ```

3. Marca el checkbox y envía

### Resultado en Base de Datos:

```json
Order:
{
  "title": "Gastos de viaje cliente ABC",
  "description": "Viaje a Monterrey para reunión con cliente",
  "category": "Reembolso de Gastos",
  "dynamicValue": 2500.00,
  "actionCompleted": true,
  "status": "pending"
}

FutureAction:
{
  "orderId": "673xyz...",
  "tipoAccionFutura": "presentacionDocumento",
  "descripcionAccion": "Adjunto comprobantes de gastos válidos",
  "documentoRequerido": "Facturas y tickets de transporte",
  "fechaLimite": "2025-11-20T00:00:00.000Z",
  "estadoAccion": "pendiente",
  "responsableAccion": "usuario"
}
```

---

## Caso 3: Solicitud de Días de Vacaciones Especiales

### Configuración del Administrador:

```
Nombre: Vacaciones Especiales
Tipo: fecha
Requiere Acción Futura: Sí
Tipo de Acción: Fecha Específica
Texto: "Confirmo que entregaré mis pendientes antes de la fecha indicada"
```

### Experiencia del Usuario Móvil:

1. Selecciona categoría "Vacaciones Especiales"
2. Ve estos campos:

   ```
   Título del pedido: [Vacaciones por trámite personal]
   Descripción: [Necesito resolver un trámite legal importante]
   Fecha: [2025-12-15]

   ━━━ Acción Futura ━━━
   Tipo: Fecha Específica

   Fecha Límite: [2025-12-10]

   ☑ Confirmo que entregaré mis pendientes antes de la
     fecha indicada *
   ```

3. Marca el checkbox y envía

### Resultado en Base de Datos:

```json
Order:
{
  "title": "Vacaciones por trámite personal",
  "description": "Necesito resolver un trámite legal importante",
  "category": "Vacaciones Especiales",
  "dynamicValue": "2025-12-15",
  "actionCompleted": true,
  "status": "pending"
}

FutureAction:
{
  "orderId": "673xyz...",
  "tipoAccionFutura": "fechaEspecifica",
  "descripcionAccion": "Confirmo que entregaré mis pendientes antes de la fecha indicada",
  "fechaLimite": "2025-12-10T00:00:00.000Z",
  "estadoAccion": "pendiente",
  "responsableAccion": "usuario"
}
```

---

## Caso 4: Solicitud de Capacitación Externa

### Configuración del Administrador:

```
Nombre: Capacitación Externa
Tipo: otros
Requiere Acción Futura: Sí
Tipo de Acción: Vencimiento Interno
Texto: "Me comprometo a compartir lo aprendido con el equipo"
```

### Experiencia del Usuario Móvil:

1. Selecciona categoría "Capacitación Externa"
2. Ve estos campos:

   ```
   Título del pedido: [Curso AWS Certified Solutions Architect]
   Descripción: [Curso de certificación AWS para mejorar infraestructura]
   Detalles adicionales: [Curso online de 40 horas, costo $500 USD]

   ━━━ Acción Futura ━━━
   Tipo: Vencimiento Definido Internamente

   ⚠️ Un área interna debe evaluar y asignar una fecha de
   vencimiento. El pedido quedará en estado "En Revisión"
   hasta que se cargue la fecha límite.

   ☑ Me comprometo a compartir lo aprendido con el equipo *
   ```

3. Marca el checkbox y envía

### Resultado en Base de Datos:

```json
Order:
{
  "title": "Curso AWS Certified Solutions Architect",
  "description": "Curso de certificación AWS para mejorar infraestructura",
  "category": "Capacitación Externa",
  "dynamicValue": "Curso online de 40 horas, costo $500 USD",
  "actionCompleted": true,
  "status": "pending"
}

FutureAction:
{
  "orderId": "673xyz...",
  "tipoAccionFutura": "vencimientoInterno",
  "descripcionAccion": "Me comprometo a compartir lo aprendido con el equipo",
  "estadoAccion": "en_revision",
  "responsableAccion": "usuario",
  "quienDefineVencimiento": "area_interna"
}
```

**Nota:** El administrador de RR.HH. o el área correspondiente deberá luego asignar manualmente la fecha límite para esta acción.

---

## Caso 5: Solicitud de Home Office Permanente

### Configuración del Administrador:

```
Nombre: Home Office
Tipo: otros
Requiere Acción Futura: Sí
Tipo de Acción: Sin vencimiento
Texto: "Acepto mantener la productividad y disponibilidad según lo acordado"
```

### Experiencia del Usuario Móvil:

1. Selecciona categoría "Home Office"
2. Ve estos campos:

   ```
   Título del pedido: [Solicitud de trabajo remoto permanente]
   Descripción: [Por motivos de salud necesito trabajar desde casa]
   Detalles adicionales: [Cuento con conexión estable y espacio
                          adecuado para trabajar]

   ━━━ Acción Futura ━━━
   Tipo: Sin vencimiento

   ℹ️ No tiene fecha límite, pero debe ser gestionada y
   marcada como cumplida manualmente.

   ☑ Acepto mantener la productividad y disponibilidad
     según lo acordado *
   ```

3. Marca el checkbox y envía

### Resultado en Base de Datos:

```json
Order:
{
  "title": "Solicitud de trabajo remoto permanente",
  "description": "Por motivos de salud necesito trabajar desde casa",
  "category": "Home Office",
  "dynamicValue": "Cuento con conexión estable y espacio adecuado para trabajar",
  "actionCompleted": true,
  "status": "pending"
}

FutureAction:
{
  "orderId": "673xyz...",
  "tipoAccionFutura": "sinVencimiento",
  "descripcionAccion": "Acepto mantener la productividad y disponibilidad según lo acordado",
  "estadoAccion": "pendiente",
  "responsableAccion": "usuario"
}
```

**Nota:** Esta acción no tiene fecha límite, pero debe ser monitoreada y marcada como cumplida cuando se verifique que el usuario está cumpliendo con el compromiso.

---

## Caso 6: Solicitud con Subcategorías

### Configuración del Administrador:

```
Nombre: Material de Oficina
Tipo: objeto
Subcategorías:
  - Tecnología (laptops, monitores, teclados)
  - Mobiliario (sillas, escritorios, lámparas)
  - Papelería (hojas, carpetas, bolígrafos)
Requiere Acción Futura: Sí
Tipo de Acción: Vencimiento por Sistema
Texto: "Confirmo que el material será usado para fines laborales"
```

### Experiencia del Usuario Móvil:

1. Selecciona categoría "Material de Oficina"
2. Ve estos campos:

   ```
   Subcategoría: [Tecnología]

   Título del pedido: [Monitor adicional 27 pulgadas]
   Descripción: [Necesito un segundo monitor para aumentar productividad]
   Especifica el objeto: [Monitor Dell 27" 4K]

   ━━━ Acción Futura ━━━
   Tipo: Vencimiento Definido por Sistema

   Plazo Predefinido (Días): [7]
   ℹ️ El sistema define automáticamente este plazo según
   reglas internas

   ☑ Confirmo que el material será usado para fines
     laborales *
   ```

3. Marca el checkbox y envía

### Resultado en Base de Datos:

```json
Order:
{
  "title": "Monitor adicional 27 pulgadas",
  "description": "Necesito un segundo monitor para aumentar productividad",
  "category": "Material de Oficina",
  "subcategoryId": "sub_tech",
  "subcategoryLabel": "Tecnología",
  "dynamicValue": "Monitor Dell 27\" 4K",
  "actionCompleted": true,
  "status": "pending"
}

FutureAction:
{
  "orderId": "673xyz...",
  "tipoAccionFutura": "vencimientoSistema",
  "descripcionAccion": "Confirmo que el material será usado para fines laborales",
  "plazoDias": 7,
  "fechaLimite": "2025-11-22T00:00:00.000Z",
  "estadoAccion": "pendiente",
  "responsableAccion": "usuario",
  "quienDefineVencimiento": "sistema"
}
```

---

## Comparación Visual de Tipos de Acción

| Tipo                       | Usuario Ingresa            | Sistema Calcula            | Responsable Define  |
| -------------------------- | -------------------------- | -------------------------- | ------------------- |
| **Plazo en Días**          | Número de días             | Fecha límite automática    | Usuario             |
| **Fecha Específica**       | Fecha límite directa       | Nada                       | Usuario             |
| **Presentación Documento** | Documento + fecha opcional | Nada                       | Usuario             |
| **Vencimiento Sistema**    | Días predefinidos          | Fecha límite automática    | Sistema             |
| **Vencimiento Interno**    | Nada                       | Nada (estado: en_revision) | Área interna        |
| **Sin vencimiento**        | Nada                       | Nada                       | Usuario (sin fecha) |

---

## Resumen de Beneficios

### Para el Administrador:

✅ Configuración flexible y poderosa
✅ Control total sobre los compromisos requeridos
✅ Adaptable a cualquier tipo de proceso interno
✅ Trazabilidad completa de acciones futuras

### Para el Usuario:

✅ Interfaz clara y guiada
✅ Validaciones que previenen errores
✅ Preview visual de fechas calculadas
✅ Experiencia mobile-first optimizada

### Para la Organización:

✅ Cumplimiento de procesos garantizado
✅ Seguimiento automatizado de compromisos
✅ Reducción de pedidos mal gestionados
✅ Datos estructurados para reportes y análisis
