import React from "react";
import { OrderCategory } from "../../../../api/orderCategories";

interface DynamicCategoryInputProps {
  category: OrderCategory | null;
  subcategoryValue: string;
  onSubcategoryChange: (value: string) => void;
  dynamicValue: any;
  onDynamicValueChange: (value: any) => void;
  actionCompleted: boolean;
  onActionCompletedChange: (value: boolean) => void;
}

export const DynamicCategoryInput: React.FC<DynamicCategoryInputProps> = ({
  category,
  subcategoryValue,
  onSubcategoryChange,
  dynamicValue,
  onDynamicValueChange,
  actionCompleted,
  onActionCompletedChange,
}) => {
  if (!category) return null;

  const hasSubcategories = category.config?.subtipos && category.config.subtipos.length > 0;

  const renderDynamicInput = () => {
    switch (category.categoryType) {
      case "fecha":
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Fecha *
            </label>
            <input
              type="date"
              value={dynamicValue || ""}
              onChange={(e) => onDynamicValueChange(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none"
            />
          </div>
        );

      case "dinero":
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Monto ($) *
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={dynamicValue || ""}
                onChange={(e) => onDynamicValueChange(parseFloat(e.target.value) || 0)}
                required
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none"
                placeholder="0.00"
              />
            </div>
          </div>
        );

      case "objeto":
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Especifica el objeto *
            </label>
            <input
              type="text"
              value={dynamicValue || ""}
              onChange={(e) => onDynamicValueChange(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none"
              placeholder="Ej: Laptop Dell XPS 15, Mouse Logitech..."
            />
          </div>
        );

      case "otros":
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Detalles adicionales *
            </label>
            <textarea
              value={dynamicValue || ""}
              onChange={(e) => onDynamicValueChange(e.target.value)}
              required
              rows={4}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none"
              placeholder="Describe tu solicitud con el mayor detalle posible..."
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {hasSubcategories && (
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Subcategoría *
          </label>
          <select
            value={subcategoryValue}
            onChange={(e) => onSubcategoryChange(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none"
          >
            <option value="">Selecciona una opción</option>
            {category.config?.subtipos?.map((subtipo) => (
              <option key={subtipo.id} value={subtipo.id}>
                {subtipo.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {renderDynamicInput()}

      {category.requiresAction && category.actionText && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={actionCompleted}
              onChange={(e) => onActionCompletedChange(e.target.checked)}
              required
              className="mt-0.5 w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">
              {category.actionText}
            </span>
          </label>
        </div>
      )}
    </div>
  );
};
