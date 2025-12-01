import { useState, useEffect } from "react";
import { PageLayout } from "../../components/ui/PageLayout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faEdit, faTrash, faFilePdf, faCheckCircle, faTimesCircle, faTimes, faSave, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { pdfTemplatesAPI, PdfTemplate, PdfTemplateInput, codeOptions, variablesByCode, systemVariables } from "../../api/pdfTemplates";
import Swal from "sweetalert2";

export function PdfTemplatesPage() {
  const [templates, setTemplates] = useState<PdfTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PdfTemplate | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [formData, setFormData] = useState<PdfTemplateInput>({
    code: "dinero",
    name: "",
    content: "",
    variablesHint: "",
    isActive: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (editingTemplate) {
      setFormData({
        code: editingTemplate.code,
        name: editingTemplate.name,
        content: editingTemplate.content,
        variablesHint: editingTemplate.variablesHint || "",
        isActive: editingTemplate.isActive,
      });
    } else {
      setFormData({
        code: "dinero",
        name: "",
        content: "",
        variablesHint: "",
        isActive: true,
      });
    }
  }, [editingTemplate]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await pdfTemplatesAPI.getAll();
      setTemplates(data);
    } catch (error) {
      console.error("Error loading templates:", error);
      Swal.fire("Error", "No se pudieron cargar las plantillas", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template: PdfTemplate) => {
    setEditingTemplate(template);
    setShowForm(true);
  };

  const handleDelete = async (template: PdfTemplate) => {
    const result = await Swal.fire({
      title: "¿Eliminar plantilla?",
      text: `Se eliminará la plantilla "${template.name}"`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });

    if (result.isConfirmed) {
      try {
        await pdfTemplatesAPI.delete(template._id);
        await loadTemplates();
        Swal.fire("Eliminada", "La plantilla ha sido eliminada", "success");
      } catch (error) {
        Swal.fire("Error", "No se pudo eliminar la plantilla", "error");
      }
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "El nombre es requerido";
    if (!formData.content.trim()) newErrors.content = "El contenido es requerido";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      if (editingTemplate) {
        await pdfTemplatesAPI.update(editingTemplate._id, formData);
        Swal.fire("Actualizada", "La plantilla ha sido actualizada", "success");
      } else {
        await pdfTemplatesAPI.create(formData);
        Swal.fire("Creada", "La plantilla ha sido creada", "success");
      }
      await loadTemplates();
      setShowForm(false);
      setEditingTemplate(null);
    } catch (error: any) {
      Swal.fire("Error", error.response?.data?.error || "No se pudo guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  const getCodeBadgeColor = (code: string) => {
    switch (code) {
      case "dinero":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "fechaRango":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "fechaUnica":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const filteredTemplates = templates.filter((t) => {
    if (filter === "active") return t.isActive;
    if (filter === "inactive") return !t.isActive;
    return true;
  });

  const selectedVariables = variablesByCode[formData.code] || [];

  return (
    <PageLayout title="Plantillas PDF" description="Gestiona las plantillas para generación automática de PDFs en pedidos">
      <div className="mb-6 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex gap-2">
          <button onClick={() => setFilter("all")} className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === "all" ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100"}`}>
            Todas ({templates.length})
          </button>
          <button onClick={() => setFilter("active")} className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === "active" ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100"}`}>
            Activas ({templates.filter((t) => t.isActive).length})
          </button>
          <button onClick={() => setFilter("inactive")} className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === "inactive" ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100"}`}>
            Inactivas ({templates.filter((t) => !t.isActive).length})
          </button>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2">
          <FontAwesomeIcon icon={faPlus} />
          Nueva Plantilla
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-lg p-6">
              <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-4"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-12 text-center">
          <FontAwesomeIcon icon={faFilePdf} className="text-6xl text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">No hay plantillas</h3>
          <button onClick={() => setShowForm(true)} className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium inline-flex items-center gap-2">
            <FontAwesomeIcon icon={faPlus} />
            Crear Primera Plantilla
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTemplates.map((template) => (
            <div key={template._id} className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{template.name}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getCodeBadgeColor(template.code)}`}>{codeOptions.find((o) => o.value === template.code)?.label}</span>
                    {template.isActive ? (
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                        <FontAwesomeIcon icon={faCheckCircle} />
                        Activa
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-400 text-sm">
                        <FontAwesomeIcon icon={faTimesCircle} />
                        Inactiva
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-sm line-clamp-2">{template.content.substring(0, 150)}...</p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button onClick={() => handleEdit(template)} className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded-lg">
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button onClick={() => handleDelete(template)} className="p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg">
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{editingTemplate ? "Editar Plantilla" : "Nueva Plantilla"}</h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingTemplate(null);
                }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <FontAwesomeIcon icon={faTimes} className="text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Nombre *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={`w-full px-4 py-2 border rounded-lg dark:bg-slate-900 ${errors.name ? "border-red-500" : "border-slate-300"}`} placeholder="Ej: Solicitud de Dinero" disabled={saving} />
                  {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Código *</label>
                  <select value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value as any })} className="w-full px-4 py-2 border border-slate-300 rounded-lg dark:bg-slate-900" disabled={saving}>
                    {codeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} disabled={saving} />
                Plantilla Activa
              </label>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">Variables del Sistema (Automáticas)</h4>
                {systemVariables.map((v) => (
                  <div key={v.variable} className="text-sm text-blue-700 dark:text-blue-300">
                    <code className="bg-white px-2 py-0.5 rounded">{v.variable}</code> - {v.description}
                  </div>
                ))}
              </div>

              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 rounded-lg p-4">
                <h4 className="font-semibold text-purple-900 dark:text-purple-300 mb-2">Variables del Pedido</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedVariables.map((v) => (
                    <code key={v} className="bg-white px-2 py-1 rounded text-xs">
                      {v}
                    </code>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Contenido *</label>
                <textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} rows={12} className={`w-full px-4 py-3 border rounded-lg font-mono text-sm dark:bg-slate-900 ${errors.content ? "border-red-500" : "border-slate-300"}`} disabled={saving} />
                {errors.content && <p className="mt-1 text-sm text-red-500">{errors.content}</p>}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingTemplate(null);
                  }}
                  className="px-6 py-2 border border-slate-300 rounded-lg"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button type="submit" className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2" disabled={saving}>
                  {saving ? (
                    "Guardando..."
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faSave} />
                      {editingTemplate ? "Actualizar" : "Crear"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
