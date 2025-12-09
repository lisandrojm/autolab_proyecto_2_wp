# Eliminación de OrderCounter

## Resumen de Cambios

Se eliminó completamente el modelo `OrderCounter` y su sistema de secuencias centralizadas. Ahora la generación de números de pedido es completamente dinámica y sin estado compartido.

## Nueva Implementación

### Generación de Números
- **Antes**: Usaba un documento `OrderCounter` por tenant con incremento atómico
- **Ahora**: Consulta el último `orderNumber` y calcula el siguiente dinámicamente
- **Ventaja**: Sin colisiones por contadores duplicados, sin necesidad de sincronización

### Manejo de Race Conditions
El modelo `Order` incluye:
- Mecanismo de retry (hasta 5 intentos)
- Detección de colisiones (error 11000 de MongoDB)
- Backoff aleatorio entre reintentos

### Transacciones
El endpoint de creación de pedidos usa transacciones de MongoDB para garantizar consistencia.

## Script de Limpieza

Para eliminar la colección `ordercounters` de la base de datos:

```bash
cd server
npx tsx src/scripts/cleanOrderCounters.ts
```

Este script:
1. Conecta a la base de datos
2. Verifica si existe la colección `ordercounters`
3. La elimina si existe
4. Confirma la eliminación

## Archivos Modificados

### Creados
- `server/src/scripts/cleanOrderCounters.ts` - Script de limpieza

### Modificados
- `server/src/utils/orderHelpers.ts` - Nueva función `getNextOrderNumber()`
- `server/src/models/Order.ts` - Pre-hook refactorizado con retry logic
- `server/src/routes/orders.ts` - Transacciones en creación de pedidos
- `server/src/scripts/seedOnStart.ts` - Eliminada referencia a OrderCounter
- `server/src/server.ts` - Eliminada sincronización de contadores

### Eliminados
- `server/src/models/OrderCounter.ts`
- `server/src/scripts/syncOrderCounters.ts`
- `server/src/scripts/migrateOrderNumbers.ts`

## Verificación

El proyecto compila correctamente:
```bash
cd server
npm run build
```

## Notas Importantes

- La colección `ordercounters` permanecerá en la base de datos hasta que ejecutes el script de limpieza
- Los pedidos existentes NO se ven afectados
- Los nuevos pedidos se generan sin necesidad de contadores
- El sistema es más robusto ante fallos y race conditions
