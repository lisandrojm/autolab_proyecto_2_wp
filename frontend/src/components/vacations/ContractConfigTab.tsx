import React, { useState, useEffect } from "react";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faToggleOn, faToggleOff } from "@fortawesome/free-solid-svg-icons";
import { vacationConfigAPI, type ContractRule, type TipoContratoVacaciones } from "../../api/vacationConfig";
import { sweetAlert } from "../../utils/sweetAlert";
import { TablaConEncabezadoFijo } from "../ui/TablaConEncabezadoFijo";
import { codigosArca } from "./campania/SelectorTiposContrato";

/*
  VISIBILIDAD DEL BOTÓN «VACACIONES» POR TIPO DE CONTRATO. Desde el 23/11/2026, una fila por tipo del CATÁLOGO
  (`/vacation-config/tipos-contrato`): antes se agrupaba por el número de la plantilla de FRAME, y todo lo creado en
  WeProdu (que tiene un 0 ahí) caía en una sola fila con el nombre de cualquiera, así que la regla de Jornada no
  alcanzaba a las Jornadas cargadas en WeProdu. Van los tipos activos (y un inactivo sólo si todavía tiene gente
  vigente), con sus códigos de ARCA y cuántas personas lo tienen vigente hoy.

  Cada cambio se guarda solo y manda las reglas de todos los tipos, con la clave nueva (`tipoContratoId`).
*/
export const ContractConfigTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [tipos, setTipos] = useState<TipoContratoVacaciones[]>([]);
  // Tipo del catálogo → tiene vacaciones.
  const [rules, setRules] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const lista = await vacationConfigAPI.getTiposContrato();
      setTipos(lista);
      // El server ya dice cómo queda cada tipo (las reglas viejas por número de FRAME vienen traducidas).
      setRules(Object.fromEntries(lista.map((t) => [t.id, t.vacationsEnabled])));
    } catch (error) {
      console.error("Error loading data:", error);
      sweetAlert.error("Error", "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string) => {
    const newValue = !rules[id];
    const updated = { ...rules, [id]: newValue };
    setRules(updated);
    try {
      // Sólo las reglas: mandar la configuración entera pisaría lo cambiado en otra sección.
      const contractRules: ContractRule[] = tipos.map((t) => ({ tipoContratoId: t.id, contractName: t.name, vacationsEnabled: updated[t.id] ?? true }));
      await vacationConfigAPI.updateConfig({ contractRules });
    } catch (error) {
      console.error(error);
      sweetAlert.error("Error", "No se pudo actualizar el estado");
      setRules((prev) => ({ ...prev, [id]: !newValue }));
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando reglas..." />;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FontAwesomeIcon icon={faFileContract} className="text-gray-400" />
            Visibilidad del botón "Vacaciones" por tipo de contrato
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Habilita o deshabilita el módulo de vacaciones según el tipo de contrato del usuario. Un tipo por fila, del catálogo de Tipos de Contrato.</p>
        </div>
      </div>

      <TablaConEncabezadoFijo className="rounded border border-gray-200 dark:border-gray-700 mb-6" tabla="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo de contrato</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Códigos ARCA</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Personas vigentes</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Botón Vacaciones | Estado</th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
          {tipos.length > 0 ? (
            tipos.map((t) => {
              const isEnabled = rules[t.id] ?? true;
              const codigos = codigosArca(t);
              return (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {t.name}
                      {!t.activo && <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400" title="Inactivo en el catálogo: aparece porque todavía hay contratos vigentes de este tipo.">inactivo</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400" title={codigos ? `Modalidad de contrato ${t.arca.modalidad || "—"} · tipo de servicio ${t.arca.servicio || "—"} · modalidad de liquidación ${t.arca.liquidacion || "—"}` : "No se da de alta en ARCA"}>
                      {codigos || "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300" title="Personas con un contrato vigente de este tipo hoy">
                    {t.vigentes}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button type="button" onClick={() => handleToggle(t.id)} className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${isEnabled ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200"}`}>
                      <FontAwesomeIcon icon={isEnabled ? faToggleOn : faToggleOff} className="mr-2" />
                      {isEnabled ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                No se encontraron tipos de contrato en el catálogo.
              </td>
            </tr>
          )}

          {/* Fila estática para usuarios sin contrato */}
          <tr className="bg-gray-50/50 dark:bg-gray-800/30">
            <td className="px-6 py-4 whitespace-nowrap">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 italic">Sin contrato activo</div>
            </td>
            <td />
            <td />
            <td className="px-6 py-4 whitespace-nowrap">
              <button type="button" disabled className="px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed opacity-70">
                <FontAwesomeIcon icon={faToggleOff} className="mr-2" />
                Inactivo
              </button>
            </td>
          </tr>
        </tbody>
      </TablaConEncabezadoFijo>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4 mb-6">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>Nota:</strong> Los cambios se guardan automáticamente. Si un usuario tiene un contrato vigente de un tipo marcado como "Inactivo", el módulo de vacaciones estará deshabilitado para él, y la campaña de goce no lo invita.
        </p>
      </div>
    </div>
  );
};
