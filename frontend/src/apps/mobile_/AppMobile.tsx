import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMobileScreen,
  faUserTie,
  faUsers,
  faExclamationTriangle,
  faArrowLeft
} from "@fortawesome/free-solid-svg-icons";

const AppMobile: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const permissions = user?.permissions || [];
  const hasMobileAccess = permissions.includes("mobile:access");
  const isMobileCollaborator = permissions.includes("mobile:collaborator");
  const isMobileCoordinator = permissions.includes("mobile:coordinator");

  if (!hasMobileAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="mb-6">
            <div className="mx-auto w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-600 dark:text-red-400 text-3xl" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Acceso Restringido
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            No tienes permisos para acceder a esta aplicación. Por favor, contacta con tu administrador si necesitas acceso.
          </p>
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (isMobileCoordinator) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                <FontAwesomeIcon icon={faUserTie} className="text-white text-2xl" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  App Mobile - Vista Coordinador
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Bienvenido, {user?.firstName || "Coordinador"}
                </p>
              </div>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <FontAwesomeIcon icon={faMobileScreen} className="mr-2" />
                Acceso completo a funciones de gestión y coordinación
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-200">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center mb-4">
                <FontAwesomeIcon icon={faUsers} className="text-indigo-600 dark:text-indigo-400 text-xl" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Gestión de Equipo
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Administra tu equipo de colaboradores, asigna tareas y supervisa el progreso.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-200">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                <FontAwesomeIcon icon={faMobileScreen} className="text-purple-600 dark:text-purple-400 text-xl" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Reportes Avanzados
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Accede a métricas detalladas y reportes de rendimiento del equipo.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-200">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                <FontAwesomeIcon icon={faUserTie} className="text-blue-600 dark:text-blue-400 text-xl" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Configuración
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Configura parámetros de la app y gestiona permisos de colaboradores.
              </p>
            </div>
          </div>

          <div className="mt-8 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Nota:</strong> Esta es una vista placeholder para coordinadores.
              Las funcionalidades reales se implementarán según los requisitos específicos del proyecto.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isMobileCollaborator) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-50 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-teal-600 rounded-xl flex items-center justify-center">
                <FontAwesomeIcon icon={faUsers} className="text-white text-2xl" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  App Mobile - Vista Colaborador
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Bienvenido, {user?.firstName || "Colaborador"}
                </p>
              </div>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <FontAwesomeIcon icon={faMobileScreen} className="mr-2" />
                Acceso a funciones básicas de colaboración
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-200">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mb-4">
                <FontAwesomeIcon icon={faMobileScreen} className="text-green-600 dark:text-green-400 text-xl" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Mis Tareas
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Consulta y actualiza el estado de tus tareas asignadas.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-200">
              <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900/30 rounded-lg flex items-center justify-center mb-4">
                <FontAwesomeIcon icon={faUsers} className="text-teal-600 dark:text-teal-400 text-xl" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Comunicación
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Mantente en contacto con tu equipo y coordinadores.
              </p>
            </div>
          </div>

          <div className="mt-8 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Nota:</strong> Esta es una vista placeholder para colaboradores.
              Las funcionalidades reales se implementarán según los requisitos específicos del proyecto.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
            <FontAwesomeIcon icon={faMobileScreen} className="text-blue-600 dark:text-blue-400 text-3xl" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Bienvenido a Mobile App
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Tienes acceso a la aplicación mobile, pero tu rol aún no está completamente configurado.
          Por favor, contacta con tu administrador.
        </p>
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200"
        >
          <FontAwesomeIcon icon={faArrowLeft} />
          Volver al Dashboard
        </button>
      </div>
    </div>
  );
};

export default AppMobile;
