# Troubleshooting

## El frontend muestra "Local | Development" en lugar de "Autolab.fun | Production"

Este problema ocurre cuando el navegador tiene la aplicación cacheada con variables de entorno antiguas.

### Causas posibles:

1. **Cache del navegador**: El navegador cargó una versión antigua de la app
2. **Dev server con variables antiguas**: El servidor se inició antes de los cambios
3. **Hot Module Replacement (HMR)**: Vite no detectó el cambio en variables de entorno

### Soluciones:

#### 1. Hard Refresh en el navegador
Presiona `Ctrl+Shift+R` (Windows/Linux) o `Cmd+Shift+R` (Mac) para forzar la recarga sin cache.

#### 2. Reiniciar el dev server en Bolt.new
1. Detener el servidor actual
2. Ejecutar nuevamente `npm run dev`

#### 3. Verificar la consola del navegador
Abre DevTools (F12) y busca en la consola:
```
=== APP STARTUP ===
🌍 VITE_API_URL: https://autolab.fun:7000/api/v1
🌍 MODE: production
==================
```

Si ves `http://localhost:8080` en lugar de `https://autolab.fun:7000`, el navegador tiene la versión antigua cacheada.

### Verificación:

Después de aplicar las soluciones, deberías ver:

**En la consola del servidor:**
```
🚀 Mode: production
👉 VITE_API_URL: https://autolab.fun:7000/api/v1
```

**En la consola del navegador:**
```
=== APP STARTUP ===
🌍 VITE_API_URL: https://autolab.fun:7000/api/v1
🌍 MODE: production
==================
```

**En la interfaz:**
- Badge: **"Autolab.fun | Production"** 🟣
- Server status: Conectando a `https://autolab.fun:7000`

### ¿Por qué pasa esto?

1. **Variables de entorno son embebidas en build time**: Cuando Vite compila el código, reemplaza `import.meta.env.VITE_API_URL` con el valor real
2. **HMR no detecta cambios en .env**: Si cambias archivos `.env` mientras el servidor está corriendo, HMR no recarga automáticamente
3. **Cache del navegador**: El navegador puede cachear la versión antigua del JavaScript compilado

## Verificar que el servidor está conectado al VPS

1. Abrir DevTools (F12)
2. Ver Network tab
3. Las peticiones deben ir a `https://autolab.fun:7000/api/v1`

## Comandos

- `npm run dev` → Conecta al VPS (producción)
- `npm run dev:local` → Conecta a localhost:8080 (desarrollo local)
- `npm run build` → Compilar para producción
