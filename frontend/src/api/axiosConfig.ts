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

    /**
     * 429 NO es 401. Es "aflojá", no "no sos vos".
     *
     * El servidor limita a 200 requests por minuto, así que cualquier carga masiva de a un registro
     * choca contra la ventana. Deslogear ahí es lo peor que se puede hacer: el trabajo se corta a
     * mitad de camino y el síntoma —"se cerró la sesión"— manda a investigar la autenticación, que
     * está perfecta. Se reintenta respetando `Retry-After`, y si no viene, con backoff exponencial.
     *
     * Igual, reintentar es la red de contención: para cargar un catálogo entero está `/bulk`, que lo
     * hace en UN request y no toca la ventana.
     */
    if (error.response?.status === 429) {
      const config = error.config as (typeof error.config & { __reintentos429?: number }) | undefined;
      const intentos = (config?.__reintentos429 ?? 0) + 1;
      const MAX_REINTENTOS = 4;
      if (config && intentos <= MAX_REINTENTOS) {
        config.__reintentos429 = intentos;
        // `Retry-After` (segundos) es lo que el propio limitador dice que hay que esperar; el backoff
        // es el plan B cuando no lo manda: 1s, 2s, 4s, 8s.
        const retryAfter = Number(error.response.headers?.["retry-after"]);
        const esperaMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** (intentos - 1) * 1000;
        console.warn(`429 (límite de tasa) en ${config.url}: reintento ${intentos}/${MAX_REINTENTOS} en ${esperaMs}ms`);
        return new Promise((resolve, reject) => {
          setTimeout(() => axiosInstance(config).then(resolve).catch(reject), esperaMs);
        });
      }
      return Promise.reject(error);
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
