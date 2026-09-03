import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      // Auth
      "auth.login": "Login",
      "auth.logout": "Logout",
      "auth.email": "Email",
      "auth.password": "Password",
      "auth.signIn": "Sign In",
      "auth.welcome": "Welcome back",
      "auth.loginSubtitle": "Sign in to your account to continue",
      "auth.registerSubtitle": "Sign in to your account to continue",
      "auth.invalidCredentials": "Invalid credentials",
      "auth.loginSuccess": "Login successful",

      // Navigation
      "nav.dashboard": "Dashboard",
      "nav.campaigns": "Campaigns",
      "nav.clients": "Clients",
      "nav.tasks": "Tasks",
      "nav.posts": "Posts",
      "nav.analytics": "Analytics",
      "nav.settings": "Settings",

      // Dashboard
      "dashboard.title": "Marketing Dashboard",
      "dashboard.welcome": "Welcome to your marketing platform",
      "dashboard.description": "Manage your campaigns, track performance, and grow your business.",

      // Common
      "common.loading": "Loading...",
      "common.error": "Error",
      "common.success": "Success",
      "common.cancel": "Cancel",
      "common.save": "Save",
      "common.delete": "Delete",
      "common.edit": "Edit",
      "common.create": "Create",
      "common.actions": "Actions",

      // Roles
      "roles.title": "Roles",
      "roles.new": "New Role",
      "roles.edit": "Edit Role",
      "roles.name": "Name",
      "roles.description": "Description",
      "roles.permissions": "Permissions",
      "roles.isDefault": "Default Role",

      // Users
      "users.title": "Users",
      "users.new": "New User",
      "users.edit": "Edit User",
      "users.email": "Email",
      "users.firstName": "First Name",
      "users.lastName": "Last Name",
      "users.isActive": "Active",
      "users.roles": "Roles",
      "users.password": "Password",
    },
  },
  es: {
    translation: {
      // Auth
      "auth.login": "Iniciar sesión",
      "auth.logout": "Cerrar sesión",
      "auth.email": "Email",
      "auth.password": "Contraseña",
      "auth.signIn": "Iniciar sesión",
      "auth.welcome": "Bienvenido",
      "auth.loginSubtitle": "Iniciar sesión",
      "auth.registerSubtitle": "Crea tu cuenta para continuar",
      "auth.invalidCredentials": "Credenciales inválidas",
      "auth.loginSuccess": "Inicio de sesión exitoso",

      // Navigation
      "nav.dashboard": "Panel",
      "nav.campaigns": "Campañas",
      "nav.clients": "Clientes",
      "nav.tasks": "Tareas",
      "nav.posts": "Posts",
      "nav.analytics": "Analíticas",
      "nav.settings": "Configuración",

      // Dashboard
      "dashboard.title": "Panel de Marketing",
      "dashboard.welcome": "Bienvenido a tu plataforma de marketing",
      "dashboard.description": "Gestiona tus campañas, rastrea el rendimiento y haz crecer tu negocio.",

      // Common
      "common.loading": "Cargando...",
      "common.error": "Error",
      "common.success": "Éxito",
      "common.cancel": "Cancelar",
      "common.save": "Guardar",
      "common.delete": "Eliminar",
      "common.edit": "Editar",
      "common.create": "Crear",
      "common.actions": "Acciones",

      // Roles
      "roles.title": "Roles",
      "roles.new": "Nuevo Rol",
      "roles.edit": "Editar Rol",
      "roles.name": "Nombre",
      "roles.description": "Descripción",
      "roles.permissions": "Permisos",
      "roles.isDefault": "Rol por Defecto",

      // Users
      "users.title": "Usuarios",
      "users.new": "Nuevo Usuario",
      "users.edit": "Editar Usuario",
      "users.email": "Email",
      "users.firstName": "Nombre",
      "users.lastName": "Apellido",
      "users.isActive": "Activo",
      "users.roles": "Roles",
      "users.password": "Contraseña",
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: import.meta.env.VITE_DEFAULT_LOCALE || "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  // evita warnings si usás Suspense=false
  react: { useSuspense: false },
});

export default i18n;
