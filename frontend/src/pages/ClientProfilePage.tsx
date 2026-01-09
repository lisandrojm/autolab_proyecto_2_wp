import React, { useState, useEffect } from "react";

import { useClientContextStore } from "../stores/clientContextStore";
import { clientsAPI, Client } from "../api/clients";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faEdit, faSave, faEnvelope, faPhone, faBuilding, faGlobe, faExternalLink } from "@fortawesome/free-solid-svg-icons";
import { faFacebook, faInstagram, faLinkedin, faTiktok, faXTwitter, faYoutube } from "@fortawesome/free-brands-svg-icons";

export const ClientProfilePage: React.FC = () => {
  /*   const { token, tenantId } = useAuthStore(); */
  const { selectedClient, setSelectedClient } = useClientContextStore();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const [basicForm, setBasicForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    industry: "",
    website: "",
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
    loadClientData();
  }, []);

  const loadClientData = async () => {
    try {
      setLoading(true);

      // Si hay cliente seleccionado, usar ese
      if (selectedClient) {
        setClient(selectedClient);
        hydrateBasicForm(selectedClient);
        setLoading(false);
        return;
      }

      // Si no, cargar el primer cliente disponible (backend filtra por permisos)
      const response = await clientsAPI.list({ limit: 1 });
      if (response.clients.length > 0) {
        const firstClient = response.clients[0];
        setClient(firstClient);
        setSelectedClient(firstClient);
        hydrateBasicForm(firstClient);
      }
    } catch (error) {
      console.error("Error loading client data:", error);
      sweetAlert.error("Error", "No se pudo cargar la información del cliente");
    } finally {
      setLoading(false);
    }
  };

  const hydrateBasicForm = (clientData: Client) => {
    const data = clientData as any;
    setBasicForm({
      name: data.name || "",
      email: data.email || "",
      phone: data.phone || "",
      company: data.company || "",
      industry: data.industry || "",
      website: data.website || "",
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

  const handleBasicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;

    try {
      const payload = {
        ...basicForm,
        socialMedia: Object.fromEntries(Object.entries(basicForm.socialMedia).filter(([, value]) => value.trim())),
      };

      const updated = await clientsAPI.update(client._id, payload);
      setClient(updated);
      setSelectedClient(updated);
      setEditing(false);
      sweetAlert.success("Perfil actualizado", "Los cambios se han guardado correctamente");
    } catch (error: any) {
      const message = error?.response?.data?.error || "No se pudo actualizar el perfil";
      sweetAlert.error("Error", message);
    }
  };

  const getSocialIcon = (platform: string) => {
    switch (platform) {
      case "facebook":
        return faFacebook;
      case "instagram":
        return faInstagram;
      case "linkedin":
        return faLinkedin;
      case "twitter":
        return faXTwitter;
      case "tiktok":
        return faTiktok;
      case "youtube":
        return faYoutube;
      default:
        return faGlobe;
    }
  };

  if (loading) return <LoadingSpinner message="Cargando perfil..." />;

  if (!client) {
    return (
      <PageLayout title="Perfil Cliente" subtitle="Gestiona tu información">
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faUser} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No se encontró información del cliente</h3>
          <p className="text-gray-600 dark:text-gray-400">Contacta con el administrador para configurar tu acceso.</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Gestión de Perfil"
      subtitle="Administra tu información y brand kit"
      faIcon={{ icon: faUser }}
      clientMiniAvatar={{
        alt: `${client.name} logo`,
        fallback: client.name?.charAt(0)?.toUpperCase() || "?",
        label: client.name,
      }}
    >
      <div className="space-y-6">
        {/* Información */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Información</h3>
            <button
              onClick={() => {
                if (editing) {
                  hydrateBasicForm(client);
                }
                setEditing(!editing);
              }}
              className="btn-secondary flex items-center space-x-2"
            >
              <FontAwesomeIcon icon={editing ? faUser : faEdit} className="h-4 w-4" />
              <span>{editing ? "Cancelar" : "Editar"}</span>
            </button>
          </div>

          {editing ? (
            <form onSubmit={handleBasicSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                  <input type="text" required value={basicForm.name} onChange={(e) => setBasicForm((prev) => ({ ...prev, name: e.target.value }))} className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email *</label>
                  <input type="email" required value={basicForm.email} onChange={(e) => setBasicForm((prev) => ({ ...prev, email: e.target.value }))} className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Teléfono</label>
                  <input type="tel" value={basicForm.phone} onChange={(e) => setBasicForm((prev) => ({ ...prev, phone: e.target.value }))} className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Empresa</label>
                  <input type="text" value={basicForm.company} onChange={(e) => setBasicForm((prev) => ({ ...prev, company: e.target.value }))} className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Industria</label>
                  <input type="text" value={basicForm.industry} onChange={(e) => setBasicForm((prev) => ({ ...prev, industry: e.target.value }))} className="input-field" />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sitio Web</label>
                  <input type="url" value={basicForm.website} onChange={(e) => setBasicForm((prev) => ({ ...prev, website: e.target.value }))} className="input-field" />
                </div>
              </div>

              {/* Redes Sociales */}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-md font-medium text-gray-900 dark:text-white mb-3">Redes Sociales</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(basicForm.socialMedia).map(([platform, value]) => (
                    <div key={platform}>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <FontAwesomeIcon icon={getSocialIcon(platform)} className="h-4 w-4 mr-2" />
                        {platform.charAt(0).toUpperCase() + platform.slice(1)}
                      </label>
                      <input
                        type="url"
                        value={value}
                        onChange={(e) =>
                          setBasicForm((prev) => ({
                            ...prev,
                            socialMedia: {
                              ...prev.socialMedia,
                              [platform]: e.target.value,
                            },
                          }))
                        }
                        className="input-field"
                        placeholder={`https://${platform}.com/usuario`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setEditing(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex items-center space-x-2">
                  <FontAwesomeIcon icon={faSave} className="h-4 w-4" />
                  <span>Guardar Cambios</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              {/* Datos básicos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center space-x-3">
                  <FontAwesomeIcon icon={faEnvelope} className="h-5 w-5 text-gray-400" />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">Email</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{client.email}</div>
                  </div>
                </div>

                {(client as any).phone && (
                  <div className="flex items-center space-x-3">
                    <FontAwesomeIcon icon={faPhone} className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">Teléfono</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{(client as any).phone}</div>
                    </div>
                  </div>
                )}

                {(client as any).company && (
                  <div className="flex items-center space-x-3">
                    <FontAwesomeIcon icon={faBuilding} className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">Empresa</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{(client as any).company}</div>
                    </div>
                  </div>
                )}

                {(client as any).website && (
                  <div className="flex items-center space-x-3">
                    <FontAwesomeIcon icon={faGlobe} className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">Sitio Web</div>
                      <a href={(client as any).website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center space-x-1">
                        <span>{(client as any).website}</span>
                        <FontAwesomeIcon icon={faExternalLink} className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Redes Sociales */}
              {(client as any).socialMedia && Object.values((client as any).socialMedia).some(Boolean) && (
                <div>
                  <h4 className="text-md font-medium text-gray-900 dark:text-white mb-3">Redes Sociales</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries((client as any).socialMedia).map(([platform, url]) => {
                      if (!url) return null;
                      return (
                        <a key={platform} href={url as string} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-3 p-3 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-600">
                          <FontAwesomeIcon icon={getSocialIcon(platform)} className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                          <span className="capitalize text-sm text-gray-900 dark:text-white font-medium">{platform}</span>
                          <FontAwesomeIcon icon={faExternalLink} className="h-3 w-3 text-gray-400 ml-auto" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
};
