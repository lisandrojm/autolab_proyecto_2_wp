import React, { useEffect, useRef, useState } from "react";
import axios from "../api/axiosConfig";
import { PageLayout } from "../components/ui/PageLayout";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRotateRight,
  faCheckCircle,
  faExclamationTriangle,
  faUserPlus,
  faUserCheck,
  faExclamationCircle,
  faClock,
  faDatabase
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
  dni?: string;
  _id?: string;
}

interface AddedProject {
  name: string;
  externalId: number;
  _id?: string;
}

interface ContractInfo {
  nombre_contrato: string;
  nombre_rol_frame: string;
  fecha_alta_contrato: string;
  fecha_baja_contrato: string;
}

interface UserProjectInfo {
  nombre_proyecto: string;
  nombre_rol_frame: string;
  contracts: ContractInfo[];
}

interface AddedUserDetail {
  name: string;
  email: string;
  dni: string;
  projects: UserProjectInfo[];
}

interface HistoryItem {
  _id: string;
  status: "running" | "success" | "failed";
  executedBy: { firstName?: string; lastName?: string; email?: string } | string;
  stats: SyncStats;
  addedUsers: AddedUser[];
  addedProjects: AddedProject[];
  errorDetails?: string;
  createdAt: string;
}

export const ImportUsersWpPage: React.FC = () => {
  const HELP_KEY = "importUsersWp" as const;
  const helpEntry = getHelp(HELP_KEY);
  const [showInfo, setShowInfo] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "projects" | "history">("users");
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);

  // States for stats and sync
  const [latestSync, setLatestSync] = useState<HistoryItem | null>(null);
  const [addedUsersDetails, setAddedUsersDetails] = useState<AddedUserDetail[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

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

  // Polling del estado mientras la sincronización está en curso (ver comentario en el backend:
  // el sync recorre ~1900+ empleados secuencialmente y puede tardar varios minutos, muy por
  // encima de cualquier timeout de request HTTP, así que se dispara en segundo plano).
  const pollingRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  const startPolling = () => {
    stopPolling();
    pollingRef.current = window.setInterval(async () => {
      try {
        const res = await axios.get("/users/import/history/latest");
        const latest: HistoryItem | null = res.data;
        setLatestSync(latest);
        if (latest && latest.status !== "running") {
          stopPolling();
          setLoading(false);
          if (latest.status === "success") {
            showToast("Sincronización completada con éxito", "success");
          } else {
            showToast(latest.errorDetails || "La sincronización terminó con errores", "error");
          }
          await fetchData();
        }
      } catch (err) {
        // Error transitorio de red al consultar el estado: no se corta el polling, se reintenta
        // en el próximo tick.
        console.error("Error polling import status:", err);
      }
    }, 5000);
  };

  const fetchData = async () => {
    setFetchingData(true);
    try {
      // 1. Fetch latest import run info
      const latestRes = await axios.get("/users/import/history/latest");
      const latest: HistoryItem | null = latestRes.data;
      setLatestSync(latest);

      // Si ya hay una corrida en curso (disparada por otra persona, o esta misma pestaña se
      // recargó a mitad de camino), se retoma el polling en vez de dejar la pantalla colgada.
      if (latest?.status === "running") {
        setLoading(true);
        startPolling();
      }

      // 1b. Fetch project/contract/rol-frame details for the last added users
      const detailsRes = await axios.get("/users/import/last-added-details");
      setAddedUsersDetails(detailsRes.data || []);

      // 2. Fetch full history list
      const historyRes = await axios.get("/users/import/history");
      setHistory(historyRes.data);
    } catch (err: any) {
      console.error("Error fetching data:", err);
      showToast("Error al cargar la información del servidor", "error");
    } finally {
      setFetchingData(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualSync = async () => {
    setLoading(true);
    try {
      // Sincronización SIEMPRE completa + con proyectos (sin opciones/automatización). El request
      // responde apenas se dispara (no espera a que termine); el resultado se sigue por polling.
      await axios.post("/users/import/trigger", { syncProjects: true });
      showToast("Sincronización iniciada: puede tardar varios minutos, esta pantalla se actualiza sola.", "success");
      startPolling();
    } catch (err: any) {
      if (err.response?.status === 409) {
        // Ya había una en curso (otra persona la disparó): igual la seguimos por polling.
        showToast(err.response?.data?.error || "Ya hay una sincronización en curso.", "error");
        startPolling();
        return;
      }
      console.error("Manual sync error:", err);
      const errMsg = err.response?.data?.error || "Falló la sincronización con la API de FRAME";
      showToast(errMsg, "error");
      setLoading(false);
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
      shouldShowInfo={hasHelp(HELP_KEY)}
      infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: helpEntry.title, size: helpEntry.size, content: helpEntry.content }}
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
        <div>

          {/* Main Sync Controls Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
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
                    <div
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                        latestSync.status === "running"
                          ? "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900 dark:text-blue-400"
                          : latestSync.status === "failed"
                            ? "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-400"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400"
                      }`}
                    >
                      {latestSync.status === "running" ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                          Sincronizando...
                        </>
                      ) : latestSync.status === "failed" ? (
                        <>
                          <FontAwesomeIcon icon={faExclamationCircle} />
                          Falló
                        </>
                      ) : (
                        <>
                          <FontAwesomeIcon icon={faCheckCircle} />
                          Sincronizado
                        </>
                      )}
                    </div>
                  )}
                </div>

                {latestSync?.status === "running" ? (
                  <div className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-800 text-center text-xs text-gray-500 dark:text-gray-400">
                    Trayendo empleados desde FRAME (puede tardar varios minutos)... esta pantalla se actualiza sola cuando termine.
                  </div>
                ) : (
                  latestSync && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-gray-200 dark:border-gray-800 text-center">
                      <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/40">
                        <span className="block text-2xl font-bold text-blue-600 dark:text-blue-400">{latestSync.stats.createdUsers}</span>
                        <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1 mt-1">
                          <FontAwesomeIcon icon={faUserPlus} className="text-blue-500" />
                          Creados
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/40">
                        <span className="block text-2xl font-bold text-amber-600 dark:text-amber-400">{latestSync.stats.updatedUsers ?? 0}</span>
                        <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1 mt-1">
                          <FontAwesomeIcon icon={faUserCheck} className="text-amber-500" />
                          Actualizados
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
                  )
                )}
              </div>

              {/* Qué hace la sincronización */}
              <div className="p-4 bg-blue-50/50 dark:bg-blue-950/10 rounded-xl border border-blue-100 dark:border-blue-900/40">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <FontAwesomeIcon icon={faDatabase} className="text-blue-500" />
                  ¿Qué hace "Sincronizar Ahora"?
                </h3>
                <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5 leading-relaxed list-disc list-inside">
                  <li>Trae <strong>todos</strong> los empleados desde FRAME (sincronización completa, no incremental).</li>
                  <li>Crea los <strong>usuarios nuevos</strong> (contraseña inicial = DNI) con rol <em>Mobile-Colaborador</em>; los que ya existen se <strong>omiten</strong>.</li>
                  <li>Actualiza de forma <strong>aditiva</strong> sus <strong>contratos, roles frame y datos personales</strong> (nunca pisa datos ya cargados en WeProdu).</li>
                  <li>Crea los <strong>proyectos de FRAME que falten</strong> (con su cliente y responsable) y <strong>vincula</strong> a cada empleado con su proyecto.</li>
                </ul>
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
                Nuevos Usuarios ({addedUsersDetails.length})
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
                {addedUsersDetails.length === 0 ? (
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
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contraseña (DNI)</th>
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Proyectos · Rol Frame · Contrato</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                        {(() => {
                          return addedUsersDetails.map((u, i) => {
                            const projects = u.projects || [];
                            return (
                              <tr key={u.email || i} className="hover:bg-gray-50 dark:hover:bg-gray-900/20 align-top">
                                <td className="px-5 py-4 text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{u.name}</td>
                                <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{u.email}</td>
                                <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">{u.dni || "—"}</td>
                                <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                                  {projects.length === 0 ? (
                                    <span className="text-gray-400">Sin proyectos</span>
                                  ) : (
                                    <div className="space-y-2">
                                      {projects.map((p, pi) => (
                                        <div key={pi} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
                                          <div className="font-semibold text-gray-900 dark:text-white">{p.nombre_proyecto || "—"}</div>
                                          <div className="text-xs text-gray-500 dark:text-gray-400">
                                            Rol Frame: <span className="font-medium text-gray-700 dark:text-gray-200">{p.nombre_rol_frame || "—"}</span>
                                          </div>
                                          {p.contracts.length > 0 && (
                                            <ul className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                                              {p.contracts.map((c, ci) => (
                                                <li key={ci}>
                                                  Contrato: <span className="font-medium text-gray-700 dark:text-gray-200">{c.nombre_contrato || "—"}</span>
                                                  {c.fecha_alta_contrato && (
                                                    <span> ({c.fecha_alta_contrato}{c.fecha_baja_contrato ? ` → ${c.fecha_baja_contrato}` : ""})</span>
                                                  )}
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()}
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
                          <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actualizados</th>
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
                                  : h.status === "running"
                                    ? "bg-blue-50 text-blue-800 dark:bg-blue-950/20 dark:text-blue-400"
                                    : "bg-rose-50 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400"
                              }`}>
                                {h.status === "success" ? "Exitoso" : h.status === "running" ? "En curso" : "Fallido"}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-sm text-center text-blue-600 dark:text-blue-400 font-bold">{h.stats.createdUsers}</td>
                            <td className="px-5 py-4 text-sm text-center text-amber-600 dark:text-amber-400 font-bold">{h.stats.updatedUsers ?? 0}</td>
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
