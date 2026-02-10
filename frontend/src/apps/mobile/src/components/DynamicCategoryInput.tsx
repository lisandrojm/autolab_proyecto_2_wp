import React, { useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar } from "@fortawesome/free-solid-svg-icons";
import { OrderConfig as OrderType } from "../../../../api/orderConfig";

interface DynamicCategoryInputProps {
  category: OrderType | null;
  subcategories: string;
  onSubcategoriesChange: (value: string) => void;
  dynamicValue: any;
  onDynamicValueChange: (value: any) => void;
  amount?: number;
  onAmountChange?: (value: number) => void;
  actionCompleted: boolean;
  onActionCompletedChange: (value: boolean) => void;
  futureActionPlazoDias?: number;
  onOrderFutureActionPlazoDiasChange?: (value: number) => void;
  futureActionFechaLimite?: string;
  onOrderFutureActionFechaLimiteChange?: (value: string) => void;
  futureActionDocumento?: string;
  onOrderFutureActionDocumentoChange?: (value: string) => void;
  document?: File | null;
  onDocumentChange?: (file: File | null) => void;
  documentPreview?: string | null;
  onDocumentPreviewChange?: (preview: string | null) => void;
}

export const DynamicCategoryInput: React.FC<DynamicCategoryInputProps> = ({ category, subcategories, onSubcategoriesChange, dynamicValue, onDynamicValueChange, amount, onAmountChange, actionCompleted, onActionCompletedChange, futureActionPlazoDias, onOrderFutureActionPlazoDiasChange, futureActionFechaLimite, onOrderFutureActionFechaLimiteChange, futureActionDocumento, onOrderFutureActionDocumentoChange, document, onDocumentChange, documentPreview, onDocumentPreviewChange }) => {
  if (!category) return null;

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split("T")[0];

  const hasSubcategories = category.config?.subtipos && category.config.subtipos.length > 0;

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onDocumentChange && onDocumentPreviewChange) {
      if (file.size > 10 * 1024 * 1024) {
        alert("El archivo debe ser menor a 10MB");
        return;
      }
      onDocumentChange(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        onDocumentPreviewChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveDocument = () => {
    if (onDocumentChange && onDocumentPreviewChange) {
      onDocumentChange(null);
      onDocumentPreviewChange(null);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const renderDynamicInput = () => {
    switch (category.categoryType) {
      case "fecha":
        if (category.dateMode === "range") {
          const fechaDesde = dynamicValue?.fechaDesde || "";
          const fechaHasta = dynamicValue?.fechaHasta || "";

          // Calculate active max days
          let activeMaxDays = category.maxDays;
          if (subcategories && category.config?.subtipos) {
            const selectedSubtype = category.config.subtipos.find((s) => s.id === subcategories);
            if (selectedSubtype?.maxDays) {
              activeMaxDays = selectedSubtype.maxDays;
            }
          }

          // Calculate max date string if maxDays is set and start date is selected
          let maxDateStr: string | undefined = undefined;
          if (activeMaxDays && fechaDesde) {
            const d = new Date(fechaDesde);
            d.setDate(d.getDate() + activeMaxDays - 1);
            maxDateStr = d.toISOString().split("T")[0];
          }

          return (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Rango de Fechas</label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Fecha Desde</label>
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      let newEnd = fechaHasta;

                      const dStart = new Date(newStart);

                      // If new start date makes current end date invalid (checks against max days)
                      if (activeMaxDays && newEnd && newStart) {
                        const dEnd = new Date(newEnd);
                        const diffTime = Math.abs(dEnd.getTime() - dStart.getTime());
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        if (diffDays >= activeMaxDays) {
                          newEnd = "";
                        }
                      }

                      // Also validate min date (end date cannot be before start date)
                      if (newEnd && newStart) {
                        const dEnd = new Date(newEnd);
                        if (dEnd < dStart) {
                          newEnd = "";
                        }
                      }

                      const newValue = {
                        fechaDesde: newStart,
                        fechaHasta: newEnd,
                      };
                      onDynamicValueChange(newValue);
                    }}
                    min={today}
                    required
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Fecha Hasta</label>
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => {
                      const newValue = {
                        fechaDesde: fechaDesde,
                        fechaHasta: e.target.value,
                      };
                      onDynamicValueChange(newValue);
                    }}
                    min={fechaDesde || today}
                    max={maxDateStr}
                    required
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none"
                  />
                  {activeMaxDays && <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Máximo {activeMaxDays} días permitidos.</p>}
                </div>
              </div>
              {(() => {
                if (!fechaHasta) return null;
                const [y, m, d] = fechaHasta.split("-").map(Number);
                const dateObj = new Date(y, m - 1, d);

                const nextWorkingDay = new Date(dateObj);
                nextWorkingDay.setDate(nextWorkingDay.getDate() + 1);

                if (nextWorkingDay.getDay() === 6) nextWorkingDay.setDate(nextWorkingDay.getDate() + 2);
                else if (nextWorkingDay.getDay() === 0) nextWorkingDay.setDate(nextWorkingDay.getDate() + 1);

                return (
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded p-3 text-sm text-emerald-700 dark:text-emerald-400">
                    <p>
                      <span className="font-bold">Presentarse a trabajar el día:</span> {nextWorkingDay.toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                );
              })()}
            </div>
          );
        } else {
          const nextWorkingDay = (() => {
            if (!dynamicValue) return null;
            if (typeof dynamicValue !== "string") return null;

            const [y, m, d] = dynamicValue.split("-").map(Number);
            const dateObj = new Date(y, m - 1, d);

            const next = new Date(dateObj);
            next.setDate(next.getDate() + 1); // Next day

            // If Saturday (6), add 2 days -> Monday
            if (next.getDay() === 6) next.setDate(next.getDate() + 2);
            // If Sunday (0), add 1 day -> Monday
            else if (next.getDay() === 0) next.setDate(next.getDate() + 1);
            return next;
          })();

          return (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Fecha</label>
                <input type="date" min={today} value={dynamicValue || ""} onChange={(e) => onDynamicValueChange(e.target.value)} required className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none" />
              </div>
              {nextWorkingDay && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded p-3 text-sm text-emerald-700 dark:text-emerald-400">
                  <p>
                    <span className="font-bold">Presentarse a trabajar el día:</span> {nextWorkingDay.toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </p>
                </div>
              )}
            </div>
          );
        }

      case "dinero":
        const maxMonto = category.montoMaximo || 10000000;
        const stepMonto = 50000;
        const currentMonto = typeof amount === "number" ? amount : 0;

        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Monto ($)</label>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded p-4 mb-3">
              <div className="text-center mb-4">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">$ {currentMonto.toLocaleString("es-ES")}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Monto seleccionado</div>
              </div>

              <div className="space-y-2">
                <input type="range" min="0" max={maxMonto} step={stepMonto} value={currentMonto} onChange={(e) => onAmountChange?.(parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded appearance-none cursor-pointer slider-thumb" required />

                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>$ 0</span>
                  <span>$ {maxMonto.toLocaleString("es-ES")}</span>
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Especifica el objeto</label>
            <input type="text" value={dynamicValue || ""} onChange={(e) => onDynamicValueChange(e.target.value)} required className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none" placeholder="Ej: Laptop Dell XPS 15, Mouse Logitech..." />
          </div>
        );

      case "otros":
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Detalles adicionales</label>
            <textarea value={dynamicValue || ""} onChange={(e) => onDynamicValueChange(e.target.value)} required rows={4} className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none" placeholder="Describe tu solicitud con el mayor detalle posible..." />
          </div>
        );

      default:
        return null;
    }
  };

  const renderDeadlineInfo = () => {
    if (!category.deadlineMode || category.deadlineMode === "none") {
      return null;
    }

    if (category.deadlineMode === "plazoDias" && category.plazoDias) {
      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() + category.plazoDias);
      return (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faCalendar} className="w-4 h-4" />
            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
              Completar antes del <span className="font-bold">{fechaLimite.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</span>
            </p>
          </div>
        </div>
      );
    }

    if (category.deadlineMode === "fechaEspecifica" && category.fechaLimite) {
      const fechaLimite = new Date(category.fechaLimite);
      return (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faCalendar} className="w-4 h-4" />
            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
              Fecha límite: <span className="font-bold">{fechaLimite.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</span>
            </p>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-4">
      {hasSubcategories && (
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Opciones</label>
          <select value={subcategories} onChange={(e) => onSubcategoriesChange(e.target.value)} required className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none">
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
          {/* Presentación de Documento */}
          {category.futureActionType === "documento" && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1"> Presentar "{category.documentoRequerido && <span>{category.documentoRequerido}"</span>}</p>
              {renderDeadlineInfo()}
            </div>
          )}

          {category.futureActionType === "otra" && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-3">
              <div className="flex items-start gap-2">
                <span className="text-xl">⚠️</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{category.tituloAccion || "Acción requerida"}</p>
                  {renderDeadlineInfo()}
                </div>
              </div>
            </div>
          )}

          {category.requiresUserConfirmation && category.actionText && category.futureActionType && (
            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={actionCompleted} onChange={(e) => onActionCompletedChange(e.target.checked)} required className="mt-0.5 w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">
                  {category.actionText} <span className="text-blue-500">*</span>
                </span>
              </label>

              {!actionCompleted && <p className="mt-2 text-xs text-slate-600">* Debes marcar este compromiso para continuar</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
