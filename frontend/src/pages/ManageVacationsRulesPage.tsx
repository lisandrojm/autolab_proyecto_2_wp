import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faSpinner, faPlus, faEdit, faTrash, faToggleOn, faToggleOff, faPlus as faPlusCircle, faTimes, faGear, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { Modal } from "../components/ui/Modal";
import { sweetAlert } from "../utils/sweetAlert";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { InfoModal } from "../components/ui/InfoModal";
import { pdfTemplatesAPI, PdfTemplate } from "../api/pdfTemplates";
import { vacationRulesAPI } from "../api/vacations";

const HELP_KEY = "vacations" as const;

type VacationRuleScope = "all" | "cargo" | "nivel" | "cargo_nivel";

interface AntiguedadTranche {
  desde: number;
  hasta: number;
  dias: number;
}

interface VacationRule {
  id: string;
  name: string;
  description?: string;
  activo: boolean;
  scope: VacationRuleScope;
  cargo: string | null;
  nivel: string | null;
  antiguedadTramos: AntiguedadTranche[];
  maxDiasGozados?: number;
  diasBeneficio?: number;
  permiteArrastre: boolean;
  maxDiasArrastre?: number;
  vencimientoArrastreDias?: number;
  minDiasPorSolicitud?: number;
  maxDiasCorridos?: number;
  maxDiasHabiles?: number;
  anticipacionMinimaDias?: number;
  permiteFraccionadas: boolean;
  requiereFirma: boolean;
  pdfTemplateId?: string;
  isActive: boolean;
}

// Mock rules removed - now using API

const CARGOS_OPTIONS = ["Operario", "Analista", "Coordinador", "Manager", "Director"];
const NIVELES_OPTIONS = ["Junior", "Semi-Senior", "Senior", "Lead"];

const initialFormState: Omit<VacationRule, "id"> = {
  name: "",
  description: "",
  activo: true,
  scope: "all",
  cargo: null,
  nivel: null,
  antiguedadTramos: [],
  maxDiasGozados: undefined,
  diasBeneficio: undefined,
  permiteArrastre: false,
  maxDiasArrastre: undefined,
  vencimientoArrastreDias: undefined,
  minDiasPorSolicitud: undefined,
  maxDiasCorridos: undefined,
  maxDiasHabiles: undefined,
  anticipacionMinimaDias: undefined,
  permiteFraccionadas: false,
  requiereFirma: true,
  pdfTemplateId: undefined,
  isActive: true,
};

export function ManageVacationsRulesPage() {
  const navigate = useNavigate();
  const helpEntry = getHelp(HELP_KEY);

  const [rules, setRules] = useState<VacationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<VacationRule | null>(null);
  const [formData, setFormData] = useState<Omit<VacationRule, "id">>(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [showMainInfo, setShowMainInfo] = useState(false);
  const [pdfTemplates, setPdfTemplates] = useState<PdfTemplate[]>([]);
  const [showPdfTemplateInfo, setShowPdfTemplateInfo] = useState(false);

  const [showAntiguedadInfo, setShowAntiguedadInfo] = useState(false);
  const [showMaxDiasGozadosInfo, setShowMaxDiasGozadosInfo] = useState(false);
  const [showDiasBeneficioInfo, setShowDiasBeneficioInfo] = useState(false);
  const [showArrastreInfo, setShowArrastreInfo] = useState(false);
  const [showMaxDiasArrastreInfo, setShowMaxDiasArrastreInfo] = useState(false);
  const [showVencimientoInfo, setShowVencimientoInfo] = useState(false);
  const [showMinDiasInfo, setShowMinDiasInfo] = useState(false);
  const [showMaxDiasCorridosInfo, setShowMaxDiasCorridosInfo] = useState(false);
  const [showMaxDiasHabilesInfo, setShowMaxDiasHabilesInfo] = useState(false);
  const [showAnticipacionInfo, setShowAnticipacionInfo] = useState(false);
  const [showFraccionadasInfo, setShowFraccionadasInfo] = useState(false);

  useEffect(() => {
    loadRules();
    loadPdfTemplates();
  }, []);

  const loadRules = async () => {
    try {
      setLoading(true);
      const data = await vacationRulesAPI.getAll();
      // Transform API data to match VacationRule interface
      const transformedRules: VacationRule[] = data.map((item: any) => ({
        id: item._id,
        name: item.name,
        description: item.description || "",
        activo: item.active,
        scope: item.scope,
        cargo: item.position || null,
        nivel: item.level || null,
        antiguedadTramos: item.antiguedadTramos || [],
        maxDiasGozados: item.maxDiasGozados,
        diasBeneficio: item.diasBeneficio,
        permiteArrastre: item.permiteArrastre || false,
        maxDiasArrastre: item.maxDiasArrastre,
        vencimientoArrastreDias: item.vencimientoArrastreDias,
        minDiasPorSolicitud: item.minDiasPorSolicitud,
        maxDiasCorridos: item.maxDiasCorridos,
        maxDiasHabiles: item.maxDiasHabiles,
        anticipacionMinimaDias: item.anticipacionMinimaDias,
        permiteFraccionadas: item.permiteFraccionadas || false,
        requiereFirma: item.requiereFirma,
        pdfTemplateId: item.pdfTemplateId,
        isActive: item.active,
      }));
      setRules(transformedRules);
    } catch (error) {
      console.error("Error loading vacation rules:", error);
      sweetAlert.error("Error", "No se pudieron cargar las reglas de vacaciones");
    } finally {
      setLoading(false);
    }
  };

  const loadPdfTemplates = async () => {
    try {
      const data = await pdfTemplatesAPI.getAll();
      setPdfTemplates(data.filter((t: PdfTemplate) => t.isActive));
    } catch (error) {
      console.error("Error loading PDF templates:", error);
    }
  };

  const openCreateModal = () => {
    setEditingRule(null);
    setFormData(initialFormState);
    setShowModal(true);
  };

  const openEditModal = (rule: VacationRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description,
      activo: rule.activo,
      scope: rule.scope,
      cargo: rule.cargo,
      nivel: rule.nivel,
      antiguedadTramos: rule.antiguedadTramos,
      maxDiasGozados: rule.maxDiasGozados,
      diasBeneficio: rule.diasBeneficio,
      permiteArrastre: rule.permiteArrastre,
      maxDiasArrastre: rule.maxDiasArrastre,
      vencimientoArrastreDias: rule.vencimientoArrastreDias,
      minDiasPorSolicitud: rule.minDiasPorSolicitud,
      maxDiasCorridos: rule.maxDiasCorridos,
      maxDiasHabiles: rule.maxDiasHabiles,
      anticipacionMinimaDias: rule.anticipacionMinimaDias,
      permiteFraccionadas: rule.permiteFraccionadas,
      requiereFirma: rule.requiereFirma,
      pdfTemplateId: rule.pdfTemplateId,
      isActive: rule.isActive,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (!formData.name.trim()) {
        sweetAlert.error("Error", "El nombre de la regla es obligatorio");
        setSubmitting(false);
        return;
      }

      const backendData = {
        name: formData.name,
        description: formData.description,
        active: formData.isActive,
        scope: formData.scope,
        position: formData.cargo,
        level: formData.nivel,
        antiguedadTramos: formData.antiguedadTramos,
        maxDiasGozados: formData.maxDiasGozados,
        diasBeneficio: formData.diasBeneficio,
        permiteArrastre: formData.permiteArrastre,
        maxDiasArrastre: formData.maxDiasArrastre,
        vencimientoArrastreDias: formData.vencimientoArrastreDias,
        minDiasPorSolicitud: formData.minDiasPorSolicitud,
        maxDiasCorridos: formData.maxDiasCorridos,
        maxDiasHabiles: formData.maxDiasHabiles,
        anticipacionMinimaDias: formData.anticipacionMinimaDias,
        permiteFraccionadas: formData.permiteFraccionadas,
        requiereFirma: formData.requiereFirma,
        pdfTemplateId: formData.pdfTemplateId,
      };

      if (editingRule) {
        await vacationRulesAPI.update(editingRule.id, backendData);
        await sweetAlert.success("Regla actualizada", "La regla de vacaciones se actualizó correctamente");
      } else {
        await vacationRulesAPI.create(backendData);
        await sweetAlert.success("Regla creada", "La regla de vacaciones se creó correctamente");
      }

      setShowModal(false);
      await loadRules();
    } catch (error: any) {
      console.error("Error saving vacation rule:", error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || "No se pudo guardar la regla";
      const errorDetails = error.response?.data?.details;

      if (errorDetails && Array.isArray(errorDetails)) {
        const detailsText = errorDetails.map((d: any) => `${d.field}: ${d.message}`).join("\n");
        sweetAlert.error("Error de validación", detailsText);
      } else {
        sweetAlert.error("Error", errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rule: VacationRule) => {
    const result = await sweetAlert.confirm("¿Eliminar regla?", `¿Estás seguro de eliminar la regla "${rule.name}"?`);
    if (!result.isConfirmed) return;

    try {
      await vacationRulesAPI.delete(rule.id);
      sweetAlert.success("Regla eliminada", "La regla se eliminó correctamente");
      await loadRules();
    } catch (error: any) {
      sweetAlert.error("Error", "No se pudo eliminar la regla");
    }
  };

  const handleToggleActive = async (rule: VacationRule) => {
    try {
      const newActivo = !rule.activo;
      await vacationRulesAPI.update(rule.id, { active: newActivo });
      await loadRules();
    } catch (error: any) {
      sweetAlert.error("Error", "No se pudo actualizar el estado");
    }
  };

  const addAntiguedadTramo = () => {
    setFormData((prev) => ({
      ...prev,
      antiguedadTramos: [...prev.antiguedadTramos, { desde: 0, hasta: 0, dias: 0 }],
    }));
  };

  const removeAntiguedadTramo = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      antiguedadTramos: prev.antiguedadTramos.filter((_, i) => i !== index),
    }));
  };

  const updateAntiguedadTramo = (index: number, field: keyof AntiguedadTranche, value: number) => {
    setFormData((prev) => ({
      ...prev,
      antiguedadTramos: prev.antiguedadTramos.map((tramo, i) => (i === index ? { ...tramo, [field]: value } : tramo)),
    }));
  };

  const getScopeLabel = (scope: VacationRuleScope) => {
    switch (scope) {
      case "all":
        return "Todos";
      case "cargo":
        return "Por Cargo";
      case "nivel":
        return "Por Nivel";
      case "cargo_nivel":
        return "Cargo + Nivel";
      default:
        return "-";
    }
  };

  const formatAntiguedadTramos = (tramos: AntiguedadTranche[]) => {
    if (!tramos || tramos.length === 0) return "-";
    return tramos.map(t => `${t.desde}-${t.hasta}a: ${t.dias}d`).join(", ");
  };

  const formatLimites = (rule: VacationRule) => {
    const limits = [];
    if (rule.minDiasPorSolicitud) limits.push(`Mín: ${rule.minDiasPorSolicitud}d`);
    if (rule.maxDiasCorridos) limits.push(`Máx corridos: ${rule.maxDiasCorridos}d`);
    if (rule.maxDiasHabiles) limits.push(`Máx hábiles: ${rule.maxDiasHabiles}d`);
    return limits.length > 0 ? limits.join(" | ") : "-";
  };

  const formatArrastre = (rule: VacationRule) => {
    if (!rule.permiteArrastre) return "No";
    const parts = ["Sí"];
    if (rule.maxDiasArrastre) parts.push(`máx ${rule.maxDiasArrastre}d`);
    if (rule.vencimientoArrastreDias) parts.push(`vence ${rule.vencimientoArrastreDias}d`);
    return parts.join(", ");
  };

  return (
    <PageLayout
      title="ABM Vacaciones | Reglas"
      subtitle="Administra las reglas de vacaciones del personal"
      faIcon={{ icon: faGear }}
      onBack={() => navigate("/hr/vacation-requests")}
      shouldShowInfo={hasHelp(HELP_KEY)}
      infoModal={{
        isOpen: showMainInfo,
        onOpen: () => setShowMainInfo(true),
        onClose: () => setShowMainInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      headerActions={
        <button onClick={openCreateModal} className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
          <FontAwesomeIcon icon={faPlus} />
        </button>
      }
    >
      <div className="space-y-6">
        <div>
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-blue-600" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded border dark:border-slate-800">
                <table className="w-full dark:bg-slate-800/80 min-w-[1200px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Regla</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Días por Antigüedad</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Límites</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Operativa</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Arrastre</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Firma</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Estado</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr key={rule.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{rule.name}</div>
                          {rule.description && <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{rule.description}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            {formatAntiguedadTramos(rule.antiguedadTramos)}
                          </div>
                          {rule.diasBeneficio && (
                            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                              +{rule.diasBeneficio}d beneficio
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-xs text-gray-700 dark:text-gray-300">
                            {formatLimites(rule)}
                          </div>
                          {rule.maxDiasGozados && (
                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Máx/año: {rule.maxDiasGozados}d
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            {rule.anticipacionMinimaDias && (
                              <div className="text-xs text-gray-700 dark:text-gray-300">
                                Anticip: {rule.anticipacionMinimaDias}d
                              </div>
                            )}
                            <div>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${rule.permiteFraccionadas ? "bg-green-100 text-green-800 dark:bg-green-500/30 dark:text-green-200" : "bg-gray-100 text-gray-800 dark:bg-gray-500/30 dark:text-gray-300"}`}>
                                {rule.permiteFraccionadas ? "Fraccionadas: Sí" : "Fraccionadas: No"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-xs text-gray-700 dark:text-gray-300">
                            {formatArrastre(rule)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${rule.requiereFirma ? "bg-green-100 text-green-800 dark:bg-green-500/30 dark:text-green-200" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}>
                            {rule.requiereFirma ? "Sí" : "No"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <button onClick={() => handleToggleActive(rule)} className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center ${rule.activo ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}>
                            <FontAwesomeIcon icon={rule.activo ? faToggleOn : faToggleOff} className="mr-1" />
                            {rule.activo ? "Activa" : "Inactiva"}
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEditModal(rule)} className="p-1.5 rounded-lg text-gray-600 dark:text-gray-400 transition-colors hover:text-gray-800 dark:hover:text-gray-300" title="Editar">
                              <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleDelete(rule)} className="p-1.5 rounded-lg text-gray-600 dark:text-gray-400 transition-colors hover:text-gray-800 dark:hover:text-gray-300" title="Eliminar">
                              <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rules.length === 0 && (
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faCalendar} className="h-16 w-16 text-gray-400 mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 mb-4">No hay reglas de vacaciones registradas</p>
                  <button onClick={openCreateModal} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                    Crear Primera Regla
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingRule ? "Editar Regla de Vacaciones" : "Nueva regla de vacaciones"}
        size="lg"
        footer={
          <div className="flex gap-3 w-full">
            <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Cancelar
            </button>
            <button type="submit" form="vacation-rule-form" disabled={submitting} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? "Guardando..." : editingRule ? "Actualizar" : "Crear"}
            </button>
          </div>
        }
      >
        <div className="p-6">
          <form id="vacation-rule-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Información general */}
            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Información general</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre de la regla</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" placeholder="Ej: Vacaciones estándar" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción (opcional)</label>
                  <textarea value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" placeholder="Descripción de la regla" rows={3} />
                </div>
              </div>
            </div>

            {/* Alcance - OCULTO PARA MVP pero manteniendo los campos */}
            <div className="hidden">
              <input type="hidden" value={formData.scope} />
              <input type="hidden" value={formData.cargo || ""} />
              <input type="hidden" value={formData.nivel || ""} />
            </div>

            {/* Días por antigüedad - Con labels mejorados e info icon */}
            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Días de vacaciones según años de antigüedad</h3>
                <button type="button" onClick={() => setShowAntiguedadInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                  <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Define cuántos días de vacaciones corresponden según la antigüedad del empleado en la empresa.</p>
              <div className="space-y-3">
                {formData.antiguedadTramos.map((tramo, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Desde (años)</label>
                      <input type="number" placeholder="0" value={tramo.desde} onChange={(e) => updateAntiguedadTramo(index, "desde", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Hasta (años)</label>
                      <input type="number" placeholder="5" value={tramo.hasta} onChange={(e) => updateAntiguedadTramo(index, "hasta", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Días de vacaciones</label>
                      <input type="number" placeholder="14" value={tramo.dias} onChange={(e) => updateAntiguedadTramo(index, "dias", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                    </div>
                    <button type="button" onClick={() => removeAntiguedadTramo(index)} className="p-2 mt-5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" title="Eliminar tramo">
                      <FontAwesomeIcon icon={faTimes} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addAntiguedadTramo} className="w-full px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors flex items-center justify-center gap-2">
                  <FontAwesomeIcon icon={faPlusCircle} />
                  Agregar tramo de antigüedad
                </button>
              </div>
            </div>

            {/* Límites y Días */}
            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Límites y Días</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Máximo días gozados por año</label>
                    <button type="button" onClick={() => setShowMaxDiasGozadosInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                      <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                    </button>
                  </div>
                  <input type="number" value={formData.maxDiasGozados || ""} onChange={(e) => setFormData({ ...formData, maxDiasGozados: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="30" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Días de beneficio</label>
                    <button type="button" onClick={() => setShowDiasBeneficioInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                      <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                    </button>
                  </div>
                  <input type="number" value={formData.diasBeneficio || ""} onChange={(e) => setFormData({ ...formData, diasBeneficio: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="14" />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="permiteArrastre" checked={formData.permiteArrastre} onChange={(e) => setFormData({ ...formData, permiteArrastre: e.target.checked })} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                    <label htmlFor="permiteArrastre" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Permite arrastre de días no usados
                    </label>
                    <button type="button" onClick={() => setShowArrastreInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                      <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {formData.permiteArrastre && (
                  <>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Máximo días de arrastre</label>
                        <button type="button" onClick={() => setShowMaxDiasArrastreInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                          <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                        </button>
                      </div>
                      <input type="number" value={formData.maxDiasArrastre || ""} onChange={(e) => setFormData({ ...formData, maxDiasArrastre: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="7" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Vencimiento del arrastre (días)</label>
                        <button type="button" onClick={() => setShowVencimientoInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                          <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                        </button>
                      </div>
                      <input type="number" value={formData.vencimientoArrastreDias || ""} onChange={(e) => setFormData({ ...formData, vencimientoArrastreDias: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="180" />
                    </div>
                  </>
                )}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mínimo días por solicitud</label>
                    <button type="button" onClick={() => setShowMinDiasInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                      <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                    </button>
                  </div>
                  <input type="number" value={formData.minDiasPorSolicitud || ""} onChange={(e) => setFormData({ ...formData, minDiasPorSolicitud: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="1" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Máximo días corridos</label>
                    <button type="button" onClick={() => setShowMaxDiasCorridosInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                      <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                    </button>
                  </div>
                  <input type="number" value={formData.maxDiasCorridos || ""} onChange={(e) => setFormData({ ...formData, maxDiasCorridos: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="14" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Máximo días hábiles</label>
                    <button type="button" onClick={() => setShowMaxDiasHabilesInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                      <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                    </button>
                  </div>
                  <input type="number" value={formData.maxDiasHabiles || ""} onChange={(e) => setFormData({ ...formData, maxDiasHabiles: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="10" />
                </div>
              </div>
            </div>

            {/* Operativa */}
            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Operativa</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Anticipación mínima para solicitar (días)</label>
                    <button type="button" onClick={() => setShowAnticipacionInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                      <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                    </button>
                  </div>
                  <input type="number" value={formData.anticipacionMinimaDias || ""} onChange={(e) => setFormData({ ...formData, anticipacionMinimaDias: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="15" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="permiteFraccionadas" checked={formData.permiteFraccionadas} onChange={(e) => setFormData({ ...formData, permiteFraccionadas: e.target.checked })} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                  <label htmlFor="permiteFraccionadas" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Permite vacaciones fraccionadas
                  </label>
                  <button type="button" onClick={() => setShowFraccionadasInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Firma Digital */}
            <div className="border border-gray-200 dark:border-blue-600 p-4 rounded">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="requiereFirma"
                  checked={formData.requiereFirma ?? true}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      requiereFirma: e.target.checked,
                      pdfTemplateId: e.target.checked ? formData.pdfTemplateId : undefined,
                    })
                  }
                  className="w-4 h-4 text-blue-600"
                />
                <label htmlFor="requiereFirma" className="text-sm text-gray-700 dark:text-gray-300">
                  Requiere FIRMA del usuario
                </label>
              </div>

              {(formData.requiereFirma ?? true) && (
                <>
                  <p className="pt-3 text-sm text-gray-700 dark:text-gray-300">Cuando se apruebe esta solicitud de vacaciones, se enviará automáticamente para firma del usuario.</p>

                  {/* Plantilla PDF */}
                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Plantilla PDF (opcional)</label>
                      <button type="button" onClick={() => setShowPdfTemplateInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors">
                        <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                      </button>
                    </div>
                    <select value={formData.pdfTemplateId || ""} onChange={(e) => setFormData({ ...formData, pdfTemplateId: e.target.value || undefined })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                      <option value="">Sin plantilla PDF</option>
                      {pdfTemplates.map((template) => (
                        <option key={template._id} value={template._id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">El PDF se generará automáticamente al preaprobarse la solicitud</p>
                  </div>
                </>
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
        </div>
      </Modal>

      {/* Modales de información */}
      <InfoModal isOpen={showAntiguedadInfo} onClose={() => setShowAntiguedadInfo(false)} title="Días por antigüedad">
        <p className="text-sm text-gray-700 dark:text-gray-300">Define tramos de años de antigüedad y los días de vacaciones que corresponden en cada uno.</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">Por ejemplo:</p>
        <ul className="list-disc list-inside mt-2 text-sm text-gray-700 dark:text-gray-300">
          <li>De 0 a 5 años: 14 días</li>
          <li>De 6 a 10 años: 21 días</li>
          <li>De 11 años en adelante: 28 días</li>
        </ul>
      </InfoModal>

      <InfoModal isOpen={showMaxDiasGozadosInfo} onClose={() => setShowMaxDiasGozadosInfo(false)} title="Máximo días gozados por año">
        <p className="text-sm text-gray-700 dark:text-gray-300">Cantidad máxima de días de vacaciones que un empleado puede tomar en un año calendario, incluyendo días de arrastre de años anteriores.</p>
      </InfoModal>

      <InfoModal isOpen={showDiasBeneficioInfo} onClose={() => setShowDiasBeneficioInfo(false)} title="Días de beneficio">
        <p className="text-sm text-gray-700 dark:text-gray-300">Días adicionales de vacaciones que se otorgan como beneficio especial, además de los días por antigüedad. Estos días no dependen de la antigüedad del empleado.</p>
      </InfoModal>

      <InfoModal isOpen={showArrastreInfo} onClose={() => setShowArrastreInfo(false)} title="Arrastre de días">
        <p className="text-sm text-gray-700 dark:text-gray-300">Permite que los días de vacaciones no utilizados en un año puedan ser usados en el año siguiente dentro del plazo de vencimiento configurado.</p>
      </InfoModal>

      <InfoModal isOpen={showMaxDiasArrastreInfo} onClose={() => setShowMaxDiasArrastreInfo(false)} title="Máximo días de arrastre">
        <p className="text-sm text-gray-700 dark:text-gray-300">Cantidad máxima de días de vacaciones no utilizados que pueden arrastrarse al siguiente año. Por ejemplo, si se configuran 7 días, el empleado puede arrastrar hasta 7 días no usados.</p>
      </InfoModal>

      <InfoModal isOpen={showVencimientoInfo} onClose={() => setShowVencimientoInfo(false)} title="Vencimiento del arrastre">
        <p className="text-sm text-gray-700 dark:text-gray-300">Cantidad de días desde el inicio del nuevo año en los que los días arrastrados deben ser utilizados. Después de este plazo, los días no usados se pierden.</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">Por ejemplo, si se configuran 180 días, los días arrastrados deben usarse antes del 30 de junio.</p>
      </InfoModal>

      <InfoModal isOpen={showMinDiasInfo} onClose={() => setShowMinDiasInfo(false)} title="Mínimo días por solicitud">
        <p className="text-sm text-gray-700 dark:text-gray-300">Cantidad mínima de días que el empleado debe solicitar en cada pedido de vacaciones. Esto evita solicitudes de períodos muy cortos.</p>
      </InfoModal>

      <InfoModal isOpen={showMaxDiasCorridosInfo} onClose={() => setShowMaxDiasCorridosInfo(false)} title="Máximo días corridos">
        <p className="text-sm text-gray-700 dark:text-gray-300">Máxima cantidad de días corridos (incluyendo fines de semana y feriados) que pueden solicitarse en un solo período de vacaciones.</p>
      </InfoModal>

      <InfoModal isOpen={showMaxDiasHabilesInfo} onClose={() => setShowMaxDiasHabilesInfo(false)} title="Máximo días hábiles">
        <p className="text-sm text-gray-700 dark:text-gray-300">Máxima cantidad de días hábiles (excluyendo fines de semana y feriados) que pueden solicitarse en un solo período de vacaciones.</p>
      </InfoModal>

      <InfoModal isOpen={showAnticipacionInfo} onClose={() => setShowAnticipacionInfo(false)} title="Anticipación mínima">
        <p className="text-sm text-gray-700 dark:text-gray-300">Cantidad mínima de días de anticipación con la que el empleado debe solicitar sus vacaciones antes de la fecha de inicio deseada.</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">Por ejemplo, si se configuran 15 días, el empleado debe solicitar con al menos 15 días de anticipación.</p>
      </InfoModal>

      <InfoModal isOpen={showFraccionadasInfo} onClose={() => setShowFraccionadasInfo(false)} title="Vacaciones fraccionadas">
        <p className="text-sm text-gray-700 dark:text-gray-300">Permite que el empleado pueda dividir sus días de vacaciones en múltiples períodos a lo largo del año, en lugar de tomarlos todos juntos.</p>
      </InfoModal>

      <InfoModal isOpen={showPdfTemplateInfo} onClose={() => setShowPdfTemplateInfo(false)} title="Plantilla PDF (opcional)">
        <p className="text-sm text-gray-700 dark:text-gray-300">Selecciona una plantilla PDF que se generará automáticamente cuando se preapruebe una solicitud de vacaciones de este tipo.</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">Si no seleccionas ninguna plantilla, no se generará ningún PDF automáticamente.</p>
      </InfoModal>
    </PageLayout>
  );
}
