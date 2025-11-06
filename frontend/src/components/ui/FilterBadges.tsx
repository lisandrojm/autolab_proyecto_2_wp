import React from 'react';
import { X } from 'lucide-react';
import { ActiveFilter } from '../../hooks/useAssetGallery';

interface FilterBadgesProps {
  filters: ActiveFilter[];
  onRemoveFilter: (filterId: string) => void;
}

export const FilterBadges: React.FC<FilterBadgesProps> = ({ filters, onRemoveFilter }) => {
  if (filters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {filters.map((filter) => (
        <div
          key={filter.id}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium rounded-full border border-primary-200 dark:border-primary-800"
        >
          <span>{filter.label}</span>
          <button
            onClick={() => onRemoveFilter(filter.id)}
            className="hover:bg-primary-200 dark:hover:bg-primary-800/50 rounded-full p-0.5 transition-colors"
            title={`Eliminar filtro: ${filter.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
};
