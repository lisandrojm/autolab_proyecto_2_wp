import { useState, useEffect } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { Card } from "../components/ui/Card";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faEdit, faTrash, faFileContract, faCheckCircle, faTimesCircle, faEye, faList } from "@fortawesome/free-solid-svg-icons";

import { pdfsAPI, Pdf, PdfInput, codeOptions, variablesByCode, systemVariables } from "../api/pdf";
import { pdfPreviewAPI } from "../api/pdfPreview";

import Swal from "sweetalert2";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { Modal } from "../components/ui/Modal";
import { RichTextEditor } from "../components/ui/RichTextEditor";
import { PdfGlobalConfigTab } from "./PdfGlobalConfigTab";
import { PdfProjectConfigTab } from "./PdfProjectConfigTab";
import { PdfAssignmentStatus } from "./PdfAssignmentStatus";

const HELP_KEY = "pdfTemplates" as const;

/** El editor devuelve "<p></p>" cuando está vacío: chequeamos que haya texto real. */
const hasContent = (html: string): boolean => !!html && html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;

const looksLikeHtml = (s: string): boolean => /<\/?(p|div|h[1-6]|ul|ol|li|table|tr|td|strong|em|u|br)\b/i.test(s || "");

/**
 * Las plantillas creadas antes del editor con formato son texto plano con saltos de línea.
 * Al abrirlas hay que convertirlas a HTML para no perder esos saltos dentro del editor.
 */
const toEditorHtml = (content: string): string => {
  const text = content || "";
  if (!text.trim() || looksLikeHtml(text)) return text;
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escape(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
};

export function PdfTemplatesPage() {
  // data
  const [templates, setTemplates] = useState<Pdf[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [isFetching, setIsFetching] = useState(false);

  // modal
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Pdf | null>(null);
  const [saving, setSaving] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  // form
  const [formData, setFormData] = useState<PdfInput>({
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

  // tabs
  const [activeTab, setActiveTab] = useState<"global" | "projectConfig" | "templates">("global");

  const handlePreview = async () => {
    try {
      Swal.fire({
        title: "Generando previsualización...",
        text: "Por favor espere",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const blob = await pdfPreviewAPI.preview(formData.content, formData.code, formData.title);
      Swal.close();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "No se pudo generar la previsualización", "error");
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await pdfsAPI.getAll();
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

    // Primer código libre. Nunca dejar "" : el <select> mostraría la primera opción sin que el
    // estado coincida, y las variables del pedido quedarían vacías hasta cambiar el select.
    const used = new Set(templates.map((t) => t.code));
    const firstAvailable = codeOptions.find((opt) => !used.has(opt.value))?.value ?? codeOptions[0].value;

    setFormData({
      code: firstAvailable as any,
      name: "",
      content: "",
      variablesHint: "",
      isActive: true,
    });

    setErrors({});
    setShowModal(true);
  };

  const openEdit = (template: Pdf) => {
    setEditingTemplate(template);
    setFormData({
      code: template.code,
      name: template.name,
      title: template.title || "",
      content: toEditorHtml(template.content),
      variablesHint: template.variablesHint || "",
      isActive: template.isActive,
    });
    setErrors({});
    setShowModal(true);
  };

  const handleDelete = async (template: Pdf) => {
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
      await pdfsAPI.delete(template._id);
      Swal.fire("Eliminada", "La plantilla ha sido eliminada", "success");
      loadTemplates();
    } catch {
      Swal.fire("Error", "No se pudo eliminar la plantilla", "error");
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "El nombre es requerido";
    if (!hasContent(formData.content)) newErrors.content = "El contenido es requerido";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      if (editingTemplate) {
        await pdfsAPI.update(editingTemplate._id, formData);
        Swal.fire("Actualizada", "La plantilla ha sido actualizada", "success");
      } else {
        await pdfsAPI.create(formData);
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

  const getBadge = (template: Pdf) => {
    if (template.isActive) {
      return {
        text: "Activa",
        color: "emerald",
        icon: faCheckCircle,
      };
    }
    return {
      text: "Inactiva",
      color: "slate",
      icon: faTimesCircle,
    };
  };

  const usedCodes = templates.map((t) => t.code);
  const availableCodes = codeOptions.filter((c) => !usedCodes.includes(c.value));
  const isAddDisabled = availableCodes.length === 0;

  // Códigos ofrecidos en el modal: los libres, más el de la plantilla que se está editando.
  // Evita elegir uno ya usado (el backend lo rechaza por el índice único tenant+code).
  // Siempre se incluye `formData.code` para que el valor del <select> exista como opción: si no,
  // el navegador muestra la primera opción mientras el estado dice otra cosa y las variables
  // del pedido aparecen vacías.
  const modalCodeOptions = codeOptions.filter((c) => !usedCodes.includes(c.value) || c.value === formData.code || c.value === editingTemplate?.code);

  return (
    <PageLayout
      title="Plantillas PDF"
      itemCount={activeTab === "templates" ? filteredTemplates.length : undefined}
      subtitle="Crea y gestiona plantillas PDF para pedidos y vacaciones"
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
        activeTab !== "global" ? (
          <div className="flex gap-2">
            <button onClick={isAddDisabled ? undefined : openCreate} disabled={isAddDisabled} className={`flex items-center justify-center text-sm px-4 py-2 gap-2 rounded-md transition-colors ${isAddDisabled ? "bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500" : "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"}`} title={isAddDisabled ? "Todos los códigos ya tienen asignada una plantilla" : "Crear nueva plantilla"}>
              <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
              <span>Nueva Plantilla</span>
            </button>
            {activeTab === "templates" && (
              <button onClick={() => setShowStatusModal(true)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors" title="Ver estado de asignación">
                <FontAwesomeIcon icon={faList} className="h-4 w-4" />
                <span>Estado</span>
              </button>
            )}
          </div>
        ) : null
      }
      searchAndFilters={
        <div className="flex flex-col gap-4">
          {/* TABS */}
          <div className="flex space-x-4 border-b border-gray-200 dark:border-gray-700">
            <button onClick={() => setActiveTab("global")} className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "global" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
              Configuración Global
            </button>
            <button onClick={() => setActiveTab("projectConfig")} className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "projectConfig" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
              Configuración por proyecto
            </button>
            <button onClick={() => setActiveTab("templates")} className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "templates" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
              Plantillas
            </button>
          </div>

          {activeTab === "templates" && (
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
          )}
        </div>
      }
    >
      {/* Loading state */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando plantillas..." />
        </div>
      ) : activeTab === "global" ? (
        <PdfGlobalConfigTab />
      ) : activeTab === "projectConfig" ? (
        <PdfProjectConfigTab />
      ) : (
        <>
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
                  subtitle: "Crear nueva plantilla",
                }}
              />
            </div>
          </div>
          {filteredTemplates.length === 0 && !isFetching && (
            <EmptyState
              icon={faFileContract}
              title="No hay plantillas"
              description="No hay plantillas definidas."
              action={{
                label: "Nueva Plantilla",
                onClick: openCreate,
                icon: faPlus,
              }}
            />
          )}
        </>
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
        footer={
          <div className="flex justify-between w-full">
            <button type="button" className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700" onClick={handlePreview}>
              <FontAwesomeIcon icon={faEye} className="mr-2" />
              Previsualizar
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                onClick={() => {
                  setShowModal(false);
                  setEditingTemplate(null);
                }}
              >
                Cancelar
              </button>
              <button type="submit" form="template-form" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? "Guardando..." : editingTemplate ? "Actualizar" : "Crear"}
              </button>
            </div>
          </div>
        }
      >
        <form id="template-form" onSubmit={handleSubmitForm}>
          <div className="space-y-6">
            {/* form fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
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
                  className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                >
                  {modalCodeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título del Documento</label>
              <input type="text" value={formData.title || ""} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Ej: AUTORIZACIÓN GENERAL DE SOLICITUDES DE RECURSOS HUMANOS" className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
              <p className="text-xs text-gray-500 mt-1">Este título aparecerá centrado en el PDF, debajo del encabezado.</p>
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
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              Plantilla activa
            </label>

            {/* contenido */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contenido *</label>
              <RichTextEditor
                value={formData.content}
                onChange={(html) => setFormData({ ...formData, content: html })}
                variables={[
                  { grupo: formData.code === "vacaciones" ? "Variables de vacaciones" : "Variables del pedido", vars: variablesByCode[formData.code] || [] },
                  { grupo: "Variables de la empresa", vars: systemVariables.map((s) => s.variable) },
                ]}
                variablesTitle="Variables disponibles (click para insertar)"
              />
              {errors.content && <p className="text-sm text-red-500 mt-1">{errors.content}</p>}
            </div>
          </div>
        </form>
      </Modal>
      {/* Status Modal */}
      <Modal isOpen={showStatusModal} onClose={() => setShowStatusModal(false)} title="Estado de Asignación de Plantillas" size="xl">
        <PdfAssignmentStatus templates={templates} />
      </Modal>
    </PageLayout>
  );
}
