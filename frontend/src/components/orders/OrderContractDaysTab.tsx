import React, { useState, useEffect } from "react";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faToggleOn, faToggleOff } from "@fortawesome/free-solid-svg-icons";
import { vacationConfigAPI, AvailableContract } from "../../api/vacationConfig";
import { orderConfigAPI } from "../../api/orderConfig";
import { sweetAlert } from "../../utils/sweetAlert";

interface ContractDayRule {
  saturday: boolean;
  sunday: boolean;
  holiday: boolean;
}

export const OrderContractDaysTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<AvailableContract[]>([]);
  // Local state for rules: contractId -> rules
  const [rules, setRules] = useState<Record<number, ContractDayRule>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Reusing the contract fetcher from vacation config as contracts are global
      const [contractsRes, settingsRes] = await Promise.all([vacationConfigAPI.getAvailableContracts(), orderConfigAPI.getSettings()]);
      setContracts(contractsRes);

      // Initialize default rules
      const initialRules: Record<number, ContractDayRule> = {};

      // Map saved rules for easy lookup
      const savedRulesMap = new Map();
      if (settingsRes && Array.isArray(settingsRes.contractRules)) {
        settingsRes.contractRules.forEach((r: any) => {
          savedRulesMap.set(r.contractId, r);
        });
      }

      contractsRes.forEach((c) => {
        const saved = savedRulesMap.get(c.id);
        initialRules[c.id] = {
          saturday: saved?.saturday ?? false,
          sunday: saved?.sunday ?? false,
          holiday: saved?.holiday ?? false,
        };
      });
      setRules(initialRules);
    } catch (error) {
      console.error("Error loading configuration:", error);
      sweetAlert.error("Error", "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (contractId: number, field: keyof ContractDayRule) => {
    // 1. Optimistic Update
    const currentRule = rules[contractId];
    if (!currentRule) return;

    const newValue = !currentRule[field];

    // Create new state object
    const newRules = {
      ...rules,
      [contractId]: {
        ...currentRule,
        [field]: newValue,
      },
    };

    setRules(newRules);

    // 2. Prepare Payload
    // Convert Record back to Array for API
    const contractRulesPayload = contracts.map((c) => ({
      contractId: c.id,
      contractName: c.name,
      ...newRules[c.id],
    }));

    try {
      await orderConfigAPI.updateSettings({
        contractRules: contractRulesPayload,
      });
      // Silent success
    } catch (error) {
      console.error(error);
      sweetAlert.error("Error", "No se pudo guardar el cambio");
      // Revert on error
      setRules((prev) => ({
        ...prev,
        [contractId]: {
          ...prev[contractId]!,
          [field]: !newValue, // Revert value
        },
      }));
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando configuración..." />;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FontAwesomeIcon icon={faFileContract} className="text-gray-400" />
            Días por Tipo de Contrato
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configura los días permitidos (Sábados, Domingos, Feriados) para realizar pedidos según el contrato.</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700 mb-6">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo de Contrato</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sábado</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Domingo</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Feriados</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {contracts.length > 0 ? (
              contracts.map((contract) => {
                const rule = rules[contract.id] || { saturday: false, sunday: false, holiday: false };
                return (
                  <tr key={contract.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{contract.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button type="button" onClick={() => handleToggle(contract.id, "saturday")} className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${rule.saturday ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"}`}>
                        <FontAwesomeIcon icon={rule.saturday ? faToggleOn : faToggleOff} className="mr-2" />
                        {rule.saturday ? "Habilitado" : "Deshabilitado"}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button type="button" onClick={() => handleToggle(contract.id, "sunday")} className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${rule.sunday ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"}`}>
                        <FontAwesomeIcon icon={rule.sunday ? faToggleOn : faToggleOff} className="mr-2" />
                        {rule.sunday ? "Habilitado" : "Deshabilitado"}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button type="button" onClick={() => handleToggle(contract.id, "holiday")} className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${rule.holiday ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"}`}>
                        <FontAwesomeIcon icon={rule.holiday ? faToggleOn : faToggleOff} className="mr-2" />
                        {rule.holiday ? "Habilitado" : "Deshabilitado"}
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  No se encontraron tipos de contrato disponibles.
                </td>
              </tr>
            )}
            {/* Fila estática para usuarios sin contrato (Opcional, pero consistente con Vacation) */}
            <tr className="bg-gray-50/50 dark:bg-gray-800/30">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400 italic">Sin contrato activo</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center">
                <button type="button" disabled className="px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed opacity-70">
                  <FontAwesomeIcon icon={faToggleOff} className="mr-2" />
                  Deshabilitado
                </button>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center">
                <button type="button" disabled className="px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed opacity-70">
                  <FontAwesomeIcon icon={faToggleOff} className="mr-2" />
                  Deshabilitado
                </button>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center">
                <button type="button" disabled className="px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed opacity-70">
                  <FontAwesomeIcon icon={faToggleOff} className="mr-2" />
                  Deshabilitado
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
