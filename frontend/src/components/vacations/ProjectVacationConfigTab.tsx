import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faToggleOn, faToggleOff, faBriefcase, faLayerGroup, faUserTag, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { projectsAPI, Project } from "../../api/projects";
import { clientsAPI, Client } from "../../api/clients";
import { areasAPI, Area } from "../../api/areas";
import { positionsAPI, Position } from "../../api/positions";
import { globalVacationConfigAPI, GlobalVacationConfig } from "../../api/globalVacationConfig";
import { sweetAlert } from "../../utils/sweetAlert";

type ConfigScope = "project" | "area" | "position";

export const ProjectVacationConfigTab: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [globalConfig, setGlobalConfig] = useState<GlobalVacationConfig | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isSavingGlobal, setIsSavingGlobal] = useState(false);
  const [scope, setScope] = useState<ConfigScope>("project");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [projectsData, clientsData, areasData, positionsData, globalConfigData] = await Promise.all([projectsAPI.listAll(), clientsAPI.listAll(), areasAPI.listAll(), positionsAPI.listAll(), globalVacationConfigAPI.getConfig()]);
      setProjects(projectsData);
      setClients(clientsData);
      setAreas(areasData);
      setPositions(positionsData);
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
    setProjects((prev) => prev.map((p) => (p._id === project._id ? { ...p, vacationConfig: { ...p.vacationConfig, ...updates } } : p)));

    setSavingId(project._id);
    try {
      const updatedConfig = {
        useGlobalConfig: true,
        permiteFraccionadas: true,
        ...project.vacationConfig,
        ...updates,
      };
      if (updatedConfig.minDiasFraccion !== undefined && updatedConfig.minDiasFraccion !== null && updatedConfig.minDiasFraccion < 1) {
        updatedConfig.minDiasFraccion = 1;
      }
      await projectsAPI.updateProject(project._id, { vacationConfig: updatedConfig });
      sweetAlert.success("Actualizado", "Configuración de proyecto guardada");
    } catch (error) {
      console.error("Error updating project:", error);
      sweetAlert.error("Error", "No se pudo actualizar");
      setProjects((prev) => prev.map((p) => (p._id === project._id ? originalProject : p)));
    } finally {
      setSavingId(null);
    }
  };

  const handleUpdateAreaConfig = async (area: Area, updates: any) => {
    const originalArea = { ...area };
    setAreas((prev) => prev.map((a) => (a._id === area._id ? { ...a, vacationConfig: { ...a.vacationConfig, ...updates } } : a)));

    setSavingId(area._id);
    try {
      const updatedConfig = {
        useGlobalConfig: true,
        permiteFraccionadas: true,
        ...area.vacationConfig,
        ...updates,
      };
      if (updatedConfig.minDiasFraccion !== undefined && updatedConfig.minDiasFraccion !== null && updatedConfig.minDiasFraccion < 1) {
        updatedConfig.minDiasFraccion = 1;
      }
      await areasAPI.update(area._id, { vacationConfig: updatedConfig } as any);
      sweetAlert.success("Actualizado", "Configuración de área guardada");
    } catch (error) {
      console.error("Error updating area:", error);
      sweetAlert.error("Error", "No se pudo actualizar");
      setAreas((prev) => prev.map((a) => (a._id === area._id ? originalArea : a)));
    } finally {
      setSavingId(null);
    }
  };

  const handleUpdatePositionConfig = async (position: Position, updates: any) => {
    const originalPosition = { ...position };
    setPositions((prev) => prev.map((p) => (p._id === position._id ? { ...p, vacationConfig: { ...p.vacationConfig, ...updates } } : p)));

    setSavingId(position._id);
    try {
      const updatedConfig = {
        useGlobalConfig: true,
        permiteFraccionadas: true,
        ...position.vacationConfig,
        ...updates,
      };
      if (updatedConfig.minDiasFraccion !== undefined && updatedConfig.minDiasFraccion !== null && updatedConfig.minDiasFraccion < 1) {
        updatedConfig.minDiasFraccion = 1;
      }
      await positionsAPI.update(position._id, { vacationConfig: updatedConfig } as any);
      sweetAlert.success("Actualizado", "Configuración de cargo guardada");
    } catch (error) {
      console.error("Error updating position:", error);
      sweetAlert.error("Error", "No se pudo actualizar");
      setPositions((prev) => prev.map((p) => (p._id === position._id ? originalPosition : p)));
    } finally {
      setSavingId(null);
    }
  };

  const renderConfigRow = (id: string, title: string, subtitle: string | undefined, config: any, onUpdate: (updates: any) => void, onLocalChange: (updates: any) => void) => {
    // Determine effective value for display (not logic, just visual)
    const effectivePermitted = config.useGlobalConfig ? globalConfig?.permiteFraccionadas : config.permiteFraccionadas;
    const effectiveMinDays = config.useGlobalConfig ? globalConfig?.minDiasFraccion : (config.minDiasFraccion ?? 1);

    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1">
            <h4 className="font-medium text-gray-900 dark:text-gray-100">{title}</h4>
            {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Use Global Config Toggle */}
            <button
              onClick={() => {
                const willUseGlobal = !config.useGlobalConfig;
                const updates: any = { useGlobalConfig: willUseGlobal };

                if (willUseGlobal) {
                  // Switching TO Global: Clear custom specific values
                  updates.minDiasFraccion = null;
                } else {
                  // Switching TO Custom: Pre-fill with current global configuration
                  updates.permiteFraccionadas = globalConfig?.permiteFraccionadas ?? true;
                  updates.minDiasFraccion = globalConfig?.minDiasFraccion ?? 1;
                }

                onUpdate(updates);
              }}
              className={`px-3 py-1.5 rounded border text-sm font-medium flex items-center gap-2 transition-colors ${config.useGlobalConfig ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300" : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}
            >
              <FontAwesomeIcon icon={config.useGlobalConfig ? faToggleOn : faToggleOff} />
              Usar Global
            </button>

            {!config.useGlobalConfig && (
              <>
                <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block"></div>

                {/* Permite Fraccionadas Toggle */}
                <button
                  onClick={() => {
                    const newValue = !config.permiteFraccionadas;
                    const updates: any = { permiteFraccionadas: newValue };
                    if (!newValue) {
                      updates.minDiasFraccion = null; // Clear if disabling
                    } else if (!config.minDiasFraccion) {
                      updates.minDiasFraccion = globalConfig?.minDiasFraccion ?? 1; // Default if enabling
                    }
                    onUpdate(updates);
                  }}
                  className={`px-3 py-1.5 rounded border text-sm font-medium flex items-center gap-2 transition-colors ${config.permiteFraccionadas ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300" : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}
                >
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
                        const val = parseInt(e.target.value) || 0;
                        onLocalChange({ minDiasFraccion: val });
                      }}
                      className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      onClick={() => {
                        const currentVal = config.minDiasFraccion || 0;
                        const finalVal = currentVal < 1 ? 1 : currentVal;
                        onUpdate({ minDiasFraccion: finalVal });
                      }}
                      disabled={savingId === id}
                      className="w-28 px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {savingId === id ? (
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

            {/* Display effective state text */}
            <div className="flex flex-col items-end min-w-[100px]">
              <span className="text-xs text-gray-400 italic">Efectivo: {effectivePermitted ? "Permitido" : "No"}</span>
              {effectivePermitted && <span className="text-[10px] text-gray-400 italic">Min: {effectiveMinDays} días</span>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <FontAwesomeIcon icon={faSpinner} className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Configuración de Fraccionamiento</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">Personaliza las reglas de fraccionamiento para cada entidad. Si se activa la configuración personalizada, anulará la configuración global.</p>
        <div className="mt-2 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 p-2 rounded flex flex-col items-start gap-1">
          <p className="ml-1">
            <strong>Fraccionamiento:</strong> Permite tomar vacaciones en periodos más cortos que el total anual.
          </p>
          <p className="ml-1 font-bold">Jerarquía de aplicación: Cargo &gt; Área &gt; Proyecto &gt; Global</p>
        </div>
      </div>

      {globalConfig && (
        <div className="mb-8 bg-blue-50 dark:bg-blue-900/20 p-4 rounded border border-blue-100 dark:border-blue-800">
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
              className={`px-3 py-1.5 rounded border text-sm font-medium flex items-center gap-2 transition-colors ${globalConfig.permiteFraccionadas ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300" : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}
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
                  className="w-28 px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors flex items-center justify-center gap-2"
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

      {/* Scope Selector */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <button onClick={() => setScope("project")} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${scope === "project" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
          <FontAwesomeIcon icon={faBriefcase} /> Proyectos
        </button>
        <button onClick={() => setScope("area")} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${scope === "area" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
          <FontAwesomeIcon icon={faLayerGroup} /> Áreas
        </button>
        <button onClick={() => setScope("position")} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${scope === "position" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
          <FontAwesomeIcon icon={faUserTag} /> Cargos
        </button>
      </div>

      <div className="space-y-4">
        {scope === "project" &&
          (projects.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No hay proyectos.</p>
          ) : (
            projects.map((project) => {
              const client = clients.find((c) => c._id === (typeof project.clientId === "string" ? project.clientId : (project.clientId as any)._id));
              const config = { useGlobalConfig: true, permiteFraccionadas: true, minDiasFraccion: 1, ...project.vacationConfig };
              return (
                <div key={project._id}>
                  {renderConfigRow(
                    project._id,
                    project.name,
                    client?.name,
                    config,
                    (updates) => handleUpdateProjectConfig(project, updates),
                    (updates) => setProjects((prev) => prev.map((p) => (p._id === project._id ? { ...p, vacationConfig: { ...p.vacationConfig, ...updates } } : p)))
                  )}
                </div>
              );
            })
          ))}

        {scope === "area" &&
          (areas.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No hay áreas.</p>
          ) : (
            areas.map((area) => {
              const config = { useGlobalConfig: true, permiteFraccionadas: true, minDiasFraccion: 1, ...area.vacationConfig };
              return (
                <div key={area._id}>
                  {renderConfigRow(
                    area._id,
                    area.name,
                    area.description,
                    config,
                    (updates) => handleUpdateAreaConfig(area, updates),
                    (updates) => setAreas((prev) => prev.map((a) => (a._id === area._id ? { ...a, vacationConfig: { ...a.vacationConfig, ...updates } } : a)))
                  )}
                </div>
              );
            })
          ))}

        {scope === "position" &&
          (positions.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No hay cargos.</p>
          ) : (
            positions.map((position) => {
              const config = { useGlobalConfig: true, permiteFraccionadas: true, minDiasFraccion: 1, ...position.vacationConfig };
              return (
                <div key={position._id}>
                  {renderConfigRow(
                    position._id,
                    position.name,
                    position.description,
                    config,
                    (updates) => handleUpdatePositionConfig(position, updates),
                    (updates) => setPositions((prev) => prev.map((p) => (p._id === position._id ? { ...p, vacationConfig: { ...p.vacationConfig, ...updates } } : p)))
                  )}
                </div>
              );
            })
          ))}
      </div>
    </div>
  );
};
