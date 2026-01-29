import React, { useState, useEffect } from "react";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faCheck, faTimes, faToggleOn, faToggleOff } from "@fortawesome/free-solid-svg-icons";
import { vacationConfigAPI, VacationConfig, AvailableContract, ContractRule } from "../../api/vacationConfig";
import { sweetAlert } from "../../utils/sweetAlert";

export const ContractConfigTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  // We no longer need global submitting state for a bottom save button,
  // but we might want per-row loading state if needed.
  // For simplicity, we'll just toggle optimistically or show a small toast.
  const [config, setConfig] = useState<VacationConfig | null>(null);
  const [availableContracts, setAvailableContracts] = useState<AvailableContract[]>([]);

  // We maintain a local state of rules map: contractId -> boolean (enabled)
  const [rules, setRules] = useState<Record<number, boolean>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configRes, contractsRes] = await Promise.all([vacationConfigAPI.getConfig(), vacationConfigAPI.getAvailableContracts()]);
      setConfig(configRes);
      setAvailableContracts(contractsRes);

      // Initialize rules
      const rulesMap: Record<number, boolean> = {};

      // Default all valid contracts to enabled if no rule exists, or use existing rule
      contractsRes.forEach((c) => {
        const existingRule = configRes.contractRules?.find((r: any) => r.contractId === c.id);
        if (existingRule) {
          rulesMap[c.id] = existingRule.vacationsEnabled;
        } else {
          rulesMap[c.id] = true; // Default enabled
        }
      });
      setRules(rulesMap);
    } catch (error) {
      console.error("Error loading data:", error);
      sweetAlert.error("Error", "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (contractId: number) => {
    if (!config) return;

    // 1. Optimistic Update
    const newValue = !rules[contractId];
    setRules((prev) => ({
      ...prev,
      [contractId]: newValue,
    }));

    try {
      // 2. Prepare Payload
      // We need to send ALL rules, not just the changed one, because the API likely updates the whole array.
      // We construct the new state merging current 'rules' with the change.
      // Note: 'rules' state might not be updated yet in this closure if we didn't use functional update,
      // but we know the specific change: contractId -> newValue

      const updatedRulesMap = { ...rules, [contractId]: newValue };

      const contractRules: ContractRule[] = availableContracts.map((c) => ({
        contractId: c.id,
        contractName: c.name,
        vacationsEnabled: updatedRulesMap[c.id] ?? true,
      }));

      // 3. Save to Backend
      await vacationConfigAPI.updateConfig({
        ...config,
        contractRules,
      });

      // Update local config ref
      setConfig({ ...config, contractRules });

      // Optional: unobtrusive success feedback could go here,
      // but for switches instant toggle is usually enough feedback.
      // sweetAlert.toast.success("Guardado");
    } catch (error) {
      console.error(error);
      sweetAlert.error("Error", "No se pudo actualizar el estado");
      // Revert on error
      setRules((prev) => ({
        ...prev,
        [contractId]: !newValue,
      }));
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
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Habilita o deshabilita el módulo de vacaciones según el tipo de contrato del usuario.</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700 mb-6">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo de Contrato Activo</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Botón Vacaciones | Estado</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {availableContracts.length > 0 ? (
              availableContracts.map((contract) => {
                const isEnabled = rules[contract.id];
                return (
                  <tr key={contract.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{contract.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button type="button" onClick={() => handleToggle(contract.id)} className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${isEnabled ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"}`}>
                        <FontAwesomeIcon icon={isEnabled ? faToggleOn : faToggleOff} className="mr-2" />
                        {isEnabled ? "Activo" : "Inactiv"}
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={2} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  No se encontraron tipos de contrato disponibles.
                </td>
              </tr>
            )}

            {/* Fila estática para usuarios sin contrato */}
            <tr className="bg-gray-50/50 dark:bg-gray-800/30">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400 italic">Sin contrato activo</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center">
                <button type="button" disabled className="px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed opacity-70">
                  <FontAwesomeIcon icon={faToggleOff} className="mr-2" />
                  Inactivo
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4 mb-6">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>Nota:</strong> Los cambios se guardan automáticamente. Si un usuario tiene un contrato marcado como "Inactivo", el módulo de vacaciones estará deshabilitado para él.
        </p>
      </div>
    </div>
  );
};
