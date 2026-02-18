# Explicación del Guardado y Control de Días por Tipo de Pedido

Este documento detalla cómo el sistema gestiona, guarda y controla los días solicitados para cada tipo de pedido (ej. "Día de Estudio", "Mudanza", etc.) por usuario.

## 1. Modelo de Datos (`Order`)

Cada vez que un usuario crea un pedido que implica una solicitud de días (categoría tipo "fecha"), se guarda un registro en la base de datos con la siguiente información clave:

- **`categoryId`**: Identifica el tipo de pedido (ej. el ID de la categoría "Día de Estudio").
- **`subcategories`**: (Opcional) Si la categoría tiene subtipos (ej. examen final vs parcial), se guarda el ID de la subcategoría seleccionada.
- **`daysRequested`**: **Este es el campo principal.** Al crear el pedido, el sistema calcula automáticamente la cantidad de días hábiles entre la "Fecha Desde" y "Fecha Hasta" solicitadas y guarda este número.
- **`status`**: El estado del pedido (`pending`, `approved`, `delivered`, etc.). Solo los pedidos activos (no rechazados ni cancelados) suman al conteo de días utilizados.
- **`userId`**: El usuario que realizó el pedido.

### Ejemplo de un registro en Base de Datos:

```json
{
  "_id": "order123",
  "userId": "user456",
  "categoryId": "cat_dia_estudio", // ID de la configuración "Día de Estudio"
  "status": "approved",
  "daysRequested": 2, // El usuario pidió 2 días en esta solicitud
  "requestedAt": "2024-03-20T10:00:00.000Z"
}
```

## 2. Configuración (`OrderConfig`)

Los límites de días se definen en la configuración de cada tipo de pedido.

- **`maxDays`**: El número máximo de días permitidos por año para esta categoría en total.
- **`subtipos`**: Si la categoría tiene opciones, cada opción puede tener su propio `maxDays`.

## 3. Lógica de Cálculo de Días Restantes

El sistema no guarda un campo "días restantes" en el usuario que se vaya restando. En su lugar, realiza un **cálculo en tiempo real** cada vez que se necesita saber el saldo. Esto evita errores de sincronización.

El proceso es el siguiente:

1.  **Obtener Límite (`maxDays`)**: Se consulta la configuración (`OrderConfig`) para saber cuántos días están permitidos para esa categoría (o subcategoría).
2.  **Calcular Días Usados (`usedDays`)**:
    - El sistema busca **todos** los pedidos de ese usuario que coincidan con el `categoryId`.
    - Filtra solo los pedidos que sean del año actual.
    - Filtra solo los pedidos con estado "activo" (pendientes, aprobados, entregados).
    - Suma el valor del campo `daysRequested` de todos esos pedidos.
3.  **Calcular Restantes**:
    - `Días Restantes = maxDays - usedDays`

### Ejemplo Práctico:

1.  **Configuración**: La categoría "Día de Estudio" permite **10 días al año**.
2.  **Historial del Usuario**:
    - Pedido A (Enero): 2 días (Aprobado)
    - Pedido B (Marzo): 1 día (Pendiente)
    - Pedido C (Abril): 3 días (Rechazado) -> _No cuenta_
3.  **Cálculo**:
    - Total Usado = 2 (Pedido A) + 1 (Pedido B) = **3 días**.
    - Restantes = 10 (Límite) - 3 (Usados) = **7 días**.

## 4. Bloqueo en el Calendario

Para evitar que el usuario pida más días de los que le quedan, el componente de selección de fechas (`DynamicCategoryInput`) utiliza este valor de `Restantes`:

- **Si `Restantes` > 0**: El calendario permite seleccionar un rango de fechas, pero la duración máxima del rango se limita automáticamente a este número. Por ejemplo, si quedan 7 días, no dejará seleccionar un rango de 8 días.
- **Si `Restantes` <= 0**: El calendario se deshabilita y se muestra un mensaje indicando que no hay días disponibles.
