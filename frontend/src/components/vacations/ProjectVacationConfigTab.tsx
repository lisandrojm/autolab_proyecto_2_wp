import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faToggleOn, faToggleOff } from "@fortawesome/free-solid-svg-icons";
import { projectsAPI, Project } from "../../api/projects";
import { clientsAPI, Client } from "../../api/clients";
import { globalVacationConfigAPI, GlobalVacationConfig } from "../../api/globalVacationConfig";
import { sweetAlert } from "../../utils/sweetAlert";

export const ProjectVacationConfigTab: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [globalConfig, setGlobalConfig] = useState<GlobalVacationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isSavingGlobal, setIsSavingGlobal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [projectsData, clientsData, globalConfigData] = await Promise.all([projectsAPI.listAll(), clientsAPI.listAll(), globalVacationConfigAPI.getConfig()]);
      setProjects(projectsData);
      setClients(clientsData);
      setGlobalConfig(globalConfigData);
    } catch (error) {
      console.error("Error loading data:", error);
      sweetAlert.error("Error", "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProjectConfig = async (project: Project, updates: any) => {
    const originalProject = { ...project };

    // Optimistic update
    setProjects((prev) => prev.map((p) => (p._id === project._id ? { ...p, vacationConfig: { ...p.vacationConfig, ...updates } } : p)));

    setSavingId(project._id);
    try {
      const updatedConfig = {
        useGlobalConfig: true,
        permiteFraccionadas: true,
        ...project.vacationConfig,
        ...updates,
      };

      // Sanitize minDiasFraccion
      if (updatedConfig.minDiasFraccion !== undefined && updatedConfig.minDiasFraccion < 1) {
        updatedConfig.minDiasFraccion = 1;
      }

      await projectsAPI.updateProject(project._id, { vacationConfig: updatedConfig });
      sweetAlert.success("Actualizado", "Configuración guardada correctamente");
      // Success - no need to do anything as state is already updated
    } catch (error) {
      console.error("Error updating project:", error);
      sweetAlert.error("Error", "No se pudo actualizar la configuración del proyecto");
      // Revert optimistic update
      setProjects((prev) => prev.map((p) => (p._id === project._id ? originalProject : p)));
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <FontAwesomeIcon icon={faSpinner} className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Configuración de Vacaciones por Proyecto</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">Personaliza las reglas de fraccionamiento para cada proyecto. Si se activa la configuración personalizada, anulará la configuración global para los empleados asignados a dicho proyecto.</p>
      </div>

      {globalConfig && (
        <div className="mb-8 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
          <h4 className="text-md font-semibold text-blue-900 dark:text-blue-100 mb-3">Configuración Global</h4>
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={async () => {
                const newValue = !globalConfig.permiteFraccionadas;
                setGlobalConfig({ ...globalConfig, permiteFraccionadas: newValue });
                try {
                  await globalVacationConfigAPI.updateConfig({ ...globalConfig, permiteFraccionadas: newValue });
                  sweetAlert.success("Actualizado", "Configuración global actualizada");
                } catch (e) {
                  console.error(e);
                  setGlobalConfig(globalConfig); // revert
                }
              }}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium flex items-center gap-2 transition-colors ${globalConfig.permiteFraccionadas ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300" : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}
            >
              <FontAwesomeIcon icon={globalConfig.permiteFraccionadas ? faToggleOn : faToggleOff} />
              {globalConfig.permiteFraccionadas ? "Permitido" : "No permitido"}
            </button>

            {globalConfig.permiteFraccionadas && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700 dark:text-gray-300">Min. Días:</label>
                <input
                  type="number"
                  min="1"
                  value={globalConfig.minDiasFraccion || ""}
                  onChange={async (e) => {
                    const val = parseInt(e.target.value) || 0;
                    setGlobalConfig({ ...globalConfig, minDiasFraccion: val });
                  }}
                  className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100"
                />
                <button
                  onClick={async () => {
                    setIsSavingGlobal(true);
                    try {
                      await globalVacationConfigAPI.updateConfig(globalConfig);
                      sweetAlert.success("Guardado", "Configuración actualizada");
                    } catch (e) {
                      console.error(e);
                      sweetAlert.error("Error", "No se pudo actualizar la configuración global");
                    } finally {
                      setIsSavingGlobal(false);
                    }
                  }}
                  className="w-28 px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  disabled={isSavingGlobal}
                >
                  {isSavingGlobal ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} className="animate-spin text-sm" />
                      <span>Aplicando...</span>
                    </>
                  ) : (
                    <span>Aplicar</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {projects.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">No hay proyectos disponibles.</p>
        ) : (
          projects.map((project) => {
            const client = clients.find((c) => c._id === (typeof project.clientId === "string" ? project.clientId : (project.clientId as any)._id));
            const config = {
              useGlobalConfig: true,
              permiteFraccionadas: true,
              minDiasFraccion: 1,
              ...project.vacationConfig,
            };
            // Ensure minDiasFraccion is normalized if it came as null/undefined from DB but the object existed
            if (config.minDiasFraccion === undefined || config.minDiasFraccion === null) {
              config.minDiasFraccion = 1;
            }

            return (
              <div key={project._id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">{project.name}</h4>
                    {client && <p className="text-sm text-gray-500 dark:text-gray-400">{client.name}</p>}
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                    {/* Use Global Config Toggle */}
                    <button onClick={() => handleUpdateProjectConfig(project, { useGlobalConfig: !config.useGlobalConfig })} className={`px-3 py-1.5 rounded-lg border text-sm font-medium flex items-center gap-2 transition-colors ${config.useGlobalConfig ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300" : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}>
                      <FontAwesomeIcon icon={config.useGlobalConfig ? faToggleOn : faToggleOff} />
                      Usar Global
                    </button>

                    {!config.useGlobalConfig && (
                      <>
                        <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block"></div>

                        {/* Permite Fraccionadas Toggle */}
                        <button onClick={() => handleUpdateProjectConfig(project, { permiteFraccionadas: !config.permiteFraccionadas })} className={`px-3 py-1.5 rounded-lg border text-sm font-medium flex items-center gap-2 transition-colors ${config.permiteFraccionadas ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300" : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}>
                          <FontAwesomeIcon icon={config.permiteFraccionadas ? faToggleOn : faToggleOff} />
                          Permitir Fraccionamiento
                        </button>

                        {/* Min Days Input */}
                        {config.permiteFraccionadas && (
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">Días Mínimos:</label>
                            <input
                              type="number"
                              min="1"
                              value={config.minDiasFraccion || ""}
                              onChange={(e) => {
                                // Update local state ONLY
                                const val = parseInt(e.target.value) || 0;
                                setProjects((prev) => prev.map((p) => (p._id === project._id ? { ...p, vacationConfig: { ...p.vacationConfig, ...config, minDiasFraccion: val } } : p)));
                              }}
                              className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
                              placeholder=""
                            />
                            <button
                              onClick={() => {
                                const currentVal = config.minDiasFraccion || 0;
                                const finalVal = currentVal < 1 ? 1 : currentVal;
                                handleUpdateProjectConfig(project, { minDiasFraccion: finalVal });
                              }}
                              className="w-28 px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                              disabled={savingId === project._id}
                            >
                              {savingId === project._id ? (
                                <>
                                  <FontAwesomeIcon icon={faSpinner} className="animate-spin text-sm" />
                                  <span>Aplicando...</span>
                                </>
                              ) : (
                                <span>Aplicar</span>
                              )}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
