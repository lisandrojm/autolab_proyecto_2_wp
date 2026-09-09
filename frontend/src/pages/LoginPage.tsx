import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Logo } from "../components/ui/Logo";
import { useAuthStore } from "../stores/authStore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagicWandSparkles, faEye, faEyeSlash, faBuilding, faMobileScreen, faLaptop, faEnvelope, faLock, faSpinner } from "@fortawesome/free-solid-svg-icons";

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

// ===== Página de Login =====
export const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastErrorObj, setLastErrorObj] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [availableClients, setAvailableClients] = useState<ClientOption[]>([]);
  const [showClientSelector, setShowClientSelector] = useState(false);
  const [availableTenants, setAvailableTenants] = useState<TenantOption[]>([]);
  const [showTenantSelector, setShowTenantSelector] = useState(false);
  const [showPortalSelector, setShowPortalSelector] = useState(false);
  const [showFirstTimeMessage, setShowFirstTimeMessage] = useState(false);

  const checkUserStatus = async (email: string) => {
    try {
      if (!email.includes("@")) return;

      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/check-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.exists && data.isFirstLogin) {
          setShowFirstTimeMessage(true);
        } else {
          setShowFirstTimeMessage(false);
        }
      }
    } catch (error) {
      console.error("Error checking user status:", error);
    }
  };

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

  // Verificar si hay errores de red/conexión previos en la URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "connection") {
      setError("No se pudo conectar con el servidor. Verifica tu conexión a internet.");
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
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

      // === Redirección según rol (fallback) ===
      // Intentamos tomar del resultado y, si no, del estado actual del store
      const rolesFromResult: any[] = (result?.user?.roles as any[]) || (useAuthStore.getState().user?.roles as any[]) || [];
      const roleNames = rolesFromResult.map((r) => (typeof r === "string" ? r : r?.name || "").toLowerCase());

      const isSuperadmin = roleNames.includes("superadmin");
      
      /*
        «RESPONSABLE DE PROYECTO» ENTRA A LOS DOS LADOS, Y ELIGE.

        Antes contaba como rol SOLO-mobile: `hasPlatformAccess` lo excluía explícitamente, así que
        quien tuviera únicamente ese rol caía derecho en `/mobile` sin ver el selector — aunque su rol
        tuviera permisos del escritorio asignados (Novedades, Pedidos, Vacaciones…), que se editan en
        Usuarios → Roles y quedaban sin forma de usarse.

        Que use mobile todos los días no significa que no pueda necesitar el escritorio: es la misma
        persona la que carga novedades desde el teléfono y después mira un reporte en la computadora.
        Ahora cuenta para los dos accesos, con lo cual cae en la rama del selector de más abajo y elige.

        Lo que se ve en el escritorio lo siguen decidiendo los permisos del rol, no esto: si no tiene
        ninguno, entra a una plataforma vacía. Esto abre la puerta; lo de adentro ya estaba resuelto.
      */
      const esResponsableProyecto = roleNames.some((n) => n.includes("responsable de proyecto"));
      const hasMobileAccess = roleNames.some((n) => n.includes("mobile")) || esResponsableProyecto;
      const hasPlatformAccess = roleNames.some((n) => !n.includes("mobile") && !n.includes("responsable de proyecto")) || esResponsableProyecto;

      // 1. Si tiene ambos accesos, mostrar selector (prioridad máxima)
      if (hasPlatformAccess && hasMobileAccess) {
        setShowPortalSelector(true);
        setIsLoading(false); // Enable buttons
        return;
      }

      // 2. Si el backend envía redirectTo explícito (y no es caso dual), usarlo
      if (result?.redirectTo) {
        window.location.href = result.redirectTo;
        return;
      }

      // 3. Redirección específica si solo tiene mobile
      if (hasMobileAccess && !hasPlatformAccess) {
        navigate("/mobile");
        return;
      }

      // 4. Default a plataforma
      navigate(isSuperadmin ? "/tenants" : "/clients");
    } catch (err: any) {
      console.error("[login:error]", err);
      setLastErrorObj(err);
      const msg = extractApiError(err);
      setError(msg || t("auth.invalidCredentials"));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePortalSelect = (type: "platform" | "mobile") => {
    if (type === "mobile") {
      navigate("/mobile");
    } else {
      // Re-calculate superadmin for link
      const roles = (useAuthStore.getState().user?.roles as any[]) || [];
      const isSuperadmin = roles.some((r) => (typeof r === "string" ? r : r?.name)?.toLowerCase() === "superadmin");
      navigate(isSuperadmin ? "/tenants" : "/clients");
    }
  };

  const checkClientsForEmail = async (_email: string) => {
    // Esta función ahora no se usa, se maneja en el login
  };

  /*
    LOGIN: una tarjeta centrada, sin adornos.

    Lo único que se hace acá es entrar. Un panel de marca al costado con un titular y degradés le
    agrega peso visual a una pantalla que se ve dos segundos, y en un monitor ancho deja el formulario
    corrido a la derecha en vez de donde uno lo busca. Queda el fondo plano, la tarjeta al medio y los
    campos grandes.

    Los campos NO usan `input-field`: esa clase está pensada para formularios densos dentro de la app.
    Acá hay lugar de sobra y una sola tarea, así que el campo puede ser más alto y llevar su ícono.
  */
  /*
    ETIQUETAS FLOTANTES.

    El label vive DENTRO del campo y sube cuando hay foco o contenido. Se apoya en dos cosas del CSS,
    sin una línea de JS: `peer`, que deja que el label reaccione al estado del input, y
    `:placeholder-shown`, que distingue "vacío" de "escrito" — por eso cada input lleva
    `placeholder=" "` (un espacio): sin placeholder, ese selector nunca aplica.

    El alto es de 64px: con menos, la etiqueta flotada queda encima del valor y se leen pisados.
  */
  const campoBase =
    "login-input peer h-16 w-full rounded-xl border border-gray-300 bg-gray-50 pl-11 dark:border-gray-700 dark:bg-gray-900 pr-4 pt-7 pb-2.5 text-[15px] text-gray-100 outline-none transition-all placeholder:text-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  /** El label: chico y arriba cuando hay foco o texto; centrado y grande cuando el campo está vacío. */
  const labelFlotante =
    "pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 text-[15px] text-gray-500 transition-all " +
    "peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-blue-400 " +
    "peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-wider peer-[:not(:placeholder-shown)]:text-gray-400";

  /** Un <select> siempre muestra algo, así que su etiqueta va arriba desde el principio. */
  const labelFijo = "pointer-events-none absolute left-11 top-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-6 text-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-[400px] animate-slide-up">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-6 text-center">
            {/* `Logo` trae `flex items-center` propio, así que el `text-center` del padre no lo mueve:
                hay que centrarlo con `justify-center` en su wrapper. */}
            <Logo sizeClass="text-3xl" wrapperClassName="flex items-center justify-center select-none" />
            {/* Sin título ni bajada: el botón de abajo ya dice "Iniciar sesión", y arriba del logo
                sobraba. Los dos campos alcanzan para saber qué hay que hacer acá. */}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" autoComplete="off">
            {/* Solo cuando la persona pertenece a más de una organización. */}
            {showTenantSelector && availableTenants.length > 0 && (
              <div className="relative">
                <FontAwesomeIcon icon={faBuilding} className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <label className={labelFijo}>Organización</label>
                <div>
                  <select
                    {...register("tenantSlug")}
                    className={`${campoBase} appearance-none`}
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
              </div>
            )}

            <div>
              <div className="relative">
                <FontAwesomeIcon icon={faEnvelope} className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  {...register("email")}
                  type="email"
                  id="login-email"
                  className={`${campoBase} ${errors.email ? "border-red-500/60" : ""}`}
                  placeholder=" "
                  autoComplete="username"
                  onBlur={(e) => {
                    register("email").onBlur(e); // Mantener validación original
                    if (e.target.value && !errors.email) {
                      checkUserStatus(e.target.value);
                    }
                  }}
                />
                <label htmlFor="login-email" className={labelFlotante}>
                  {t("auth.email")}
                </label>
              </div>
              {errors.email && <p className="mt-1.5 text-xs text-red-400">{errors.email.message}</p>}
            </div>

            {/* Aviso de primer ingreso */}
            {showFirstTimeMessage && (
              <div className="animate-fade-in rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
                <div className="flex gap-3">
                  <FontAwesomeIcon icon={faMagicWandSparkles} className="mt-0.5 shrink-0 text-blue-400" />
                  <div className="text-blue-200/90">
                    <p className="mb-1 font-semibold text-blue-200">¿Es tu primera vez ingresando?</p>
                    <p className="mb-2 text-blue-200/70">Tus credenciales de ingreso son:</p>
                    <ul className="space-y-1 text-blue-200/70">
                      <li>
                        <strong className="text-blue-200">Correo:</strong> el que registraste en la plataforma
                      </li>
                      <li>
                        <strong className="text-blue-200">Contraseña:</strong> tu número de DNI
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div>
              <div className="relative">
                <FontAwesomeIcon icon={faLock} className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input {...register("password")} type={showPassword ? "text" : "password"} id="login-password" className={`${campoBase} pr-12 ${errors.password ? "border-red-500/60" : ""}`} placeholder=" " autoComplete="current-password" />
                <label htmlFor="login-password" className={labelFlotante}>
                  {t("auth.password")}
                </label>
                <button type="button" onClick={() => setShowPassword(!showPassword)} title={showPassword ? "Ocultar" : "Mostrar"} className="absolute inset-y-0 right-0 flex items-center px-4 text-gray-500 transition-colors hover:text-gray-300">
                  <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-4 w-4" />
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>}
            </div>

            {error && (
              <div className="animate-fade-in rounded-xl border border-red-500/30 bg-red-500/10 p-3.5">
                <p className="text-sm text-red-300">{error}</p>

                {/* Solo en desarrollo: ver objeto de error completo */}
                {import.meta.env.DEV && lastErrorObj && (
                  <details className="mt-2 rounded border border-red-500/40 p-2">
                    <summary className="cursor-pointer text-xs text-red-300/80">Detalles del error (solo dev)</summary>
                    <pre className="mt-2 max-h-56 overflow-auto text-[10px] leading-4 text-red-200/80">{JSON.stringify(lastErrorObj, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}

            {/* Client Selector */}
            {showClientSelector && availableClients.length > 0 && (
              <div className="relative">
                <FontAwesomeIcon icon={faBuilding} className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <label className={labelFijo}>Cliente</label>
                <div>
                  <select {...register("clientId")} className={`${campoBase} appearance-none`} required={availableClients.length > 1}>
                    {availableClients.length > 1 && <option value="">Seleccionar cliente...</option>}
                    {availableClients.map((client) => (
                      <option key={client._id} value={client._id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading && <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4" />}
              {isLoading ? t("common.loading") : t("auth.signIn")}
            </button>
          </form>

          {/*
            SIN «Crear cuenta» Y SIN LA LISTA DE USUARIOS DEMO.

            El alta no es autoservicio: se entra por un link de invitación con token (`/registro`),
            que es lo que ata a la persona a un tenant y a un cliente. El link a `/register` ofrecía
            un camino que no existe.

            El desplegable de usuarios era una ayuda de desarrollo que listaba nombres, emails y roles
            reales, y con un botón para autocompletar el login. Aunque estaba limitado a `import.meta.env.DEV`,
            un build de desarrollo servido por error lo dejaba expuesto en la pantalla de login.
          */}
        </div>

        <p className="mt-6 text-center text-xs text-gray-600">
          © {new Date().getFullYear()} Frame
        </p>
      </div>

      {/* Selector de portal: se muestra cuando la persona puede entrar por más de un lado. */}
      {showPortalSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md animate-scale-in rounded-2xl border border-gray-200 bg-white p-8 dark:border-gray-700 dark:bg-gray-800">
            {/* Mismos colores que el título/subtítulo de cualquier otro modal de la app (ver Modal.tsx):
                antes "Bienvenido" era `text-white` a secas, sin contraparte para el modo claro —con el
                container ya soportando los dos temas, quedaba invisible sobre fondo blanco. */}
            <h3 className="text-center text-xl font-bold text-gray-900 dark:text-white">Bienvenido</h3>
            <p className="mb-6 mt-1 text-center text-sm text-gray-600 dark:text-gray-400">Elegí dónde querés ingresar</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <button onClick={() => handlePortalSelect("platform")} className="group flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-6 transition-all hover:border-blue-500/50 hover:bg-blue-500/10 dark:border-gray-700 dark:bg-gray-900">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 transition-transform group-hover:scale-110">
                  <FontAwesomeIcon icon={faLaptop} className="h-5 w-5 text-blue-400" />
                </div>
                <span className="font-semibold text-gray-100">Plataforma</span>
                <span className="mt-1 text-center text-xs text-gray-500">Administración y gestión</span>
              </button>

              <button onClick={() => handlePortalSelect("mobile")} className="group flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-6 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/10 dark:border-gray-700 dark:bg-gray-900">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 transition-transform group-hover:scale-110">
                  <FontAwesomeIcon icon={faMobileScreen} className="h-5 w-5 text-emerald-400" />
                </div>
                <span className="font-semibold text-gray-100">App Mobile</span>
                <span className="mt-1 text-center text-xs text-gray-500">Portal de empleado</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
