import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faChevronDown, faFilter, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "./Modal";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  placeholder?: string;
}

export interface DateRangeFilter {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}

export interface SelectFilter {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  label: string;
  placeholder?: string;
}

export interface SwitchFilter {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
}

export interface RadioFilterOption {
  value: string;
  label: string;
}

export interface RadioFilter {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: RadioFilterOption[];
}

interface SearchAndFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterProps[];
  dateFilter?: DateRangeFilter;
  // New filter props for modal
  selectFilters?: SelectFilter[];
  switchFilters?: SwitchFilter[];
  radioFilters?: RadioFilter[];

  className?: string;
  extraActions?: React.ReactNode;
}

const FilterSelect: React.FC<FilterProps> = ({ value, onChange, options, placeholder }) => {
  return (
    <div className="relative flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none w-full px-3 py-2 pe-8 border border-gray-300 dark:border-gray-600 rounded
                   focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Ícono fijo, sin rotación */}
      <FontAwesomeIcon icon={faChevronDown} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
    </div>
  );
};

export const SearchAndFilters: React.FC<SearchAndFiltersProps> = ({ searchTerm, onSearchChange, searchPlaceholder = "Buscar...", filters = [], dateFilter, selectFilters = [], switchFilters = [], radioFilters = [], className = "", extraActions }) => {
  const [showFilterModal, setShowFilterModal] = useState(false);

  const hasDateFilters = dateFilter && (dateFilter.startDate || dateFilter.endDate);
  const hasSelectFilters = selectFilters.some((sf) => sf.value !== "");
  const hasSwitchFilters = switchFilters.some((sw) => sw.value);
  const hasRadioFilters = radioFilters.some((rf) => rf.value !== "");
  const hasActiveFilters = hasDateFilters || hasSelectFilters || hasSwitchFilters || hasRadioFilters;
  const activeFilterCount = [hasDateFilters, ...selectFilters.map((sf) => sf.value !== ""), ...switchFilters.map((sw) => sw.value), ...radioFilters.map((rf) => rf.value !== "")].filter(Boolean).length;
  const shouldShowBadges = hasDateFilters || hasSelectFilters || hasSwitchFilters || radioFilters.length > 0;

  const handleApply = () => {
    setShowFilterModal(false);
  };

  const handleClearAll = () => {
    if (dateFilter) {
      dateFilter.onStartDateChange("");
      dateFilter.onEndDateChange("");
    }
    selectFilters.forEach((sf) => sf.onChange(""));
    switchFilters.forEach((sw) => sw.onChange(false));
    radioFilters.forEach((rf) => rf.onChange(""));
    setShowFilterModal(false);
  };

  const getDateBadgeText = () => {
    if (!dateFilter) return "";

    if (dateFilter.startDate && dateFilter.endDate) {
      return `Desde ${new Date(dateFilter.startDate).toLocaleDateString()} hasta ${new Date(dateFilter.endDate).toLocaleDateString()}`;
    } else if (dateFilter.startDate) {
      return `Desde ${new Date(dateFilter.startDate).toLocaleDateString()}`;
    } else if (dateFilter.endDate) {
      return `Hasta ${new Date(dateFilter.endDate).toLocaleDateString()}`;
    }
    return "";
  };

  // Check if filter modal should be shown (date filter OR new filters exist)
  const showFilterButton = dateFilter || selectFilters.length > 0 || switchFilters.length > 0 || radioFilters.length > 0;

  return (
    <>
      <div className="space-y-3">
        <div className={`flex gap-4 w-auto ${className}`}>
          {/* Search */}
          <div className="flex-1 relative">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded
                         focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex gap-3">
            {/* Inline Filters */}
            {filters.map((filter, idx) => (
              <FilterSelect key={idx} value={filter.value} onChange={filter.onChange} options={filter.options} placeholder={filter.placeholder} />
            ))}

            {/* Filter Modal Button */}
            {showFilterButton && (
              <button
                onClick={() => setShowFilterModal(true)}
                className={`relative inline-flex items-center gap-2 
                   px-3 py-2 border rounded 
                   transition-all duration-200
                   w-auto
                   ${hasActiveFilters ? "bg-primary-50 dark:bg-primary-900/20 border-primary-500 dark:border-primary-600 text-primary-700 dark:text-primary-300" : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"}`}
                title="Filtros avanzados"
              >
                <FontAwesomeIcon icon={faFilter} className="h-4 w-4" />
                {activeFilterCount > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-primary-500 text-white rounded-full">{activeFilterCount}</span>}
              </button>
            )}
            {extraActions && <div className="flex items-center ml-2 pl-2 border-l border-gray-200 dark:border-gray-700">{extraActions}</div>}
          </div>
        </div>

        {/* Active Filter Badges */}
        {shouldShowBadges && (
          <div className="flex flex-wrap items-center gap-2">
            {hasDateFilters && (
              <span
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium
                             bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200
                             border border-primary-300 dark:border-primary-700"
              >
                {getDateBadgeText()}
                <button
                  onClick={() => {
                    dateFilter?.onStartDateChange("");
                    dateFilter?.onEndDateChange("");
                  }}
                  className="p-0.5 rounded hover:bg-primary-200 dark:hover:bg-primary-800/50 transition-colors"
                  title="Quitar filtro de fecha"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                </button>
              </span>
            )}
            {selectFilters
              .filter((sf) => sf.value !== "")
              .map((sf, idx) => (
                <span
                  key={`select-${idx}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium
                               bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200
                               border border-blue-300 dark:border-blue-700"
                >
                  {sf.label}: {sf.options.find((o) => o.value === sf.value)?.label || sf.value}
                  <button onClick={() => sf.onChange("")} className="p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors" title={`Quitar filtro de ${sf.label}`}>
                    <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                  </button>
                </span>
              ))}
            {switchFilters
              .filter((sw) => sw.value)
              .map((sw, idx) => (
                <span
                  key={`switch-${idx}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium
                               bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200
                               border border-green-300 dark:border-green-700"
                >
                  {sw.label}
                  <button onClick={() => sw.onChange(false)} className="p-0.5 rounded hover:bg-green-200 dark:hover:bg-green-800/50 transition-colors" title={`Quitar filtro ${sw.label}`}>
                    <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                  </button>
                </span>
              ))}
            {radioFilters.map((rf, idx) => {
              const isDefault = rf.value === "";
              const isActive = rf.value === "active";
              const isInactive = rf.value === "inactive";
              
              return (
                <span
                  key={`radio-${idx}`}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium border ${
                    isActive
                      ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700"
                      : isInactive
                        ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700"
                        : "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700"
                  }`}
                >
                  {rf.label}: {isDefault ? "Todos los usuarios Activos e Inactivos" : (rf.options.find((o) => o.value === rf.value)?.label || rf.value)}
                  {!isDefault && (
                    <button
                      onClick={() => rf.onChange("")}
                      className={`p-0.5 rounded transition-colors ${
                        isActive
                          ? "hover:bg-green-200 dark:hover:bg-green-800/50"
                          : isInactive
                            ? "hover:bg-red-200 dark:hover:bg-red-800/50"
                            : "hover:bg-blue-200 dark:hover:bg-blue-800/50"
                      }`}
                      title={`Quitar filtro de ${rf.label}`}
                    >
                      <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter Modal */}
      {showFilterButton && (
        <Modal
          isOpen={showFilterModal}
          onClose={() => setShowFilterModal(false)}
          title="Filtros Avanzados"
          subtitle="Configura los filtros para refinar los resultados"
          size="sm"
          footer={
            <>
              <button onClick={handleClearAll} className="btn-secondary">
                Limpiar Todo
              </button>
              <button onClick={handleApply} className="btn-primary">
                Aplicar
              </button>
            </>
          }
        >
          <div className="space-y-4">
            {/* Radio Filters Section (Top) */}
            {radioFilters.length > 0 && (
              <div className="space-y-3 pb-4 border-b border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filtrar por usuarios</h4>
                {radioFilters.map((rf, idx) => (
                  <div key={`modal-radio-${idx}`} className="space-y-2">
                    {rf.options.map((opt, optIdx) => (
                      <label key={optIdx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{opt.label}</span>
                        <div
                          className={`relative w-11 h-6 rounded-full transition-colors ${rf.value === opt.value ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`}
                          onClick={(e) => {
                            e.preventDefault();
                            rf.onChange(opt.value);
                          }}
                        >
                          <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${rf.value === opt.value ? "translate-x-5" : "translate-x-0"}`} />
                        </div>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Date Filter Section */}
            {dateFilter && (
              <div className="space-y-3 pb-4 border-b border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filtrar por Fecha</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Desde</label>
                    <input
                      type="date"
                      value={dateFilter.startDate}
                      onChange={(e) => dateFilter.onStartDateChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded
                                 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Hasta</label>
                    <input
                      type="date"
                      value={dateFilter.endDate}
                      onChange={(e) => dateFilter.onEndDateChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded
                                 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Select Filters Section */}
            {selectFilters.length > 0 && (
              <div className="space-y-3 pb-4 border-b border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filtros por Categoría</h4>
                {selectFilters.map((sf, idx) => (
                  <div key={idx}>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{sf.label}</label>
                    <div className="relative">
                      <select
                        value={sf.value}
                        onChange={(e) => sf.onChange(e.target.value)}
                        className="appearance-none w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded
                                   focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white text-sm"
                      >
                        <option value="">{sf.placeholder || `Todos los ${sf.label}`}</option>
                        {sf.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <FontAwesomeIcon icon={faChevronDown} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Switch Filters Section */}
            {switchFilters.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Opciones</h4>
                {switchFilters.map((sw, idx) => (
                  <label key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{sw.label}</span>
                    <div
                      className={`relative w-11 h-6 rounded-full transition-colors ${sw.value ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`}
                      onClick={(e) => {
                        e.preventDefault();
                        sw.onChange(!sw.value);
                      }}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${sw.value ? "translate-x-5" : "translate-x-0"}`} />
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Active filters summary */}
            {activeFilterCount > 0 && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>{activeFilterCount}</strong> filtro{activeFilterCount > 1 ? "s" : ""} activo{activeFilterCount > 1 ? "s" : ""}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
};
