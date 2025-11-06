import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useClientContextStore } from "../stores/clientContextStore";
import { clientsAPI, Client } from "../api/clients";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faEdit, faEnvelope, faPhone, faBuilding, faGlobe, faExternalLink } from "@fortawesome/free-solid-svg-icons";
import { faFacebook, faInstagram, faLinkedin, faTiktok, faXTwitter, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { Card } from "../components/ui/Card";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { SocialMediaInput } from "../components/forms/SocialMediaInput";
import { getImageUrl } from "../utils/imageHelpers";

const HELP_KEY = "clientContextInfo" as const;

type SocialMediaMap = Partial<Record<"instagram" | "facebook" | "linkedin" | "twitter" | "tiktok" | "youtube", string>>;

type ClientView = Client & {
  createdAt?: string;
  updatedAt?: string;
  brandKit?: { logo?: string | null } | null;
  socialMedia?: SocialMediaMap | null;
};

export const ClientContextInfoPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedClient, setSelectedClient } = useClientContextStore();

  const [client, setClient] = useState<ClientView | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // modal de info (ⓘ)
  const [openInfo, setOpenInfo] = useState<boolean>(false);

  const helpEntry = getHelp(HELP_KEY);

  // modal de edición (igual que en ClientDetailPage → PageLayout.modal)
  const [openEdit, setOpenEdit] = useState<boolean>(false);
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    phone: string;
    company: string;
    industry: string;
    website: string;
    status: Client["status"];
    socialMedia: {
      facebook: string;
      instagram: string;
      twitter: string;
      linkedin: string;
      tiktok: string;
      youtube: string;
    };
  }>({
    name: "",
    email: "",
    phone: "",
    company: "",
    industry: "",
    website: "",
    status: "active",
    socialMedia: {
      facebook: "",
      instagram: "",
      twitter: "",
      linkedin: "",
      tiktok: "",
      youtube: "",
    },
  });

  useEffect(() => {
    if (!id) return;

    if (selectedClient && selectedClient._id === id) {
      setClient(selectedClient as ClientView);
      hydrateForm(selectedClient as ClientView);
      setLoading(false);
      return;
    }

    fetchClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, selectedClient?._id]);

  const fetchClient = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = (await clientsAPI.get(id)) as ClientView;
      setClient(data);
      if (!selectedClient || selectedClient._id !== data._id) {
        setSelectedClient(data);
      }
      hydrateForm(data);
    } catch (error) {
      console.error("Error fetching client:", error);
      sweetAlert.error("Error", "No se pudo cargar el cliente");
    } finally {
      setLoading(false);
    }
  };

  const hydrateForm = (data: ClientView) => {
    setFormData({
      name: data.name || "",
      email: data.email || "",
      phone: (data as any).phone || "",
      company: (data as any).company || "",
      industry: (data as any).industry || "",
      website: (data as any).website || "",
      status: data.status || "active",
      socialMedia: {
        facebook: data.socialMedia?.facebook || "",
        instagram: data.socialMedia?.instagram || "",
        twitter: data.socialMedia?.twitter || "",
        linkedin: data.socialMedia?.linkedin || "",
        tiktok: data.socialMedia?.tiktok || "",
        youtube: data.socialMedia?.youtube || "",
      },
    });
  };

  const submitEdit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!client) return;

    try {
      const payload: Partial<Client> = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone?.trim() || undefined,
        company: formData.company?.trim() || undefined,
        industry: formData.industry?.trim() || undefined,
        website: formData.website?.trim() || undefined,
        status: formData.status,
        socialMedia: Object.fromEntries(Object.entries(formData.socialMedia || {}).filter(([, value]) => (value || "").trim())),
      };

      await clientsAPI.update(client._id, payload);
      const refreshed = (await clientsAPI.get(client._id)) as ClientView;
      setClient(refreshed);
      setSelectedClient(refreshed);
      sweetAlert.success("Cliente actualizado", "Los cambios se han guardado correctamente");
      setOpenEdit(false);
    } catch (error: any) {
      const message = error?.response?.data?.error || "No se pudo actualizar el cliente";
      sweetAlert.error("Error", message);
    }
  };

  if (!id) {
    return <EmptyState icon={faUser} title="Cliente no válido" description="Selecciona un cliente para ver su información básica." action={{ label: "Ir a Clientes", onClick: () => navigate("/clients") }} />;
  }

  if (loading) return <LoadingSpinner message="Cargando información del cliente..." />;

  if (!client) {
    return <EmptyState icon={faUser} title="Cliente no encontrado" description="No se pudo encontrar el cliente solicitado." action={{ label: "Volver", onClick: () => navigate(-1) }} />;
  }

  const displayLogo = client.brandKit?.logos?.[0]?.url || client.brandKit?.logo;
  const hasAnySocial = !!client.socialMedia && Object.values(client.socialMedia as Record<string, string | undefined>).some((v) => typeof v === "string" && v.length > 0);

  const getIconForPlatform = (p: string) => {
    switch (p) {
      case "instagram":
        return faInstagram;
      case "facebook":
        return faFacebook;
      case "linkedin":
        return faLinkedin;
      case "twitter":
        return faXTwitter;
      case "tiktok":
        return faTiktok;
      case "youtube":
        return faYoutube;
      default:
        return faExternalLink;
    }
  };

  return (
    <PageLayout
      title="Información"
      faIcon={{ icon: faUser }}
      subtitle={`Datos de contacto y empresa de ${client.name ?? ""}`}
      clientMiniAvatar={{
        src: getImageUrl(displayLogo) ?? undefined,
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
      // Modal de edición (mismo esquema que ClientDetailPage)
      modal={{
        isOpen: openEdit,
        onClose: () => setOpenEdit(false),
        title: "Editar Información",
        subtitle: "Actualiza los datos del cliente",
        size: "lg",
        actions: [
          {
            label: "Guardar",
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#client-basic-edit-form");
              form?.requestSubmit();
            },
            variant: "primary",
          },
          { label: "Cancelar", onClick: () => setOpenEdit(false), variant: "ghost" },
        ],
        content: (
          <form id="client-basic-edit-form" onSubmit={submitEdit}>
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
                <input type="tel" value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} className="input-field" placeholder="+34 600 000 000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Empresa</label>
                <input type="text" value={formData.company} onChange={(e) => setFormData((p) => ({ ...p, company: e.target.value }))} className="input-field" placeholder="Nombre de la empresa" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Industria</label>
                <input type="text" value={formData.industry} onChange={(e) => setFormData((p) => ({ ...p, industry: e.target.value }))} className="input-field" placeholder="Ej: Tecnología" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sitio web</label>
                <input type="url" value={formData.website} onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))} className="input-field" placeholder="https://ejemplo.com" />
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

              {/*               <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: "active", l: "Activo" },
                    { v: "onboarding", l: "Onboarding" },
                    { v: "inactive", l: "Inactivo" },
                  ].map((opt) => (
                    <label key={opt.v} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                      <input type="radio" name="status" className="accent-primary-600" checked={formData.status === (opt.v as Client["status"])} onChange={() => setFormData((p) => ({ ...p, status: opt.v as Client["status"] }))} />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{opt.l}</span>
                    </label>
                  ))}
                </div>
              </div> */}
            </div>
          </form>
        ),
      }}
      onBack={() => navigate(-1)}
      headerActions={
        <button onClick={() => setOpenEdit(true)} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
          <FontAwesomeIcon icon={faEdit} className="h-3 w-3 lg:h-4 lg:w-4" />
        </button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card Datos de Contacto - Clickeable */}
        <Card
          header={{
            title: "Datos de Contacto",
            icon: faEnvelope,
          }}
          onClick={() => setOpenEdit(true)}
          className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
        >
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <FontAwesomeIcon icon={faEnvelope} className="h-5 w-5 text-gray-400" />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">Email</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{client.email}</div>
              </div>
            </div>

            {!!(client as any).phone && (
              <div className="flex items-center space-x-3">
                <FontAwesomeIcon icon={faPhone} className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Teléfono</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{(client as any).phone}</div>
                </div>
              </div>
            )}

            {!!(client as any).company && (
              <div className="flex items-center space-x-3">
                <FontAwesomeIcon icon={faBuilding} className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Empresa</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{(client as any).company}</div>
                </div>
              </div>
            )}

            {!!(client as any).website && (
              <div className="flex items-center space-x-3">
                <FontAwesomeIcon icon={faGlobe} className="h-5 w-5 text-gray-400" />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Sitio Web</div>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open((client as any).website, "_blank", "noopener,noreferrer");
                    }}
                    className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center space-x-1 cursor-pointer"
                  >
                    <span>{(client as any).website}</span>
                    <FontAwesomeIcon icon={faExternalLink} className="h-3 w-3" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Card Redes Sociales - Clickeable */}
        <Card
          header={{
            title: "Redes Sociales",
            icon: faGlobe,
          }}
          onClick={() => setOpenEdit(true)}
          className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
        >
          {hasAnySocial ? (
            <div className="space-y-3">
              {Object.entries(client.socialMedia as Record<string, string | undefined>)
                .filter(([, url]) => !!url)
                .slice(0, 3) // Mostrar máximo 3 para no sobrecargar la card
                .map(([platform, url]) => (
                  <div
                    key={platform}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(url as string, "_blank", "noopener,noreferrer");
                    }}
                    className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  >
                    <FontAwesomeIcon icon={getIconForPlatform(platform)} className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    <span className="capitalize text-sm text-gray-900 dark:text-white font-medium">{platform}</span>
                    <FontAwesomeIcon icon={faExternalLink} className="h-3 w-3 text-gray-400 ml-auto" />
                  </div>
                ))}
              {Object.entries(client.socialMedia as Record<string, string | undefined>).filter(([, url]) => !!url).length > 3 && <div className="text-xs text-gray-500 dark:text-gray-500 text-center">+{Object.entries(client.socialMedia as Record<string, string | undefined>).filter(([, url]) => !!url).length - 3} más</div>}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-gray-400 mb-2">
                <FontAwesomeIcon icon={faGlobe} className="h-8 w-8" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">No hay redes sociales configuradas</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Haz clic para agregar</p>
            </div>
          )}
        </Card>
      </div>
    </PageLayout>
  );
};
