import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Logo } from "../components/ui/Logo";
import { SuccessModal } from "../components/ui/SuccessModal";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { registerTenantSchema, RegisterTenantForm } from "../validation/registerSchema";
import { apiRegisterTenant } from "../api/auth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserPlus, faMoon, faSun, faUser, faEnvelope, faBuilding, faPhone, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";

function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Extiendo el tipo localmente por si RegisterTenantForm no incluye password/confirmPassword
type FormValues = RegisterTenantForm & {
  password: string;
  confirmPassword: string;
};

export const RegisterPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
    setFocus,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(registerTenantSchema as any),
    mode: "onChange",
    defaultValues: {
      companyName: "",
      slug: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const firstError = Object.keys(errors)[0] as keyof FormValues | undefined;
    if (firstError) setFocus(firstError);
  }, [errors, setFocus]);

  const companyName = watch("companyName");
  useEffect(() => {
    const auto = slugify(companyName);
    setValue("slug", auto, { shouldValidate: true, shouldDirty: true });
  }, [companyName, setValue]);

  const onSubmit = async (data: FormValues) => {
    setIsLoading(true);
    setError("");
    try {
      const ensuredSlug = data.slug && data.slug.length > 0 ? data.slug : slugify(data.companyName);

      // Validación mínima local de password
      if (!data.password || data.password.length < 8) {
        setError("La contraseña debe tener al menos 8 caracteres.");
        setIsLoading(false);
        return;
      }
      if (data.password !== data.confirmPassword) {
        setError("Las contraseñas no coinciden.");
        setIsLoading(false);
        return;
      }

      const response = await apiRegisterTenant({
        companyName: data.companyName,
        slug: ensuredSlug,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        password: data.password,
      });

      if (response) {
        const tenantData = (response as any).tenant;
        const tenantSlug = tenantData?.slug || ensuredSlug;

        // Mostrar modal de éxito
        setRegisteredEmail(data.email);
        setShowSuccessModal(true);

        // Hacer login automático después de mostrar el modal
        await login(data.email, data.password, tenantSlug, undefined);
      }
    } catch (err: any) {
      setError(err?.message || "Error al crear la cuenta");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    navigate("/users");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800 px-4 sm:px-6 lg:px-8 py-8">
      <SuccessModal isOpen={showSuccessModal} onClose={handleSuccessModalClose} title="¡Cuenta creada exitosamente!" message="Se ha creado un usuario administrador con las credenciales que ingresaste. Ya puedes comenzar a usar la plataforma." email={registeredEmail} />

      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button onClick={toggleTheme} className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all duration-200" title="Toggle Theme">
            {theme === "light" ? <FontAwesomeIcon icon={faMoon} className="h-5 w-5 text-gray-600" /> : <FontAwesomeIcon icon={faSun} className="h-5 w-5 text-gray-300" />}
          </button>
        </div>
      </div>

      <div className="max-w-md w-full space-y-8">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl">
          <div className="text-center mb-4">
            <div className="flex justify-center items-center">
              <Logo sizeClass="text-3xl" />
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">{t("auth.registerSubtitle")}</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* slug oculto */}
            <input type="hidden" {...register("slug")} />

            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FontAwesomeIcon icon={faBuilding} className="mr-2" />
                Nombre de la Empresa *
              </label>
              <input {...register("companyName")} type="text" id="companyName" className={`input-field ${errors.companyName ? "border-red-500" : ""}`} placeholder="Mi Empresa S.A." />
              {errors.companyName && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{(errors.companyName as any).message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <FontAwesomeIcon icon={faUser} className="mr-2" />
                  Nombre *
                </label>
                <input {...register("firstName")} type="text" id="firstName" className={`input-field ${errors.firstName ? "border-red-500" : ""}`} placeholder="Juan" />
                {errors.firstName && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{(errors.firstName as any).message}</p>}
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Apellido *
                </label>
                <input {...register("lastName")} type="text" id="lastName" className={`input-field ${errors.lastName ? "border-red-500" : ""}`} placeholder="Pérez" />
                {errors.lastName && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{(errors.lastName as any).message}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FontAwesomeIcon icon={faEnvelope} className="mr-2" />
                Email *
              </label>
              <input {...register("email")} type="email" id="email" className={`input-field ${errors.email ? "border-red-500" : ""}`} placeholder="admin@miempresa.com" />
              {errors.email && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{(errors.email as any).message}</p>}
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Teléfono
              </label>
              <input {...register("phone")} type="tel" id="phone" className="input-field" placeholder="+54 11 1234-5678" />
            </div>

            {/* Contraseña */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Contraseña *
              </label>
              <div className="relative">
                <input
                  {...register("password", {
                    required: "Contraseña requerida",
                    minLength: { value: 8, message: "Mínimo 8 caracteres" },
                  })}
                  type={showPwd ? "text" : "password"}
                  id="password"
                  className={`input-field pr-10 ${errors.password ? "border-red-500" : ""}`}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button type="button" className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500" onClick={() => setShowPwd((v) => !v)} aria-label="Mostrar u ocultar contraseña">
                  <FontAwesomeIcon icon={showPwd ? faEyeSlash : faEye} />
                </button>
              </div>
              {errors.password ? <p className="mt-1 text-sm text-red-600 dark:text-red-400">{(errors.password as any).message}</p> : <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Mín. 8 caracteres, con mayúscula, minúscula y número.</p>}
            </div>

            {/* Repetir contraseña */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Repetir contraseña *
              </label>
              <div className="relative">
                <input
                  {...register("confirmPassword", {
                    required: "Repetí la contraseña",
                    validate: (v) => v === watch("password") || "Las contraseñas no coinciden",
                  })}
                  type={showPwd2 ? "text" : "password"}
                  id="confirmPassword"
                  className={`input-field pr-10 ${errors.confirmPassword ? "border-red-500" : ""}`}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button type="button" className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500" onClick={() => setShowPwd2((v) => !v)} aria-label="Mostrar u ocultar contraseña">
                  <FontAwesomeIcon icon={showPwd2 ? faEyeSlash : faEye} />
                </button>
              </div>
              {errors.confirmPassword && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{(errors.confirmPassword as any).message}</p>}
            </div>

            <button type="submit" disabled={!isValid || isLoading} className="w-full btn-primary flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <FontAwesomeIcon icon={faUserPlus} />
              <span>{isLoading ? "Creando cuenta..." : t("Crear Cuenta")}</span>
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              ¿Ya tienes una cuenta?{" "}
              <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300">
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
