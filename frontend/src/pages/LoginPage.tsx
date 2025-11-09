import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Logo } from "../components/ui/Logo";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRightToBracket, faGlobe, faMoon, faSun, faMagicWandSparkles, faCheckCircle, faTimesCircle, faEye, faEyeSlash, faBuilding } from "@fortawesome/free-solid-svg-icons";

// ===== Validación =====
const loginWithClientSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  tenantSlug: z.string().optional(),
  clientId: z.string().optional(),
});
type LoginForm = z.infer<typeof loginWithClientSchema>;

interface ClientOption {
  _id: string;
  name: string;
  slug?: string;
}

interface TenantOption {
  _id: string;
  name: string;
  slug: string;
}
interface DemoUser {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roles: {
    _id: string;
    name: string;
    description?: string;
  }[];
  isActive: boolean;
  tenant?: {
    _id: string;
    name: string;
    slug: string;
  };
}

// ===== Página de Login =====
export const LoginPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastErrorObj, setLastErrorObj] = useState<any>(null);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [availableClients, setAvailableClients] = useState<ClientOption[]>([]);
  const [showClientSelector, setShowClientSelector] = useState(false);
  const [availableTenants, setAvailableTenants] = useState<TenantOption[]>([]);
  const [showTenantSelector, setShowTenantSelector] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginWithClientSchema),
    defaultValues: {
      // ← No precargar credenciales
      email: "",
      password: "",
      tenantSlug: "",
      clientId: "",
    },
  });

  const watchedEmail = watch("email");

  // Cargar usuarios demo al montar el componente
  useEffect(() => {
    fetchDemoUsers();
  }, []);

  // Verificar clientes disponibles cuando cambia el email
  useEffect(() => {
    if (watchedEmail && watchedEmail.includes("@")) {
      checkClientsForEmail(watchedEmail);
    } else {
      setAvailableClients([]);
      setShowClientSelector(false);
    }
  }, [watchedEmail]);

  const fetchDemoUsers = async () => {
    setLoadingUsers(true);
    try {
      const usersResponse = await fetch(`${import.meta.env.VITE_API_URL}/auth/demo-users`);

      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        const allUsers = usersData.users || [];
        console.log("📋 Usuarios cargados desde todos los tenants:", allUsers.length);
        setDemoUsers(allUsers);
      } else {
        console.warn("Error al cargar usuarios desde la DB");
        setDemoUsers([]);
      }
    } catch (error) {
      console.error("No se pudieron cargar los usuarios demo:", error);
      setDemoUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const extractApiError = (err: any): string => {
    const isProduction = import.meta.env.PROD;

    if (err?.isAxiosError) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message || "";

      if (isProduction) {
        if (status === 401 || status === 403) {
          return "Correo electrónico o contraseña incorrectos";
        }
        if (status === 404) {
          return "Usuario no encontrado";
        }
        if (status === 500 || status === 503) {
          return "El servidor no está disponible. Intenta nuevamente en unos momentos";
        }
        if (!status) {
          return "No se pudo conectar con el servidor";
        }
        return "Ocurrió un error al iniciar sesión. Verifica tus credenciales";
      }
      return `[${status ?? "ERR"}] ${msg}`;
    }

    if (err?.__api) {
      const status = err.status ?? "ERR";
      const msg = err.data?.message || err.message || "";

      if (isProduction) {
        if (status === 401 || status === 403) {
          return "Correo electrónico o contraseña incorrectos";
        }
        if (status === 404) {
          return "Usuario no encontrado";
        }
        return "Error de autenticación. Verifica tus credenciales";
      }

      return `[${status}] ${msg}`;
    }

    if (err instanceof TypeError && /fetch/i.test(String(err))) {
      if (isProduction) {
        return "No se pudo conectar con el servidor. Verifica tu conexión a internet";
      }
      return "Network error (¿CORS? ¿URL del API correcta? ¿Servidor caído?)";
    }

    if (isProduction) {
      return "Ocurrió un error inesperado. Por favor, intenta nuevamente";
    }

    return err?.message || "Unexpected error";
  };

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setError("");
    setLastErrorObj(null);
    try {
      const result = await login(data.email, data.password, data.tenantSlug, data.clientId);

      if (result?.requiresTenantSelection && result.tenants) {
        setAvailableTenants(result.tenants);
        setShowTenantSelector(true);
        setError("Este email existe en múltiples tenants. Por favor selecciona uno.");
        setIsLoading(false);
        return;
      }

      // === Redirección automática ===
      // Si el backend envía redirectTo, usar ese valor
      if (result?.redirectTo) {
        window.location.href = result.redirectTo;
        return;
      }

      // === Redirección según rol (fallback) ===
      // Intentamos tomar del resultado y, si no, del estado actual del store
      const rolesFromResult: any[] = (result?.user?.roles as any[]) || (useAuthStore.getState().user?.roles as any[]) || [];

      const isSuperadmin = Array.isArray(rolesFromResult) ? rolesFromResult.some((r) => (typeof r === "string" ? r : r?.name)?.toLowerCase() === "superadmin") : false;

      navigate(isSuperadmin ? "/tenants" : "/users");
    } catch (err: any) {
      console.error("[login:error]", err);
      setLastErrorObj(err);
      const msg = extractApiError(err);
      setError(msg || t("auth.invalidCredentials"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLanguageToggle = () => {
    const newLang = i18n.language === "en" ? "es" : "en";
    i18n.changeLanguage(newLang);
  };

  const autofill = (user: DemoUser) => {
    setValue("email", user.email, { shouldValidate: true });

    // Establecer el tenant del usuario seleccionado
    if (user.tenant?.slug) {
      setValue("tenantSlug", user.tenant.slug, { shouldValidate: true });
    }

    const demoPasswords: Record<string, string> = {
      "superadmin@example.com": "superadmin123",
      "admin@example.com": "admin123",
      "manager@example.com": "manager123",
      "user@example.com": "user123",
      "cliente@example.com": "changeme",
    };
    const password = demoPasswords[user.email] || "tenant123";
    setValue("password", password, { shouldValidate: true });
  };

  const checkClientsForEmail = async (_email: string) => {
    // Esta función ahora no se usa, se maneja en el login
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-accent-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      {/* Controles globales */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          {/* <button onClick={handleLanguageToggle} className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all duration-200" title="Toggle Language">
            <FontAwesomeIcon icon={faGlobe} className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          </button> */}
          <button onClick={toggleTheme} className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all duration-200" title="Toggle Theme">
            {theme === "light" ? <FontAwesomeIcon icon={faMoon} className="h-5 w-5 text-gray-600" /> : <FontAwesomeIcon icon={faSun} className="h-5 w-5 text-gray-300" />}
          </button>
        </div>
      </div>

      {/* Card de login */}
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 shadow-xl rounded-2xl p-8 animate-slide-up">
          <div className="text-center mb-4">
            <div className="flex justify-center items-center">
              <Logo sizeClass="text-3xl" />
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">{t("auth.loginSubtitle")}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" autoComplete="off">
            {/* Tenant Selector - solo cuando hay múltiples tenants */}
            {showTenantSelector && availableTenants.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <FontAwesomeIcon icon={faBuilding} className="h-4 w-4 mr-2" />
                  Selecciona tu organización
                </label>
                <select
                  {...register("tenantSlug")}
                  className="input-field"
                  required
                  onChange={(e) => {
                    setValue("tenantSlug", e.target.value);
                    setShowTenantSelector(false);
                  }}
                >
                  <option value="">Seleccionar organización...</option>
                  {availableTenants.map((tenant) => (
                    <option key={tenant._id} value={tenant.slug}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("auth.email")}</label>
              <input {...register("email")} type="email" className="input-field" placeholder="admin@example.com" autoComplete="username" />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("auth.password")}</label>
              <div className="relative">
                <input {...register("password")} type={showPassword ? "text" : "password"} className="input-field pr-10" placeholder="••••••••" autoComplete="current-password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>}
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-800 dark:border-red-800 rounded-lg">
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>

                {/* Solo en desarrollo: ver objeto de error completo */}
                {import.meta.env.DEV && lastErrorObj && (
                  <details className="mt-2 rounded border border-red-500 p-2 text-red-200">
                    <summary className="cursor-pointer text-xs text-red-200">Detalles del error (solo dev)</summary>
                    <pre className="mt-2 max-h-56 overflow-auto text-[10px] leading-4">{JSON.stringify(lastErrorObj, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}

            {/* Client Selector */}
            {showClientSelector && availableClients.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <FontAwesomeIcon icon={faBuilding} className="h-4 w-4 mr-2" />
                  Cliente
                </label>
                <select {...register("clientId")} className="input-field" required={availableClients.length > 1}>
                  {availableClients.length > 1 && <option value="">Seleccionar cliente...</option>}
                  {availableClients.map((client) => (
                    <option key={client._id} value={client._id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button type="submit" disabled={isLoading} className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? t("common.loading") : t("auth.signIn")}
            </button>
          </form>

          {/* --- Usuarios disponibles --- */}
          <div className="mt-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              ¿No tienes cuenta?{" "}
              <Link to="/register" className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300">
                Crear cuenta
              </Link>
            </p>
          </div>

          {/* Solo mostrar usuarios disponibles en modo development */}
          {import.meta.env.DEV && demoUsers.length > 0 && (
            <div className="mt-4">
              <details className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">Usuarios disponibles ({demoUsers.length})</summary>
                <div className="p-4 space-y-3">
                  {demoUsers.map((user) => (
                    <div key={user._id} className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
                      <div className="flex-1">
                        {/* Tenant Badge - destacado arriba */}
                        {user.tenant && (
                          <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-700">
                            <FontAwesomeIcon icon={faBuilding} className="h-3 w-3" />
                            {user.tenant.name}
                          </div>
                        )}
                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : user.email.split("@")[0]}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">Email: {user.email}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">Roles: {user.roles.map((r) => r.name).join(", ") || "Sin roles"}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          Estado:
                          {user.isActive ? <FontAwesomeIcon icon={faCheckCircle} className="text-blue-500" /> : <FontAwesomeIcon icon={faTimesCircle} className="text-red-500" />}
                        </div>
                      </div>
                      <button type="button" onClick={() => autofill(user)} disabled={!user.isActive} className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm bg-primary-600 text-white hover:bg-primary-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                        <FontAwesomeIcon icon={faMagicWandSparkles} className="h-4 w-4" />
                        Usar
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
