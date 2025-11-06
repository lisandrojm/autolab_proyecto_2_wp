# Guía de Corrección: Visualización de Imágenes en Gallery Panel

## Problema Resuelto

Las imágenes no se mostraban en el Create Gallery Panel ni en las vistas de Clientes y Usuario debido a:

1. URLs absolutas en la base de datos que no coincidían con el dominio del frontend
2. Falta de procesamiento de URLs en el hook `useAssetGallery`
3. Sin manejo de errores para imágenes que fallaban al cargar
4. Query ineficiente usando regex en URLs

## Cambios Implementados

### 1. Backend - URLs Relativas (server/src/routes/clientAssets.ts)

**ANTES:**
```typescript
const url = `${req.protocol}://${req.get("host")}/storage/${tenantId}/${identifier}/${scope}/${newFilename}`;
```

**DESPUÉS:**
```typescript
const relativePath = `/storage/${tenantId}/${identifier}/${scope}/${newFilename}`;
asset.url = relativePath; // Se guarda URL relativa en DB
```

### 2. Frontend - Helper de Imágenes (frontend/src/utils/imageHelpers.ts)

- Mejorado para procesar URLs relativas y convertirlas a absolutas
- Usa `VITE_API_URL` para construir la URL base del servidor
- Agrega logs detallados para debugging

### 3. Frontend - Hook useAssetGallery (frontend/src/hooks/useAssetGallery.ts)

- Integrado `getImageUrl()` para procesar todas las URLs de assets
- Transforma URLs relativas a absolutas antes de pasarlas al componente

### 4. Frontend - Gallery Panel (frontend/src/components/ui/CreativeGalleryPanel.tsx)

- Manejo de errores con `onError` en etiquetas `<img>`
- Placeholder visual cuando una imagen falla al cargar
- Lazy loading para optimizar performance
- Logs de debugging para identificar problemas

### 5. Backend - Query Optimizado (server/src/routes/clientAssets.ts)

**ANTES:**
```typescript
filter.url = { $regex: `/storage/${tenantId}/${clientId}/` };
```

**DESPUÉS:**
```typescript
filter.clientId = String(clientId); // Usa índice en lugar de regex
```

## Migración de URLs Existentes

Para actualizar las URLs existentes en la base de datos, ejecuta:

```bash
# Desarrollo
cd server
npm run migrate:asset-urls

# Producción
npm run migrate:asset-urls:prod
```

Este script:
- Convierte URLs absolutas a relativas
- Mantiene URLs ya relativas sin cambios
- Muestra resumen de cambios realizados

## Verificación

### 1. Verificar Variables de Entorno

Asegúrate que `VITE_API_URL` esté configurado correctamente:

**frontend/.env.development:**
```
VITE_API_URL=http://localhost:8080/api/v1
```

**frontend/.env.production:**
```
VITE_API_URL=https://tu-dominio.com/api/v1
```

### 2. Verificar Servidor Express

El servidor debe servir archivos estáticos desde `/storage`:

```typescript
// server/src/server.ts (línea 106-107)
const storagePath = path.join(__dirname, "../storage");
app.use("/storage", express.static(storagePath));
```

### 3. Verificar en Consola del Navegador

Cuando cargues el Gallery Panel, deberías ver logs como:

```
[imageHelpers] Server base URL: http://localhost:8080
[getImageUrl] Relative storage URL: /storage/.../asset_xxx.png → http://localhost:8080/storage/.../asset_xxx.png
[useAssetGallery] Transform asset: {...}
[CreativeGalleryPanel] Image loaded successfully: xxx
```

Si ves errores:
```
[CreativeGalleryPanel] Image failed to load: {...}
```

Verifica que:
- El archivo existe físicamente en `server/storage/...`
- La URL construida es correcta
- El servidor está corriendo y accesible

## Testing

### Caso 1: Subir Nueva Imagen

1. Abre el modal de crear post
2. Sube una imagen desde tu computadora
3. La imagen debe aparecer en la galería inmediatamente
4. Verifica en la consola que la URL es relativa

### Caso 2: Cargar Imágenes Existentes

1. Abre cualquier cliente
2. Ve a la vista con Gallery Panel
3. Las imágenes deben mostrarse automáticamente
4. Si alguna falla, debe aparecer el placeholder con "Error al cargar"

### Caso 3: Filtrar por Usuario/Cliente

1. Usa el toggle "Incluir mis assets"
2. La galería debe actualizarse mostrando assets adicionales
3. Todas las imágenes deben renderizar correctamente

## Troubleshooting

### Las imágenes aún no se muestran

1. **Ejecuta la migración de URLs:**
   ```bash
   cd server
   npm run migrate:asset-urls
   ```

2. **Verifica CORS en el servidor:**
   - El servidor debe permitir requests desde el dominio del frontend
   - Revisa `server/src/server.ts` línea 86-100

3. **Verifica que los archivos existen:**
   ```bash
   ls -la server/storage/[tenantId]/client/[clientId]/brandkit/
   ```

4. **Revisa los logs del servidor:**
   - Busca errores relacionados con static files
   - Verifica que express.static esté configurado

### Algunas imágenes cargan, otras no

1. **Compara URLs en la consola:**
   - Las que funcionan vs las que fallan
   - Puede haber inconsistencia en el formato

2. **Verifica permisos de archivos:**
   ```bash
   chmod -R 755 server/storage/
   ```

3. **Revisa la base de datos:**
   - Conecta a MongoDB y verifica el campo `url` de los assets
   - Todas deben empezar con `/storage`

### Performance lento

1. **La query está optimizada** para usar índices en lugar de regex
2. Si aún es lento, verifica los índices de MongoDB:
   ```javascript
   db.assets.getIndexes()
   ```

3. Los índices necesarios están definidos en `server/src/models/Asset.ts`

## Arquitectura de URLs

```
┌─────────────────────────────────────────────────────┐
│ MongoDB Asset Document                              │
│ url: "/storage/tenantId/clientId/scope/file.png"   │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Backend API Response                                │
│ url: "http://domain/storage/tenant/client/file.png"│
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Frontend useAssetGallery Hook                       │
│ getImageUrl("/storage/...")                         │
│ → "http://localhost:8080/storage/..."              │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ CreativeGalleryPanel Component                      │
│ <img src="http://localhost:8080/storage/..." />    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Express Static Middleware                           │
│ app.use("/storage", express.static(...))            │
│ → Sirve archivo físico                             │
└─────────────────────────────────────────────────────┘
```

## Logs Útiles

Para habilitar logs detallados durante el desarrollo, estos ya están implementados:

- `[imageHelpers]` - Procesamiento de URLs
- `[getImageUrl]` - Transformación de URLs
- `[useAssetGallery]` - Carga de assets
- `[CreativeGalleryPanel]` - Renderizado de imágenes
- `[Query Assets]` - Backend query de assets

Para producción, puedes remover estos `console.log` o usar una librería de logging.

## Próximos Pasos (Opcional)

1. **Implementar CDN**: Para mejor performance en producción
2. **Compresión de imágenes**: Al subir, generar thumbnails optimizados
3. **Caché de imágenes**: Implementar service worker para caché offline
4. **Lazy loading avanzado**: Usar Intersection Observer para carga progresiva

---

**Fecha:** 2025-11-01
**Estado:** ✅ Implementado y probado
