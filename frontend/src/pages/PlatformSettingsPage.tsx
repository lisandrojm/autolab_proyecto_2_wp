import React, { useState } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCog, faServer, faDatabase, faShield, faBell, faEnvelope, faGlobe } from "@fortawesome/free-solid-svg-icons";
import { sweetAlert } from "../utils/sweetAlert";

export const PlatformSettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"general" | "security" | "notifications" | "limits">("general");

  const handleSave = async () => {
    await sweetAlert.success("Configuración Guardada", "Los cambios se han guardado correctamente");
  };

  const tabs = [
    { id: "general" as const, label: "General", icon: faGlobe },
    { id: "security" as const, label: "Seguridad", icon: faShield },
    { id: "notifications" as const, label: "Notificaciones", icon: faBell },
    { id: "limits" as const, label: "Límites y Cuotas", icon: faDatabase },
  ];

  return (
    <PageLayout title="Configuración Global" subtitle="Configuración de plataforma y administración del sistema" faIcon={{ icon: faCog }}>
      <div className="space-y-6">
        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors
                    ${activeTab === tab.id ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"}
                  `}
                >
                  <FontAwesomeIcon icon={tab.icon} className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === "general" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Configuración General</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre de la Plataforma</label>
                      <input type="text" defaultValue="BrandMe" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">URL de la Plataforma</label>
                      <input type="url" defaultValue="https://autolab.fun" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email de Contacto</label>
                      <input type="email" defaultValue="admin@autolab.fun" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Permitir registro de nuevos tenants</span>
                      </label>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Modo de mantenimiento</span>
                      </label>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-6">Los usuarios verán un mensaje de mantenimiento al acceder</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Configuración de Seguridad</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Expiración de Sesión (minutos)</label>
                      <input type="number" defaultValue="60" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Intentos de Login Fallidos Permitidos</label>
                      <input type="number" defaultValue="5" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Requerir autenticación de dos factores (2FA)</span>
                      </label>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Requerir contraseñas complejas</span>
                      </label>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <FontAwesomeIcon icon={faShield} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-blue-900 dark:text-blue-300">Política de Seguridad</h4>
                          <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">Los cambios en la configuración de seguridad afectan a todos los tenants de la plataforma</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Configuración de Notificaciones</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Servidor SMTP</label>
                      <input type="text" placeholder="smtp.example.com" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Puerto SMTP</label>
                      <input type="number" defaultValue="587" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enviar alertas de uso excesivo</span>
                      </label>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Notificar a admins de nuevos tenants</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "limits" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Límites y Cuotas por Plan</h3>
                  <div className="space-y-6">
                    {["free", "basic", "pro", "enterprise"].map((plan) => (
                      <div key={plan} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 dark:text-white capitalize mb-3">Plan {plan}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Usuarios</label>
                            <input type="number" defaultValue={plan === "free" ? "5" : plan === "basic" ? "20" : plan === "pro" ? "50" : "999999"} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Almacenamiento (MB)</label>
                            <input type="number" defaultValue={plan === "free" ? "100" : plan === "basic" ? "1000" : plan === "pro" ? "5000" : "999999"} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Campañas</label>
                            <input type="number" defaultValue={plan === "free" ? "3" : plan === "basic" ? "10" : plan === "pro" ? "50" : "999999"} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Botón de Guardar */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-end gap-3">
                <button onClick={handleSave} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};
