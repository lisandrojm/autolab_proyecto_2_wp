import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faBuilding, faSignature, faImage, faSave, faEdit, faTrash, faSpinner, faTimes, faCog } from "@fortawesome/free-solid-svg-icons";
import Swal from "sweetalert2";

import { projectPdfConfigAPI, ProjectPdfConfig } from "../api/projectPdfConfig";
import { projectsAPI, Project } from "../api/projects";
import { clientAssetsAPI } from "../api/clientAssets";
import { useAuthStore } from "../stores/authStore";

export function PdfProjectConfigTab() {
  const [configs, setConfigs] = useState<ProjectPdfConfig[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal states
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ProjectPdfConfig | null>(null);

  const { register, handleSubmit, reset } = useForm<{
    name: string;
    razonSocial: string;
    cuit: string;
    ciudad: string;
    direccion: string;
    signerName: string;
    signerRole: string;
  }>();

  // local selected projects in form
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  // Preview states
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [fetchedConfigs, fetchedProjects] = await Promise.all([projectPdfConfigAPI.getAll(), projectsAPI.listAll()]);
      setConfigs(fetchedConfigs);
      setProjects(fetchedProjects);
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "No se pudieron cargar los datos", "error");
    } finally {
      setLoading(false);
    }
  };

  const currentClientId = useAuthStore.getState().user?.clientId || useAuthStore.getState().tenantId || "system";

  const onSubmit = async (data: any) => {
    if (selectedProjects.length === 0) {
      Swal.fire("Atención", "Debe asignar esta plantilla a al menos un proyecto.", "warning");
      return;
    }

    try {
      setSaving(true);
      const payload: Partial<ProjectPdfConfig> = {
        name: data.name,
        razonSocial: data.razonSocial,
        cuit: data.cuit,
        ciudad: data.ciudad,
        direccion: data.direccion,
        signerName: data.signerName,
        signerRole: data.signerRole,
        projects: selectedProjects,
      };

      if (logoFile) {
        try {
          const uploadRes = await clientAssetsAPI.upload("brandkit", logoFile, currentClientId);
          payload.logoUrl = uploadRes.path;
        } catch (error) {
          console.error("Error uploading logo:", error);
          Swal.fire("Error", "Error al subir el logo", "error");
          setSaving(false);
          return;
        }
      }

      if (signatureFile) {
        try {
          const uploadRes = await clientAssetsAPI.upload("brandkit", signatureFile, currentClientId);
          payload.signatureUrl = uploadRes.path;
        } catch (error) {
          console.error("Error uploading signature:", error);
          Swal.fire("Error", "Error al subir la firma", "error");
          setSaving(false);
          return;
        }
      }

      if (editingConfig) {
        await projectPdfConfigAPI.update(editingConfig._id, payload);
        Swal.fire("Guardado", "Configuración actualizada correctamente", "success");
      } else {
        await projectPdfConfigAPI.create(payload);
        Swal.fire("Guardado", "Configuración creada correctamente", "success");
      }

      setShowConfigModal(false);
      loadData();
    } catch (error: any) {
      console.error(error);
      Swal.fire("Error", "No se pudo guardar la configuración", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (configId: string) => {
    const res = await Swal.fire({
      title: "¿Eliminar configuración?",
      text: "Se eliminará esta plantilla de proyectos y los proyectos asignados volverán a usar la configuración global.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Eliminar",
    });

    if (!res.isConfirmed) return;

    try {
      await projectPdfConfigAPI.delete(configId);
      Swal.fire("Eliminado", "La configuración ha sido eliminada", "success");
      loadData();
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "No se pudo eliminar", "error");
    }
  };

  const getImageUrl = (url: string) => {
    if (!url) return "";
    if (url.startsWith("blob:") || url.startsWith("http")) return url;
    return `${import.meta.env.VITE_API_URL}${url}`;
  };

  const openModal = (config?: ProjectPdfConfig) => {
    if (config) {
      setEditingConfig(config);
      reset({
        name: config.name || "",
        razonSocial: config.razonSocial || "",
        cuit: config.cuit || "",
        ciudad: config.ciudad || "",
        direccion: config.direccion || "",
        signerName: config.signerName || "",
        signerRole: config.signerRole || "",
      });
      setSelectedProjects(config.projects || []);
      setLogoPreview(config.logoUrl || null);
      setSignaturePreview(config.signatureUrl || null);
    } else {
      setEditingConfig(null);
      reset({
        name: "",
        razonSocial: "",
        cuit: "",
        ciudad: "",
        direccion: "",
        signerName: "",
        signerRole: "",
      });
      setSelectedProjects([]);
      setLogoPreview(null);
      setSignaturePreview(null);
    }
    setLogoFile(null);
    setSignatureFile(null);
    setShowConfigModal(true);
  };

  if (loading) return <LoadingSpinner message="Cargando configuraciones..." />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FontAwesomeIcon icon={faCog} className="text-blue-500" />
            Configuraciones por Proyecto
          </h3>
          <p className="text-gray-500 text-sm mt-1">Crea plantillas con membretes, logos y firmas personalizadas para asignar a proyectos específicos.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {configs.map((config) => (
          <Card
            key={config._id}
            onClick={() => openModal(config)}
            className="cursor-pointer hover:shadow-md transition-shadow"
            header={{
              icon: faBuilding,
              title: config.name || "Sin Nombre",
              subtitle: `${config.projects?.length || 0} proyectos asignados`,
            }}
            footer={{
              leftContent: null,
              actions: [
                {
                  icon: faEdit,
                  title: "Editar",
                  onClick: (e) => {
                    e.stopPropagation();
                    openModal(config);
                  },
                },
                {
                  icon: faTrash,
                  title: "Eliminar",
                  onClick: (e) => {
                    e.stopPropagation();
                    handleDelete(config._id);
                  },
                },
              ],
            }}
          >
            <div className="text-sm text-gray-600 dark:text-gray-300">
              <p>
                <strong>Razón Social:</strong> {config.razonSocial || "-"}
              </p>
              <p>
                <strong>CUIT:</strong> {config.cuit || "-"}
              </p>
              <p>
                <strong>Firma:</strong> {config.signerName || "-"}
              </p>
            </div>
          </Card>
        ))}

        <Card
          variant="create"
          onClick={() => openModal()}
          header={{
            icon: faPlus,
            title: "Nueva Configuración",
            subtitle: "Crear plantilla de membrete por proyecto",
          }}
        />
      </div>

      {configs.length === 0 && (
        <EmptyState
          icon={faCog}
          title="No hay configuraciones por proyecto"
          description="Aún no has creado ninguna plantilla de membrete."
          action={{
            label: "Crear primera plantilla",
            onClick: () => openModal(),
            icon: faPlus,
          }}
        />
      )}

      {/* MODAL */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title={editingConfig ? "Editar Configuración" : "Nueva Configuración"}
        size="2xl"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button type="button" onClick={() => setShowConfigModal(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 bg-gray-100 border border-transparent rounded-md hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">
              Cerrar
            </button>
            <button type="submit" form="project-pdf-config-form" disabled={saving} className="px-5 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 flex items-center justify-center min-w-[120px]">
              {saving ? <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> : <FontAwesomeIcon icon={faSave} className="mr-2" />}
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        }
      >
        <form id="project-pdf-config-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre de la Plantilla *</label>
            <input {...register("name", { required: true })} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ej. Membrete Frame" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Razón Social</label>
              <input {...register("razonSocial")} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CUIT</label>
              <input {...register("cuit")} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ciudad Sede</label>
              <input {...register("ciudad")} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dirección</label>
              <input {...register("direccion")} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Archivos logo / firma */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                <FontAwesomeIcon icon={faImage} /> Logo de la Empresa
              </label>
              <div className="h-48 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex flex-col justify-between items-center relative">
                {logoPreview ? (
                  <>
                    <img src={getImageUrl(logoPreview)} alt="Logo Preview" className="h-28 mx-auto object-contain" />
                    <button
                      type="button"
                      onClick={() => {
                        setLogoPreview(null);
                        setLogoFile(null);
                      }}
                      className="absolute top-2 right-2 flex items-center justify-center bg-red-500 text-white rounded-full w-6 h-6 hover:bg-red-600"
                    >
                      <FontAwesomeIcon icon={faTimes} size="sm" />
                    </button>
                  </>
                ) : (
                  <div className="text-gray-400 mb-3 flex-1 flex flex-col justify-center items-center">
                    <FontAwesomeIcon icon={faImage} size="2x" />
                    <p className="text-xs mt-1">Sin logo cargado</p>
                  </div>
                )}
                <div className="w-full">
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setLogoFile(e.target.files[0]);
                        setLogoPreview(URL.createObjectURL(e.target.files[0]));
                      }
                    }}
                    className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                <FontAwesomeIcon icon={faSignature} /> Firma
              </label>
              <div className="h-48 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex flex-col justify-between items-center relative">
                {signaturePreview ? (
                  <>
                    <img src={getImageUrl(signaturePreview)} alt="Signature Preview" className="h-28 mx-auto object-contain" />
                    <button
                      type="button"
                      onClick={() => {
                        setSignaturePreview(null);
                        setSignatureFile(null);
                      }}
                      className="absolute top-2 right-2 flex items-center justify-center bg-red-500 text-white rounded-full w-6 h-6 hover:bg-red-600"
                    >
                      <FontAwesomeIcon icon={faTimes} size="sm" />
                    </button>
                  </>
                ) : (
                  <div className="text-gray-400 mb-3 flex-1 flex flex-col justify-center items-center">
                    <FontAwesomeIcon icon={faSignature} size="2x" />
                    <p className="text-xs mt-1">Sin firma cargada</p>
                  </div>
                )}
                <div className="w-full">
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSignatureFile(e.target.files[0]);
                        setSignaturePreview(URL.createObjectURL(e.target.files[0]));
                      }
                    }}
                    className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Aclaración de Firma (Nombre)</label>
              <input {...register("signerName")} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cargo / Puesto</label>
              <input {...register("signerRole")} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
          </div>

          <hr className="border-gray-200 dark:border-gray-700 mt-6" />

          {/* Asignación a proyectos con switches */}
          <div>
            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Asignar a Proyectos *</h4>
            <div className="max-h-64 overflow-y-auto space-y-2 border border-gray-200 dark:border-gray-700 rounded-md p-2">
              {projects.length === 0 ? (
                <p className="text-sm text-gray-500 p-2">No hay proyectos disponibles</p>
              ) : (
                projects.map((proj) => {
                  const isAssignedToThis = selectedProjects.includes(proj._id);
                  const isAssignedToOther = configs.some((c) => c._id !== editingConfig?._id && (c.projects || []).includes(proj._id));

                  return (
                    <div key={proj._id} className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-md transition-colors">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{proj.name}</span>
                        {isAssignedToOther && <span className="text-xs text-red-500">Ya está asignado a otra plantilla</span>}
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={isAssignedToThis}
                          disabled={isAssignedToOther}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProjects((prev) => [...prev, proj._id]);
                            } else {
                              setSelectedProjects((prev) => prev.filter((id) => id !== proj._id));
                            }
                          }}
                        />
                        <div className={"w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600 " + (isAssignedToOther ? "opacity-50 cursor-not-allowed" : "")}></div>
                      </label>
                    </div>
                  );
                })
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">Los proyectos solo pueden estar asignados a UNA plantilla específica. Si ya están en otra, no podrás marcarlos aquí.</p>
          </div>
        </form>
      </Modal>
    </div>
  );
}
