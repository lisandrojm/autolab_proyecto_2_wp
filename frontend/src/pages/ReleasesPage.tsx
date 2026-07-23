import { useState, useEffect, useRef } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { Card } from "../components/ui/Card";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faEdit, faTrash, faRocket, faDownload, faPaperclip, faUpload, faEye } from "@fortawesome/free-solid-svg-icons";

import { releasesAPI, Release } from "../api/release";

import Swal from "sweetalert2";
import { Modal } from "../components/ui/Modal";
import { ReleaseViewerModal } from "../components/releases/ReleaseViewerModal";
import { ViewToggle, ViewMode } from "../components/ui/ViewToggle";

interface ReleaseFormData {
  name: string;
  version: string;
  description: string;
  isActive: boolean;
}

const EMPTY_FORM: ReleaseFormData = {
  name: "",
  version: "",
  description: "",
  isActive: true,
};

export function ReleasesPage() {
  // data
  const HELP_KEY = "releases" as const;
  const helpEntry = getHelp(HELP_KEY);
  const [showInfo, setShowInfo] = useState(false);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");

  // Vista (Tabla vs Tarjetas)
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) setViewMode("cards");
    };
    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem("releasesViewMode");
      if (saved === "table" || saved === "cards") setViewMode(saved as ViewMode);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useEffect(() => {
    if (isLarge) localStorage.setItem("releasesViewMode", viewMode);
  }, [viewMode, isLarge]);
  const effectiveViewMode: ViewMode = isLarge ? viewMode : "cards";

  // modal
  const [showModal, setShowModal] = useState(false);
  const [editingRelease, setEditingRelease] = useState<Release | null>(null);
  const [saving, setSaving] = useState(false);

  // viewer
  const [viewingRelease, setViewingRelease] = useState<Release | null>(null);

  // form
  const [formData, setFormData] = useState<ReleaseFormData>(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadReleases();
  }, []);

  const loadReleases = async () => {
    try {
      setLoading(true);
      const data = await releasesAPI.getAll();
      setReleases(data);
    } catch {
      Swal.fire("Error", "No se pudieron cargar los releases", "error");
    } finally {
      setLoading(false);
    }
  };

  // filtering
  const filteredReleases = releases.filter((r) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const match = r.name.toLowerCase().includes(term) || r.version.toLowerCase().includes(term) || (r.description || "").toLowerCase().includes(term);
      if (!match) return false;
    }

    if (filterActive === "active" && !r.isActive) return false;
    if (filterActive === "inactive" && r.isActive) return false;

    return true;
  });

  const openCreate = () => {
    setEditingRelease(null);
    setFormData(EMPTY_FORM);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (release: Release) => {
    setEditingRelease(release);
    setFormData({
      name: release.name,
      version: release.version,
      description: release.description || "",
      isActive: release.isActive,
    });
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setErrors({});
    setShowModal(true);
  };

  const handleDelete = async (release: Release) => {
    const result = await Swal.fire({
      title: "¿Eliminar release?",
      text: `Se eliminará el release "${release.name}"`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Eliminar",
    });

    if (!result.isConfirmed) return;

    try {
      await releasesAPI.delete(release._id);
      Swal.fire("Eliminado", "El release ha sido eliminado", "success");
      loadReleases();
    } catch {
      Swal.fire("Error", "No se pudo eliminar el release", "error");
    }
  };

  const handleDownload = async (release: Release) => {
    try {
      await releasesAPI.download(release);
    } catch {
      Swal.fire("Error", "No se pudo descargar el archivo", "error");
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "El nombre es requerido";
    if (!formData.version.trim()) newErrors.version = "La versión es requerida";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      const payload = new FormData();
      payload.append("name", formData.name);
      payload.append("version", formData.version);
      payload.append("description", formData.description);
      payload.append("isActive", String(formData.isActive));
      if (selectedFile) payload.append("file", selectedFile);

      if (editingRelease) {
        await releasesAPI.update(editingRelease._id, payload);
        Swal.fire("Actualizado", "El release ha sido actualizado", "success");
      } else {
        await releasesAPI.create(payload);
        Swal.fire("Creado", "El release ha sido creado", "success");
      }
      setShowModal(false);
      setEditingRelease(null);
      loadReleases();
    } catch (error: any) {
      Swal.fire("Error", error.response?.data?.error || "No se pudo guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  const getBadge = (release: Release) => {
    if (release.isActive) {
      return { text: "Activo", variant: "green" as const };
    }
    return { text: "Inactivo", variant: "destructive" as const };
  };

  return (
    <PageLayout
      title="Releases"
      itemCount={filteredReleases.length}
      subtitle="Crea y gestiona los releases con sus archivos adjuntos"
      faIcon={{ icon: faRocket }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: helpEntry.title, size: helpEntry.size, content: helpEntry.content }}
      headerActions={
        <button onClick={openCreate} className="flex items-center justify-center text-sm px-4 py-2 gap-2 rounded-md transition-colors bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700" title="Crear nuevo release">
          <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
          <span>Nuevo Release</span>
        </button>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por nombre, versión o descripción..."
              filters={[
                {
                  value: filterActive,
                  onChange: (v) => setFilterActive(v as any),
                  options: [
                    { value: "all", label: "Todos" },
                    { value: "active", label: "Activos" },
                    { value: "inactive", label: "Inactivos" },
                  ],
                },
              ]}
            />
          </div>
          {isLarge && <ViewToggle value={viewMode} onChange={setViewMode} />}
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando releases..." />
        </div>
      ) : (
        <>
          {effectiveViewMode === "cards" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
            {filteredReleases.map((release) => (
              <Card
                key={release._id}
                onClick={() => openEdit(release)}
                className="cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200"
                header={{
                  icon: faRocket,
                  title: release.name,
                  subtitle: `Versión ${release.version}`,
                  badges: [getBadge(release)],
                }}
                footer={{
                  leftContent: release.fileName ? (
                    <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px]" title={release.fileName}>
                      <FontAwesomeIcon icon={faPaperclip} className="h-3 w-3" />
                      <span className="truncate">{release.fileName}</span>
                    </span>
                  ) : null,
                  actions: [
                    ...(release.fileUrl
                      ? [
                          {
                            icon: faEye,
                            title: "Visualizar",
                            onClick: (e: any) => {
                              e.stopPropagation();
                              setViewingRelease(release);
                            },
                          },
                          {
                            icon: faDownload,
                            title: "Descargar actual",
                            onClick: (e: any) => {
                              e.stopPropagation();
                              handleDownload(release);
                            },
                          },
                        ]
                      : []),
                    {
                      icon: faEdit,
                      title: "Editar",
                      onClick: (e: any) => {
                        e.stopPropagation();
                        openEdit(release);
                      },
                    },
                    {
                      icon: faTrash,
                      title: "Eliminar",
                      onClick: (e: any) => {
                        e.stopPropagation();
                        handleDelete(release);
                      },
                    },
                  ],
                }}
              >
                {release.description && <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">{release.description}</p>}
              </Card>
            ))}

            {/* CREATE CARD */}
            <Card
              variant="create"
              onClick={openCreate}
              header={{
                icon: faRocket,
                title: "Nuevo Release",
                subtitle: "Crear nuevo release",
              }}
            />
          </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg mx-0.5 lg:mx-0">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Versión</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">Archivo</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {filteredReleases.map((release) => (
                    <tr key={release._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20 cursor-pointer" onClick={() => openEdit(release)}>
                      <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-white">{release.name}</td>
                      <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">{release.version}</td>
                      <td className="px-5 py-3 text-sm whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${release.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"}`}>{release.isActive ? "Activo" : "Inactivo"}</span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                        {release.fileName ? (
                          <span className="flex items-center gap-1 truncate max-w-[220px]" title={release.fileName}>
                            <FontAwesomeIcon icon={faPaperclip} className="h-3 w-3" />
                            <span className="truncate">{release.fileName}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {release.fileUrl && (
                            <>
                              <button onClick={() => setViewingRelease(release)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Visualizar">
                                <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
                              </button>
                              <button onClick={() => handleDownload(release)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Descargar actual">
                                <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button onClick={() => openEdit(release)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Editar">
                            <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(release)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" title="Eliminar">
                            <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredReleases.length === 0 && (
            <EmptyState
              icon={faRocket}
              title="No hay releases"
              description="No hay releases definidos."
              action={{
                label: "Nuevo Release",
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
          setEditingRelease(null);
        }}
        title={editingRelease ? "Editar Release" : "Nuevo Release"}
        size="lg"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              onClick={() => {
                setShowModal(false);
                setEditingRelease(null);
              }}
            >
              Cancelar
            </button>
            <button type="submit" form="release-form" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? "Guardando..." : editingRelease ? "Actualizar" : "Crear"}
            </button>
          </div>
        }
      >
        <form id="release-form" onSubmit={handleSubmitForm}>
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
                {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Versión *</label>
                <input type="text" value={formData.version} onChange={(e) => setFormData({ ...formData, version: e.target.value })} placeholder="Ej: 1" className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
                {errors.version && <p className="text-sm text-red-500 mt-1">{errors.version}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={4} className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
              Release activo
            </label>

            {/* Archivo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Archivo</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">
                  <FontAwesomeIcon icon={faUpload} className="h-4 w-4" />
                  Subir archivo
                </button>
                <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[260px]">{selectedFile ? selectedFile.name : editingRelease?.fileName ? `Actual: ${editingRelease.fileName}` : "Ningún archivo seleccionado"}</span>
                {editingRelease?.fileUrl && (
                  <>
                    <button type="button" onClick={() => setViewingRelease(editingRelease)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                      <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
                      Visualizar
                    </button>
                    <button type="button" onClick={() => handleDownload(editingRelease)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                      <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                      Descargar actual
                    </button>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".doc,.docx,.pdf" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
              <p className="text-xs text-gray-500 mt-1">Tamaño máximo: 25MB.{editingRelease ? " Si no seleccionás un archivo, se mantiene el actual." : ""}</p>
            </div>
          </div>
        </form>
      </Modal>

      {/* VISOR DE ARCHIVO */}
      <ReleaseViewerModal release={viewingRelease} isOpen={!!viewingRelease} onClose={() => setViewingRelease(null)} />
    </PageLayout>
  );
}
