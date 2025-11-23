import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { CategoryType, DateMode, Subtype, TipoAccionFutura } from "../../api/orderCategories";
import { InfoModal } from "../ui/InfoModal";
import { tipoAccionFuturaLabels } from "../../types/futureAction";

interface OrderCategoryFormProps {
  formData: {
    name: string;
    description: string;
    isActive: boolean;
    categoryType: CategoryType;
    dateMode: DateMode;
    requiresAction: boolean;
    actionText: string;
    futureActionType: TipoAccionFutura | "";
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

  const handleFutureActionTypeChange = (newType: TipoAccionFutura | "") => {
    setFormData({
      ...formData,
      futureActionType: newType,
      plazoDias: undefined,
      fechaLimite: undefined,
      documentoRequerido: undefined,
    });
  };

  const renderFutureActionConditionalFields = () => {
    if (!formData.futureActionType) return null;

    switch (formData.futureActionType) {
      case "plazoDias":
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Plazo en Días *</label>
            <input type="number" min="1" max="365" value={formData.plazoDias || ""} onChange={(e) => setFormData({ ...formData, plazoDias: parseInt(e.target.value) || undefined })} required className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Ej: 10" />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">El sistema calculará automáticamente la fecha límite</p>
          </div>
        );

      case "fechaEspecifica":
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Límite *</label>
            <input type="date" value={formData.fechaLimite || ""} onChange={(e) => setFormData({ ...formData, fechaLimite: e.target.value })} required min={new Date().toISOString().split("T")[0]} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
          </div>
        );

      case "presentacionDocumento":
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Documento Requerido *</label>
              <input type="text" value={formData.documentoRequerido || ""} onChange={(e) => setFormData({ ...formData, documentoRequerido: e.target.value })} required className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Ej: DNI escaneado, Certificado médico..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Límite (Opcional)</label>
              <input type="date" value={formData.fechaLimite || ""} onChange={(e) => setFormData({ ...formData, fechaLimite: e.target.value })} min={new Date().toISOString().split("T")[0]} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        );

      case "vencimientoSistema":
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Plazo Predefinido (Días) *</label>
            <input type="number" min="1" max="365" value={formData.plazoDias || 7} onChange={(e) => setFormData({ ...formData, plazoDias: parseInt(e.target.value) || 7 })} required className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">El sistema define automáticamente este plazo según reglas internas</p>
          </div>
        );

      case "vencimientoInterno":
        return (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">Un área interna debe evaluar y asignar una fecha de vencimiento. El pedido quedará en estado "En Revisión" hasta que se cargue la fecha límite.</p>
          </div>
        );

      case "sinVencimiento":
        return (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">No tiene fecha límite, pero debe ser gestionada y marcada como cumplida manualmente.</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <form id="order-category-form" onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre</label>
          <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Nombre del tipo de pedido" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción (opcional)</label>
          <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Describe el tipo de pedido..." />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Dato *</label>
            <button type="button" onClick={() => setShowCategoryTypeInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver información">
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

        {formData.categoryType === "fecha" && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Modo de Fecha *</label>
              <button type="button" onClick={() => setShowDateModeInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver información">
                <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
              </button>
            </div>
            <select required value={formData.dateMode} onChange={(e) => setFormData({ ...formData, dateMode: e.target.value as DateMode })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="single">Fecha única</option>
              <option value="range">Rango de fechas (Desde - Hasta)</option>
            </select>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Opciones del Pedido (opcional)</label>
              <button type="button" onClick={() => setShowSubcategoriesInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver información">
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
                    placeholder="Nombre de subcategoría"
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

        <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
          <div className="flex items-center gap-2 mb-3">
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
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Acción Futura *</label>
                  <button type="button" onClick={() => setShowActionTypeInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver información">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <select required={formData.requiresAction} value={formData.futureActionType} onChange={(e) => handleFutureActionTypeChange(e.target.value as TipoAccionFutura)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  <option value="sinVencimiento">{tipoAccionFuturaLabels.sinVencimiento}</option>
                  <option value="plazoDias">{tipoAccionFuturaLabels.plazoDias}</option>
                  <option value="fechaEspecifica">{tipoAccionFuturaLabels.fechaEspecifica}</option>
                  <option value="presentacionDocumento">{tipoAccionFuturaLabels.presentacionDocumento}</option>
                  <option value="vencimientoSistema">{tipoAccionFuturaLabels.vencimientoSistema}</option>
                  <option value="vencimientoInterno">{tipoAccionFuturaLabels.vencimientoInterno}</option>
                </select>
              </div>

              {renderFutureActionConditionalFields()}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Texto de la acción *</label>
                  <button type="button" onClick={() => setShowActionTextInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors" title="Ver información">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <input type="text" required={formData.requiresAction} value={formData.actionText} onChange={(e) => setFormData({ ...formData, actionText: e.target.value })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Ej: Adjunto comprobantes de gastos" />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="isActive" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
          <label htmlFor="isActive" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Activa (visible en el formulario)
          </label>
        </div>
      </form>

      <InfoModal isOpen={showCategoryTypeInfo} onClose={() => setShowCategoryTypeInfo(false)} title="Tipo de Dato" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>Define qué tipo de input se mostrará en el formulario móvil cuando el usuario seleccione este tipo de pedido.</p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showSubcategoriesInfo} onClose={() => setShowSubcategoriesInfo(false)} title="Opciones del Pedido" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>
            Estas opciones aparecerán luego como un <strong>select obligatorio</strong> cuando el usuario elija este tipo de pedido en el formulario móvil.
          </p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showActionTypeInfo} onClose={() => setShowActionTypeInfo(false)} title="Tipos de Acción Futura" size="md">
        <div className="text-gray-700 dark:text-gray-300 space-y-3">
          <p className="font-medium mb-3">Cada tipo de acción futura tiene características específicas:</p>
          <div className="space-y-2">
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Plazo en Días:</strong>
              <p className="text-sm mt-1">Genera un vencimiento automático basado en días desde la creación del pedido.</p>
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Fecha Específica:</strong>
              <p className="text-sm mt-1">Asigna una fecha fija como límite para completar la acción.</p>
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Presentación de Documento:</strong>
              <p className="text-sm mt-1">Requiere que el usuario suba un documento específico.</p>
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Vencimiento por Sistema:</strong>
              <p className="text-sm mt-1">La fecha de vencimiento viene definida por un sistema externo o reglas predefinidas.</p>
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Vencimiento Interno:</strong>
              <p className="text-sm mt-1">La empresa fija la fecha de vencimiento manualmente después de revisar el pedido.</p>
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Sin Vencimiento:</strong>
              <p className="text-sm mt-1">No requiere fecha límite, pero debe ser completada y marcada manualmente.</p>
            </div>
          </div>
        </div>
      </InfoModal>

      <InfoModal isOpen={showActionTextInfo} onClose={() => setShowActionTextInfo(false)} title="Texto de la Acción" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>Este texto aparecerá junto a un checkbox que el usuario debe marcar para confirmar que completará la acción requerida.</p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Ejemplo: "Me comprometo a adjuntar los comprobantes de gastos"</p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showDateModeInfo} onClose={() setShowDateModeInfo(false)} title="Modo de Fecha" size="sm">
        <div className="text-gray-700 dark:text-gray-300 space-y-3">
          <p>Define cómo el usuario ingresará la fecha en el formulario de pedidos:</p>
          <div>
            <strong className="text-blue-600 dark:text-blue-400">Fecha única:</strong>
            <p className="text-sm mt-1">El usuario selecciona una sola fecha mediante un calendario.</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Ejemplo: Fecha de nacimiento, fecha de evento</p>
          </div>
          <div>
            <strong className="text-blue-600 dark:text-blue-400">Rango de fechas (Desde - Hasta):</strong>
            <p className="text-sm mt-1">El usuario selecciona dos fechas: una fecha de inicio y una de fin.</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Ejemplo: Período de vacaciones, duración de un proyecto</p>
          </div>
        </div>
      </InfoModal>
    </>
  );
};
