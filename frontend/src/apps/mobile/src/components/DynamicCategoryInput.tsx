import React from "react";
import { OrderCategory } from "../../../../api/orderCategories";
import { tipoAccionFuturaLabels } from "../../../../types/futureAction";

interface DynamicCategoryInputProps {
  category: OrderCategory | null;
  subcategories: string;
  onSubcategoriesChange: (value: string) => void;
  dynamicValue: any;
  onDynamicValueChange: (value: any) => void;
  actionCompleted: boolean;
  onActionCompletedChange: (value: boolean) => void;
  futureActionPlazoDias?: number;
  onFutureActionPlazoDiasChange?: (value: number) => void;
  futureActionFechaLimite?: string;
  onFutureActionFechaLimiteChange?: (value: string) => void;
  futureActionDocumento?: string;
  onFutureActionDocumentoChange?: (value: string) => void;
}

export const DynamicCategoryInput: React.FC<DynamicCategoryInputProps> = ({ category, subcategories, onSubcategoriesChange, dynamicValue, onDynamicValueChange, actionCompleted, onActionCompletedChange, futureActionPlazoDias, onFutureActionPlazoDiasChange, futureActionFechaLimite, onFutureActionFechaLimiteChange, futureActionDocumento, onFutureActionDocumentoChange }) => {
  if (!category) return null;

  const hasSubcategories = category.config?.subtipos && category.config.subtipos.length > 0;

  const renderDynamicInput = () => {
    switch (category.categoryType) {
      case "fecha":
        if (category.dateMode === "range") {
          const fechaDesde = dynamicValue?.fechaDesde || "";
          const fechaHasta = dynamicValue?.fechaHasta || "";

          console.log("DynamicCategoryInput - Date Range - dynamicValue:", dynamicValue);
          console.log("DynamicCategoryInput - Date Range - fechaDesde:", fechaDesde);
          console.log("DynamicCategoryInput - Date Range - fechaHasta:", fechaHasta);

          return (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Rango de Fechas *</label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Fecha Desde</label>
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => {
                      console.log("fechaDesde changed to:", e.target.value);
                      const newValue = {
                        fechaDesde: e.target.value,
                        fechaHasta: fechaHasta,
                      };
                      console.log("Calling onDynamicValueChange with:", newValue);
                      onDynamicValueChange(newValue);
                    }}
                    required
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Fecha Hasta</label>
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => {
                      console.log("fechaHasta changed to:", e.target.value);
                      const newValue = {
                        fechaDesde: fechaDesde,
                        fechaHasta: e.target.value,
                      };
                      console.log("Calling onDynamicValueChange with:", newValue);
                      onDynamicValueChange(newValue);
                    }}
                    min={fechaDesde || ""}
                    required
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          );
        } else {
          return (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Fecha *</label>
              <input type="date" value={dynamicValue || ""} onChange={(e) => onDynamicValueChange(e.target.value)} required className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none" />
            </div>
          );
        }

      case "dinero":
        const maxMonto = category.montoMaximo || 10000000;
        const stepMonto = 50000;
        const currentMonto = typeof dynamicValue === 'number' ? dynamicValue : 0;

        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Monto ($) *</label>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 mb-3">
              <div className="text-center mb-4">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  $ {currentMonto.toLocaleString('es-ES')}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Monto seleccionado
                </div>
              </div>

              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max={maxMonto}
                  step={stepMonto}
                  value={currentMonto}
                  onChange={(e) => onDynamicValueChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
                  required
                />

                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>$ 0</span>
                  <span>$ {maxMonto.toLocaleString('es-ES')}</span>
                </div>
              </div>
            </div>

            <style>{`
              .slider-thumb::-webkit-slider-thumb {
                appearance: none;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: #3b82f6;
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
              }

              .slider-thumb::-moz-range-thumb {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: #3b82f6;
                cursor: pointer;
                border: none;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
              }

              .slider-thumb::-webkit-slider-thumb:hover {
                background: #2563eb;
              }

              .slider-thumb::-moz-range-thumb:hover {
                background: #2563eb;
              }
            `}</style>
          </div>
        );

      case "objeto":
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Especifica el objeto *</label>
            <input type="text" value={dynamicValue || ""} onChange={(e) => onDynamicValueChange(e.target.value)} required className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none" placeholder="Ej: Laptop Dell XPS 15, Mouse Logitech..." />
          </div>
        );

      case "otros":
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Detalles adicionales *</label>
            <textarea value={dynamicValue || ""} onChange={(e) => onDynamicValueChange(e.target.value)} required rows={4} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none" placeholder="Describe tu solicitud con el mayor detalle posible..." />
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
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Opciones *</label>
          <select value={subcategories} onChange={(e) => onSubcategoriesChange(e.target.value)} required className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none">
            <option value="">Selecciona una opción</option>
            {category.config.subtipos?.map((subtipo) => (
              <option key={subtipo.id} value={subtipo.id}>
                {subtipo.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {renderDynamicInput()}

      {category.requiresAction && category.futureActionType && (
        <div className="space-y-3">
          <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Acción Futura</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{tipoAccionFuturaLabels[category.futureActionType]}</p>
          </div>

          {category.futureActionType === "plazoDias" && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg border border-blue-500  flex items-center justify-center">
                  <span className="text-white text-lg font-bold">{category.plazoDias}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Plazo: {category.plazoDias} días</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">El sistema calculará automáticamente la fecha límite desde el día de la solicitud</p>
                </div>
              </div>
              {category.plazoDias && category.plazoDias > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <p className="text-sm text-green-700 dark:text-green-300 font-medium">✓ Fecha límite estimada: {new Date(Date.now() + category.plazoDias * 24 * 60 * 60 * 1000).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>
              )}
            </div>
          )}

          {category.futureActionType === "fechaEspecifica" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Fecha Límite *</label>
              <input type="date" value={futureActionFechaLimite || ""} onChange={(e) => onFutureActionFechaLimiteChange?.(e.target.value)} required min={new Date().toISOString().split("T")[0]} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none" />
            </div>
          )}

          {category.futureActionType === "presentacionDocumento" && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Documento Requerido *</label>
                <input type="text" value={futureActionDocumento || ""} onChange={(e) => onFutureActionDocumentoChange?.(e.target.value)} required className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none" placeholder="Ej: DNI escaneado, Certificado médico..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Fecha Límite (Opcional)</label>
                <input type="date" value={futureActionFechaLimite || ""} onChange={(e) => onFutureActionFechaLimiteChange?.(e.target.value)} min={new Date().toISOString().split("T")[0]} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none" />
              </div>
            </>
          )}

          {category.futureActionType === "sinVencimiento" && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-slate-700 dark:text-slate-200">No tiene fecha límite, pero debe ser gestionada y marcada como cumplida manualmente.</p>
            </div>
          )}

          {category.actionText && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={actionCompleted} onChange={(e) => onActionCompletedChange(e.target.checked)} required className="mt-0.5 w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">
                  {category.actionText} <span className="text-blue-500">*</span>
                </span>
              </label>
              {!actionCompleted && <p className="mt-2 text-xs text-blue-500 dark:text-blue-500">* Debes marcar este compromiso para continuar</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
