import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useClientContextStore } from "../stores/clientContextStore";
import { clientsAPI, Client } from "../api/clients";
import { clientAssetsAPI } from "../api/clientAssets";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPalette, faEdit, faExternalLink, faTrash, faPlus, faImage, faFont, faFileAlt, faDownload } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { getImageUrl, getImageFullUrl } from "../utils/imageHelpers";
import { FontPicker } from "../components/brandkit/FontPicker";
import { getFileIcon, formatFileSize, getFileExtension, isProhibitedFileType, validateFileSize } from "../utils/fileHelpers";

const HELP_KEY = "clientContextBrandKit" as const;

interface LogoItem {
  _id: string;
  url: string;
  name?: string;
  fileName?: string;
  uploadedAt?: string | Date;
  size?: number;
}

interface DocumentItem {
  _id: string;
  url: string;
  name?: string;
  fileName?: string;
  fileType?: string;
  uploadedAt?: string | Date;
  size?: number;
}

export const ClientContextBrandKitPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedClient, setSelectedClient } = useClientContextStore();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [openEdit, setOpenEdit] = useState<boolean>(false);

  const [formData, setFormData] = useState({
    logos: [] as LogoItem[],
    documents: [] as DocumentItem[],
    colors: ["111827"] as string[],
    fonts: [] as string[],
    guidelines: "",
  });

  const [newLogoFile, setNewLogoFile] = useState<File | null>(null);
  const [newLogoPreview, setNewLogoPreview] = useState<string | null>(null);
  const [newLogoName, setNewLogoName] = useState<string>("");
  const [newDocumentFile, setNewDocumentFile] = useState<File | null>(null);
  const [newDocumentName, setNewDocumentName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dragActiveDoc, setDragActiveDoc] = useState(false);
  const [openInfo, setOpenInfo] = useState<boolean>(false);

  const helpEntry = getHelp(HELP_KEY);

  useEffect(() => {
    if (!id) return;

    if (selectedClient && selectedClient._id === id) {
      setClient(selectedClient as unknown as Client);
      hydrateForm(selectedClient as unknown as Client);
      setLoading(false);
      return;
    }

    fetchClient();
  }, [id, selectedClient?._id]);

  const fetchClient = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const data = await clientsAPI.get(id);
      setClient(data);

      if (!selectedClient || selectedClient._id !== data._id) {
        setSelectedClient(data as unknown as Client);
      }

      hydrateForm(data);
    } catch (error) {
      console.error("Error fetching client:", error);
      sweetAlert.error("Error", "No se pudo cargar el cliente");
    } finally {
      setLoading(false);
    }
  };

  const hydrateForm = (data: Client) => {
    const colors = data.brandKit?.colors?.length ? data.brandKit.colors.map((c) => c.replace(/^#+/, "")) : ["111827"];
    const fonts = data.brandKit?.fonts || [];
    const logos = data.brandKit?.logos || [];
    const documents = data.brandKit?.documents || [];

    setFormData({
      logos: logos as LogoItem[],
      documents: documents as DocumentItem[],
      colors,
      fonts,
      guidelines: data.brandKit?.guidelines || "",
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!client) return;

    try {
      setUploading(true);
      const fonts = formData.fonts || [];

      let finalLogos = [...formData.logos];

      // Si hay un logo pendiente de subir, subirlo primero
      if (newLogoFile) {
        try {
          // Verificar límite de logos
          if (finalLogos.length >= 10) {
            sweetAlert.error("Límite alcanzado", "Has alcanzado el límite máximo de 10 logos");
            return;
          }

          const uploadResponse = await clientAssetsAPI.upload("brandkit", newLogoFile, client._id);

          const logoData = {
            url: uploadResponse.url,
            name: newLogoName.trim() || undefined,
            fileName: newLogoFile.name,
            size: newLogoFile.size,
          };

          const newLogo = await clientsAPI.addLogo(client._id, logoData);

          finalLogos = [...finalLogos, { ...newLogo, _id: newLogo._id || String(Date.now()) }];

          // Limpiar el estado temporal del logo
          setNewLogoFile(null);
          setNewLogoPreview(null);
          setNewLogoName("");
        } catch (logoError: any) {
          console.error("Error uploading pending logo:", logoError);
          const logoMessage = logoError?.response?.data?.error || logoError?.message || "No se pudo subir el logo";
          sweetAlert.error("Error al subir logo", logoMessage);
          return;
        }
      }

      const sanitizedLogos = finalLogos.map((logo) => ({
        url: logo.url,
        name: logo.name,
        fileName: logo.fileName,
        size: logo.size,
      }));

      const sanitizedDocuments = formData.documents.map((doc) => ({
        url: doc.url,
        name: doc.name,
        fileName: doc.fileName,
        fileType: doc.fileType,
        size: doc.size,
      }));

      const payload: Partial<Client> = {
        brandKit: {
          logo: client.brandKit?.logo,
          logos: sanitizedLogos,
          documents: sanitizedDocuments,
          colors: (formData.colors || [])
            .map((c) => {
              const cleaned = c.replace(/^#+/, "").trim();
              return cleaned ? `#${cleaned}` : "";
            })
            .filter(Boolean),
          fonts,
          guidelines: formData.guidelines?.trim() || undefined,
        },
      };

      await clientsAPI.update(client._id, payload);
      const refreshed = await clientsAPI.get(client._id);
      setClient(refreshed);
      setSelectedClient(refreshed as unknown as Client);
      hydrateForm(refreshed);
      setOpenEdit(false);
      sweetAlert.success("Brand Kit actualizado", "Los cambios se han guardado correctamente");
    } catch (error: any) {
      console.error("Error updating brandKit:", error);
      const message = error?.response?.data?.error || error?.message || "No se pudo actualizar el brand kit";
      sweetAlert.error("Error", message);
    } finally {
      setUploading(false);
    }
  };

  const handleAddLogo = async () => {
    if (!newLogoFile || !client) return;

    try {
      setUploading(true);

      const uploadResponse = await clientAssetsAPI.upload("brandkit", newLogoFile, client._id);

      const logoData = {
        url: uploadResponse.url,
        name: newLogoName.trim() || undefined,
        fileName: newLogoFile.name,
        size: newLogoFile.size,
      };

      const newLogo = await clientsAPI.addLogo(client._id, logoData);

      setFormData((prev) => ({
        ...prev,
        logos: [...prev.logos, { ...newLogo, _id: newLogo._id || String(Date.now()) }],
      }));

      setNewLogoFile(null);
      setNewLogoPreview(null);
      setNewLogoName("");

      const refreshed = await clientsAPI.get(client._id);
      setClient(refreshed);
      setSelectedClient(refreshed as unknown as Client);
      hydrateForm(refreshed);

      sweetAlert.success("Logo agregado", "El logo se ha agregado correctamente");
    } catch (error: any) {
      console.error("Error adding logo:", error);
      const message = error?.response?.data?.error || error?.message || "No se pudo agregar el logo";
      sweetAlert.error("Error", message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteLogo = async (logoId: string) => {
    if (!client) return;

    const result = await sweetAlert.confirm("¿Eliminar logo?", "Esta acción no se puede deshacer", "Eliminar");

    if (!result.isConfirmed) return;

    try {
      setUploading(true);
      await clientsAPI.deleteLogo(client._id, logoId);

      setFormData((prev) => ({
        ...prev,
        logos: prev.logos.filter((l) => l._id !== logoId),
      }));

      const refreshed = await clientsAPI.get(client._id);
      setClient(refreshed);
      setSelectedClient(refreshed as unknown as Client);
      hydrateForm(refreshed);

      sweetAlert.success("Logo eliminado", "El logo se ha eliminado correctamente");
    } catch (error: any) {
      console.error("Error deleting logo:", error);
      const message = error?.response?.data?.error || error?.message || "No se pudo eliminar el logo";
      sweetAlert.error("Error", message);
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateLogoName = async (logoId: string, newName: string) => {
    if (!client) return;

    try {
      await clientsAPI.updateLogoName(client._id, logoId, newName);

      setFormData((prev) => ({
        ...prev,
        logos: prev.logos.map((l) => (l._id === logoId ? { ...l, name: newName } : l)),
      }));

      const refreshed = await clientsAPI.get(client._id);
      setClient(refreshed);
      setSelectedClient(refreshed as unknown as Client);
    } catch (error: any) {
      console.error("Error updating logo name:", error);
      const message = error?.response?.data?.error || error?.message || "No se pudo actualizar el nombre";
      sweetAlert.error("Error", message);
    }
  };

  const handleAddDocument = async () => {
    if (!newDocumentFile || !client) return;

    if (isProhibitedFileType(newDocumentFile.name)) {
      sweetAlert.error("Error", "Tipo de archivo no permitido por razones de seguridad");
      return;
    }

    const sizeValidation = validateFileSize(newDocumentFile, 40);
    if (!sizeValidation.valid) {
      sweetAlert.error("Error", sizeValidation.error || "Archivo demasiado grande");
      return;
    }

    try {
      setUploading(true);

      const uploadResponse = await clientAssetsAPI.uploadDocument(newDocumentFile, client._id);

      const documentData = {
        url: uploadResponse.url,
        name: newDocumentName.trim() || undefined,
        fileName: newDocumentFile.name,
        fileType: uploadResponse.fileType || getFileExtension(newDocumentFile.name),
        size: newDocumentFile.size,
      };

      const newDocument = await clientsAPI.addDocument(client._id, documentData);

      setFormData((prev) => ({
        ...prev,
        documents: [...prev.documents, { ...newDocument, _id: newDocument._id || String(Date.now()) }],
      }));

      setNewDocumentFile(null);
      setNewDocumentName("");

      const refreshed = await clientsAPI.get(client._id);
      setClient(refreshed);
      setSelectedClient(refreshed as unknown as Client);
      hydrateForm(refreshed);

      sweetAlert.success("Documento agregado", "El documento se ha agregado correctamente");
    } catch (error: any) {
      console.error("Error adding document:", error);
      const message = error?.response?.data?.error || error?.message || "No se pudo agregar el documento";
      sweetAlert.error("Error", message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!client) return;

    const result = await sweetAlert.confirm("¿Eliminar documento?", "Esta acción no se puede deshacer", "Eliminar");

    if (!result.isConfirmed) return;

    try {
      setUploading(true);
      await clientsAPI.deleteDocument(client._id, docId);

      setFormData((prev) => ({
        ...prev,
        documents: prev.documents.filter((d) => d._id !== docId),
      }));

      const refreshed = await clientsAPI.get(client._id);
      setClient(refreshed);
      setSelectedClient(refreshed as unknown as Client);
      hydrateForm(refreshed);

      sweetAlert.success("Documento eliminado", "El documento se ha eliminado correctamente");
    } catch (error: any) {
      console.error("Error deleting document:", error);
      const message = error?.response?.data?.error || error?.message || "No se pudo eliminar el documento";
      sweetAlert.error("Error", message);
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateDocumentName = async (docId: string, newName: string) => {
    if (!client) return;

    try {
      await clientsAPI.updateDocumentName(client._id, docId, newName);

      setFormData((prev) => ({
        ...prev,
        documents: prev.documents.map((d) => (d._id === docId ? { ...d, name: newName } : d)),
      }));

      const refreshed = await clientsAPI.get(client._id);
      setClient(refreshed);
      setSelectedClient(refreshed as unknown as Client);
    } catch (error: any) {
      console.error("Error updating document name:", error);
      const message = error?.response?.data?.error || error?.message || "No se pudo actualizar el nombre";
      sweetAlert.error("Error", message);
    }
  };

  const handleDocumentFileChange = (file: File | null) => {
    if (!file) {
      setNewDocumentFile(null);
      return;
    }

    if (isProhibitedFileType(file.name)) {
      sweetAlert.error("Error", "Tipo de archivo no permitido por razones de seguridad");
      return;
    }

    const sizeValidation = validateFileSize(file, 40);
    if (!sizeValidation.valid) {
      sweetAlert.error("Error", sizeValidation.error || "El archivo no debe superar los 40MB");
      return;
    }

    setNewDocumentFile(file);
  };

  const handleDragDoc = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActiveDoc(true);
    } else if (e.type === "dragleave") {
      setDragActiveDoc(false);
    }
  };

  const handleDropDoc = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveDoc(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleDocumentFileChange(e.dataTransfer.files[0]);
    }
  };

  const hasLogos = (brandKit?: Client["brandKit"]) => !!(brandKit?.logos && brandKit.logos.length > 0);
  const hasDocuments = (brandKit?: Client["brandKit"]) => !!(brandKit?.documents && brandKit.documents.length > 0);
  const hasColors = (brandKit?: Client["brandKit"]) => !!(brandKit?.colors && brandKit.colors.length > 0);
  const hasFonts = (brandKit?: Client["brandKit"]) => !!(brandKit?.fonts && brandKit.fonts.length > 0);
  const hasGuidelines = (brandKit?: Client["brandKit"]) => !!(brandKit?.guidelines && brandKit.guidelines.trim().length > 0);

  const openEditModal = () => {
    if (client) hydrateForm(client);
    setNewLogoFile(null);
    setNewLogoPreview(null);
    setNewLogoName("");
    setNewDocumentFile(null);
    setNewDocumentName("");
    setOpenEdit(true);
  };

  const handleFileChange = (file: File | null) => {
    if (!file) {
      setNewLogoFile(null);
      setNewLogoPreview(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      sweetAlert.error("Error", "Por favor selecciona una imagen válida");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      sweetAlert.error("Error", "El archivo no debe superar los 5MB");
      return;
    }

    setNewLogoFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  if (!id) {
    return (
      <EmptyState
        icon={faPalette}
        title="Cliente no válido"
        description="Selecciona un cliente para ver su brand kit."
        action={{
          label: "Ir a Clientes",
          onClick: () => navigate("/clients"),
        }}
      />
    );
  }

  if (loading) return <LoadingSpinner message="Cargando brand kit del cliente..." />;

  if (!client) {
    return (
      <EmptyState
        icon={faPalette}
        title="Cliente no encontrado"
        description="No se pudo encontrar el cliente solicitado."
        action={{
          label: "Volver",
          onClick: () => navigate(-1),
        }}
      />
    );
  }

  const displayLogo = client.brandKit?.logos?.[0]?.url || client.brandKit?.logo;

  return (
    <PageLayout
      title="Brand Kit"
      faIcon={{ icon: faPalette }}
      subtitle={`Elementos de marca de ${client.name}`}
      clientMiniAvatar={{
        src: displayLogo ?? undefined,
        alt: client?.name ? `${client.name} logo` : undefined,
        fallback: client?.name?.charAt(0)?.toUpperCase?.() || "?",
        label: client?.name,
      }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      modal={{
        isOpen: openEdit,
        onClose: () => setOpenEdit(false),
        title: "Editar Brand Kit",
        subtitle: "Elementos del brand kit del cliente",
        size: "lg",
        actions: [
          {
            label: uploading ? (newLogoFile ? "Subiendo logo..." : "Guardando...") : "Guardar Cambios",
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#brandkit-edit-form");
              form?.requestSubmit();
            },
            variant: "primary",
            disabled: uploading,
          },
          { label: "Cancelar", onClick: () => setOpenEdit(false), variant: "ghost" },
        ],
        content: (
          <form id="brandkit-edit-form" onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Logos</label>

                {formData.logos && formData.logos.length > 0 && (
                  <div className="mb-4 space-y-3">
                    {formData.logos.map((logo) => (
                      <div key={logo._id} className="flex items-center gap-4 p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                        <img src={getImageUrl(logo.url)} alt={logo.name || "Logo"} className="w-16 h-16 object-cover rounded-lg border-2 border-gray-200 dark:border-gray-600" />
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={logo.name || ""}
                            onChange={(e) => {
                              const newName = e.target.value;
                              setFormData((prev) => ({
                                ...prev,
                                logos: prev.logos.map((l) => (l._id === logo._id ? { ...l, name: newName } : l)),
                              }));
                            }}
                            onBlur={(e) => handleUpdateLogoName(logo._id, e.target.value)}
                            className="input-field text-sm"
                            placeholder="Nombre del logo (opcional)"
                            maxLength={50}
                          />
                          {logo.fileName && <p className="text-xs text-gray-500 dark:text-gray-400">{logo.fileName}</p>}
                        </div>
                        <button type="button" onClick={() => handleDeleteLogo(logo._id)} className="px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600" disabled={uploading}>
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {formData.logos.length < 10 && (
                  <>
                    {newLogoPreview && (
                      <div className="mb-4 p-3 border border-gray-200 dark:border-gray-600 rounded-lg space-y-3">
                        <img src={newLogoPreview} alt="Preview" className="w-20 h-20 object-cover rounded-lg border-2 border-gray-200 dark:border-gray-600" />
                        <input type="text" value={newLogoName} onChange={(e) => setNewLogoName(e.target.value)} className="input-field text-sm" placeholder="Nombre del logo (opcional)" maxLength={50} />
                        <div className="flex gap-2">
                          <button type="button" onClick={handleAddLogo} className="btn-primary text-sm" disabled={uploading}>
                            {uploading ? "Subiendo..." : "Agregar Logo"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewLogoFile(null);
                              setNewLogoPreview(null);
                              setNewLogoName("");
                            }}
                            className="btn-ghost text-sm"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {!newLogoPreview && (
                      <div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragActive ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"}`}>
                        <input type="file" id="logo-upload" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml" onChange={(e) => handleFileChange(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className="space-y-2">
                          <FontAwesomeIcon icon={faPlus} className="h-8 w-8 text-gray-400 mx-auto" />
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            <label htmlFor="logo-upload" className="text-primary-600 dark:text-primary-400 hover:underline cursor-pointer">
                              Selecciona un archivo
                            </label>{" "}
                            o arrastra y suelta
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500">PNG, JPG, GIF, WebP, SVG hasta 5MB (máx 10 logos)</p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {formData.logos.length >= 10 && <p className="text-sm text-gray-500 dark:text-gray-400">Has alcanzado el límite máximo de 10 logos</p>}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Colores de marca</label>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        colors: [...(prev.colors || []), "111827"],
                      }))
                    }
                    className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    + Agregar color
                  </button>
                </div>

                <div className="space-y-2">
                  {(formData.colors || []).map((color, index) => {
                    const cleanColor = color?.replace(/^#+/, "") || "";
                    const fullColor = cleanColor ? `#${cleanColor}` : "#111827";

                    return (
                      <div key={index} className="flex items-center gap-3">
                        <input
                          type="color"
                          value={fullColor}
                          onChange={(e) => {
                            const newColor = e.target.value.replace(/^#/, "");
                            setFormData((prev) => ({
                              ...prev,
                              colors: prev.colors.map((c, i) => (i === index ? newColor : c)),
                            }));
                          }}
                          className="h-10 w-12 p-0 border border-gray-300 dark:border-gray-600 rounded"
                          aria-label={`Color ${index + 1}`}
                        />
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none select-none">#</span>
                          <input
                            type="text"
                            value={cleanColor}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9A-Fa-f]/g, "").slice(0, 6);
                              setFormData((prev) => ({
                                ...prev,
                                colors: prev.colors.map((c, i) => (i === index ? value : c)),
                              }));
                            }}
                            className="input-field pl-7"
                            placeholder="111827"
                            maxLength={6}
                          />
                        </div>
                        {formData.colors.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                colors: prev.colors.filter((_, i) => i !== index),
                              }))
                            }
                            className="px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"
                            aria-label={`Eliminar color ${index + 1}`}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <FontPicker value={formData.fonts} onChange={(fonts) => setFormData((prev) => ({ ...prev, fonts }))} label="Fuentes de marca (Google Fonts)" placeholder="Buscar fuente…" maxVisibleChips={6} />

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Documentos</label>

                {formData.documents && formData.documents.length > 0 && (
                  <div className="mb-4 space-y-3">
                    {formData.documents.map((doc) => (
                      <div key={doc._id} className="flex items-center gap-4 p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700">
                          <FontAwesomeIcon icon={getFileIcon(doc.fileType || "")} className="h-6 w-6 text-gray-600 dark:text-gray-300" />
                        </div>
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={doc.name || ""}
                            onChange={(e) => {
                              const newName = e.target.value;
                              setFormData((prev) => ({
                                ...prev,
                                documents: prev.documents.map((d) => (d._id === doc._id ? { ...d, name: newName } : d)),
                              }));
                            }}
                            onBlur={(e) => handleUpdateDocumentName(doc._id, e.target.value)}
                            className="input-field text-sm"
                            placeholder="Título del documento (opcional)"
                            maxLength={100}
                          />
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            {doc.fileName && <span>{doc.fileName}</span>}
                            {doc.size && <span>• {formatFileSize(doc.size)}</span>}
                          </div>
                        </div>
                        <a href={getImageUrl(doc.url)} download={doc.fileName} className="px-3 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600" title="Descargar documento">
                          <FontAwesomeIcon icon={faDownload} />
                        </a>
                        <button type="button" onClick={() => handleDeleteDocument(doc._id)} className="px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600" disabled={uploading}>
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {formData.documents.length < 20 && (
                  <>
                    {newDocumentFile && (
                      <div className="mb-4 p-3 border border-gray-200 dark:border-gray-600 rounded-lg space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700">
                            <FontAwesomeIcon icon={getFileIcon(getFileExtension(newDocumentFile.name))} className="h-6 w-6 text-gray-600 dark:text-gray-300" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{newDocumentFile.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(newDocumentFile.size)}</p>
                          </div>
                        </div>
                        <input type="text" value={newDocumentName} onChange={(e) => setNewDocumentName(e.target.value)} className="input-field text-sm" placeholder="Título del documento (opcional)" maxLength={100} />
                        <div className="flex gap-2">
                          <button type="button" onClick={handleAddDocument} className="btn-primary text-sm" disabled={uploading}>
                            {uploading ? "Subiendo..." : "Agregar Documento"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewDocumentFile(null);
                              setNewDocumentName("");
                            }}
                            className="btn-ghost text-sm"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {!newDocumentFile && (
                      <div onDragEnter={handleDragDoc} onDragLeave={handleDragDoc} onDragOver={handleDragDoc} onDrop={handleDropDoc} className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragActiveDoc ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"}`}>
                        <input type="file" id="document-upload" onChange={(e) => handleDocumentFileChange(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className="space-y-2">
                          <FontAwesomeIcon icon={faPlus} className="h-8 w-8 text-gray-400 mx-auto" />
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            <label htmlFor="document-upload" className="text-primary-600 dark:text-primary-400 hover:underline cursor-pointer">
                              Selecciona un archivo
                            </label>{" "}
                            o arrastra y suelta
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500">Cualquier tipo de archivo hasta 40MB (máx 20 documentos)</p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {formData.documents.length >= 20 && <p className="text-sm text-gray-500 dark:text-gray-400">Has alcanzado el límite máximo de 20 documentos</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Guías de Marca</label>
                <textarea rows={4} value={formData.guidelines} onChange={(e) => setFormData((prev) => ({ ...prev, guidelines: e.target.value }))} className="input-field resize-none" placeholder="Notas, usos del logo, tono, etc." />
              </div>
            </div>
          </form>
        ),
      }}
      onBack={() => navigate(-1)}
      headerActions={
        <button
          onClick={() => {
            openEditModal();
          }}
          className="btn-primary flex items-center justify-center text-sm p-2 gap-2"
        >
          <FontAwesomeIcon icon={faEdit} className="h-3 w-3 lg:h-4 lg:w-4" />
        </button>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Logos Card */}
          {hasLogos(client.brandKit) ? (
            <Card
              header={{
                title: "Logos",
                subtitle: `${client.brandKit!.logos!.length} logo${client.brandKit!.logos!.length > 1 ? "s" : ""} configurado${client.brandKit!.logos!.length > 1 ? "s" : ""}`,
                icon: faImage,
              }}
              onClick={openEditModal}
              className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-3">
                  {client.brandKit!.logos!.slice(0, 4).map((logo) => (
                    <div key={logo._id} className="space-y-2">
                      <img src={getImageUrl(logo.url)} alt={logo.name || "Logo"} className="w-full h-15 object-cover rounded-lg border-2 border-gray-200 dark:border-gray-600 p-2" />
                      {logo.name && <p className="text-xs text-gray-700 dark:text-gray-300 text-center truncate">{logo.name}</p>}
                    </div>
                  ))}
                </div>
                {client.brandKit!.logos!.length > 4 && (
                  <div className="text-center text-sm text-gray-500 dark:text-gray-500">
                    +{client.brandKit!.logos!.length - 4} logo{client.brandKit!.logos!.length - 4 > 1 ? "s" : ""} más
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card
              variant="create"
              onClick={openEditModal}
              header={{
                title: "Cargar Logo",
                subtitle: "Agrega el logo del cliente",
                icon: faImage,
              }}
            />
          )}

          {/* Colors Card */}
          {hasColors(client.brandKit) ? (
            <Card
              header={{
                title: "Colores de Marca",
                subtitle: `${client.brandKit!.colors!.length} colores configurados`,
                icon: faPalette,
              }}
              onClick={openEditModal}
              className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              <div className="grid grid-cols-2 gap-3">
                {client.brandKit!.colors!.slice(0, 4).map((color, index) => (
                  <div key={index} className="flex items-center space-x-2 p-2 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <div
                      className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0"
                      style={{
                        backgroundColor: color.startsWith("#") ? color : `var(--${color})`,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{color}</p>
                    </div>
                  </div>
                ))}
                {client.brandKit!.colors!.length > 4 && <div className="flex items-center justify-center p-2 text-xs text-gray-500 dark:text-gray-500 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">+{client.brandKit!.colors!.length - 4} más</div>}
              </div>
            </Card>
          ) : (
            <Card
              variant="create"
              onClick={openEditModal}
              header={{
                title: "Cargar Colores de Marca",
                subtitle: "Define la paleta de colores",
                icon: faPalette,
              }}
            />
          )}

          {/* Fonts Card */}
          {hasFonts(client.brandKit) ? (
            <Card
              header={{
                title: "Fuentes Tipográficas",
                subtitle: `${client.brandKit!.fonts!.length} fuentes configuradas`,
                icon: faFont,
              }}
              onClick={openEditModal}
              className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              <div className="space-y-2">
                {client.brandKit!.fonts!.slice(0, 3).map((font, index) => (
                  <div key={index} className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{font}</p>
                  </div>
                ))}
                {client.brandKit!.fonts!.length > 3 && <div className="text-center text-xs text-gray-500 dark:text-gray-500 py-2">+{client.brandKit!.fonts!.length - 3} fuentes más</div>}
              </div>
            </Card>
          ) : (
            <Card
              variant="create"
              onClick={openEditModal}
              header={{
                title: "Cargar Fuentes Tipográficas",
                subtitle: "Agrega las tipografías de marca",
                icon: faFont,
              }}
            />
          )}

          {/* Documents Card */}
          {hasDocuments(client.brandKit) ? (
            <Card
              header={{
                title: "Documentos",
                subtitle: `${client.brandKit!.documents!.length} documento${client.brandKit!.documents!.length > 1 ? "s" : ""} disponible${client.brandKit!.documents!.length > 1 ? "s" : ""}`,
                icon: faFileAlt,
              }}
              onClick={openEditModal}
              className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              <div className="space-y-2">
                {client.brandKit!.documents!.slice(0, 4).map((doc) => (
                  <div key={doc._id} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                    <FontAwesomeIcon icon={getFileIcon(doc.fileType || "")} className="h-5 w-5 text-gray-600 dark:text-gray-300 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{doc.name || doc.fileName}</p>
                      {doc.size && <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(doc.size)}</p>}
                    </div>
                  </div>
                ))}
                {client.brandKit!.documents!.length > 4 && (
                  <div className="text-center text-xs text-gray-500 dark:text-gray-500 py-2">
                    +{client.brandKit!.documents!.length - 4} documento{client.brandKit!.documents!.length - 4 > 1 ? "s" : ""} más
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card
              variant="create"
              onClick={openEditModal}
              header={{
                title: "Cargar Documentos",
                subtitle: "Agrega manuales de marca y documentos",
                icon: faFileAlt,
              }}
            />
          )}

          {/* Guidelines Card */}
          {hasGuidelines(client.brandKit) ? (
            <Card
              header={{
                title: "Guías de Marca",
                subtitle: "Directrices y notas de uso",
                icon: faFileAlt,
              }}
              onClick={openEditModal}
              className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <p className="text-sm text-gray-900 dark:text-white leading-relaxed line-clamp-3">{client.brandKit!.guidelines}</p>
              </div>
            </Card>
          ) : (
            <Card
              variant="create"
              onClick={openEditModal}
              header={{
                title: "Cargar Guías de Marca",
                subtitle: "Define directrices y notas de uso",
                icon: faFileAlt,
              }}
            />
          )}
        </div>
      </div>
    </PageLayout>
  );
};
