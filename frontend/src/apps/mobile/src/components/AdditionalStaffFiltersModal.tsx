import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";

export interface AdditionalStaffFilterValues {
  roleFilters: string[];
  statusFilter: "active" | "inactive" | "all";
  contractActive: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: AdditionalStaffFilterValues) => void;
  availableRoles: string[];
  currentFilters: AdditionalStaffFilterValues;
}

/**
 * Completely self-contained filter modal for "Otros Presentes".
 * Uses only local state internally — toggling filters does NOT trigger
 * re-renders of the parent component or the employee list behind.
 * Filters are only communicated to the parent via onApply callback.
 */
const AdditionalStaffFiltersModal: React.FC<Props> = ({ isOpen, onClose, onApply, availableRoles, currentFilters }) => {
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">(currentFilters.statusFilter);
  const [roleFilters, setRoleFilters] = useState<string[]>(currentFilters.roleFilters);
  const [contractActive, setContractActive] = useState(currentFilters.contractActive);

  // Sync local state when the modal opens with fresh currentFilters
  useEffect(() => {
    if (isOpen) {
      setStatusFilter(currentFilters.statusFilter);
      setRoleFilters([...currentFilters.roleFilters]);
      setContractActive(currentFilters.contractActive);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const handleApply = () => {
    onApply({ roleFilters, statusFilter, contractActive });
  };

  const handleClearAll = () => {
    setRoleFilters([]);
    setStatusFilter("active");
    setContractActive(false);
  };

  const toggleRole = (role: string) => {
    setRoleFilters(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  return (
    <div className="fixed inset-0 overflow-y-auto" style={{ zIndex: 100 }}>
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop - NO backdrop-blur to avoid GPU compositing issues with nested modals */}
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/70 transition duration-200"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        />

        {/* Panel */}
        <div
          className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 sticky top-0 py-3 z-50">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Filtros Avanzados</h2>
            <button onClick={onClose} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cerrar modal">
              <FontAwesomeIcon icon={faXmark} className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="p-4 rounded-xl border border-dashed border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-slate-900/50 mb-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Configura los filtros para refinar los resultados</p>
            </div>

            {/* User Status Section */}
            <section className="space-y-4">
              <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Filtrar por usuarios</h4>
              <div className="space-y-2">
                {(["active", "inactive", "all"] as const).map((value) => {
                  const labels: Record<string, string> = {
                    active: "Usuarios Activos",
                    inactive: "Usuarios Inactivos",
                    all: "Todos los usuarios (Activos e Inactivos)",
                  };
                  return (
                    <div key={value} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{labels[value]}</span>
                      <div
                        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${statusFilter === value ? "bg-blue-600" : "bg-gray-200 dark:bg-slate-700"}`}
                        onClick={() => setStatusFilter(value)}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${statusFilter === value ? "translate-x-5" : "translate-x-0"}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Role Frame Section */}
            <section className="space-y-4">
              <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Filtros por Categoría</h4>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Role Frame</label>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {availableRoles.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No hay roles disponibles</p>
                  ) : (
                    availableRoles.map((role) => (
                      <button
                        key={role}
                        onClick={() => toggleRole(role)}
                        className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${roleFilters.includes(role) ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400" : "bg-white dark:bg-slate-800/40 border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                      >
                        <span className="text-sm font-bold">{role}</span>
                        {roleFilters.includes(role) && <FontAwesomeIcon icon={faCheck} className="text-xs" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </section>

            {/* Options Section */}
            <section className="space-y-4 pb-4">
              <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Opciones</h4>
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Contrato Activo</span>
                <div
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${contractActive ? "bg-blue-600" : "bg-gray-200 dark:bg-slate-700"}`}
                  onClick={() => setContractActive(!contractActive)}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${contractActive ? "translate-x-5" : "translate-x-0"}`} />
                </div>
              </div>
            </section>
          </div>

          {/* Fixed Footer */}
          <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-slate-900 flex gap-3 sticky bottom-0 z-50">
            <button
              onClick={handleClearAll}
              className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-all text-sm"
            >
              Limpiar Todo
            </button>
            <button
              onClick={handleApply}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-none hover:bg-blue-700 transition-all active:scale-95 text-sm"
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AdditionalStaffFiltersModal);
