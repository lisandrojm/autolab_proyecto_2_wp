import React, { useEffect, useMemo, useState } from 'react';
import { fuzzyMatch } from '../utils/searchHelpers';
import { useAuthStore } from '../stores/authStore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageLayout } from '../components/ui/PageLayout';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Card } from '../components/ui/Card';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClone, faPlus, faTrash, faUsers } from '@fortawesome/free-solid-svg-icons';
import { clientsAPI, type Client } from '../api/clients';
import { customAlphabet } from 'nanoid';
import { getHelp, hasHelp } from '../data/help/helpContent';

const HELP_KEY = 'clients' as const;

type StatusFilter = 'all' | 'active' | 'inactive' | 'onboarding';
type ModalMode = 'create' | 'edit' | 'clone' | null;

interface ClientFormData {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  industry?: string;
  website?: string;
  status: 'active' | 'inactive' | 'onboarding';
}

/* Generador corto de IDs */
const genId = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 6);

/* Email único para clonación */
const makeCloneEmail = (srcEmail?: string) => {
  const id = genId();
  if (srcEmail && srcEmail.includes('@')) {
    const [local, domain] = srcEmail.split('@');
    return `${local}_copy-${id}@${domain}`;
  }
  return `client_copy-${id}@clone.local`;
};

export const ClientsPage: React.FC = () => {
  const { hasPermission } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // data
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // búsqueda + filtro
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus] = useState<StatusFilter>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // info modal (ⓘ)
  const [openInfo, setOpenInfo] = useState(false);
  const showHelp = hasHelp(HELP_KEY);
  const helpEntry = showHelp ? getHelp(HELP_KEY) : { title: 'Ayuda', size: 'md' as const, content: <div /> };

  // modal (crear/editar/clonar)
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [cloneSource, setCloneSource] = useState<Client | null>(null);

  const [formData, setFormData] = useState<ClientFormData>({
    name: '',
    email: '',
    phone: '',
    company: '',
    industry: '',
    website: '',
    status: 'active',
  });

  const canManage = hasPermission('admin_clients:view');

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
      sweetAlert.error('Error', 'No se pudieron cargar los clientes');
    } finally {
      setLoading(false);
    }
  };

  // ---------- acciones ----------
  /* const toggleFavorite = async (id: string, current: boolean) => {
    setClients((prev) => prev.map((c) => (c._id === id ? { ...c, favorite: !current } : c)));
    try {
      const updated = await clientsAPI.toggleFavorite(id, !current);
      setClients((prev) => prev.map((c) => (c._id === id ? { ...c, favorite: !!updated.favorite } : c)));
      sweetAlert.success("Favoritos", !current ? "Cliente marcado como favorito" : "Cliente removido de favoritos");
    } catch (e) {
      setClients((prev) => prev.map((c) => (c._id === id ? { ...c, favorite: current } : c)));
      sweetAlert.error("Error", "No se pudo actualizar favorito");
    }
  }; */

  const openClone = (client: Client) => {
    setCloneSource(client);
    setEditingClient(null);
    setModalMode('clone');
    setFormData({
      name: `${client.name} (copia)`,
      email: makeCloneEmail(client.email),
      phone: '',
      company: '',
      industry: '',
      website: '',
      status: client.status || 'active',
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
        attachments: cloneSource.attachments ? [...cloneSource.attachments] : [],

        status: cloneSource.status || 'active',
        favorite: false,
      };

      const created = await clientsAPI.create(payload as any);
      sweetAlert.success('Cliente clonado', 'Se creó una copia del cliente');
      setClients((prev) => [created, ...prev]);
      closeModal();
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'No se pudo clonar el cliente';
      sweetAlert.error('Error', msg);
    }
  };

  const handleDeleteClient = async (client: Client) => {
    const res = await sweetAlert.confirm('¿Eliminar cliente?', `¿Estás seguro de eliminar a "${client.name}"?`);
    if (!res.isConfirmed) return;
    try {
      await clientsAPI.remove(client._id);
      setClients((prev) => prev.filter((c) => c._id !== client._id));
      sweetAlert.success('Cliente eliminado', 'El cliente ha sido eliminado correctamente');
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'No se pudo eliminar el cliente';
      sweetAlert.error('Error', msg);
    }
  };

  // ---------- modal crear/editar ----------
  const openCreate = () => {
    setEditingClient(null);
    setCloneSource(null);
    setModalMode('create');
    setFormData({
      name: '',
      email: '',
      phone: '',
      company: '',
      industry: '',
      website: '',
      status: 'active',
    });
    setShowModal(true);
  };

  // Detectar si debe abrir el modal automáticamente
  useEffect(() => {
    if (searchParams.get('openModal') === 'true' && canManage) {
      openCreate();
      setSearchParams({});
    }
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
      const payload = {
        ...formData,
      };

      if (modalMode === 'edit' && editingClient) {
        await clientsAPI.update(editingClient._id, payload);
        sweetAlert.success('Cliente actualizado', 'Los cambios se han guardado correctamente');
      } else if (modalMode === 'create') {
        await clientsAPI.create(payload);
        sweetAlert.success('Cliente creado', 'El cliente se ha creado correctamente');
      } else if (modalMode === 'clone') {
        await handleCloneSubmit();
        return;
      }
      closeModal();
      fetchClients();
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Error al guardar el cliente';
      sweetAlert.error('Error', message);
    }
  };

  // ---------- filtrado ----------
  const filteredClients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return clients.filter((c) => {
      const matchesSearch = q.length === 0 || fuzzyMatch(c.name || '', q) || fuzzyMatch(c.email || '', q) || fuzzyMatch(c.company || '', q) || fuzzyMatch(c.industry || '', q);

      const matchesStatus = filterStatus === 'all' ? true : c.status === filterStatus;

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

  const modalTitle = modalMode === 'clone' ? 'Clonar Cliente' : modalMode === 'edit' ? 'Editar Cliente' : 'Nuevo Cliente';
  const modalPrimary = modalMode === 'clone' ? 'Clonar' : modalMode === 'edit' ? 'Actualizar' : 'Crear';
  const modalSubtitle = modalMode === 'clone' ? 'Completa los datos requeridos para la clonación' : 'Datos básicos del cliente';

  return (
    <PageLayout
      title="Clientes"
      itemCount={filteredClients.length}
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
          <button onClick={openCreate} title="Nuevo cliente" aria-label="Nuevo cliente" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            <FontAwesomeIcon icon={faPlus} />
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
        size: 'lg',
        actions: [
          {
            label: modalPrimary,
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>('#client-form');
              form?.requestSubmit();
            },
            variant: 'primary',
          },
          { label: 'Cancelar', onClick: closeModal, variant: 'ghost' },
        ],
        content: (
          <form id="client-form" onSubmit={handleSubmit}>
            <div className="space-y-6">
              {modalMode === 'clone' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                    <input type="text" required value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Nombre del cliente" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email *</label>
                    <input type="email" required value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} className="input-field" placeholder="cliente_copy@ejemplo.com" />
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
                    <input type="tel" value={formData.phone || ''} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} className="input-field" placeholder="+34 600 000 000" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Empresa</label>
                    <input type="text" value={formData.company || ''} onChange={(e) => setFormData((p) => ({ ...p, company: e.target.value }))} className="input-field" placeholder="Nombre de la empresa" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Industria</label>
                    <input type="text" value={formData.industry || ''} onChange={(e) => setFormData((p) => ({ ...p, industry: e.target.value }))} className="input-field" placeholder="Ej: Tecnología" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sitio web</label>
                    <input type="url" value={formData.website || ''} onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))} className="input-field" placeholder="https://ejemplo.com" />
                  </div>
                </div>
              )}
            </div>
          </form>
        ),
      }}
    >
      {/* Loading state */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando clientes..." />
        </div>
      ) : (
        <>
          {/* Grid de clientes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {filteredClients.map((client) => {
              const logoUrl = client.attachments?.find((a: any) => a.name?.toLowerCase().includes('logo') || a.fileType?.includes('image'))?.url;
              return (
                <Card
                  key={client._id}
                  onClick={() => navigate(`/clients/${client._id}`)}
                  header={{
                    title: client.name,
                    subtitle: client.company || '',
                    icon: faUsers,
                    avatar: logoUrl
                      ? {
                          src: logoUrl,
                          fallback: '?',
                          alt: `${client.name} logo`,
                        }
                      : undefined,
                    iconClassName: 'text-primary-600 dark:text-primary-400',
                    badges:
                      client.tenant && client.tenant.name
                        ? [
                            {
                              text: client.tenant.name,
                              variant: 'default' as const,
                              className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                            },
                          ]
                        : [],
                    /*               badges: [],
              favorite: !!client.favorite,
              onToggleFavorite: () => toggleFavorite(client._id, !!client.favorite), */
                  }}
                  className="hover:scale-105 hover:shadow-lg transition-all duration-200"
                  footer={{
                    leftContent: <span className="text-xs text-gray-500 dark:text-gray-500">{client.createdAt ? new Date(client.createdAt as any).toLocaleDateString() : '—'}</span>,
                    actions: canManage
                      ? [
                          {
                            icon: faClone,
                            onClick: (e) => {
                              e.stopPropagation();
                              openClone(client);
                            },
                            title: 'Clonar cliente',
                            variant: 'default' as const,
                          },
                          {
                            icon: faTrash,
                            onClick: (e) => {
                              e.stopPropagation();
                              handleDeleteClient(client);
                            },
                            title: 'Eliminar cliente',
                            variant: 'default' as const,
                          },
                        ]
                      : [],
                  }}
                />
              );
            })}
            {canManage && (
              <Card
                variant="create"
                onClick={openCreate}
                header={{
                  title: 'Nuevo Cliente',
                  subtitle: 'Crear un nuevo cliente en el sistema',
                  icon: faUsers,
                }}
              />
            )}
          </div>

          {!loading && filteredClients.length === 0 && (
            <EmptyState
              icon={faUsers}
              title={startDate || endDate ? 'No hay clientes en este rango de fechas' : 'No hay clientes'}
              description={startDate || endDate ? `No se encontraron clientes ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : 'Crea tu primer cliente para comenzar.'}
              action={
                canManage
                  ? {
                      label: 'Nuevo Cliente',
                      onClick: openCreate,
                    }
                  : undefined
              }
            />
          )}
        </>
      )}
    </PageLayout>
  );
};
