# BrandMe Platform

Plataforma simplificada de gestión de campañas de marketing con multi-tenancy.

### Características

- **Multi-tenant**: Soporte para múltiples organizaciones
- **Autenticación JWT**: Sistema seguro de autenticación
- **Gestión de Clientes**: CRUD completo con información detallada
- **Campañas de Marketing**: Planificación y seguimiento
- **Gestión de Publicaciones**: Contenido para redes sociales
- **Tareas y Workflow**: Sistema Kanban para organización
- **Analytics**: Métricas y reportes básicos
- **Responsive Design**: Interfaz adaptable a todos los dispositivos

## Stack Tecnológico

### Backend

--

- **Node.js** con **Express**
- **TypeScript** para tipado estático
- **MongoDB** con **Mongoose**
- **JWT** para autenticación
- **Zod** para validación de datos

### Frontend

- **React 18** con **TypeScript**
- **Vite** como build tool
- **TailwindCSS** para estilos
- **React Router** para navegación
- **React Hook Form** para formularios
- **Zustand** para estado global
- **Font Awesome** para iconos

# Configuración de Deployment

## Frontend (Deploy en Bolt.new)

El proyecto está configurado para trabajar desde el **root** apuntando a la carpeta `frontend/`.

### Comandos disponibles:

```bash
npm run dev        # Comando por defecto - Conecta al VPS (producción)
npm run dev:local  # Desarrollo local con proxy
npm run prod       # Producción (igual que dev - conecta al VPS)
npm run build      # Compilar para producción
```

**⚠️ IMPORTANTE**: Bolt ejecuta `npm run dev` por defecto, que conecta al VPS en modo producción.

**🔄 Si ves "Local | Development"**: Reinicia el dev server para que cargue las variables de `.env.production`. Ver `TROUBLESHOOTING.md`.

### Variables de entorno:

- **Development** (`npm run dev:local`): `.env.development` (proxy a localhost:8080)
- **Production** (`npm run dev` o `npm run prod`): `.env.production` (conecta al VPS externo)

---

## Server (Deploy en VPS externo)

El backend corre independientemente en un VPS y NO se deploya en Bolt.

### Comandos:

- **Local** → `npm run dev`
  Usa `.env.development` → corre **server local** (HTTP :8080).
- **VPS** → `npm run prod`  
  Usa `.env.production` → corre **server VPS** (HTTPS :7001 con Let’s Encrypt).

---

## Frontend (`web`)

- Toma `VITE_API_URL` del `.env` correspondiente según el modo.

### Comandos

- **Local** → `npm run dev`  
  Usa `.env.development` → **frontend local** contra **server local**.
- **Prod (local apuntando a VPS)** → `npm run prod`  
  Usa `.env.production` → **frontend local** contra **server VPS**.

---

## 🔧 Configuración del Tenant

Para cambiar el tenant principal del sistema, debes actualizar las siguientes variables de entorno:

### Backend (server/.env.development y server/.env.production)

```
SEED_TENANT_SLUG=demo-tenant
```

### Frontend (frontend/.env.development y frontend/.env.production)

```
VITE_TENANT_SLUG=demo-tenant
```

Estos valores deben coincidir para que el sistema funcione correctamente. Al cambiar el slug del tenant en la base de datos, actualiza estas variables y reinicia los servicios.

---

## 👤 Creación Automática de Usuario Administrador

Cuando se crea un nuevo tenant (ya sea manualmente desde TenantsPage o mediante registro público), el sistema automáticamente:

1. **Crea un usuario administrador** con el email de contacto del tenant
2. **Asigna la contraseña predeterminada**: `tenant123`
3. **Agrega el usuario al array `userIds`** del tenant
4. **Asigna el rol "admin"** con permisos completos

### Variable de Entorno

```bash
# Server (.env.development y .env.production)
DEFAULT_TENANT_USER_PASSWORD=tenant123
```

Esta contraseña se usa para:

- Usuarios administradores creados automáticamente al crear un tenant
- Registro público de nuevas organizaciones

**⚠️ Importante**: El usuario debe cambiar esta contraseña después del primer login por seguridad.

### Flujo de Registro

Cuando un nuevo cliente hace clic en "Crear cuenta" desde la página de login:

1. Se redirige a `/register` que ahora registra un **tenant completo**
2. Se solicita:
   - Nombre de la empresa
   - Slug único
   - Datos del administrador (nombre, apellido, email, teléfono)
3. El sistema automáticamente:
   - Crea el tenant
   - Crea el rol "admin"
   - Crea el usuario administrador con contraseña `tenant123`
   - Realiza auto-login del usuario

### Flujo de Login Multi-Tenant

El sistema soporta múltiples tenants. Cuando un usuario hace login:

**Caso 1: Email existe en un solo tenant**

- El sistema realiza login automáticamente sin requerir especificar el tenant

**Caso 2: Email existe en múltiples tenants**

- Si no se especifica el tenant, el backend devuelve una lista de tenants disponibles
- El frontend muestra un selector para elegir la organización
- El usuario selecciona y vuelve a hacer login

**Caso 3: Especificar tenant manualmente**

- El formulario de login incluye un campo opcional "Tenant"
- El usuario puede ingresar el slug del tenant directamente
- Útil cuando se conoce el tenant exacto (ej: nuevo tenant creado)

**Para acceder a un nuevo tenant creado:**

1. Ingresa el email del administrador (email de contacto del tenant)
2. Ingresa la contraseña: `tenant123`
3. En el campo "Tenant (opcional)", ingresa el slug del tenant
4. Haz clic en "Sign in"

---

## 🔧 Extra

- También disponible `npm run vps` (frontend) para levantar el front en el VPS con Vite en modo producción, útil para debug rápido.
  .

## PM2

Comandos útiles para `brandme-api`:

Iniciar:

```bash
npx pm2 start brandme-api
```

Ver lista de procesos:

```bash
npx pm2 list
```

Ver logs:

```bash
npx pm2 logs brandme-api
```

Reiniciar la app:

```bash
npx pm2 restart brandme-api
```

Detener la app:

```bash
npx pm2 stop brandme-api
```

Eliminar del monitoreo:

```bash
npx pm2 delete brandme-api
```

Guardar configuración:

```bash
npx pm2 save
```

Si el servidor se reinicia, restaurar con:

```bash
npx pm2 resurrect
```

# Configuración del Deploy Hook de Vercel

Para que el **botón de deploy** aparezca correctamente, sigue estos pasos:

## 1. Obtener tu Deploy Hook URL desde Vercel

1. Ve a tu proyecto en [Vercel](https://vercel.com).
2. Navega a **Settings → Git**.
3. Crea un nuevo **Deploy Hook** (si no tienes uno).
4. Copia la **URL** generada.

## 2. Configurar la variable de entorno

1. Abre el archivo correspondiente en tu frontend:

   ```bash
   /frontend/.env.development
   # o
   /frontend/.env.production
   ```

2. Pega tu URL del hook en la variable:

   ```bash
   VITE_VERCEL_DEPLOY_HOOK_URL=https://api.vercel.com/v1/integrations/deploy/...
   ```

3. Reinicia tu servidor de desarrollo:

   ```bash
   npm run dev
   ```

---

## ✅ **Listo:** el botón de deploy debería estar visible y funcional.

---
