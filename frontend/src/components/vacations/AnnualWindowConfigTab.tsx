import React, { useState, useEffect } from "react";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faToggleOn, faToggleOff, faInfoCircle, faBriefcase, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { projectsAPI, Project } from "../../api/projects";
import { clientsAPI, Client } from "../../api/clients";
import { areasAPI, Area } from "../../api/areas";
import { vacationConfigAPI, VacationConfig } from "../../api/vacationConfig";
import { sweetAlert } from "../../utils/sweetAlert";
import { diasDelMesSinAnio, normalizarVentana, resumenDeVentana, unirVentanas, ventanaDeEntidad, type VentanaGoce } from "@compartido/ventanaGoce";

/*
  VENTANA ANUAL DE GOCE (10/11/2026): el tramo del año en que se pueden tomar vacaciones (p. ej. del
  1/11 al 30/4). Calcada de «Días Corridos»: la global arriba y, debajo, la excepción por Proyecto o
  Área con «Usar Global» y el chip «Efectivo:».

  Las fechas no llevan año —la ventana se repite todas las temporadas— y viajan como "MM-DD". Si el
  inicio es posterior al fin, la ventana cruza el fin de año (noviembre → abril). Las cuentas son las
  de `@compartido/ventanaGoce`, las mismas con las que el server frena una solicitud.

  «Usar Global» es EL MISMO interruptor de Fraccionamiento y Días Corridos (`vacationConfig.useGlobalConfig`):
  la pantalla lo dice, porque apagarlo acá también deja al proyecto con su fraccionamiento propio.
*/

type ConfigScope = "project" | "area";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dosDigitos = (n: number) => String(n).padStart(2, "0");
const claseSelect = "px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed";

/** Día y mes, sin año. Al cambiar el mes, el día se acomoda a los que ese mes tiene (31/4 → 30/4). */
const SelectorDiaMes: React.FC<{ value: string; onChange: (mesDia: string) => void; disabled?: boolean; etiqueta: string }> = ({ value, onChange, disabled, etiqueta }) => {
  const mes = Number(value.slice(0, 2)) || 1;
  const dia = Number(value.slice(3, 5)) || 1;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{etiqueta}</span>
      <select aria-label={`${etiqueta}: día`} disabled={disabled} value={dia} onChange={(e) => onChange(`${dosDigitos(mes)}-${dosDigitos(Number(e.target.value))}`)} className={claseSelect}>
        {Array.from({ length: diasDelMesSinAnio(mes) }, (_x, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select aria-label={`${etiqueta}: mes`} disabled={disabled} value={mes} onChange={(e) => { const m = Number(e.target.value); onChange(`${dosDigitos(m)}-${dosDigitos(Math.min(dia, diasDelMesSinAnio(m)))}`); }} className={claseSelect}>
        {MESES.map((nombre, i) => (
          <option key={nombre} value={i + 1}>
            {nombre}
          </option>
        ))}
      </select>
    </div>
  );
};

const CAMPOS_DE_VENTANA = ["ventanaGoceEnabled", "ventanaGoceInicio", "ventanaGoceFin"] as const;
/** ¿El servidor guardó lo que se le mandó de la ventana? Uno anterior al cambio descarta esos campos sin avisar. */
const servidorSinVentana = (enviado: Record<string, unknown>, respuesta: any): boolean => CAMPOS_DE_VENTANA.some((c) => enviado[c] !== undefined && respuesta?.vacationConfig && respuesta.vacationConfig[c] === undefined);
const AVISO_SERVIDOR = "El servidor todavía no admite la ventana anual: hay que publicar la versión nueva.";

export const AnnualWindowConfigTab: React.FC = () => {
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

  /** La ventana global, leída tolerando un servidor que todavía no la manda (queda apagada, 1/11 – 30/4). */
  const ventanaGlobal: VentanaGoce = normalizarVentana(globalConfig?.ventanaGoce);

  const guardarGlobal = async (nueva: VentanaGoce) => {
    if (!globalConfig) return;
    const anterior = globalConfig;
    setGlobalConfig({ ...globalConfig, ventanaGoce: nueva });
    try {
      setIsSavingGlobal(true);
      // Sólo la ventana: mandar la configuración entera pisaría, con lo que esta pestaña tenía cargado, lo que se haya cambiado en otra.
      const guardada = await vacationConfigAPI.updateConfig({ ventanaGoce: nueva });
      if (!guardada?.ventanaGoce) {
        setGlobalConfig(anterior);
        sweetAlert.warning("No se guardó", AVISO_SERVIDOR);
        return;
      }
      sweetAlert.success("Actualizado", "Ventana anual global actualizada");
    } catch (e: any) {
      console.error(e);
      setGlobalConfig(anterior);
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo actualizar");
    } finally {
      setIsSavingGlobal(false);
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
      const respuesta = await projectsAPI.updateProject(project._id, { vacationConfig: updatedConfig });
      if (servidorSinVentana(updates, respuesta)) {
        setProjects((prev) => prev.map((p) => (p._id === project._id ? originalProject : p)));
        sweetAlert.warning("No se guardó", AVISO_SERVIDOR);
        return;
      }
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
      const respuesta = await areasAPI.update(area._id, { vacationConfig: updatedConfig } as any);
      if (servidorSinVentana(updates, respuesta)) {
        setAreas((prev) => prev.map((a) => (a._id === area._id ? originalArea : a)));
        sweetAlert.warning("No se guardó", AVISO_SERVIDOR);
        return;
      }
      sweetAlert.success("Actualizado", "Configuración de área guardada");
    } catch (error) {
      console.error("Error updating area:", error);
      sweetAlert.error("Error", "No se pudo actualizar");
      setAreas((prev) => prev.map((a) => (a._id === area._id ? originalArea : a)));
    }
  };

  const renderConfigRow = (title: string, subtitle: string | undefined, config: any, onUpdate: (updates: any) => void) => {
    // La ventana de la entidad: la global si usa la global; si no, la suya (lo que no definió sale de la global).
    const propia = ventanaDeEntidad(config, ventanaGlobal);
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex-1">
            <h4 className="font-medium text-gray-900 dark:text-gray-100">{title}</h4>
            {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-x-6 gap-y-3">
            {/* Use Global Config Toggle */}
            <button onClick={() => onUpdate({ useGlobalConfig: !config.useGlobalConfig })} className={`px-3 py-1.5 rounded border text-sm font-medium flex items-center gap-2 transition-colors ${config.useGlobalConfig ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300" : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}>
              <FontAwesomeIcon icon={config.useGlobalConfig ? faToggleOn : faToggleOff} />
              Usar Global
            </button>

            {!config.useGlobalConfig && (
              <>
                <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block"></div>
                <button onClick={() => onUpdate({ ventanaGoceEnabled: !propia.enabled, ventanaGoceInicio: propia.inicio, ventanaGoceFin: propia.fin })} className={`px-3 py-1.5 rounded border text-sm font-medium flex items-center gap-2 transition-colors ${propia.enabled ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-300" : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}>
                  <FontAwesomeIcon icon={propia.enabled ? faToggleOn : faToggleOff} />
                  {propia.enabled ? "Con ventana" : "Sin ventana"}
                </button>
                {propia.enabled && (
                  <>
                    <SelectorDiaMes etiqueta="Desde" value={propia.inicio} onChange={(v) => onUpdate({ ventanaGoceEnabled: true, ventanaGoceInicio: v, ventanaGoceFin: propia.fin })} />
                    <SelectorDiaMes etiqueta="Hasta" value={propia.fin} onChange={(v) => onUpdate({ ventanaGoceEnabled: true, ventanaGoceInicio: propia.inicio, ventanaGoceFin: v })} />
                  </>
                )}
              </>
            )}

            {/* Display effective state text */}
            <span className="text-xs text-gray-400 italic min-w-[130px] text-right">Efectivo: {resumenDeVentana(unirVentanas([propia]))}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <LoadingSpinner message="Cargando reglas..." />;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Ventana Anual de Goce</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">El tramo del año en que se pueden tomar vacaciones. Se repite todas las temporadas, por eso las fechas no llevan año. Si se activa la configuración personalizada de una entidad, anulará la configuración global.</p>
        <div className="mt-2 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 p-2 rounded flex flex-col items-start gap-1">
          <div className="flex items-start gap-2">
            <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5" />
            <p>
              Con la ventana habilitada, una solicitud sólo se acepta si <strong>todos sus días</strong> caen adentro: del 28/4 al 5/5 no entra en una ventana que termina el 30/4. Si el inicio es posterior al fin, la ventana cruza el fin de año (1/11 → 30/4 incluye diciembre y enero). También vale para los bloques del plan de vacaciones por proyecto.
            </p>
          </div>
          <p className="ml-5">Quien está en más de un proyecto usa la más flexible: si alguno no tiene ventana, no se le aplica; si todos tienen, vale la unión.</p>
          <p className="ml-5 font-bold">Jerarquía de aplicación: Área &gt; Proyecto &gt; Global</p>
          <p className="ml-5">«Usar Global» es el mismo interruptor de Fraccionamiento y Días Corridos: al apagarlo, la entidad pasa a usar su configuración propia en las tres reglas.</p>
        </div>
      </div>

      {globalConfig && (
        <div className="mb-8 bg-blue-50 dark:bg-blue-900/20 p-4 rounded border border-blue-100 dark:border-blue-800">
          <h4 className="text-md font-semibold text-blue-900 dark:text-blue-100 mb-3">Configuración Global</h4>
          <div className="flex items-center gap-x-6 gap-y-3 flex-wrap">
            <button
              onClick={() => guardarGlobal({ ...ventanaGlobal, enabled: !ventanaGlobal.enabled })}
              disabled={isSavingGlobal}
              className={`px-3 py-1.5 rounded border text-sm font-medium flex items-center gap-2 transition-colors ${ventanaGlobal.enabled ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300" : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}
            >
              {isSavingGlobal ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={ventanaGlobal.enabled ? faToggleOn : faToggleOff} />}
              {ventanaGlobal.enabled ? "Habilitada" : "Deshabilitada (se puede pedir cualquier fecha)"}
            </button>
            <SelectorDiaMes etiqueta="Desde" value={ventanaGlobal.inicio} disabled={isSavingGlobal} onChange={(v) => guardarGlobal({ ...ventanaGlobal, inicio: v })} />
            <SelectorDiaMes etiqueta="Hasta" value={ventanaGlobal.fin} disabled={isSavingGlobal} onChange={(v) => guardarGlobal({ ...ventanaGlobal, fin: v })} />
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Efectivo: {resumenDeVentana(unirVentanas([ventanaGlobal]))}</span>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Período legal LCT art. 154: 1/10 al 30/4.</p>
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
              const config = { useGlobalConfig: true, permiteFraccionadas: true, ...project.vacationConfig };
              return <div key={project._id}>{renderConfigRow(project.name, client?.name, config, (updates) => handleUpdateProjectConfig(project, updates))}</div>;
            })
          ))}

        {scope === "area" &&
          (areas.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No hay áreas.</p>
          ) : (
            areas.map((area) => {
              const config = { useGlobalConfig: true, permiteFraccionadas: true, ...area.vacationConfig };
              return <div key={area._id}>{renderConfigRow(area.name, area.description, config, (updates) => handleUpdateAreaConfig(area, updates))}</div>;
            })
          ))}
      </div>
    </div>
  );
};
