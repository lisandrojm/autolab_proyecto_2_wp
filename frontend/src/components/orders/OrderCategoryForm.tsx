import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faToggleOn, faToggleOff } from "@fortawesome/free-solid-svg-icons";

import { CategoryType, DateMode, Subtype, TipoAccionFutura, DeadlineMode } from "../../api/orderCategories";
import { InfoModal } from "../ui/InfoModal";
import { tipoAccionFuturaLabels, deadlineModeLabels } from "../../types/futureAction";

interface OrderCategoryFormProps {
  formData: {
    name: string;
    informacion: string;
    isActive: boolean;
    categoryType: CategoryType;
    dateMode: DateMode;
    montoMaximo?: number;
    requiresAction: boolean;
    actionText: string;
    futureActionType: TipoAccionFutura | "";
    deadlineMode?: DeadlineMode;
    subtipos: Subtype[];
    plazoDias?: number;
    fechaLimite?: string;
    documentoRequerido?: string;
  };
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
}

export const OrderCategoryForm: React.FC<OrderCategoryFormProps> = ({ formData, setFormData, onSubmit, submitting }) => {
  const [showCategoryTypeInfo, setShowCategoryTypeInfo] = useState(false);
  const [showDateModeInfo, setShowDateModeInfo] = useState(false);
  const [showSubcategoriesInfo, setShowSubcategoriesInfo] = useState(false);
  const [showActionTypeInfo, setShowActionTypeInfo] = useState(false);
  const [showActionTextInfo, setShowActionTextInfo] = useState(false);
  const [showInformacionInfo, setShowInformacionInfo] = useState(false);

  const handleFutureActionTypeChange = (newType: TipoAccionFutura | "") => {
    setFormData({
      ...formData,
      futureActionType: newType,
      deadlineMode: "none",
      plazoDias: undefined,
      fechaLimite: undefined,
      documentoRequerido: undefined,
    });
  };

  const handleDeadlineModeChange = (newMode: DeadlineMode) => {
    setFormData({
      ...formData,
      deadlineMode: newMode,
      plazoDias: newMode === "plazoDias" ? formData.plazoDias : undefined,
      fechaLimite: newMode === "fechaEspecifica" ? formData.fechaLimite : undefined,
    });
  };

  const renderFutureActionConditionalFields = () => {
    if (!formData.futureActionType) return null;

    switch (formData.futureActionType) {
      case "accion":
        return (
          <div className="space-y-3">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">Acción requerida del usuario</p>
            </div>
            {renderDeadlineFields()}
          </div>
        );

      case "documento":
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Documento Requerido *</label>
              <input type="text" value={formData.documentoRequerido || ""} onChange={(e) => setFormData({ ...formData, documentoRequerido: e.target.value })} required className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Ej: DNI escaneado, Certificado médico..." />
            </div>
            {renderDeadlineFields()}
          </div>
        );

      case "condicion":
        return (
          <div className="space-y-3">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">Condición que debe aceptar el usuario</p>
            </div>
            {renderDeadlineFields()}
          </div>
        );

      case "sinVencimiento":
        return (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">No requiere vencimiento ni condiciones adicionales</p>
          </div>
        );

      default:
        return null;
    }
  };

  const renderDeadlineFields = () => {
    if (formData.futureActionType === "sinVencimiento") return null;

    return (
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Modo de Vencimiento *</label>
          <select required value={formData.deadlineMode || "none"} onChange={(e) => handleDeadlineModeChange(e.target.value as DeadlineMode)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
            <option value="none">{deadlineModeLabels.none}</option>
            <option value="plazoDias">{deadlineModeLabels.plazoDias}</option>
            <option value="fechaEspecifica">{deadlineModeLabels.fechaEspecifica}</option>
          </select>
        </div>

        {formData.deadlineMode === "plazoDias" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Plazo en Días *</label>
            <input type="number" min="1" max="365" value={formData.plazoDias || ""} onChange={(e) => setFormData({ ...formData, plazoDias: parseInt(e.target.value) || undefined })} required className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Ej: 10" />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">El sistema calculará automáticamente la fecha límite</p>
          </div>
        )}

        {formData.deadlineMode === "fechaEspecifica" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Límite *</label>
            <input type="date" value={formData.fechaLimite || ""} onChange={(e) => setFormData({ ...formData, fechaLimite: e.target.value })} required min={new Date().toISOString().split("T")[0]} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <form id="order-category-form" onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre</label>
          <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Nombre del tipo de pedido" />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Información de Confirmación (opcional)</label>
            <button type="button" onClick={() => setShowInformacionInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver información">
              <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
            </button>
          </div>
          <textarea value={formData.informacion} onChange={(e) => setFormData({ ...formData, informacion: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Texto de confirmación que se mostrará al usuario antes de enviar el pedido..." />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Dato *</label>
            <button type="button" onClick={() => setShowCategoryTypeInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver informacion">
              <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
            </button>
          </div>
          <select required value={formData.categoryType} onChange={(e) => setFormData({ ...formData, categoryType: e.target.value as CategoryType })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
            <option value="fecha">Fecha</option>
            <option value="dinero">Dinero</option>
            <option value="objeto">Objeto</option>
            <option value="otros">Otros</option>
          </select>
        </div>
        {/* Opciones del Tipo de Dato */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Opciones del Tipo de Dato (opcional)</label>
              <button type="button" onClick={() => setShowSubcategoriesInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver informacion">
                <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                const newId = `sub_${Date.now()}`;
                setFormData({
                  ...formData,
                  subtipos: [...formData.subtipos, { id: newId, label: "" }],
                });
              }}
              className="text-sm px-2 py-1 bg-blue-100 dark:bg-blue-500 text-blue-700 dark:text-white rounded hover:bg-blue-200"
            >
              + Agregar Opciones
            </button>
          </div>

          {formData.subtipos.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-2">
              {formData.subtipos.map((subtipo, index) => (
                <div key={subtipo.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Nombre de subcategoria"
                    value={subtipo.label}
                    onChange={(e) => {
                      const newSubtipos = [...formData.subtipos];
                      newSubtipos[index].label = e.target.value;
                      setFormData({ ...formData, subtipos: newSubtipos });
                    }}
                    className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        subtipos: formData.subtipos.filter((_, i) => i !== index),
                      });
                    }}
                    className="text-red-600 hover:text-red-800 text-sm px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {formData.categoryType === "fecha" && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Modo de Fecha *</label>
              <button type="button" onClick={() => setShowDateModeInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver informacion">
                <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
              </button>
            </div>
            <select required value={formData.dateMode} onChange={(e) => setFormData({ ...formData, dateMode: e.target.value as DateMode })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="single">Fecha unica</option>
              <option value="range">Rango de fechas (Desde - Hasta)</option>
            </select>
          </div>
        )}

        {/* Monto Máximo */}
        {formData.categoryType === "dinero" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Monto Maximo (opcional)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">$</span>
              <input type="number" min="0" step="1" value={formData.montoMaximo || ""} onChange={(e) => setFormData({ ...formData, montoMaximo: e.target.value ? parseFloat(e.target.value) : undefined })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-8 pr-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Sin limite" />
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Define el monto maximo que puede solicitar el usuario. Si no lo defines, no habra limite.</p>
          </div>
        )}

        <div className="border border-gray-200 dark:border-gray-600 p-4 rounded">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="requiresAction"
              checked={formData.requiresAction}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  requiresAction: e.target.checked,
                  futureActionType: e.target.checked ? formData.futureActionType || "sinVencimiento" : "",
                  actionText: e.target.checked ? formData.actionText : "",
                  plazoDias: e.target.checked ? formData.plazoDias : undefined,
                  fechaLimite: e.target.checked ? formData.fechaLimite : undefined,
                  documentoRequerido: e.target.checked ? formData.documentoRequerido : undefined,
                })
              }
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="requiresAction" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Requiere acción futura del usuario
            </label>
          </div>

          {formData.requiresAction && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 my-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Accion Futura *</label>
                  <button type="button" onClick={() => setShowActionTypeInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver informacion">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <select required={formData.requiresAction} value={formData.futureActionType} onChange={(e) => handleFutureActionTypeChange(e.target.value as TipoAccionFutura)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  <option value="accion">{tipoAccionFuturaLabels.accion}</option>
                  <option value="documento">{tipoAccionFuturaLabels.documento}</option>
                  <option value="condicion">{tipoAccionFuturaLabels.condicion}</option>
                  <option value="sinVencimiento">{tipoAccionFuturaLabels.sinVencimiento}</option>
                </select>
              </div>

              {renderFutureActionConditionalFields()}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Texto de la accion *</label>
                  <button type="button" onClick={() => setShowActionTextInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver informacion">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <input type="text" required={formData.requiresAction} value={formData.actionText} onChange={(e) => setFormData({ ...formData, actionText: e.target.value })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Ej: Adjunto comprobantes de gastos" />
              </div>
            </div>
          )}
        </div>

        <div className="pt-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Visivilidad en el formulario</label>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors inline-flex items-center flex-nowrap
      ${formData.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}
          >
            <FontAwesomeIcon icon={formData.isActive ? faToggleOn : faToggleOff} className="mr-1" />
            {formData.isActive ? "Activa" : "Inactiva"}
          </button>
        </div>
      </form>

      <InfoModal isOpen={showCategoryTypeInfo} onClose={() => setShowCategoryTypeInfo(false)} title="Tipo de Dato" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>Define que tipo de input se mostrara en el formulario movil cuando el usuario seleccione este tipo de pedido.</p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showSubcategoriesInfo} onClose={() => setShowSubcategoriesInfo(false)} title="Opciones del Pedido" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>
            Estas opciones apareceran luego como un <strong>select obligatorio</strong> cuando el usuario elija este tipo de pedido en el formulario movil.
          </p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showActionTypeInfo} onClose={() => setShowActionTypeInfo(false)} title="Tipos de Acción Futura" size="md">
        <div className="text-gray-700 dark:text-gray-300 space-y-3">
          <p className="font-medium mb-3">Cada tipo de acción futura define QUÉ debe hacer el usuario:</p>
          <div className="space-y-2">
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Acción Requerida:</strong>
              <p className="text-sm mt-1">Acción general que el usuario debe completar.</p>
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Presentación de Documento:</strong>
              <p className="text-sm mt-1">Requiere que el usuario presente un documento específico.</p>
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Aceptación de Condición:</strong>
              <p className="text-sm mt-1">El usuario debe aceptar términos o condiciones específicas.</p>
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Sin Vencimiento:</strong>
              <p className="text-sm mt-1">No requiere ni acción ni vencimiento específico.</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
            <p className="text-sm">
              El <strong>modo de vencimiento</strong> (plazo en días, fecha específica, o sin vencimiento) se configura por separado.
            </p>
          </div>
        </div>
      </InfoModal>

      <InfoModal isOpen={showActionTextInfo} onClose={() => setShowActionTextInfo(false)} title="Texto de la Accion" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>Este texto aparecera junto a un checkbox que el usuario debe marcar para confirmar que completara la accion requerida.</p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Ejemplo: &quot;Me comprometo a adjuntar los comprobantes de gastos&quot;</p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showDateModeInfo} onClose={() => setShowDateModeInfo(false)} title="Modo de Fecha" size="sm">
        <div className="text-gray-700 dark:text-gray-300 space-y-3">
          <p>Define como el usuario ingresara la fecha en el formulario de pedidos:</p>
          <div>
            <strong className="text-blue-600 dark:text-blue-400">Fecha unica:</strong>
            <p className="text-sm mt-1">El usuario selecciona una sola fecha mediante un calendario.</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Ejemplo: Fecha de nacimiento, fecha de evento</p>
          </div>
          <div>
            <strong className="text-blue-600 dark:text-blue-400">Rango de fechas (Desde - Hasta):</strong>
            <p className="text-sm mt-1">El usuario selecciona dos fechas: una fecha de inicio y una de fin.</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Ejemplo: Periodo de vacaciones, duracion de un proyecto</p>
          </div>
        </div>
      </InfoModal>

      <InfoModal isOpen={showInformacionInfo} onClose={() => setShowInformacionInfo(false)} title="Información" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>Este texto se mostrará al usuario una vez finalizado el formulario, como mensaje de confirmación o condiciones del pedido.</p>
        </div>
      </InfoModal>
    </>
  );
};
