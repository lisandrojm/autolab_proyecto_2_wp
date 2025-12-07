import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faSpinner, faPlus, faEdit, faTrash, faToggleOn, faToggleOff, faPlus as faPlusCircle, faTimes } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { Modal } from "../components/ui/Modal";
import { sweetAlert } from "../utils/sweetAlert";
import { getHelp, hasHelp } from "../data/help/helpContent";

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
  firmadoPor: string[];
}

const mockRules: VacationRule[] = [
  {
    id: "rule-1",
    name: "Vacaciones estándar",
    description: "Regla general para todos los empleados",
    scope: "all",
    cargo: null,
    nivel: null,
    activo: true,
    antiguedadTramos: [
      { desde: 0, hasta: 5, dias: 14 },
      { desde: 6, hasta: 10, dias: 21 },
      { desde: 11, hasta: 99, dias: 28 },
    ],
    maxDiasGozados: 30,
    diasBeneficio: 14,
    permiteArrastre: true,
    maxDiasArrastre: 7,
    vencimientoArrastreDias: 180,
    minDiasPorSolicitud: 1,
    maxDiasCorridos: 14,
    maxDiasHabiles: 10,
    anticipacionMinimaDias: 15,
    permiteFraccionadas: true,
    requiereFirma: false,
    firmadoPor: [],
  },
  {
    id: "rule-2",
    name: "Ejecutivos Senior",
    description: "Regla especial para nivel senior",
    scope: "nivel",
    cargo: null,
    nivel: "Senior",
    activo: true,
    antiguedadTramos: [
      { desde: 0, hasta: 99, dias: 28 },
    ],
    maxDiasGozados: 35,
    diasBeneficio: 21,
    permiteArrastre: true,
    maxDiasArrastre: 14,
    vencimientoArrastreDias: 365,
    minDiasPorSolicitud: 1,
    maxDiasCorridos: 21,
    maxDiasHabiles: 15,
    anticipacionMinimaDias: 7,
    permiteFraccionadas: true,
    requiereFirma: true,
    firmadoPor: ["Manager", "Dirección"],
  },
  {
    id: "rule-3",
    name: "Operarios Jornada Completa",
    description: "Regla para operarios de tiempo completo",
    scope: "cargo",
    cargo: "Operario",
    nivel: null,
    activo: false,
    antiguedadTramos: [
      { desde: 0, hasta: 3, dias: 10 },
      { desde: 4, hasta: 99, dias: 14 },
    ],
    maxDiasGozados: 20,
    diasBeneficio: 10,
    permiteArrastre: false,
    maxDiasArrastre: 0,
    vencimientoArrastreDias: 0,
    minDiasPorSolicitud: 2,
    maxDiasCorridos: 10,
    maxDiasHabiles: 8,
    anticipacionMinimaDias: 30,
    permiteFraccionadas: false,
    requiereFirma: true,
    firmadoPor: ["RRHH"],
  },
];

const CARGOS_OPTIONS = ["Operario", "Analista", "Coordinador", "Manager", "Director"];
const NIVELES_OPTIONS = ["Junior", "Semi-Senior", "Senior", "Lead"];
const FIRMANTES_OPTIONS = ["Manager", "RRHH", "Dirección"];

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
  requiereFirma: false,
  firmadoPor: [],
};

export default function VacationsRulesPage() {
  const navigate = useNavigate();
  const helpEntry = getHelp(HELP_KEY);

  const [rules, setRules] = useState<VacationRule[]>(mockRules);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<VacationRule | null>(null);
  const [formData, setFormData] = useState<Omit<VacationRule, "id">>(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [showMainInfo, setShowMainInfo] = useState(false);

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
      firmadoPor: rule.firmadoPor,
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

      if (editingRule) {
        setRules((prev) => prev.map((r) => (r.id === editingRule.id ? { ...formData, id: editingRule.id } : r)));
        await sweetAlert.success("Regla actualizada", "La regla de vacaciones se actualizó correctamente");
      } else {
        const newRule: VacationRule = {
          ...formData,
          id: `rule-${Date.now()}`,
        };
        setRules((prev) => [...prev, newRule]);
        await sweetAlert.success("Regla creada", "La regla de vacaciones se creó correctamente");
      }

      setShowModal(false);
    } catch (error: any) {
      sweetAlert.error("Error", "No se pudo guardar la regla");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rule: VacationRule) => {
    const result = await sweetAlert.confirm("¿Eliminar regla?", `¿Estás seguro de eliminar la regla "${rule.name}"?`);
    if (!result.isConfirmed) return;

    try {
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      sweetAlert.success("Regla eliminada", "La regla se eliminó correctamente");
    } catch (error: any) {
      sweetAlert.error("Error", "No se pudo eliminar la regla");
    }
  };

  const handleToggleActive = async (rule: VacationRule) => {
    try {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, activo: !r.activo } : r)));
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

  const toggleFirmante = (firmante: string) => {
    setFormData((prev) => ({
      ...prev,
      firmadoPor: prev.firmadoPor.includes(firmante) ? prev.firmadoPor.filter((f) => f !== firmante) : [...prev.firmadoPor, firmante],
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

  return (
    <PageLayout
      title="Reglas de Vacaciones"
      subtitle="Administra las reglas de vacaciones del personal"
      faIcon={{ icon: faCalendar }}
      onBack={() => navigate("/hr/manage-vacations")}
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
          <span className="hidden lg:inline">Nueva regla</span>
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
                <table className="w-full dark:bg-slate-800/80">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Nombre de regla</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Alcance</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Cargo</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Nivel</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Requiere Firma</th>
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
                          <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-500/30 dark:text-gray-200">{getScopeLabel(rule.scope)}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{rule.cargo || "-"}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{rule.nivel || "-"}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${rule.requiereFirma ? "bg-green-100 text-green-800 dark:bg-green-500/30 dark:text-green-200" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}>{rule.requiereFirma ? "Sí" : "No"}</span>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleToggleActive(rule)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center ${rule.activo ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}
                          >
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
        title={editingRule ? "Editar Regla de Vacaciones" : "Crear nueva regla de vacaciones"}
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
            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Información general</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre de la regla</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Ej: Vacaciones estándar"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción (opcional)</label>
                  <textarea
                    value={formData.description || ""}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="Descripción de la regla"
                    rows={3}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="activo" checked={formData.activo} onChange={(e) => setFormData({ ...formData, activo: e.target.checked })} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                  <label htmlFor="activo" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Regla activa
                  </label>
                </div>
              </div>
            </div>

            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Alcance</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Aplicar a</label>
                  <select
                    value={formData.scope}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        scope: e.target.value as VacationRuleScope,
                        cargo: null,
                        nivel: null,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="all">Todos los empleados</option>
                    <option value="cargo">Por cargo específico</option>
                    <option value="nivel">Por nivel específico</option>
                    <option value="cargo_nivel">Por cargo y nivel</option>
                  </select>
                </div>

                {(formData.scope === "cargo" || formData.scope === "cargo_nivel") && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cargo</label>
                    <select value={formData.cargo || ""} onChange={(e) => setFormData({ ...formData, cargo: e.target.value || null })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white">
                      <option value="">Seleccionar cargo</option>
                      {CARGOS_OPTIONS.map((cargo) => (
                        <option key={cargo} value={cargo}>
                          {cargo}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(formData.scope === "nivel" || formData.scope === "cargo_nivel") && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nivel</label>
                    <select value={formData.nivel || ""} onChange={(e) => setFormData({ ...formData, nivel: e.target.value || null })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white">
                      <option value="">Seleccionar nivel</option>
                      {NIVELES_OPTIONS.map((nivel) => (
                        <option key={nivel} value={nivel}>
                          {nivel}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Días por antigüedad</h3>
              <div className="space-y-3">
                {formData.antiguedadTramos.map((tramo, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex-1">
                      <input
                        type="number"
                        placeholder="Desde (años)"
                        value={tramo.desde}
                        onChange={(e) => updateAntiguedadTramo(index, "desde", parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        min="0"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="number"
                        placeholder="Hasta (años)"
                        value={tramo.hasta}
                        onChange={(e) => updateAntiguedadTramo(index, "hasta", parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        min="0"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="number"
                        placeholder="Días"
                        value={tramo.dias}
                        onChange={(e) => updateAntiguedadTramo(index, "dias", parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        min="0"
                      />
                    </div>
                    <button type="button" onClick={() => removeAntiguedadTramo(index)} className="p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" title="Eliminar tramo">
                      <FontAwesomeIcon icon={faTimes} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addAntiguedadTramo} className="w-full px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors flex items-center justify-center gap-2">
                  <FontAwesomeIcon icon={faPlusCircle} />
                  Agregar tramo
                </button>
              </div>
            </div>

            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Límites y Días</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Máx. días gozados</label>
                  <input type="number" value={formData.maxDiasGozados || ""} onChange={(e) => setFormData({ ...formData, maxDiasGozados: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Días beneficio</label>
                  <input type="number" value={formData.diasBeneficio || ""} onChange={(e) => setFormData({ ...formData, diasBeneficio: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="permiteArrastre" checked={formData.permiteArrastre} onChange={(e) => setFormData({ ...formData, permiteArrastre: e.target.checked })} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                    <label htmlFor="permiteArrastre" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Permite arrastre de días
                    </label>
                  </div>
                </div>
                {formData.permiteArrastre && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Máx. días arrastre</label>
                      <input type="number" value={formData.maxDiasArrastre || ""} onChange={(e) => setFormData({ ...formData, maxDiasArrastre: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vencimiento arrastre (días)</label>
                      <input type="number" value={formData.vencimientoArrastreDias || ""} onChange={(e) => setFormData({ ...formData, vencimientoArrastreDias: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mín. días por solicitud</label>
                  <input type="number" value={formData.minDiasPorSolicitud || ""} onChange={(e) => setFormData({ ...formData, minDiasPorSolicitud: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Máx. días corridos</label>
                  <input type="number" value={formData.maxDiasCorridos || ""} onChange={(e) => setFormData({ ...formData, maxDiasCorridos: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Máx. días hábiles</label>
                  <input type="number" value={formData.maxDiasHabiles || ""} onChange={(e) => setFormData({ ...formData, maxDiasHabiles: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                </div>
              </div>
            </div>

            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Operativa</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Anticipación mínima (días)</label>
                  <input type="number" value={formData.anticipacionMinimaDias || ""} onChange={(e) => setFormData({ ...formData, anticipacionMinimaDias: parseInt(e.target.value) || undefined })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="permiteFraccionadas" checked={formData.permiteFraccionadas} onChange={(e) => setFormData({ ...formData, permiteFraccionadas: e.target.checked })} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                  <label htmlFor="permiteFraccionadas" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Permite vacaciones fraccionadas
                  </label>
                </div>
              </div>
            </div>

            <div className="pb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Firma Digital</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="requiereFirma" checked={formData.requiereFirma} onChange={(e) => setFormData({ ...formData, requiereFirma: e.target.checked })} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                  <label htmlFor="requiereFirma" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Requiere firma digital
                  </label>
                </div>

                {formData.requiereFirma && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Firmado por</label>
                    <div className="space-y-2">
                      {FIRMANTES_OPTIONS.map((firmante) => (
                        <div key={firmante} className="flex items-center gap-2">
                          <input type="checkbox" id={`firmante-${firmante}`} checked={formData.firmadoPor.includes(firmante)} onChange={() => toggleFirmante(firmante)} className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                          <label htmlFor={`firmante-${firmante}`} className="text-sm text-gray-700 dark:text-gray-300">
                            {firmante}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
      </Modal>
    </PageLayout>
  );
}
