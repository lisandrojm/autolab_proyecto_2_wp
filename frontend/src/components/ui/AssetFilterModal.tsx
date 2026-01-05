import React from "react";
import { X } from "lucide-react";

interface AssetFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingIncludeUserAssets: boolean;
  onTogglePendingUserAssets: (include: boolean) => void;
  onApply: () => void;
}

export const AssetFilterModal: React.FC<AssetFilterModalProps> = ({ isOpen, onClose, pendingIncludeUserAssets, onTogglePendingUserAssets, onApply }) => {
  if (!isOpen) return null;

  const handleApply = () => {
    onApply();
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded shadow-xl z-50 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filtros</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="flex items-center justify-between cursor-pointer p-3 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Incluir mis imágenes personales</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">Por defecto solo se muestran las imágenes del cliente</span>
            </div>
            <div className="relative ml-4">
              <input type="checkbox" checked={pendingIncludeUserAssets} onChange={(e) => onTogglePendingUserAssets(e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
            </div>
          </label>

          <div className="flex gap-2 pt-4">
            <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors">
              Cancelar
            </button>
            <button onClick={handleApply} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors">
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
