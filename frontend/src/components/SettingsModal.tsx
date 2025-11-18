import React, { useState, useMemo } from "react";
import { Modal } from "./ui/Modal";
import { useAuthStore } from "../stores/authStore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrown, faUsers, faHardDrive, faBuilding, faCreditCard, faBell, faClock, faCheckCircle, faExclamationTriangle, faDownload, faGlobe } from "@fortawesome/free-solid-svg-icons";
import { sweetAlert } from "../utils/sweetAlert";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = "plan" | "usage" | "billing" | "preferences";

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>("plan");

  const tabs = [
    { id: "plan" as const, label: "Plan", icon: faCrown },
    { id: "usage" as const, label: "Consumo", icon: faHardDrive },
    { id: "billing" as const, label: "Facturación", icon: faCreditCard },
    { id: "preferences" as const, label: "Preferencias", icon: faBell },
  ];

  const planType = useMemo(() => {
    if (user?.tenantSlug === "superadmin") return "Enterprise";
    return "Pro";
  }, [user?.tenantSlug]);

  const usageData = useMemo(() => {
    return {
      users: { current: 12, limit: 50, percentage: 24 },
      storage: { current: 2.4, limit: 10, percentage: 24, unit: "GB" },
      clients: { current: 8, limit: 25, percentage: 32 },
      campaigns: { current: 15, limit: 50, percentage: 30 },
    };
  }, []);

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return "bg-red-500";
    if (percentage >= 60) return "bg-yellow-500";
    return "bg-blue-500";
  };

  const getStatusBadge = (percentage: number) => {
    if (percentage >= 80) return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Alto uso</span>;
    if (percentage >= 60) return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Uso moderado</span>;
    return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">Disponible</span>;
  };

  const handleSavePreferences = async () => {
    await sweetAlert.success("Preferencias Guardadas", "Tus preferencias se han actualizado correctamente");
  };

  const displayName = useMemo(() => {
    if (user?.firstName && user?.lastName) return `${user.firstName} ${user.lastName}`;
    if (user?.firstName) return user.firstName;
    if (user?.lastName) return user.lastName;
    return "Usuario";
  }, [user]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configuración" subtitle="Gestiona tu plan, consumo y preferencias" size="xl">
      <div className="space-y-6 h-[70vh] overflow-y-auto">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${activeTab === tab.id ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"}`}>
                <FontAwesomeIcon icon={tab.icon} className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="py-4">
          {activeTab === "plan" && (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <FontAwesomeIcon icon={faCrown} className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Plan {planType}</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Acceso completo a todas las funcionalidades</p>
                  </div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    <FontAwesomeIcon icon={faCheckCircle} className="h-4 w-4 mr-1.5" />
                    Activo
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    <FontAwesomeIcon icon={faClock} className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Próxima Renovación</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">15 de Noviembre, 2025</p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    <FontAwesomeIcon icon={faBuilding} className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Tenant</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white capitalize">{user?.tenantSlug || "demo-tenant"}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Características del Plan</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {["Usuarios ilimitados", "Almacenamiento de 10GB", "25 clientes activos", "Campañas ilimitadas", "Soporte prioritario 24/7", "Integraciones avanzadas", "Analytics y reportes", "API access completo"].map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faCheckCircle} className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faCrown} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900 dark:text-blue-300">¿Necesitas más recursos?</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">Contáctanos para actualizar tu plan o solicitar recursos adicionales.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "usage" && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white">Uso de Recursos</h4>
                  {getStatusBadge(Math.max(usageData.users.percentage, usageData.storage.percentage, usageData.clients.percentage, usageData.campaigns.percentage))}
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faUsers} className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Usuarios Activos</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {usageData.users.current} / {usageData.users.limit}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full ${getProgressColor(usageData.users.percentage)}`} style={{ width: `${usageData.users.percentage}%` }}></div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{usageData.users.percentage}% utilizado</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faHardDrive} className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Almacenamiento</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {usageData.storage.current}
                        {usageData.storage.unit} / {usageData.storage.limit}
                        {usageData.storage.unit}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full ${getProgressColor(usageData.storage.percentage)}`} style={{ width: `${usageData.storage.percentage}%` }}></div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{usageData.storage.percentage}% utilizado</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faBuilding} className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Clientes</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {usageData.clients.current} / {usageData.clients.limit}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full ${getProgressColor(usageData.clients.percentage)}`} style={{ width: `${usageData.clients.percentage}%` }}></div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{usageData.clients.percentage}% utilizado</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faCrown} className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Campañas Activas</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {usageData.campaigns.current} / {usageData.campaigns.limit}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full ${getProgressColor(usageData.campaigns.percentage)}`} style={{ width: `${usageData.campaigns.percentage}%` }}></div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{usageData.campaigns.percentage}% utilizado</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900 dark:text-blue-300">Monitoreo de Uso</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">Los límites de uso se actualizan en tiempo real. Recibirás notificaciones cuando alcances el 80% de cualquier límite.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "billing" && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Información de Facturación</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FontAwesomeIcon icon={faCreditCard} className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Método de Pago</span>
                    </div>
                    <p className="text-base font-semibold text-gray-900 dark:text-white">Visa •••• 4242</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Vence 12/2026</p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FontAwesomeIcon icon={faClock} className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Próximo Cobro</span>
                    </div>
                    <p className="text-base font-semibold text-gray-900 dark:text-white">$99.00 USD</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">15 de Noviembre, 2025</p>
                  </div>
                </div>

                <div>
                  <h5 className="font-medium text-gray-900 dark:text-white mb-3">Historial de Facturas</h5>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descripción</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Monto</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {[
                          { date: "15 Oct 2025", desc: "Plan Pro - Mensual", amount: "$99.00", status: "Pagado" },
                          { date: "15 Sep 2025", desc: "Plan Pro - Mensual", amount: "$99.00", status: "Pagado" },
                          { date: "15 Ago 2025", desc: "Plan Pro - Mensual", amount: "$99.00", status: "Pagado" },
                        ].map((invoice, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">{invoice.date}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{invoice.desc}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{invoice.amount}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{invoice.status}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                              <button className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                                <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "preferences" && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Información General</h4>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tenant</label>
                    <input type="text" value={user?.tenantSlug || "demo-tenant"} disabled className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white cursor-not-allowed capitalize" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre</label>
                    <input type="text" value={displayName} disabled className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white cursor-not-allowed" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email de Contacto</label>
                    <input type="email" value={user?.email || ""} disabled className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white cursor-not-allowed" />
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Notificaciones</h4>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500" />
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Notificaciones de Email</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Recibir actualizaciones importantes por correo</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500" />
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Alertas de Uso</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Notificar cuando alcances límites de recursos</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500" />
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Newsletter</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Recibir noticias y consejos mensuales</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Configuración Regional</h4>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <FontAwesomeIcon icon={faGlobe} className="h-4 w-4 mr-2" />
                      Zona Horaria
                    </label>
                    <select className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                      <option>GMT-3 (Buenos Aires)</option>
                      <option>GMT-5 (New York)</option>
                      <option>GMT+0 (London)</option>
                      <option>GMT+1 (Madrid)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={handleSavePreferences} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
                  Guardar Preferencias
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
