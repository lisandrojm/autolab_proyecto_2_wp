import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL;

// Crear instancia de Axios con configuración base
const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

// --- Cancelación de GET en vuelo al cambiar de ruta ---
// Evita que, al navegar rápido entre páginas (Proyectos / Usuarios / Equipo),
// se apilen consultas pesadas contra el server. Solo se cancelan GET
// (nunca mutaciones POST/PUT/DELETE en curso).
const pendingGetControllers = new Set<AbortController>();

export function cancelPendingGetRequests() {
  pendingGetControllers.forEach((c) => {
    try {
      c.abort();
    } catch {
      /* noop */
    }
  });
  pendingGetControllers.clear();
}

// Interceptor para añadir headers necesarios
axiosInstance.interceptors.request.use(
  (config) => {
    // Añadir token de autenticación
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Añadir tenantId header
    const user = localStorage.getItem("user");
    if (user) {
      try {
        const userData = JSON.parse(user);
        if (userData.tenantId) {
          config.headers["X-Tenant-Id"] = userData.tenantId;
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
      }
    }

    // Set Content-Type to application/json only if not FormData
    // For FormData, let the browser set the Content-Type with boundary
    if (!(config.data instanceof FormData)) {
      config.headers["Content-Type"] = "application/json";
    }

    // Registrar los GET para poder cancelarlos al cambiar de ruta (si no traen signal propio).
    if ((config.method || "get").toLowerCase() === "get" && !config.signal) {
      const controller = new AbortController();
      config.signal = controller.signal;
      (config as any).__getAbortController = controller;
      pendingGetControllers.add(controller);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Interceptor para manejar respuestas de error
axiosInstance.interceptors.response.use(
  (response) => {
    const c = (response.config as any)?.__getAbortController;
    if (c) pendingGetControllers.delete(c);
    return response;
  },
  (error) => {
    const c = (error.config as any)?.__getAbortController;
    if (c) pendingGetControllers.delete(c);

    // Cancelado por navegación (cambio de ruta): silenciar. No mostrar error ni desloguear.
    if (axios.isCancel(error) || error.code === "ERR_CANCELED" || error.name === "CanceledError") {
      return new Promise(() => {}); // la promesa no se resuelve; el componente se está desmontando
    }

    if (error.code === "ECONNABORTED") {
      console.error("Request timeout:", error.config?.url);
      return Promise.reject(new Error("La solicitud tardó demasiado tiempo. Por favor, inténtalo de nuevo."));
    }

    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }

    if (!error.response) {
      console.error("Network error / Server disconnected:", error.message);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login?error=connection";
      }
      return Promise.reject(new Error("Error de conexión. Redirigiendo al login..."));
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
