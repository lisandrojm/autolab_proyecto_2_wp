import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL;

// Crear instancia de Axios con configuración base
const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

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

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Interceptor para manejar respuestas de error
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
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
      console.error("Network error:", error.message);
      return Promise.reject(new Error("Error de conexión. Verifica tu conexión a internet."));
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
