# Mobile App Module

Esta carpeta contiene la aplicación mobile integrada dentro del frontend principal.

## Estructura

```
mobile/
├── AppMobile.tsx       # Punto de entrada principal de la app mobile
├── components/         # Componentes específicos de la app mobile
├── routes/             # Configuración de rutas internas (opcional)
└── README.md          # Esta documentación
```

## Características Actuales

La aplicación mobile actualmente implementa un sistema de vistas basado en permisos:

- **mobile:access** - Permiso base requerido para acceder a la app
- **mobile:coordinator** - Vista completa de gestión y coordinación
- **mobile:collaborator** - Vista básica para colaboradores

## Cómo Reemplazar con Tu App Mobile Existente

### 1. Preparar Tu App Mobile

Si tu app mobile actual tiene su propio proyecto React:

1. Copia todos los componentes a la carpeta `components/`
2. Si tiene rutas internas, configúralas en `routes/`
3. Instala las dependencias necesarias en el `package.json` del frontend (raíz de frontend/)

### 2. Modificar AppMobile.tsx

El archivo `AppMobile.tsx` es el punto de entrada. Reemplaza su contenido manteniendo:

- La importación de `useAuthStore` para acceder a datos del usuario
- La verificación de permisos si es necesaria
- El export default al final

Ejemplo:

```tsx
import React from "react";
import { useAuthStore } from "../../stores/authStore";
import { MiComponentePrincipal } from "./components/MiComponentePrincipal";

const AppMobile: React.FC = () => {
  const { user } = useAuthStore();

  // Tu lógica aquí
  return <MiComponentePrincipal user={user} />;
};

export default AppMobile;
```

### 3. NO Incluir

- ❌ Otro `index.html`
- ❌ Otro `main.tsx` o punto de entrada
- ❌ Llamadas a `ReactDOM.createRoot()`
- ❌ Otro `package.json` o `node_modules`
- ❌ Configuración de Vite o bundler

### 4. SÍ Incluir

- ✅ Componentes React normales
- ✅ Hooks personalizados
- ✅ Utilidades y helpers
- ✅ Tipos TypeScript
- ✅ Estilos (CSS modules, Tailwind, etc.)

## Acceso a Datos del Usuario

Usa el hook `useAuthStore` del proyecto principal:

```tsx
import { useAuthStore } from "../../stores/authStore";

const MiComponente = () => {
  const { user, token, isAuthenticated } = useAuthStore();

  // user.permissions - Array de permisos
  // user.firstName, user.lastName - Datos del usuario
  // user.tenantId - ID del tenant actual

  return <div>Hola {user?.firstName}</div>;
};
```

## Rutas Internas

Si necesitas subrutas dentro de `/mobile/*`, puedes usar React Router:

```tsx
import { Routes, Route } from "react-router-dom";

const AppMobile = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
};
```

Las rutas serán:
- `/mobile` → HomePage
- `/mobile/dashboard` → DashboardPage
- `/mobile/settings` → SettingsPage

## Desarrollo

La app mobile se carga automáticamente cuando ejecutas:

```bash
npm run dev
```

Navega a `http://localhost:5173/mobile` para verla.

## Build

La app mobile se incluye automáticamente en el build:

```bash
npm run build
```

Vite generará chunks separados automáticamente gracias al lazy loading, optimizando el tamaño del bundle.

## Notas Importantes

- Esta app comparte el mismo contexto de autenticación que el resto del frontend
- Usa las mismas variables de entorno (VITE_API_URL, etc.)
- Comparte los mismos stores de Zustand
- Usa el mismo sistema de temas (light/dark)
- Todo se compila en un solo proyecto

## Soporte

Si necesitas ayuda para integrar tu app mobile existente, consulta los siguientes archivos del proyecto principal:

- `src/App.tsx` - Ver cómo se integra la ruta `/mobile`
- `src/stores/authStore.ts` - Sistema de autenticación
- `src/components/ProtectedRoute.tsx` - Protección de rutas
