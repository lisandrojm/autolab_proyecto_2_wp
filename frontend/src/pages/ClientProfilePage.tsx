import React, { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { useClientContextStore } from "../stores/clientContextStore";
import { clientsAPI, Client } from "../api/clients";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faEdit, faSave, faEnvelope, faPhone, faBuilding, faGlobe, faPalette, faExternalLink } from "@fortawesome/free-solid-svg-icons";
import { faFacebook, faInstagram, faLinkedin, faTiktok, faXTwitter, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { getImageUrl, getImageFullUrl } from "../utils/imageHelpers";

export const ClientProfilePage: React.FC = () => {
  const { token, tenantId } = useAuthStore();
  const { selectedClient, setSelectedClient } = useClientContextStore();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingBrandKit, setEditingBrandKit] = useState(false);

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

  const [brandForm, setBrandForm] = useState({
    logo: "",
    colors: ["111827"] as string[],
    fontsText: "",
    guidelines: "",
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
        hydrateBrandForm(selectedClient);
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
        hydrateBrandForm(firstClient);
      }
    } catch (error) {
      console.error("Error loading client data:", error);
      sweetAlert.error("Error", "No se pudo cargar la información del cliente");
    } finally {
      setLoading(false);
    }
  };

  const hydrateBasicForm = (clientData: Client) => {
    setBasicForm({
      name: clientData.name || "",
      email: clientData.email || "",
      phone: (clientData as any).phone || "",
      company: (clientData as any).company || "",
      industry: (clientData as any).industry || "",
      website: (clientData as any).website || "",
      socialMedia: {
        facebook: clientData.socialMedia?.facebook || "",
        instagram: clientData.socialMedia?.instagram || "",
        twitter: clientData.socialMedia?.twitter || "",
        linkedin: clientData.socialMedia?.linkedin || "",
        tiktok: clientData.socialMedia?.tiktok || "",
        youtube: clientData.socialMedia?.youtube || "",
      },
    });
  };

  const hydrateBrandForm = (clientData: Client) => {
    const colors = clientData.brandKit?.colors?.length
      ? clientData.brandKit.colors.map(c => c.replace(/^#+/, ''))
      : ["111827"];
    const fonts = clientData.brandKit?.fonts || [];
    setBrandForm({
      logo: clientData.brandKit?.logo || "",
      colors,
      fontsText: fonts.join(", "),
      guidelines: clientData.brandKit?.guidelines || "",
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

  const handleBrandKitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;

    try {
      const fonts = brandForm.fontsText
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);

      const payload = {
        brandKit: {
          logo: brandForm.logo?.trim() || undefined,
          colors: brandForm.colors
            .map((c) => {
              const cleaned = c.replace(/^#+/, '').trim();
              return cleaned ? `#${cleaned}` : '';
            })
            .filter(Boolean),
          fonts,
          guidelines: brandForm.guidelines?.trim() || undefined,
        },
      };

      const updated = await clientsAPI.update(client._id, payload);
      setClient(updated);
      setSelectedClient(updated);
      setEditingBrandKit(false);
      sweetAlert.success("Brand Kit actualizado", "Los cambios se han guardado correctamente");
    } catch (error: any) {
      const message = error?.response?.data?.error || "No se pudo actualizar el brand kit";
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
        src: client.brandKit?.logo,
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
              {client.socialMedia && Object.values(client.socialMedia).some(Boolean) && (
                <div>
                  <h4 className="text-md font-medium text-gray-900 dark:text-white mb-3">Redes Sociales</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(client.socialMedia).map(([platform, url]) => {
                      if (!url) return null;
                      return (
                        <a key={platform} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-600">
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

        {/* Brand Kit */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Brand Kit</h3>
            <button
              onClick={() => {
                if (editingBrandKit) {
                  hydrateBrandForm(client);
                }
                setEditingBrandKit(!editingBrandKit);
              }}
              className="btn-secondary flex items-center space-x-2"
            >
              <FontAwesomeIcon icon={editingBrandKit ? faPalette : faEdit} className="h-4 w-4" />
              <span>{editingBrandKit ? "Cancelar" : "Editar"}</span>
            </button>
          </div>

          {editingBrandKit ? (
            <form onSubmit={handleBrandKitSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Logo (URL)</label>
                <input type="url" value={brandForm.logo} onChange={(e) => setBrandForm((prev) => ({ ...prev, logo: e.target.value }))} className="input-field" placeholder="https://cdn.site/logo.png" />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Colores de marca</label>
                  <button
                    type="button"
                    onClick={() =>
                      setBrandForm((prev) => ({
                        ...prev,
                        colors: [...prev.colors, "111827"],
                      }))
                    }
                    className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    + Agregar color
                  </button>
                </div>

                <div className="space-y-2">
                  {brandForm.colors.map((color, index) => {
                    const cleanColor = color?.replace(/^#+/, '') || '';
                    const fullColor = cleanColor ? `#${cleanColor}` : '#111827';

                    return (
                      <div key={index} className="flex items-center gap-3">
                        <input
                          type="color"
                          value={fullColor}
                          onChange={(e) => {
                            const newColor = e.target.value.replace(/^#/, '');
                            setBrandForm((prev) => ({
                              ...prev,
                              colors: prev.colors.map((c, i) => (i === index ? newColor : c)),
                            }));
                          }}
                          className="h-10 w-12 p-0 border border-gray-300 dark:border-gray-600 rounded"
                        />
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none select-none">#</span>
                          <input
                            type="text"
                            value={cleanColor}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
                              setBrandForm((prev) => ({
                                ...prev,
                                colors: prev.colors.map((c, i) => (i === index ? value : c)),
                              }));
                            }}
                            onPaste={(e) => {
                              e.preventDefault();
                              const pastedText = e.clipboardData.getData('text');
                              const cleaned = pastedText.replace(/^#+/, '').replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
                              setBrandForm((prev) => ({
                                ...prev,
                                colors: prev.colors.map((c, i) => (i === index ? cleaned : c)),
                              }));
                            }}
                            className="input-field pl-7"
                            placeholder="111827"
                            maxLength={6}
                          />
                        </div>
                        {brandForm.colors.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setBrandForm((prev) => ({
                                ...prev,
                                colors: prev.colors.filter((_, i) => i !== index),
                              }))
                            }
                            className="px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fuentes (separadas por coma)</label>
                <input type="text" value={brandForm.fontsText} onChange={(e) => setBrandForm((prev) => ({ ...prev, fontsText: e.target.value }))} className="input-field" placeholder="Inter, Poppins, Roboto" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Guías de Marca</label>
                <textarea rows={4} value={brandForm.guidelines} onChange={(e) => setBrandForm((prev) => ({ ...prev, guidelines: e.target.value }))} className="input-field resize-none" placeholder="Notas, usos del logo, tono, etc." />
              </div>

              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => setEditingBrandKit(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex items-center space-x-2">
                  <FontAwesomeIcon icon={faSave} className="h-4 w-4" />
                  <span>Guardar Brand Kit</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              {/* Logo */}
              {client.brandKit?.logos && client.brandKit.logos.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Logo</h4>
                  <div className="flex items-center space-x-4">
                    <img src={getImageUrl(client.brandKit.logos[0].url)} alt={`${client.name} logo`} className="w-16 h-16 object-cover rounded-lg border-2 border-gray-200 dark:border-gray-600" />
                    <a href={getImageFullUrl(client.brandKit.logos[0].url)} target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline text-sm flex items-center space-x-1">
                      <span>Ver imagen completa</span>
                      <FontAwesomeIcon icon={faExternalLink} className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* Colores */}
              {client.brandKit?.colors && client.brandKit.colors.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Colores de Marca ({client.brandKit.colors.length})</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {client.brandKit.colors.map((color, index) => (
                      <div key={index} className="flex items-center space-x-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                        <div className="w-8 h-8 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" style={{ backgroundColor: color }} />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{color}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-500">Color {index + 1}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fuentes */}
              {client.brandKit?.fonts && client.brandKit.fonts.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Fuentes ({client.brandKit.fonts.length})</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {client.brandKit.fonts.map((font, index) => (
                      <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{font}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Guías */}
              {client.brandKit?.guidelines && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Guías de Marca</h4>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                    <p className="text-sm text-gray-900 dark:text-white leading-relaxed">{client.brandKit.guidelines}</p>
                  </div>
                </div>
              )}

              {/* Empty state si no hay brand kit */}
              {!client.brandKit?.logo && (!client.brandKit?.colors || client.brandKit.colors.length === 0) && (!client.brandKit?.fonts || client.brandKit.fonts.length === 0) && !client.brandKit?.guidelines && (
                <div className="text-center py-8">
                  <FontAwesomeIcon icon={faPalette} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Brand Kit no configurado</h4>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Configura tu logo, colores y guías de marca</p>
                  <button onClick={() => setEditingBrandKit(true)} className="btn-primary">
                    Configurar Brand Kit
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
};
