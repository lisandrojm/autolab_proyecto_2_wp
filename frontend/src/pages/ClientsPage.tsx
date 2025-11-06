import React, { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClone, faPlus, faTrash, faUserTie, faUsers } from "@fortawesome/free-solid-svg-icons";
import { clientsAPI, type Client } from "../api/clients";
import { customAlphabet } from "nanoid";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { SocialMediaInput } from "../components/forms/SocialMediaInput";

const HELP_KEY = "clients" as const;

type StatusFilter = "all" | "active" | "inactive" | "onboarding";
type ModalMode = "create" | "edit" | "clone" | null;

interface ClientFormData {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  industry?: string;
  website?: string;
  status: "active" | "inactive" | "onboarding";
  socialMedia: {
    facebook: string;
    instagram: string;
    twitter: string;
    linkedin: string;
    tiktok: string;
    youtube: string;
  };
}

const getStatusBadgeVariant = (status: Client["status"]) => (status === "active" ? "success" : status === "onboarding" ? "warning" : "blue");
const getStatusLabel = (status: Client["status"]) => (status ? status.charAt(0).toUpperCase() + status.slice(1) : "");

/** Generador corto de IDs (evita 0/O/1/I). 6 chars ≈ 2.18B combinaciones. */
const genId = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 6);

/** Email único para clonación. */
const makeCloneEmail = (srcEmail?: string) => {
  const id = genId(); // p.ej. 7XK4QD
  if (srcEmail && srcEmail.includes("@")) {
    const [local, domain] = srcEmail.split("@");
    return `${local}_copy-${id}@${domain}`;
  }
  return `client_copy-${id}@clone.local`;
};

const EMPTY_SOCIALS = {
  facebook: "",
  instagram: "",
  twitter: "",
  linkedin: "",
  tiktok: "",
  youtube: "",
};

export const ClientsPage: React.FC = () => {
  const { hasPermission } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // data
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // búsqueda + filtro
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // info modal (ⓘ)
  const [openInfo, setOpenInfo] = useState(false);
  const showHelp = hasHelp(HELP_KEY);
  const helpEntry = showHelp ? getHelp(HELP_KEY) : { title: "Ayuda", size: "md" as const, content: <div /> };

  // modal (crear/editar/clonar)
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [cloneSource, setCloneSource] = useState<Client | null>(null);

  const [formData, setFormData] = useState<ClientFormData>({
    name: "",
    email: "",
    phone: "",
    company: "",
    industry: "",
    website: "",
    status: "active",
    socialMedia: { ...EMPTY_SOCIALS },
  });

  const canManage = hasPermission("clients:manage");

  useEffect(() => {
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const resp = await clientsAPI.list({});
      setClients(resp.clients || []);
    } catch (e) {
      console.error(e);
      sweetAlert.error("Error", "No se pudieron cargar los clientes");
    } finally {
      setLoading(false);
    }
  };

  // ---------- acciones ----------
  /** Usa endpoint dedicado y optimistic update con rollback */
  const toggleFavorite = async (id: string, current: boolean) => {
    // Optimista
    setClients((prev) => prev.map((c) => (c._id === id ? { ...c, favorite: !current } : c)));

    try {
      const updated = await clientsAPI.toggleFavorite(id, !current);
      setClients((prev) => prev.map((c) => (c._id === id ? { ...c, favorite: !!updated.favorite } : c)));
      sweetAlert.success("Favoritos", !current ? "Cliente marcado como favorito" : "Cliente removido de favoritos");
    } catch (e) {
      // Rollback
      setClients((prev) => prev.map((c) => (c._id === id ? { ...c, favorite: current } : c)));
      sweetAlert.error("Error", "No se pudo actualizar favorito");
    }
  };

  const openClone = (client: Client) => {
    setCloneSource(client);
    setEditingClient(null);
    setModalMode("clone");
    setFormData({
      name: `${client.name} (copia)`,
      email: makeCloneEmail(client.email),
      phone: "",
      company: "",
      industry: "",
      website: "",
      status: client.status || "active",
      socialMedia: { ...EMPTY_SOCIALS },
    });
    setShowModal(true);
  };

  const handleCloneSubmit = async () => {
    if (!cloneSource) return;

    try {
      const payload: Partial<Client> = {
        name: formData.name,
        email: formData.email,
        phone: cloneSource.phone,
        company: cloneSource.company,
        industry: cloneSource.industry,
        website: cloneSource.website,
        socialMedia: cloneSource.socialMedia ? { ...cloneSource.socialMedia } : {},
        brandKit: cloneSource.brandKit
          ? {
              logos: [...(cloneSource.brandKit.logos || [])],
              colors: [...(cloneSource.brandKit.colors || [])],
              fonts: [...(cloneSource.brandKit.fonts || [])],
              guidelines: cloneSource.brandKit.guidelines,
            }
          : { logos: [], colors: [], fonts: [] },
        brief: cloneSource.brief
          ? {
              objectives: [...(cloneSource.brief.objectives || [])],
              targetAudience: cloneSource.brief.targetAudience,
              budget: cloneSource.brief.budget,
              timeline: cloneSource.brief.timeline,
              preferences: cloneSource.brief.preferences,
            }
          : undefined,
        status: cloneSource.status || "active",
        favorite: false,
      };

      const created = await clientsAPI.create(payload as any);
      sweetAlert.success("Cliente clonado", "Se creó una copia del cliente");
      setClients((prev) => [created, ...prev]);
      closeModal();
    } catch (e: any) {
      const msg = e?.response?.data?.error || "No se pudo clonar el cliente";
      sweetAlert.error("Error", msg);
    }
  };

  const handleDeleteClient = async (client: Client) => {
    const res = await sweetAlert.confirm("¿Eliminar cliente?", `¿Estás seguro de eliminar a "${client.name}"?`);
    if (!res.isConfirmed) return;
    try {
      await clientsAPI.remove(client._id);
      setClients((prev) => prev.filter((c) => c._id !== client._id));
      sweetAlert.success("Cliente eliminado", "El cliente ha sido eliminado correctamente");
    } catch (e: any) {
      const msg = e?.response?.data?.error || "No se pudo eliminar el cliente";
      sweetAlert.error("Error", msg);
    }
  };

  // ---------- modal crear/editar ----------
  const openCreate = () => {
    setEditingClient(null);
    setCloneSource(null);
    setModalMode("create");
    setFormData({
      name: "",
      email: "",
      phone: "",
      company: "",
      industry: "",
      website: "",
      status: "active",
      socialMedia: { ...EMPTY_SOCIALS },
    });
    setShowModal(true);
  };

  // Detectar si debe abrir el modal automáticamente
  useEffect(() => {
    if (searchParams.get("openModal") === "true" && canManage) {
      openCreate();
      // Limpiar el parámetro de la URL
      setSearchParams({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, canManage]);

  const closeModal = () => {
    setShowModal(false);
    setEditingClient(null);
    setCloneSource(null);
    setModalMode(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Filtrar redes sociales vacías antes de enviar
      const socialMediaFiltered = Object.fromEntries(Object.entries(formData.socialMedia || {}).filter(([, value]) => (value || "").trim()));

      const payload = {
        ...formData,
        socialMedia: socialMediaFiltered,
      };

      if (modalMode === "edit" && editingClient) {
        await clientsAPI.update(editingClient._id, payload);
        sweetAlert.success("Cliente actualizado", "Los cambios se han guardado correctamente");
      } else if (modalMode === "create") {
        await clientsAPI.create(payload);
        sweetAlert.success("Cliente creado", "El cliente se ha creado correctamente");
      } else if (modalMode === "clone") {
        await handleCloneSubmit();
        return;
      }
      closeModal();
      fetchClients();
    } catch (error: any) {
      const message = error?.response?.data?.error || "Error al guardar el cliente";
      sweetAlert.error("Error", message);
    }
  };

  // ---------- filtrado ----------
  const filteredClients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return clients.filter((c) => {
      const matchesSearch = q.length === 0 || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q) || (c.industry || "").toLowerCase().includes(q);

      const matchesStatus = filterStatus === "all" ? true : c.status === filterStatus;

      // Filtro de fechas (createdAt)
      let matchesDate = true;
      if (startDate || endDate) {
        const createdAt = c.createdAt ? new Date(c.createdAt).getTime() : 0;
        if (startDate) {
          const start = new Date(startDate).getTime();
          matchesDate = matchesDate && createdAt >= start;
        }
        if (endDate) {
          const end = new Date(endDate).setHours(23, 59, 59, 999);
          matchesDate = matchesDate && createdAt <= end;
        }
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [clients, searchTerm, filterStatus, startDate, endDate]);

  if (loading) return <LoadingSpinner message="Cargando clientes..." />;

  const modalTitle = modalMode === "clone" ? "Clonar Cliente" : modalMode === "edit" ? "Editar Cliente" : "Nuevo Cliente";
  const modalPrimary = modalMode === "clone" ? "Clonar" : modalMode === "edit" ? "Actualizar" : "Crear";
  const modalSubtitle = modalMode === "clone" ? "Completa los datos requeridos para la clonación" : "Datos básicos del cliente";

  return (
    <PageLayout
      title="Clientes"
      faIcon={{ icon: faUsers }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={showHelp}
      headerActions={
        canManage ? (
          <button onClick={openCreate} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
          </button>
        ) : undefined
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar clientes por nombre, email o empresa..."
          /*    filters={[
            {
              value: filterStatus,
              onChange: (v) => setFilterStatus(v as StatusFilter),
              options: [
                { value: "all", label: "Todos" },
                { value: "active", label: "Activos" },
                { value: "onboarding", label: "Onboarding" },
                { value: "inactive", label: "Inactivos" },
              ],
            },
          ]} */
          dateFilter={{
            startDate,
            endDate,
            onStartDateChange: setStartDate,
            onEndDateChange: setEndDate,
          }}
        />
      }
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: modalTitle,
        subtitle: modalSubtitle,
        size: "lg",
        actions: [
          {
            label: modalPrimary,
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#client-form");
              form?.requestSubmit();
            },
            variant: "primary",
          },
          { label: "Cancelar", onClick: closeModal, variant: "ghost" },
        ],
        content: (
          <form id="client-form" onSubmit={handleSubmit}>
            <div className="space-y-6">
              {modalMode === "clone" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                    <input type="text" required value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Nombre del cliente" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email *</label>
                    <input type="email" required value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} className="input-field" placeholder="cliente_copy@ejemplo.com" />
                    <p className="text-xs text-gray-500 mt-1">Se clona toda la info del cliente original; solo asegurá un email único.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                    <input type="text" required value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Nombre del cliente" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email *</label>
                    <input type="email" required value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} className="input-field" placeholder="cliente@ejemplo.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Teléfono</label>
                    <input type="tel" value={formData.phone || ""} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} className="input-field" placeholder="+34 600 000 000" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Empresa</label>
                    <input type="text" value={formData.company || ""} onChange={(e) => setFormData((p) => ({ ...p, company: e.target.value }))} className="input-field" placeholder="Nombre de la empresa" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Industria</label>
                    <input type="text" value={formData.industry || ""} onChange={(e) => setFormData((p) => ({ ...p, industry: e.target.value }))} className="input-field" placeholder="Ej: Tecnología" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sitio web</label>
                    <input type="url" value={formData.website || ""} onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))} className="input-field" placeholder="https://ejemplo.com" />
                  </div>

                  {/* Redes Sociales */}
                  <div className="sm:col-span-2">
                    <h4 className="text-md font-medium text-gray-900 dark:text-white mb-3 pt-2 border-t border-gray-200 dark:border-gray-700">Redes Sociales</h4>
                    <SocialMediaInput
                      value={formData.socialMedia}
                      onChange={(newSocialMedia) =>
                        setFormData((prev) => ({
                          ...prev,
                          socialMedia: newSocialMedia,
                        }))
                      }
                    />
                  </div>

                  {/*                   <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { v: "active", l: "Activo" },
                        { v: "onboarding", l: "Onboarding" },
                        { v: "inactive", l: "Inactivo" },
                      ].map((opt) => (
                        <label key={opt.v} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                          <input type="radio" name="status" className="accent-primary-600" checked={formData.status === (opt.v as ClientFormData["status"])} onChange={() => setFormData((p) => ({ ...p, status: opt.v as ClientFormData["status"] }))} />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{opt.l}</span>
                        </label>
                      ))}
                    </div>
                  </div> */}
                </div>
              )}
            </div>
          </form>
        ),
      }}
    >
      {/* Grid de clientes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {filteredClients.map((client) => (
          <Card
            key={client._id}
            onClick={() => navigate(`/clients/${client._id}`)}
            header={{
              title: client.name,
              subtitle: client.company || "",
              icon: faUserTie,
              avatar: {
                src: client.brandKit?.logos?.[0]?.url,
                fallback: client.name?.charAt(0)?.toUpperCase?.() || "?",
                alt: `${client.name} logo`,
              },
              /*               badges: [],
              favorite: !!client.favorite,
              onToggleFavorite: () => toggleFavorite(client._id, !!client.favorite), */
            }}
            className="hover:scale-105 hover:shadow-lg transition-all duration-200"
            footer={{
              leftContent: <span className="text-xs text-gray-500 dark:text-gray-500">{client.createdAt ? new Date(client.createdAt as any).toLocaleDateString() : "—"}</span>,
              actions: canManage
                ? [
                    {
                      icon: faClone,
                      onClick: (e) => {
                        e.stopPropagation();
                        openClone(client);
                      },
                      title: "Clonar cliente",
                      variant: "default" as const,
                    },
                    {
                      icon: faTrash,
                      onClick: (e) => {
                        e.stopPropagation();
                        handleDeleteClient(client);
                      },
                      title: "Eliminar cliente",
                      variant: "default" as const,
                    },
                  ]
                : [],
            }}
          />
        ))}
        {canManage && (
          <Card
            variant="create"
            onClick={openCreate}
            header={{
              title: "Nuevo Cliente",
              subtitle: "Crear un nuevo cliente en el sistema",
              icon: faUserTie,
            }}
          />
        )}
      </div>

      {filteredClients.length === 0 && (
        <EmptyState
          icon={faUsers}
          title={startDate || endDate ? "No hay clientes en este rango de fechas" : "No hay clientes"}
          description={startDate || endDate ? `No se encontraron clientes ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : "Crea tu primer cliente para comenzar."}
          action={
            canManage
              ? {
                  label: "Nuevo Cliente",
                  onClick: openCreate,
                }
              : undefined
          }
        />
      )}
    </PageLayout>
  );
};
