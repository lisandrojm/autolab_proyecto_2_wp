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

---

# Liquidación de novedades a Memosoft

Convierte los partes diarios de asistencia en el archivo de importación de Memosoft, el sistema de
sueldos. Memosoft corre en escritorio y **no tiene API**: el XLSX es el contrato de integración, así
que nada de esto escribe en Memosoft ni automatiza su interfaz.

Se construye por fases. **Hoy está terminada la fase 0**, que no calcula ningún concepto todavía:
resuelve quién entra en un período, con qué legajo, en qué empresa, en qué centro de costo y bajo
qué régimen.

## Correr una liquidación de punta a punta

### 1. Preparar los datos (una sola vez)

```bash
cd server
npx tsx src/scripts/liquidacionFase0.ts <tenantId>              # simula: no escribe nada
npx tsx src/scripts/liquidacionFase0.ts <tenantId> --aplicar    # aplica y deja respaldo
```

En modo simulación imprime la tabla de resolución agrupada por nombre de contrato distinto —26
nombres para 7.462 contratos—, así que se revisa 26 veces y no 7.462. **Mirar esa tabla antes de
aplicar**: lo que dice `SIN RESOLVER` se carga a mano, porque el motor no adivina.

`--aplicar` deja un JSON de respaldo en `server/migraciones-respaldo/` y lo dice al terminar. Para
volver atrás:

```bash
npx tsx src/scripts/liquidacionFase0.ts --revertir "<archivo de respaldo>"
```

### 2. Mirar el padrón del período

```
GET /api/v1/liquidacion/padron?periodo=2026-08
GET /api/v1/liquidacion/padron?periodo=2026-08&regimen=mensual
GET /api/v1/liquidacion/validacion?periodo=2026-08
```

Filtros: `periodo` (obligatorio, `AAAA-MM`), `empresaId`, `ccCodigo`, `tipoContratoId`, `projectId`,
`rolFrame`, `regimen`. Piden `admin_contracts:view`.

Devuelve `filas` con lo resuelto y `excepciones` con lo que no. **Las dos cosas siempre**: un padrón
que sólo muestra lo que salió bien esconde exactamente lo que hay que ir a arreglar. `/validacion` es
el mismo cálculo agrupado por motivo, para mirar antes de liquidar sin bajarse las 582 filas.

Desde la línea de comandos, sin levantar el server:

```bash
npx tsx src/scripts/verificarPadron.ts <tenantId> 2026-08
```

### 3. El catálogo de conceptos

```
GET /api/v1/liquidacion/conceptos?empresaId=<id>
```

Los 29 códigos de Memosoft con, para cada uno, cuál de los dos parámetros usa y si lo que va ahí es
una cantidad de días o un importe. Es **por empresa**: los códigos de 2030 y FZERO no son un
estándar de Memosoft.

### 4. El mapeo: qué concepto genera cada motivo

**Configuración → Novedades → tab "Liquidación".** Ahí RRHH cambia a qué concepto del recibo va cada
motivo, sin tocar código.

Dos cosas que conviene saber antes de usarla:

- **Guardar no pisa lo anterior.** Lo que regía queda cerrado el día previo y lo nuevo arranca hoy,
  así volver a liquidar un mes viejo sigue usando las reglas de ese mes. Cada motivo muestra su
  historial.
- **Las horas extra no se configuran por motivo.** Se liquidan haya o no novedad, así que son una
  regla global, arriba de todo en esa misma pantalla.

Para cargar el mapeo inicial de una vez, en lugar de treinta líneas a mano:

```bash
npx tsx src/scripts/liquidacionFase1.ts <tenantId>              # simula
npx tsx src/scripts/liquidacionFase1.ts <tenantId> --aplicar    # carga y deja respaldo
npx tsx src/scripts/liquidacionFase1.ts --revertir "<respaldo>"
```

No pisa ningún motivo que ya tenga efectos vigentes. Y deja **sin mapear** tres cosas a propósito,
que son decisiones pendientes y no olvidos: la licencia por vacaciones (no hay código confirmado),
el motivo "Horas Extras y Feriados" (lo cubre la regla global; mapearlo además duplicaría el 0015) y
el titular de "Sin Goce de Sueldo" (el catálogo pide un importe y de un parte salen días).

### 5. Correr la liquidación del período

```
POST /api/v1/liquidacion/corridas          { "periodo": "2026-08" }
POST /api/v1/liquidacion/corridas?previsualizar=1   # calcula y devuelve sin guardar
GET  /api/v1/liquidacion/corridas?periodo=2026-08
GET  /api/v1/liquidacion/corridas/<id>?hoja=<nombre de hoja>
```

**Reliquidar no pisa**: cada corrida es un documento nuevo, con sus números, sus excepciones y la
fecha del mapeo con que se calculó. Así se puede contestar "¿qué mandamos el mes pasado?" sin
depender de que alguien haya guardado el archivo.

Cada fila guarda **de qué eventos salió** (`eventIds`) y cuántos días la componen. Es lo único que
permite contestar "¿por qué acá dice 17 y no 18?" sin volver a correr todo.

Para ver qué daría sin escribir nada en la base, con el mapeo semilla en memoria:

```bash
npx tsx src/scripts/verificarCorrida.ts <tenantId> 2026-08
npx tsx src/scripts/verificarCorrida.ts <tenantId> 2026-08 --sin-jornal-base
```

### Tres reglas del motor que no se negocian

- **Nada se infiere por descarte.** Una ausencia sin efecto configurado no se convierte en
  "Inasistencia Injustificada": va al anexo.
- **Las horas extra sin discriminar no se reparten.** El 98% de las horas cargadas está sólo en
  `overtimeHours`, sin decir si son al 50% o al 100%. Mandarlas todas al 50% cambiaría lo que cobra
  la gente, así que quedan anotadas para que alguien las clasifique.
- **Un motivo mapeado para no emitir nada no es lo mismo que uno sin configurar.** El primero está
  decidido y no avisa; el segundo avisa en cada corrida hasta que se resuelva.

## Tests

```bash
npm run test:liquidacion           # de qué empresa es el contrato y bajo qué régimen se liquida
npm run test:liquidacion-efectos   # qué efectos rigen ese día, si el mapeo es válido, y los nombres
npm run test:liquidacion-motor     # normalizar, codificar y agregar
```

## Lo que todavía no está

Fases 3 a 5: los tres archivos XLSX (planilla de control, import y anexo de excepciones) y el cruce
con el reloj presencial. El cálculo ya está; falta escribirlo en disco.
