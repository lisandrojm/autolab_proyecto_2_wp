import React, { useEffect, useState } from "react";
import axios from "../api/axiosConfig";
import { PageLayout } from "../components/ui/PageLayout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faArrowRotateRight, 
  faCheckCircle, 
  faExclamationTriangle, 
  faUserPlus, 
  faUserCheck, 
  faExclamationCircle, 
  faClock, 
  faCalendarAlt, 
  faToggleOn, 
  faToggleOff, 
  faListUl,
  faDatabase,
  faUsersCog
} from "@fortawesome/free-solid-svg-icons";

interface SyncStats {
  createdUsers: number;
  updatedUsers: number;
  skippedUsers?: number;
  errorsUsers: number;
}

interface AddedUser {
  name: string;
  email: string;
  _id?: string;
}

interface AddedProject {
  name: string;
  externalId: number;
  _id?: string;
}

interface HistoryItem {
  _id: string;
  status: "success" | "failed";
  executedBy: { firstName?: string; lastName?: string; email?: string } | string;
  stats: SyncStats;
  addedUsers: AddedUser[];
  addedProjects: AddedProject[];
  errorDetails?: string;
  createdAt: string;
}

interface ImportConfigData {
  isEnabled: boolean;
  intervalHours: number;
  syncProjects: boolean;
  sinceDays?: number;
  lastRun?: string;
  nextRun?: string;
}

export const ImportUsersWpPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"users" | "projects" | "history">("users");
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);

  // States for stats and sync
  const [latestSync, setLatestSync] = useState<HistoryItem | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sinceDays, setSinceDays] = useState<number>(7);
  const [isIncremental, setIsIncremental] = useState<boolean>(true);
  const [syncProjectsOption, setSyncProjectsOption] = useState<boolean>(true);

  // States for configuration
  const [config, setConfig] = useState<ImportConfigData>({
    isEnabled: false,
    intervalHours: 24,
    syncProjects: true,
  });

  // Notification states
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | null }>({
    message: "",
    type: null,
  });

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast({ message: "", type: null });
    }, 4000);
  };

  const fetchData = async () => {
    setFetchingData(true);
    try {
      // 1. Fetch latest import run info
      const latestRes = await axios.get("/users/import/history/latest");
      setLatestSync(latestRes.data);

      // 2. Fetch full history list
      const historyRes = await axios.get("/users/import/history");
      setHistory(historyRes.data);

      // 3. Fetch auto-import config
      const configRes = await axios.get("/users/import/config");
      if (configRes.data) {
        setConfig({
          isEnabled: configRes.data.isEnabled,
          intervalHours: configRes.data.intervalHours,
          syncProjects: configRes.data.syncProjects,
          sinceDays: configRes.data.sinceDays,
          lastRun: configRes.data.lastRun,
          nextRun: configRes.data.nextRun,
        });
        if (configRes.data.sinceDays !== undefined) {
          setSinceDays(configRes.data.sinceDays);
          setIsIncremental(true);
        } else {
          setIsIncremental(false);
        }
        setSyncProjectsOption(configRes.data.syncProjects);
      }
    } catch (err: any) {
      console.error("Error fetching data:", err);
      showToast("Error al cargar la información del servidor", "error");
    } finally {
      setFetchingData(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleManualSync = async () => {
    setLoading(true);
    try {
      const payload = {
        syncProjects: syncProjectsOption,
        sinceDays: isIncremental ? sinceDays : undefined,
      };

      const response = await axios.post("/users/import/trigger", payload);
      
      showToast("Sincronización manual completada con éxito", "success");
      
      // Refresh database records
      await fetchData();
    } catch (err: any) {
      console.error("Manual sync error:", err);
      const errMsg = err.response?.data?.error || "Falló la sincronización con la API de FRAME";
      showToast(errMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const payload = {
        isEnabled: config.isEnabled,
        intervalHours: Number(config.intervalHours),
        syncProjects: config.syncProjects,
        sinceDays: isIncremental ? sinceDays : undefined,
      };

      const response = await axios.post("/users/import/config", payload);
      setConfig({
        isEnabled: response.data.isEnabled,
        intervalHours: response.data.intervalHours,
        syncProjects: response.data.syncProjects,
        sinceDays: response.data.sinceDays,
        lastRun: response.data.lastRun,
        nextRun: response.data.nextRun,
      });

      showToast("Configuración de auto-sincronización guardada", "success");
    } catch (err: any) {
      console.error("Save config error:", err);
      showToast("Error al guardar la configuración", "error");
    } finally {
      setSavingConfig(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "Nunca";
    return new Date(dateStr).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getExecutorName = (item: HistoryItem) => {
    if (item.executedBy === "system") return "Sistema (Automático)";
    if (typeof item.executedBy === "object" && item.executedBy !== null) {
      const name = `${item.executedBy.firstName || ""} ${item.executedBy.lastName || ""}`.trim();
      return name || item.executedBy.email || "Administrador";
    }
    return "Administrador";
  };

  return (
    <PageLayout
      title="Importación de Usuarios WP (FRAME)"
      subtitle="Módulo de integración y sincronización de empleados, contratos y proyectos desde el sistema externo FRAME."
    >
      
      {/* Toast Notification */}
      {toast.type && (
        <div className={`fixed top-4 right-4 z-50 flex items-center p-4 rounded-lg shadow-md transition-all duration-300 border ${
          toast.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300"
            : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300"
        }`}>
          <FontAwesomeIcon icon={toast.type === "success" ? faCheckCircle : faExclamationCircle} className="mr-3 h-5 w-5" />
          <span className="font-medium text-sm">{toast.message}</span>
        </div>
      )}

      {fetchingData ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-300">Cargando integración de FRAME...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Main Sync Controls Card */}
          <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white flex items-center gap-2">
                <FontAwesomeIcon icon={faDatabase} className="text-blue-500" />
                Ejecución y Estado General
              </h2>
            </div>
            
            <div className="p-5 flex-1 space-y-6">
              {/* Last run stats card */}
              <div className="bg-gray-55/60 dark:bg-gray-900/30 border border-gray-150 dark:border-gray-800 p-4 rounded-xl">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faClock} />
                  Última Sincronización Realizada
                </h3>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">
                      {latestSync ? formatDate(latestSync.createdAt) : "Nunca"}
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {latestSync ? `Ejecutado por: ${getExecutorName(latestSync)}` : "No se registran importaciones exitosas."}
                    </p>
                  </div>
                  {latestSync && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400">
                      <FontAwesomeIcon icon={faCheckCircle} />
                      Sincronizado
                    </div>
                  )}
                </div>

                {latestSync && (
                  <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-gray-200 dark:border-gray-800 text-center">
                    <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/40">
                      <span className="block text-2xl font-bold text-blue-600 dark:text-blue-400">{latestSync.stats.createdUsers}</span>
                      <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1 mt-1">
                        <FontAwesomeIcon icon={faUserPlus} className="text-blue-500" />
                        Creados
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/40">
                      <span className="block text-2xl font-bold text-emerald-600 dark:text-emerald-400">{latestSync.stats.skippedUsers ?? 0}</span>
                      <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1 mt-1">
                        <FontAwesomeIcon icon={faUserCheck} className="text-emerald-500" />
                        Omitidos (ya existían)
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/40">
                      <span className={`block text-2xl font-bold ${latestSync.stats.errorsUsers > 0 ? "text-rose-600 dark:text-rose-400" : "text-gray-600 dark:text-gray-400"}`}>
                        {latestSync.stats.errorsUsers}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1 mt-1">
                        <FontAwesomeIcon icon={faExclamationTriangle} className="text-rose-500" />
                        Errores
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Sync Scope Options */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Opciones de Sincronización Manual</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Option: Incremental / Full Sync */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-150 dark:border-gray-850">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isIncremental}
                        onChange={(e) => setIsIncremental(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Sincronización Incremental</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Filtra y sincroniza solo empleados dados de alta en los últimos N días. Desmarca para sincronizar todo.
                        </p>
                      </div>
                    </label>
                    
                    {isIncremental && (
                      <div className="mt-3 flex items-center gap-3 pl-7">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Rango de días:</span>
                        <input 
                          type="number"
                          min="1"
                          max="365"
                          value={sinceDays}
                          onChange={(e) => setSinceDays(Math.max(1, Number(e.target.value)))}
                          className="w-20 px-2.5 py-1 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </div>

                  {/* Option: Sync Projects */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-150 dark:border-gray-850">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={syncProjectsOption}
                        onChange={(e) => setSyncProjectsOption(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Sincronizar Contratos y Proyectos</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Consulta y actualiza la relación laboral e historial contractual de los empleados en FRAME.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Panel */}
            <div className="p-5 bg-gray-50/20 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-700/80 flex justify-end">
              <button
                onClick={handleManualSync}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm w-full sm:w-auto"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-3"></div>
                    Sincronizando con FRAME...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faArrowRotateRight} className="mr-3" />
                    Sincronizar Ahora
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Configuration Settings Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white flex items-center gap-2">
                <FontAwesomeIcon icon={faClock} className="text-blue-500" />
                Automatización (Programador)
              </h2>
            </div>
            
            <div className="p-5 flex-1 space-y-5">
              {/* Toggle Enable */}
              <div className="flex justify-between items-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900/30 border border-gray-150 dark:border-gray-800">
                <div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Auto-Sincronización</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Habilitar importaciones en segundo plano.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, isEnabled: !config.isEnabled })}
                  className="text-2xl text-blue-500 dark:text-blue-400 focus:outline-none"
                >
                  <FontAwesomeIcon icon={config.isEnabled ? faToggleOn : faToggleOff} className={config.isEnabled ? "text-blue-500" : "text-gray-400"} />
                </button>
              </div>

              {/* Form Config Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Intervalo de Ejecución</label>
                  <select
                    disabled={!config.isEnabled}
                    value={config.intervalHours}
                    onChange={(e) => setConfig({ ...config, intervalHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                  >
                    <option value="12">Cada 12 Horas</option>
                    <option value="24">Cada 24 Horas (Diario)</option>
                    <option value="48">Cada 48 Horas (Cada 2 días)</option>
                    <option value="168">Cada 168 Horas (Semanal)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Proyectos vinculados</label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input 
                      type="checkbox"
                      disabled={!config.isEnabled}
                      checked={config.syncProjects}
                      onChange={(e) => setConfig({ ...config, syncProjects: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Sincronizar proyectos de empleados</span>
                  </label>
                </div>
              </div>

              {/* Cron Run Info */}
              {config.isEnabled && (
                <div className="p-3 bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/40 rounded-xl space-y-2">
                  <h4 className="text-xs font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faCalendarAlt} />
                    Próxima Ejecución Programada
                  </h4>
                  <p className="text-sm font-bold text-blue-950 dark:text-blue-200">
                    {config.nextRun ? formatDate(config.nextRun) : "Programado al guardar"}
                  </p>
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 leading-normal">
                    La sincronización corre en segundo plano y se activará a la hora programada si el servidor está encendido.
                  </p>
                </div>
              )}
            </div>
            
            <div className="p-5 bg-gray-50/20 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-700/80 flex justify-end">
              <button
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm w-full sm:w-auto"
              >
                {savingConfig ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-3"></div>
                    Guardando...
                  </>
                ) : "Guardar Configuración"}
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Tabs and Data Tables Card */}
      {!fetchingData && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden mt-6">
          <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 px-5 pt-3">
            <div className="flex border-b border-gray-200 dark:border-gray-700 -mb-px">
              <button
                onClick={() => setActiveTab("users")}
                className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all ${
                  activeTab === "users" 
                    ? "border-blue-500 text-blue-600 dark:text-blue-400" 
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                Nuevos Usuarios ({latestSync?.addedUsers?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab("projects")}
                className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all ${
                  activeTab === "projects" 
                    ? "border-blue-500 text-blue-600 dark:text-blue-400" 
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                Nuevos Proyectos ({latestSync?.addedProjects?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all ${
                  activeTab === "history" 
                    ? "border-blue-500 text-blue-600 dark:text-blue-400" 
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                Historial de Ejecuciones
              </button>
            </div>
          </div>

          <div className="p-5">
            {/* Tab: Users */}
            {activeTab === "users" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Usuarios creados en la última sincronización
                  </h3>
                </div>
                {!latestSync || latestSync.addedUsers.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 dark:text-gray-400 text-sm">
                    No se crearon nuevos usuarios en la última ejecución exitosa.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre Completo</th>
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Correo Electrónico</th>
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contraseña Temporal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                        {latestSync.addedUsers.map((u, i) => (
                          <tr key={u._id || i} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                            <td className="px-5 py-4 text-sm font-semibold text-gray-900 dark:text-white">{u.name}</td>
                            <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{u.email}</td>
                            <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400 font-mono">ChangeMe123!</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Projects */}
            {activeTab === "projects" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Asignaciones de proyectos nuevos en la última sincronización
                  </h3>
                </div>
                {!latestSync || latestSync.addedProjects.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 dark:text-gray-400 text-sm">
                    No se detectaron nuevas asignaciones de proyectos en la última ejecución exitosa.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre del Proyecto</th>
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID Proyecto en FRAME</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                        {latestSync.addedProjects.map((p, i) => (
                          <tr key={p._id || i} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                            <td className="px-5 py-4 text-sm font-semibold text-gray-900 dark:text-white">{p.name}</td>
                            <td className="px-5 py-4 text-sm font-mono text-gray-550 dark:text-gray-400">{p.externalId}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab: History */}
            {activeTab === "history" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Registro histórico de ejecuciones
                  </h3>
                </div>
                {history.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 dark:text-gray-400 text-sm">
                    Aún no se registran ejecuciones históricas de sincronización.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha / Hora</th>
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ejecutor</th>
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                          <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Creados</th>
                          <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Omitidos</th>
                          <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Errores</th>
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Detalles</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                        {history.map((h) => (
                          <tr key={h._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                            <td className="px-5 py-4 text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatDate(h.createdAt)}</td>
                            <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{getExecutorName(h)}</td>
                            <td className="px-5 py-4 text-sm whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                h.status === "success" 
                                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400"
                                  : "bg-rose-50 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400"
                              }`}>
                                {h.status === "success" ? "Exitoso" : "Fallido"}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-sm text-center text-blue-600 dark:text-blue-400 font-bold">{h.stats.createdUsers}</td>
                            <td className="px-5 py-4 text-sm text-center text-emerald-600 dark:text-emerald-400 font-bold">{h.stats.skippedUsers ?? 0}</td>
                            <td className="px-5 py-4 text-sm text-center text-rose-600 dark:text-rose-400 font-bold">{h.stats.errorsUsers}</td>
                            <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={h.errorDetails}>
                              {h.errorDetails || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </PageLayout>
  );
};
