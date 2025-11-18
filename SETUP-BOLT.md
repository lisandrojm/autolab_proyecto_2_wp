# Configuración Bolt.new - Frontend Deploy

## Resumen de Cambios

Este proyecto está configurado para hacer deploy desde el **root** del repositorio, pero el código fuente del frontend está en `frontend/`.

## Estructura del Proyecto

```
project/
├── frontend/                 # Código fuente del frontend (React + Vite)
│   ├── src/                 # Componentes, páginas, stores, etc.
│   ├── index.html           # HTML principal
│   ├── .env.development     # Variables de desarrollo
│   └── .env.production      # Variables de producción
├── server/                   # Backend (NO se deploya en Bolt)
├── dist/                     # Build output (generado por Vite)
├── package.json             # Config principal para Bolt
├── vite.config.ts           # Config de Vite (apunta a frontend/)
├── tailwind.config.js       # Config de Tailwind
├── postcss.config.js        # Config de PostCSS
├── .env.development         # Env de desarrollo (copia de frontend/)
└── .env.production          # Env de producción (copia de frontend/)
```

## Comandos Disponibles

### En Bolt.new (desde el root):

```bash
# Comando por defecto - CONECTA AL VPS (modo producción)
npm run dev

# Desarrollo local con proxy (solo para desarrollo local)
npm run dev:local

# Modo producción (igual que dev - conecta al VPS)
npm run prod

# Compilar para producción
npm run build

# Preview del build
npm run preview
```

**⚠️ IMPORTANTE**: El comando `npm run dev` está configurado para conectar al VPS en modo producción, ya que Bolt.new ejecuta este comando por defecto.

## Configuración de vite.config.ts

El archivo `vite.config.ts` en el root tiene la propiedad `root: "frontend"` que le indica a Vite que trabaje desde esa carpeta:

```typescript
export default defineConfig({
  root: "frontend", // ← Trabaja desde frontend/
  build: {
    outDir: "../dist", // ← Output en root/dist/
    emptyOutDir: true,
  },
  // ...
});
```

## Variables de Entorno

### Development Mode (`npm run dev:local`)

Usa `frontend/.env.development`:

```env
VITE_API_URL=http://localhost:8080/api/v1
```

Vite configura un proxy para redirigir `/api/*` al backend local.

### Production Mode (`npm run dev` o `npm run prod`)

Usa `frontend/.env.production`:

```env
VITE_API_URL=https://autolab.fun:4001/api/v1
```

Conecta directamente al backend en el VPS (sin proxy).

## Backend (Server)

El backend corre en un VPS externo y **NO** forma parte del deploy de Bolt.

- **Development**: `http://localhost:8080`
- **Production**: `https://autolab.fun:4001`

## Verificación

Para verificar que todo funciona:

```bash
# 1. Instalar dependencias
npm install

# 2. Compilar
npm run build

# 3. Debería generar dist/ sin errores
ls -la dist/
```

## Notas Importantes

1. **`npm run dev` conecta al VPS en modo producción** - Este es el comando que Bolt ejecuta por defecto
2. Para desarrollo local con proxy, usar `npm run dev:local`
3. Los archivos `.root` son backups de la configuración original y se ignoran en git
4. El build siempre usa las variables de `.env.production` por defecto
5. Bolt.new solo deploya el frontend, el backend debe estar corriendo en el VPS
