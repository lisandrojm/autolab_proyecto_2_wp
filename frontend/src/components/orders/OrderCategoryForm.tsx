import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faToggleOn, faToggleOff, faEye, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import Swal from "sweetalert2";
import { pdfPreviewAPI } from "../../api/pdfPreview";

import { CategoryType, DateMode, Subtype, TipoAccionFutura, DeadlineMode } from "../../api/orderCategories";
import { InfoModal } from "../ui/InfoModal";
import { tipoAccionFuturaLabels, deadlineModeLabels } from "../../types/futureAction";

interface PdfTemplate {
  _id: string;
  name: string;
  code: string;
  content: string;
  isActive: boolean;
}

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
    actionDescription?: string;
    tituloAccion?: string;
    futureActionType: TipoAccionFutura | "";
    deadlineMode?: DeadlineMode;
    subtipos: Subtype[];
    plazoDias?: number;
    fechaLimite?: string;
    documentoRequerido?: string;
    requiresSignature?: boolean;
    requiresUserConfirmation?: boolean;
    pdfTemplateId?: string;
  };
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  pdfTemplates?: PdfTemplate[];
}

export const OrderCategoryForm: React.FC<OrderCategoryFormProps> = ({ formData, setFormData, onSubmit, submitting, pdfTemplates = [] }) => {
  const [showCategoryTypeInfo, setShowCategoryTypeInfo] = useState(false);
  const [showDateModeInfo, setShowDateModeInfo] = useState(false);
  const [showSubcategoriesInfo, setShowSubcategoriesInfo] = useState(false);
  const [showActionTypeInfo, setShowActionTypeInfo] = useState(false);
  const [showActionTextInfo, setShowActionTextInfo] = useState(false);
  const [showInformacionInfo, setShowInformacionInfo] = useState(false);

  const getExpectedTemplateCode = (): string | null => {
    const { categoryType, dateMode } = formData;
    if (categoryType === "fecha") {
      return dateMode === "range" ? "fechaRango" : "fechaUnica";
    }
    if (categoryType === "dinero") return "dinero";
    if (categoryType === "objeto") return "objeto";
    if (categoryType === "otros") return "otros";
    return null;
  };

  const handlePreview = async (code: any, content: string) => {
    try {
      const blob = await pdfPreviewAPI.preview(content, code);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "No se pudo generar la previsualización", "error");
    }
  };

  useEffect(() => {
    if (formData.requiresSignature === false) {
      if (formData.pdfTemplateId) {
        setFormData((prev: any) => ({ ...prev, pdfTemplateId: undefined }));
      }
      return;
    }

    const expectedCode = getExpectedTemplateCode();
    if (!expectedCode) return;

    const matchingTemplate = pdfTemplates?.find((t) => t.code === expectedCode && t.isActive);

    if (matchingTemplate) {
      if (formData.pdfTemplateId !== matchingTemplate._id) {
        setFormData((prev: any) => ({ ...prev, pdfTemplateId: matchingTemplate._id }));
      }
    } else {
      if (formData.pdfTemplateId) {
        setFormData((prev: any) => ({ ...prev, pdfTemplateId: undefined }));
      }
    }
  }, [formData.categoryType, formData.dateMode, formData.requiresSignature, pdfTemplates]);

  const DEFAULT_ACTION_TEXTS: Record<TipoAccionFutura, string> = {
    documento: "Me comprometo a presentar la documentación o comprobantes solicitados.",
    otra: "Acepto y me comprometo a cumplir con lo requerido.",
  };

  const DEFAULT_TITULOS: Record<string, string> = {
    otra: "Acción requerida por el usuario",
  };

  const handleFutureActionTypeChange = (newType: TipoAccionFutura | "") => {
    setFormData((prev: any) => ({
      ...prev,
      futureActionType: newType,
      deadlineMode: prev.deadlineMode ?? "none",
      plazoDias: prev.plazoDias,
      fechaLimite: prev.fechaLimite,
      documentoRequerido: newType === "documento" ? prev.documentoRequerido : undefined,
      tituloAccion: newType === "otra" ? prev.tituloAccion || DEFAULT_TITULOS.otra : undefined,
      actionText: newType ? DEFAULT_ACTION_TEXTS[newType] : prev.actionText,
    }));
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

      case "otra":
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Título de la Condición *</label>
              <input type="text" value={formData.tituloAccion || ""} onChange={(e) => setFormData({ ...formData, tituloAccion: e.target.value })} required className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Ej: Completar capacitación de seguridad" />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Este título se mostrará al usuario como alerta en el formulario mobile</p>
            </div>
            {renderDeadlineFields()}
          </div>
        );

      default:
        return null;
    }
  };

  const renderDeadlineFields = () => {
    if (!formData.futureActionType) return null;

    const hasDeadline = formData.deadlineMode && formData.deadlineMode !== "none";

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="hasDeadline"
            checked={hasDeadline}
            onChange={(e) => {
              if (e.target.checked) {
                setFormData({ ...formData, deadlineMode: "plazoDias", plazoDias: undefined, fechaLimite: undefined });
              } else {
                setFormData({ ...formData, deadlineMode: "none", plazoDias: undefined, fechaLimite: undefined });
              }
            }}
            className="w-4 h-4 text-blue-600"
          />
          <label htmlFor="hasDeadline" className="text-sm text-gray-700 dark:text-gray-300">
            Tiene vencimiento
          </label>
        </div>

        {hasDeadline && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Modo de Vencimiento *</label>
              <select required value={formData.deadlineMode} onChange={(e) => handleDeadlineModeChange(e.target.value as DeadlineMode)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
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
                <input type="date" value={formData.fechaLimite ? new Date(formData.fechaLimite).toISOString().split("T")[0] : ""} onChange={(e) => setFormData({ ...formData, fechaLimite: e.target.value })} required min={new Date().toISOString().split("T")[0]} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <>
      {/* --- FORMULARIO COMPLETO --- */}
      <form id="order-category-form" onSubmit={onSubmit} className="space-y-4">
        {/* Nombre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre</label>
          <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Nombre del tipo de pedido" />
        </div>

        {/* Información de Confirmación */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Información de Confirmación (opcional)</label>
            <button type="button" onClick={() => setShowInformacionInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors">
              <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
            </button>
          </div>
          <textarea value={formData.informacion} onChange={(e) => setFormData({ ...formData, informacion: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Texto de confirmación..." />
        </div>

        {/* Tipo de dato */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Dato *</label>
            <button type="button" onClick={() => setShowCategoryTypeInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors">
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

        {/* Subtipos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Opciones del Tipo de Dato (opcional)</label>
              <button type="button" onClick={() => setShowSubcategoriesInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                const newId = `sub_${Date.now()}`;
                setFormData({ ...formData, subtipos: [...formData.subtipos, { id: newId, label: "" }] });
              }}
              className="text-sm px-2 py-1 bg-blue-100 dark:bg-blue-500 text-blue-700 dark:text-white rounded"
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
                    value={subtipo.label}
                    placeholder="Nombre de subcategoria"
                    onChange={(e) => {
                      const newSubtipos = [...formData.subtipos];
                      newSubtipos[index].label = e.target.value;
                      setFormData({ ...formData, subtipos: newSubtipos });
                    }}
                    className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        subtipos: formData.subtipos.filter((_, i) => i !== index),
                      })
                    }
                    className="text-red-600 hover:text-red-800 text-sm px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modo Fecha */}
        {formData.categoryType === "fecha" && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Modo de Fecha *</label>
              <button type="button" onClick={() => setShowDateModeInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400">
                <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
              </button>
            </div>
            <select required value={formData.dateMode} onChange={(e) => setFormData({ ...formData, dateMode: e.target.value as DateMode })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white">
              <option value="single">Fecha única</option>
              <option value="range">Rango de fechas</option>
            </select>
          </div>
        )}

        {/* Monto Máximo */}
        {formData.categoryType === "dinero" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Monto Máximo (opcional)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                min="0"
                step="50"
                value={formData.montoMaximo || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return setFormData({ ...formData, montoMaximo: undefined });
                  setFormData({ ...formData, montoMaximo: parseFloat(v) });
                }}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!v) return;
                  if (v % 50 !== 0) {
                    const r = Math.round(v / 50) * 50;
                    setFormData({ ...formData, montoMaximo: r > 0 ? r : 50 });
                  }
                }}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-8 pr-4 py-2 text-gray-900 dark:text-white"
                placeholder="Sin límite"
              />
            </div>
          </div>
        )}

        {/* Firma */}
        <div className="border border-gray-200 dark:border-blue-600 p-4 rounded">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="requiresSignature"
              checked={formData.requiresSignature ?? true}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  requiresSignature: e.target.checked,
                  pdfTemplateId: e.target.checked ? formData.pdfTemplateId : undefined,
                })
              }
              className="w-4 h-4 text-blue-600"
            />
            <label htmlFor="requiresSignature" className="text-sm text-gray-700 dark:text-gray-300">
              Requiere FIRMA del usuario
            </label>
          </div>

          {(formData.requiresSignature ?? true) && (
            <>
              <p className="pt-3 text-sm text-gray-700 dark:text-gray-300">Cuando se apruebe este pedido, se enviará automáticamente para firma del usuario.</p>

              {/* Plantilla PDF */}
              <div className="mt-4">
                {(() => {
                  const expectedCode = getExpectedTemplateCode();
                  const matchingTemplate = pdfTemplates?.find((t) => t.code === expectedCode && t.isActive);

                  if (!expectedCode) return null;

                  if (matchingTemplate) {
                    return (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Plantilla asignada automáticamente</p>
                          <p className="text-xs text-blue-600 dark:text-blue-400">{matchingTemplate.name}</p>
                        </div>
                        <button type="button" onClick={() => handlePreview(matchingTemplate.code, matchingTemplate.content)} className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 font-medium flex items-center gap-1" title="Previsualizar plantilla">
                          <FontAwesomeIcon icon={faEye} /> Visualizar
                        </button>
                      </div>
                    );
                  } else {
                    return (
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <div className="flex items-start gap-2">
                          <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Sin plantilla asignada</p>
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                              No existe una plantilla activa para este tipo de pedido (Código esperado: <strong>{expectedCode}</strong>). El PDF no se generará.
                            </p>
                            <Link to="/hr/pdf-templates" target="_blank" className="text-xs text-blue-600 hover:underline mt-1 block font-medium">
                              Crear plantilla en Configuración &rarr;
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  }
                })()}
              </div>
            </>
          )}
        </div>

        {/* Acción Futura */}
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
                  futureActionType: e.target.checked ? formData.futureActionType : "",
                  actionText: e.target.checked ? formData.actionText : "",
                  tituloAccion: e.target.checked ? formData.tituloAccion : undefined,
                  deadlineMode: e.target.checked ? formData.deadlineMode : undefined,
                  plazoDias: e.target.checked ? formData.plazoDias : undefined,
                  fechaLimite: e.target.checked ? formData.fechaLimite : undefined,
                  documentoRequerido: e.target.checked ? formData.documentoRequerido : undefined,
                })
              }
              className="w-4 h-4 text-blue-600"
            />
            <label htmlFor="requiresAction" className="text-sm text-gray-700 dark:text-gray-300">
              Requiere Acción Futura del usuario
            </label>
          </div>

          {formData.requiresAction && (
            <div className="space-y-4">
              {/* Tipo de Acción */}
              <div>
                <div className="flex items-center gap-2 my-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Acción Futura *</label>
                  <button type="button" onClick={() => setShowActionTypeInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <select required value={formData.futureActionType} onChange={(e) => handleFutureActionTypeChange(e.target.value as TipoAccionFutura)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2">
                  <option value="">Selecciona un tipo...</option>
                  <option value="documento">{tipoAccionFuturaLabels.documento}</option>
                  <option value="otra">{tipoAccionFuturaLabels.otra}</option>
                </select>
              </div>

              {/* Campos condicionales excepto sinVencimiento */}
              {renderFutureActionConditionalFields()}

              {/* Confirmación del Usuario */}
              {formData.futureActionType && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="requiresUserConfirmation"
                      checked={formData.requiresUserConfirmation ?? false}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          requiresUserConfirmation: e.target.checked,
                          actionText: e.target.checked ? formData.actionText : "",
                        });
                      }}
                      className="w-4 h-4 text-blue-600"
                    />
                    <label htmlFor="requiresUserConfirmation" className="text-sm text-gray-700 dark:text-gray-300">
                      Requiere confirmación del usuario
                    </label>
                  </div>

                  {formData.requiresUserConfirmation && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Texto del Checkbox *</label>
                        <button type="button" onClick={() => setShowActionTextInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400">
                          <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                        </button>
                      </div>
                      <input type="text" required={formData.requiresUserConfirmation} value={formData.actionText} onChange={(e) => setFormData({ ...formData, actionText: e.target.value })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white" placeholder="Ej: Me comprometo a adjuntar el documento..." />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Visibilidad */}
        <div className="pt-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Visibilidad en el formulario</label>
          <button type="button" onClick={() => setFormData({ ...formData, isActive: !formData.isActive })} className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center ${formData.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}>
            <FontAwesomeIcon icon={formData.isActive ? faToggleOn : faToggleOff} className="mr-1" />
            {formData.isActive ? "Activa" : "Inactiva"}
          </button>
        </div>
      </form>

      {/* --- MODALES --- */}
      <InfoModal isOpen={showCategoryTypeInfo} onClose={() => setShowCategoryTypeInfo(false)} title="Tipo de Dato" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>Define qué tipo de input se mostrará en el formulario móvil.</p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showSubcategoriesInfo} onClose={() => setShowSubcategoriesInfo(false)} title="Opciones del Pedido" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>Estas opciones aparecerán como un select obligatorio para el usuario.</p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showActionTypeInfo} onClose={() => setShowActionTypeInfo(false)} title="Tipos de Acción Futura" size="md">
        <div className="text-gray-700 dark:text-gray-300 space-y-3">
          <p className="font-medium">Cada tipo define qué debe hacer el usuario:</p>
          <p>
            <strong>Presentación de Documento:</strong> El usuario debe presentar un documento específico. Requiere especificar el documento, puede incluir modo de vencimiento (opcional) y requiere texto de checkbox para confirmar el compromiso.
          </p>
          <p>
            <strong>Otra Acción Futura:</strong> El usuario debe completar una acción específica o aceptar condiciones. Requiere un título descriptivo que se muestra como alerta en mobile, puede incluir modo de vencimiento (opcional) y requiere texto de checkbox para confirmar.
          </p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showActionTextInfo} onClose={() => setShowActionTextInfo(false)} title="Texto del Checkbox" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>Texto que se muestra junto al checkbox que el usuario debe tildar para confirmar su compromiso.</p>
          <p className="mt-2 text-sm">Aplica para ambos tipos de acción futura.</p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showDateModeInfo} onClose={() => setShowDateModeInfo(false)} title="Modo de Fecha" size="sm">
        <div className="text-gray-700 dark:text-gray-300 space-y-3">
          <p>Define cómo se cargan fechas:</p>
          <p>
            <strong>Fecha única:</strong> Una sola fecha.
          </p>
          <p>
            <strong>Rango:</strong> Fecha inicio y fin.
          </p>
        </div>
      </InfoModal>

      <InfoModal isOpen={showInformacionInfo} onClose={() => setShowInformacionInfo(false)} title="Información" size="sm">
        <div className="text-gray-700 dark:text-gray-300">
          <p>Mensaje de confirmación mostrado al final del formulario.</p>
        </div>
      </InfoModal>
    </>
  );
};
