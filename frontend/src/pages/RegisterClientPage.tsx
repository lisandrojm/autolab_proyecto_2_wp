import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";

import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { useClientContextStore } from "../stores/clientContextStore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBuilding, faGlobe, faMoon, faSun, faEye, faEyeSlash, faUser, faEnvelope, faLock, faPhone } from "@fortawesome/free-solid-svg-icons";

const DEMO_TENANT = "demo-tenant";

const registerClientSchema = z
  .object({
    name: z.string().min(1, "Nombre es requerido").max(50, "Nombre muy largo"),
    email: z.string().email("Formato de email inválido"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres").max(100, "Contraseña muy larga"),
    confirmPassword: z.string(),
    company: z.string().min(1, "Empresa es requerida").max(100, "Nombre muy largo"),
    phone: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type RegisterClientForm = z.infer<typeof registerClientSchema>;

export const RegisterClientPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useThemeStore();
  const { clearSelectedClient } = useClientContextStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<RegisterClientForm>({
    resolver: zodResolver(registerClientSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      company: "",
      phone: "",
    },
  });

  const handleLanguageToggle = () => {
    const newLang = i18n.language === "en" ? "es" : "en";
    i18n.changeLanguage(newLang);
  };

  const onSubmit = async (data: RegisterClientForm) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/register-client`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": DEMO_TENANT,
        },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
          company: data.company,
          phone: data.phone,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error || errorData.message || `HTTP ${response.status}`;
        throw new Error(message);
      }

      const responseData = await response.json();

      // Auto-login después del registro
      localStorage.setItem("token", responseData.token);
      localStorage.setItem("tenantId", DEMO_TENANT);
      localStorage.setItem("user", JSON.stringify(responseData.user));

      useAuthStore.setState({
        token: responseData.token,
        tenantId: DEMO_TENANT,
        user: responseData.user,
        isAuthenticated: true,
      });

      // 🔁 Evitar “cliente pegado” en el selector: limpiar selección previa
      clearSelectedClient?.();

      // 🔔 Avisar a la app que la lista de clientes cambió (para que pickers refresquen)
      window.dispatchEvent(new CustomEvent("clientsChanged", { detail: { reason: "clientRegistered" } }));

      navigate("/client/users");
    } catch (err: any) {
      console.error("[register-client:error]", err);
      setError(err.message || "Error al crear la cuenta");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-accent-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      {/* Controles globales */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button onClick={handleLanguageToggle} className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all duration-200" title="Toggle Language">
            <FontAwesomeIcon icon={faGlobe} className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          </button>
          <button onClick={toggleTheme} className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all duration-200" title="Toggle Theme">
            {theme === "light" ? <FontAwesomeIcon icon={faMoon} className="h-5 w-5 text-gray-600" /> : <FontAwesomeIcon icon={faSun} className="h-5 w-5 text-gray-300" />}
          </button>
        </div>
      </div>

      {/* Card de registro */}
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 shadow-xl rounded-2xl p-8 animate-slide-up">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-4">
              <FontAwesomeIcon icon={faBuilding} className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Registro de Cliente</h1>
            <p className="text-gray-600 dark:text-gray-400">Crea tu cuenta empresarial</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" autoComplete="off">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FontAwesomeIcon icon={faBuilding} className="h-4 w-4 mr-2" />
                Empresa *
              </label>
              <input {...register("company")} type="text" className={`input-field ${errors.company ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}`} placeholder="Nombre de tu empresa" aria-invalid={!!errors.company} />
              {errors.company && <p className="text-red-500 text-sm mt-1">{errors.company.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FontAwesomeIcon icon={faUser} className="h-4 w-4 mr-2" />
                Nombre completo *
              </label>
              <input {...register("name")} type="text" className={`input-field ${errors.name ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}`} placeholder="Tu nombre completo" aria-invalid={!!errors.name} />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4 mr-2" />
                Email *
              </label>
              <input {...register("email")} type="email" className={`input-field ${errors.email ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}`} placeholder="tu@empresa.com" aria-invalid={!!errors.email} autoComplete="username" />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FontAwesomeIcon icon={faPhone} className="h-4 w-4 mr-2" />
                Teléfono
              </label>
              <input {...register("phone")} type="tel" className="input-field" placeholder="+34 600 000 000" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FontAwesomeIcon icon={faLock} className="h-4 w-4 mr-2" />
                Contraseña *
              </label>
              <div className="relative">
                <input {...register("password")} type={showPassword ? "text" : "password"} className={`input-field pr-10 ${errors.password ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}`} placeholder="••••••••" aria-invalid={!!errors.password} autoComplete="new-password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FontAwesomeIcon icon={faLock} className="h-4 w-4 mr-2" />
                Confirmar Contraseña *
              </label>
              <div className="relative">
                <input {...register("confirmPassword")} type={showConfirmPassword ? "text" : "password"} className={`input-field pr-10 ${errors.confirmPassword ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}`} placeholder="••••••••" aria-invalid={!!errors.confirmPassword} autoComplete="new-password" />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <FontAwesomeIcon icon={showConfirmPassword ? faEyeSlash : faEye} className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                </button>
              </div>
              {errors.confirmPassword && <p className="text-red-500 text-sm mt-1">{errors.confirmPassword.message}</p>}
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button type="submit" disabled={isLoading || !isValid} className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? "Creando cuenta..." : "Crear Cuenta Empresarial"}
            </button>
          </form>

          {/* Link a Login */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              ¿Ya tienes cuenta?{" "}
              <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300">
                Iniciar sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
