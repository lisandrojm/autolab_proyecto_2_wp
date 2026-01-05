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

interface SearchAndFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterProps[];
  dateFilter?: DateRangeFilter;
  className?: string;
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

export const SearchAndFilters: React.FC<SearchAndFiltersProps> = ({ searchTerm, onSearchChange, searchPlaceholder = "Buscar...", filters = [], dateFilter, className = "" }) => {
  const [showDateModal, setShowDateModal] = useState(false);

  const hasActiveFilters = dateFilter && (dateFilter.startDate || dateFilter.endDate);

  const handleApplyDates = () => {
    setShowDateModal(false);
  };

  const handleClearDates = () => {
    if (dateFilter) {
      dateFilter.onStartDateChange("");
      dateFilter.onEndDateChange("");
    }
    setShowDateModal(false);
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
            {/* Filters */}
            {filters.map((filter, idx) => (
              <FilterSelect key={idx} value={filter.value} onChange={filter.onChange} options={filter.options} placeholder={filter.placeholder} />
            ))}

            {/* Date Filter Button */}
            {dateFilter && (
              <button
                onClick={() => setShowDateModal(true)}
                className={`relative inline-flex items-center gap-2 
                   px-3 py-2 border rounded 
                   transition-all duration-200
                   w-auto
                   ${hasActiveFilters ? "bg-primary-50 dark:bg-primary-900/20 border-primary-500 dark:border-primary-600 text-primary-700 dark:text-primary-300" : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"}`}
                title="Filtrar por fecha"
              >
                <FontAwesomeIcon icon={faFilter} className="h-4 w-4" />
                {hasActiveFilters && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary-500 rounded"></span>}
              </button>
            )}
          </div>
        </div>

        {/* Active Date Filter Badge */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium
                           bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200
                           border border-primary-300 dark:border-primary-700"
            >
              {getDateBadgeText()}
              <button onClick={handleClearDates} className="p-0.5 rounded hover:bg-primary-200 dark:hover:bg-primary-800/50 transition-colors" title="Quitar filtro de fecha">
                <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Date Range Modal */}
      {dateFilter && (
        <Modal
          isOpen={showDateModal}
          onClose={() => setShowDateModal(false)}
          title="Filtrar por fecha"
          subtitle="Selecciona un rango de fechas para filtrar por fecha de creación"
          size="sm"
          footer={
            <>
              <button onClick={handleClearDates} className="btn-secondary">
                Limpiar
              </button>
              <button onClick={handleApplyDates} className="btn-primary">
                Aplicar
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Desde</label>
              <input
                type="date"
                value={dateFilter.startDate}
                onChange={(e) => dateFilter.onStartDateChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded
                           focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Hasta</label>
              <input
                type="date"
                value={dateFilter.endDate}
                onChange={(e) => dateFilter.onEndDateChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded
                           focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            {hasActiveFilters && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Filtro activo:</strong>
                  {dateFilter.startDate && dateFilter.endDate ? ` Del ${new Date(dateFilter.startDate).toLocaleDateString()} al ${new Date(dateFilter.endDate).toLocaleDateString()}` : dateFilter.startDate ? ` Desde ${new Date(dateFilter.startDate).toLocaleDateString()}` : ` Hasta ${new Date(dateFilter.endDate).toLocaleDateString()}`}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
};
