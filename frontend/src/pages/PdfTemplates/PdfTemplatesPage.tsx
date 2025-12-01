import { useState, useEffect } from "react";
import { PageLayout } from "../../components/ui/PageLayout";
import { Card } from "../../components/ui/Card";
import { SearchAndFilters } from "../../components/ui/SearchAndFilters";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faEdit, faTrash, faFileContract, faCheckCircle, faTimesCircle } from "@fortawesome/free-solid-svg-icons";

import { pdfTemplatesAPI, PdfTemplate, PdfTemplateInput, codeOptions, variablesByCode, systemVariables } from "../../api/pdfTemplates";

import Swal from "sweetalert2";
import { getHelp, hasHelp } from "../../data/help/helpContent";
import { Modal } from "../../components/ui/Modal";

const HELP_KEY = "pdfTemplates" as const;

export function PdfTemplatesPage() {
  // data
  const [templates, setTemplates] = useState<PdfTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [isFetching, setIsFetching] = useState(false);

  // modal
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PdfTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  // form
  const [formData, setFormData] = useState<PdfTemplateInput>({
    code: "dinero",
    name: "",
    content: "",
    variablesHint: "",
    isActive: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // help modal
  const [openInfo, setOpenInfo] = useState(false);
  const showHelp = hasHelp(HELP_KEY);
  const helpEntry = showHelp ? getHelp(HELP_KEY) : { title: "Ayuda", size: "md" as const, content: <div /> };

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await pdfTemplatesAPI.getAll();
      setTemplates(data);
    } catch {
      Swal.fire("Error", "No se pudieron cargar las plantillas", "error");
    } finally {
      setLoading(false);
    }
  };

  // filtering
  const filteredTemplates = templates.filter((t) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const match = t.name.toLowerCase().includes(term) || t.content.toLowerCase().includes(term);
      if (!match) return false;
    }

    if (filterActive === "active" && !t.isActive) return false;
    if (filterActive === "inactive" && t.isActive) return false;

    return true;
  });

  const openCreate = () => {
    setEditingTemplate(null);
    setFormData({
      code: "dinero",
      name: "",
      content: "",
      variablesHint: "",
      isActive: true,
    });
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (template: PdfTemplate) => {
    setEditingTemplate(template);
    setFormData({
      code: template.code,
      name: template.name,
      content: template.content,
      variablesHint: template.variablesHint || "",
      isActive: template.isActive,
    });
    setErrors({});
    setShowModal(true);
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
    });

    if (!result.isConfirmed) return;

    try {
      await pdfTemplatesAPI.delete(template._id);
      Swal.fire("Eliminada", "La plantilla ha sido eliminada", "success");
      loadTemplates();
    } catch {
      Swal.fire("Error", "No se pudo eliminar la plantilla", "error");
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "El nombre es requerido";
    if (!formData.content.trim()) newErrors.content = "El contenido es requerido";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
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
      setShowModal(false);
      setEditingTemplate(null);
      loadTemplates();
    } catch (error: any) {
      Swal.fire("Error", error.response?.data?.error || "No se pudo guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  const getBadge = (template: PdfTemplate) => {
    if (template.isActive) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 px-2 py-1 rounded-md">
          <FontAwesomeIcon icon={faCheckCircle} className="h-3 w-3" />
          Activa
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 px-2 py-1 rounded-md">
        <FontAwesomeIcon icon={faTimesCircle} className="h-3 w-3" />
        Inactiva
      </span>
    );
  };

  if (loading) return <LoadingSpinner message="Cargando plantillas..." />;

  return (
    <PageLayout
      title="Plantillas PDF"
      subtitle="Crea y gestiona plantillas PDF para pedidos"
      faIcon={{ icon: faFileContract }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      headerActions={
        <button onClick={openCreate} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
        </button>
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por nombre o contenido..."
          filters={[
            {
              value: filterActive,
              onChange: (v) => setFilterActive(v as any),
              options: [
                { value: "all", label: "Todas" },
                { value: "active", label: "Activas" },
                { value: "inactive", label: "Inactivas" },
              ],
            },
          ]}
        />
      }
    >
      {/* GRID */}
      <div className="relative">
        {isFetching && <div className="absolute -top-6 right-0 text-xs text-gray-500 dark:text-gray-400">Filtrando…</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
          {filteredTemplates.map((template) => (
            <Card
              key={template._id}
              onClick={() => openEdit(template)}
              className="cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200"
              header={{
                icon: faFileContract,
                title: template.name,
                subtitle: codeOptions.find((c) => c.value === template.code)?.label || template.code,
                badges: [getBadge(template)],
              }}
              footer={{
                leftContent: null,
                actions: [
                  {
                    icon: faEdit,
                    title: "Editar",
                    onClick: (e) => {
                      e.stopPropagation();
                      openEdit(template);
                    },
                  },
                  {
                    icon: faTrash,
                    title: "Eliminar",
                    onClick: (e) => {
                      e.stopPropagation();
                      handleDelete(template);
                    },
                  },
                ],
              }}
            >
              {/* YA NO HAY preview ni variables */}
            </Card>
          ))}

          {/* CREATE CARD */}
          <Card
            variant="create"
            onClick={openCreate}
            header={{
              icon: faFileContract,
              title: "Nueva Plantilla",
              subtitle: "Crear nueva plantilla PDF",
            }}
          />
        </div>
      </div>

      {filteredTemplates.length === 0 && !isFetching && (
        <EmptyState
          icon={faFileContract}
          title="No hay plantillas"
          description="Crea una plantilla PDF para comenzar."
          action={{
            label: "Nueva Plantilla",
            onClick: openCreate,
            icon: faPlus,
          }}
        />
      )}

      {/* MODAL */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingTemplate(null);
        }}
        title={editingTemplate ? "Editar Plantilla" : "Nueva Plantilla"}
        size="xl"
        actions={[
          {
            label: editingTemplate ? "Actualizar" : "Crear",
            variant: "primary",
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#template-form");
              form?.requestSubmit();
            },
          },
          {
            label: "Cancelar",
            variant: "ghost",
            onClick: () => {
              setShowModal(false);
              setEditingTemplate(null);
            },
          },
        ]}
      >
        <form id="template-form" onSubmit={handleSubmitForm}>
          <div className="space-y-6">
            {/* form fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field" />
                {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Código *</label>
                <select
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      code: e.target.value as any,
                    })
                  }
                  className="input-field"
                >
                  {codeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    isActive: e.target.checked,
                  })
                }
              />
              Plantilla activa
            </label>

            {/* variables del sistema */}
            <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <h4 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Variables del sistema</h4>

              {systemVariables.map((v) => (
                <div key={v.variable} className="text-sm text-slate-600 dark:text-slate-300">
                  <code className="bg-white dark:bg-slate-900 px-2 py-0.5 rounded">{v.variable}</code> - {v.description}
                </div>
              ))}
            </div>

            {/* variables del pedido */}
            <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <h4 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Variables del pedido</h4>

              <div className="flex flex-wrap gap-1">
                {(variablesByCode[formData.code] || []).map((v) => (
                  <code key={v} className="bg-white dark:bg-slate-800 px-2 py-1 rounded text-xs">
                    {v}
                  </code>
                ))}
              </div>
            </div>

            {/* contenido */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contenido *</label>
              <textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} rows={12} className="w-full px-4 py-3 border rounded-lg font-mono text-sm dark:bg-slate-900" />
              {errors.content && <p className="text-sm text-red-500 mt-1">{errors.content}</p>}
            </div>
          </div>
        </form>
      </Modal>
    </PageLayout>
  );
}
