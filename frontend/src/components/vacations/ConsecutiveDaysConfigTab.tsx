import React, { useState, useEffect } from "react";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faToggleOn, faToggleOff, faInfoCircle, faBriefcase, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { projectsAPI, Project } from "../../api/projects";
import { clientsAPI, Client } from "../../api/clients";
import { areasAPI, Area } from "../../api/areas";
import { vacationConfigAPI, VacationConfig } from "../../api/vacationConfig";
import { sweetAlert } from "../../utils/sweetAlert";

type ConfigScope = "project" | "area";

export const ConsecutiveDaysConfigTab: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [globalConfig, setGlobalConfig] = useState<VacationConfig | null>(null);

  const [loading, setLoading] = useState(true);
  const [isSavingGlobal, setIsSavingGlobal] = useState(false);
  const [scope, setScope] = useState<ConfigScope>("project");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [projectsData, clientsData, areasData, globalConfigData] = await Promise.all([projectsAPI.listAll(), clientsAPI.listAll(), areasAPI.listAll(), vacationConfigAPI.getConfig()]);
      setProjects(projectsData);
      setClients(clientsData);
      setAreas(areasData);
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

    try {
      const updatedConfig = {
        useGlobalConfig: true,
        permiteFraccionadas: true,
        ...project.vacationConfig,
        ...updates,
      };
      await projectsAPI.updateProject(project._id, { vacationConfig: updatedConfig });
      sweetAlert.success("Actualizado", "Configuración de proyecto guardada");
    } catch (error) {
      console.error("Error updating project:", error);
      sweetAlert.error("Error", "No se pudo actualizar");
      setProjects((prev) => prev.map((p) => (p._id === project._id ? originalProject : p)));
    }
  };

  const handleUpdateAreaConfig = async (area: Area, updates: any) => {
    const originalArea = { ...area };
    setAreas((prev) => prev.map((a) => (a._id === area._id ? { ...a, vacationConfig: { ...a.vacationConfig, ...updates } } : a)));

    try {
      const updatedConfig = {
        useGlobalConfig: true,
        permiteFraccionadas: true,
        ...area.vacationConfig,
        ...updates,
      };
      await areasAPI.update(area._id, { vacationConfig: updatedConfig } as any);
      sweetAlert.success("Actualizado", "Configuración de área guardada");
    } catch (error) {
      console.error("Error updating area:", error);
      sweetAlert.error("Error", "No se pudo actualizar");
      setAreas((prev) => prev.map((a) => (a._id === area._id ? originalArea : a)));
    }
  };


  const renderConfigRow = (title: string, subtitle: string | undefined, config: any, onUpdate: (updates: any) => void, effectiveValue: boolean | undefined) => (
    <div className="border border-gray-200 dark:border-gray-700 rounded p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 dark:text-gray-100">{title}</h4>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Use Global Config Toggle */}
          <button onClick={() => onUpdate({ useGlobalConfig: !config.useGlobalConfig })} className={`px-3 py-1.5 rounded border text-sm font-medium flex items-center gap-2 transition-colors ${config.useGlobalConfig ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300" : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}>
            <FontAwesomeIcon icon={config.useGlobalConfig ? faToggleOn : faToggleOff} />
            Usar Global
          </button>

          {!config.useGlobalConfig && (
            <>
              <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block"></div>
              {/* Dias Corridos Toggle */}
              <button onClick={() => onUpdate({ diasCorridos: !config.diasCorridos })} className={`px-3 py-1.5 rounded border text-sm font-medium flex items-center gap-2 transition-colors ${config.diasCorridos ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-300" : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}>
                <FontAwesomeIcon icon={config.diasCorridos ? faToggleOn : faToggleOff} />
                {config.diasCorridos ? "Días Corridos" : "Días Hábiles"}
              </button>
            </>
          )}

          {/* Display effective state text */}
          <span className="text-xs text-gray-400 italic min-w-[100px] text-right">Efectivo: {effectiveValue ? "Corridos" : "Hábiles"}</span>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return <LoadingSpinner message="Cargando reglas..." />;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Configuración de Días Corridos</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">Personaliza la regla de días corridos para cada entidad. Si se activa la configuración personalizada, anulará la configuración global.</p>
        <div className="mt-2 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 p-2 rounded flex flex-col items-start gap-1">
          <div className="flex items-start gap-2">
            <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5" />
            <p>
              La regla de <strong>Días Corridos</strong> establece que si las vacaciones finalizan un viernes (o sábado), se computarán automáticamente los días del fin de semana como días corridos.
            </p>
          </div>
          <p className="ml-5 font-bold">Jerarquía de aplicación: Cargo &gt; Área &gt; Proyecto &gt; Global</p>
        </div>
      </div>

      {globalConfig && (
        <div className="mb-8 bg-blue-50 dark:bg-blue-900/20 p-4 rounded border border-blue-100 dark:border-blue-800">
          <h4 className="text-md font-semibold text-blue-900 dark:text-blue-100 mb-3">Configuración Global</h4>
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={async () => {
                const newValue = !globalConfig.diasCorridos;
                setGlobalConfig({ ...globalConfig, diasCorridos: newValue });
                try {
                  setIsSavingGlobal(true);
                  await vacationConfigAPI.updateConfig({ ...globalConfig, diasCorridos: newValue });
                  sweetAlert.success("Actualizado", "Configuración global actualizada");
                } catch (e) {
                  console.error(e);
                  setGlobalConfig(globalConfig); // revert
                  sweetAlert.error("Error", "No se pudo actualizar");
                } finally {
                  setIsSavingGlobal(false);
                }
              }}
              disabled={isSavingGlobal}
              className={`px-3 py-1.5 rounded border text-sm font-medium flex items-center gap-2 transition-colors ${globalConfig.diasCorridos ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300" : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}
            >
              {isSavingGlobal ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={globalConfig.diasCorridos ? faToggleOn : faToggleOff} />}
              {globalConfig.diasCorridos ? "Activado (Días corridos)" : "Desactivado (Días hábiles)"}
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400">{globalConfig.diasCorridos ? "Se contarán fines de semana consecuentes" : "Solo se cuentan días hábiles"}</span>
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
      </div>

      <div className="space-y-4">
        {scope === "project" &&
          (projects.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No hay proyectos.</p>
          ) : (
            projects.map((project) => {
              const client = clients.find((c) => c._id === (typeof project.clientId === "string" ? project.clientId : (project.clientId as any)._id));
              const config = { useGlobalConfig: true, permiteFraccionadas: true, diasCorridos: false, ...project.vacationConfig };
              const effectiveValue = config.useGlobalConfig ? globalConfig?.diasCorridos : config.diasCorridos;
              return <div key={project._id}>{renderConfigRow(project.name, client?.name, config, (updates) => handleUpdateProjectConfig(project, updates), effectiveValue)}</div>;
            })
          ))}

        {scope === "area" &&
          (areas.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No hay áreas.</p>
          ) : (
            areas.map((area) => {
              const config = { useGlobalConfig: true, permiteFraccionadas: true, diasCorridos: false, ...area.vacationConfig };
              const effectiveValue = config.useGlobalConfig ? globalConfig?.diasCorridos : config.diasCorridos;
              return <div key={area._id}>{renderConfigRow(area.name, area.description, config, (updates) => handleUpdateAreaConfig(area, updates), effectiveValue)}</div>;
            })
          ))}

      </div>
    </div>
  );
};
