import React, { useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar } from "@fortawesome/free-solid-svg-icons";
import { OrderType } from "../../../../api/orderTypes";

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

          console.log("DynamicCategoryInput - Date Range - dynamicValue:", dynamicValue);
          console.log("DynamicCategoryInput - Date Range - fechaDesde:", fechaDesde);
          console.log("DynamicCategoryInput - Date Range - fechaHasta:", fechaHasta);

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
                      console.log("fechaDesde changed to:", e.target.value);
                      const newValue = {
                        fechaDesde: e.target.value,
                        fechaHasta: fechaHasta,
                      };
                      console.log("Calling onDynamicValueChange with:", newValue);
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
                      console.log("fechaHasta changed to:", e.target.value);
                      const newValue = {
                        fechaDesde: fechaDesde,
                        fechaHasta: e.target.value,
                      };
                      console.log("Calling onDynamicValueChange with:", newValue);
                      onDynamicValueChange(newValue);
                    }}
                    min={fechaDesde || today}
                    required
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          );
        } else {
          return (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Fecha</label>
              <input type="date" min={today} value={dynamicValue || ""} onChange={(e) => onDynamicValueChange(e.target.value)} required className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none" />
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

              {/*               <div className="mt-3">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Subir Documento</label>
                {documentPreview ? (
                  <div className="relative rounded overflow-hidden border-2 border-slate-300 dark:border-slate-600">
                    <img src={documentPreview} alt="Preview" className="w-full h-48 object-cover" />
                    <button type="button" onClick={handleRemoveDocument} className="absolute top-2 right-2 p-2 rounded bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg">
                      <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input ref={cameraInputRef} type="file" accept="image/*,application/pdf" capture="environment" onChange={handleDocumentChange} className="hidden" />
                    <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 py-4 px-3 hover:bg-slate-100 dark:hover:bg-slate-700">
                      <FontAwesomeIcon icon={faCamera} className="w-6 h-6 text-slate-400" />
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Tomar Foto</span>
                    </button>

                    <inpt ref={galleryInputRef} type="file" accept="image/*,application/pdf" onChange={handleDocumentChange} className="hidden" />
                    <button type="button" onClick={() => galleryInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 py-4 px-3 hover:bg-slate-100 dark:hover:bg-slate-700">
                      <FontAwesomeIcon icon={faImage} className="w-6 h-6 text-slate-400" />
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Subir Archivo</span>
                    </button>
                  </div>
                )}
              </div> */}
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
