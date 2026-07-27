import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { tenantsApi, Tenant, CreateTenantDTO } from '../api/tenants';
import { PageLayout } from '../components/ui/PageLayout';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Card } from '../components/ui/Card';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuilding, faEdit, faTrash, faPlus, faLock } from '@fortawesome/free-solid-svg-icons';
import { getHelp, hasHelp } from '../data/help/helpContent';

const HELP_KEY = 'tenants' as const;

export const TenantsPage: React.FC = () => {
  const { hasPermission } = useAuthStore();

  // data
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);

  // búsqueda/filters (server-side)
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // modal create/edit
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  // form create/edit
  const [formData, setFormData] = useState<CreateTenantDTO>({
    name: '',
    slug: '',
    domain: '',
    company: {
      legalName: '',
      taxId: '',
      industry: '',
      address: {
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
      },
      website: '',
      description: '',
    },
    contact: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      position: '',
      department: '',
      password: '',
    },
    settings: {
      timezone: 'UTC',
      currency: 'USD',
      language: 'en',
      features: [],
    },
    subscription: {
      plan: 'free',
      status: 'active',
    },
    isActive: true,
  });

  // info modal (ⓘ)
  const [openInfo, setOpenInfo] = useState(false);

  const helpEntry = hasHelp(HELP_KEY) ? getHelp(HELP_KEY) : { title: 'Ayuda', size: 'md' as const, content: <div>Información de ayuda no disponible</div> };

  // view modal (solo lectura)
  const [viewOpen, setViewOpen] = useState(false);
  const [viewTenant, setViewTenant] = useState<Tenant | null>(null);

  const canManage = hasPermission('tenants:view');

  // Para descartar respuestas viejas
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Carga inicial
    const init = async () => {
      try {
        setInitialLoading(true);
        await fetchTenants({ silent: true });
      } finally {
        setInitialLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce para refrescar la lista cuando cambian searchTerm / filterStatus / fechas
  useEffect(() => {
    const h = setTimeout(() => {
      fetchTenants({ silent: true });
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filterStatus, startDate, endDate]);

  const fetchTenants = async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) setIsFetching(true);
      const currentId = ++requestIdRef.current;

      const params: any = {};
      if (searchTerm) params.name = searchTerm;
      if (filterStatus !== 'all') params.status = filterStatus;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await tenantsApi.getAll(params);

      // Solo aplico si esta respuesta es la más reciente
      if (currentId === requestIdRef.current) {
        const tenantsList = Array.isArray(response) ? response : response.tenants || response.items || response.data || [];
        setTenants(tenantsList);
        console.log('📋 Tenants cargados:', tenantsList.length);
      }
    } catch (error) {
      console.error('Error fetching tenants:', error);
      sweetAlert.error('Error', 'No se pudieron cargar los tenants');
    } finally {
      if (!silent) setIsFetching(false);
    }
  };

  // Abrir modales
  const openCreate = () => {
    setEditingTenant(null);
    setPasswordConfirm('');
    setShowPassword(false);
    setPasswordStrength(0);
    setFormData({
      name: '',
      slug: '',
      domain: '',
      company: {
        legalName: '',
        taxId: '',
        industry: '',
        address: {
          street: '',
          city: '',
          state: '',
          postalCode: '',
          country: '',
        },
        website: '',
        description: '',
      },
      contact: {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        position: '',
        department: '',
        password: '',
      },
      settings: {
        timezone: 'UTC',
        currency: 'USD',
        language: 'en',
        features: [],
      },
      subscription: {
        plan: 'free',
        status: 'active',
      },
      isActive: true,
    });
    setShowModal(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setPasswordConfirm('');
    setShowPassword(false);
    setPasswordStrength(0);
    setFormData({
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain || '',
      company: tenant.company,
      contact: { ...tenant.contact, password: '' },
      settings: tenant.settings,
      subscription: tenant.subscription,
      isActive: tenant.isActive,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTenant(null);
    setPasswordConfirm('');
    setShowPassword(false);
    setPasswordStrength(0);
  };

  const openView = (tenant: Tenant) => {
    setViewTenant(tenant);
    setViewOpen(true);
  };

  const closeView = () => {
    setViewOpen(false);
    setViewTenant(null);
  };

  // Submit create/edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingTenant && formData.contact.password && formData.contact.password !== passwordConfirm) {
      sweetAlert.error('Error', 'Las contraseñas no coinciden');
      return;
    }

    if (!editingTenant && formData.contact.password && formData.contact.password.length < 8) {
      sweetAlert.error('Error', 'La contraseña debe tener al menos 8 caracteres');
      return;
    }

    if (editingTenant && formData.contact.password && formData.contact.password !== passwordConfirm) {
      sweetAlert.error('Error', 'Las contraseñas no coinciden');
      return;
    }

    if (editingTenant && formData.contact.password && formData.contact.password.length < 8) {
      sweetAlert.error('Error', 'La contraseña debe tener al menos 8 caracteres');
      return;
    }

    try {
      const dataToSend = { ...formData };
      if (editingTenant && !dataToSend.contact.password) {
        delete dataToSend.contact.password;
      }

      if (editingTenant) {
        await tenantsApi.update(editingTenant._id, dataToSend);
        sweetAlert.success('Tenant actualizado', 'Los cambios se han guardado correctamente');
      } else {
        await tenantsApi.create(dataToSend);
        sweetAlert.success('Tenant creado', 'El tenant se ha creado correctamente');
      }
      closeModal();
      fetchTenants({ silent: true });
    } catch (error: any) {
      const message = error.response?.data?.error || 'Error al guardar el tenant';
      sweetAlert.error('Error', message);
    }
  };

  const handleDelete = async (tenant: Tenant) => {
    const result = await sweetAlert.confirm('¿Eliminar tenant?', `¿Estás seguro de que quieres eliminar el tenant "${tenant.name}"?`);
    if (result.isConfirmed) {
      try {
        await tenantsApi.delete(tenant._id);
        sweetAlert.success('Tenant eliminado', 'El tenant ha sido eliminado correctamente');
        fetchTenants({ silent: true });
      } catch (error: any) {
        const message = error.response?.data?.error || 'Error al eliminar el tenant';
        sweetAlert.error('Error', message);
      }
    }
  };

  return (
    <PageLayout
      title="Tenants"
      itemCount={tenants.length}
      faIcon={{ icon: faBuilding }}
      subtitle="Gestiona tenants y sus configuraciones"
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
        canManage ? (
          <button onClick={openCreate} title="Nuevo tenant" aria-label="Nuevo tenant" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            <FontAwesomeIcon icon={faPlus} />
          </button>
        ) : undefined
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por nombre..."
          /*           filters={[
            {
              value: filterStatus,
              onChange: (v) => setFilterStatus(v as "all" | "active" | "inactive"),
              options: [
                { value: "all", label: "Todos" },
                { value: "active", label: "Activos" },
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
      // Ver (solo lectura)
      viewModal={{
        isOpen: viewOpen,
        onClose: closeView,
        title: viewTenant?.name || 'Tenant',
        subtitle: viewTenant?.slug,
        size: 'lg',
        actions: [
          ...(canManage && !(viewTenant as any)?.isSystem
            ? [
                {
                  label: 'Editar',
                  onClick: () => {
                    if (viewTenant) openEdit(viewTenant);
                    closeView();
                  },
                  variant: 'secondary',
                } as const,
              ]
            : []),
          {
            label: 'Cerrar',
            onClick: closeView,
            variant: 'ghost',
          },
        ],
        content: viewTenant ? (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${viewTenant.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300'}`}>{viewTenant.isActive ? 'Activo' : 'Inactivo'}</span>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Información General</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Slug</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{viewTenant.slug}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Dominio</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{viewTenant.domain || '—'}</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Empresa</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Razón Social</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{viewTenant.company.legalName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Tax ID</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{viewTenant.company.taxId || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Industria</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{viewTenant.company.industry || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sitio Web</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{viewTenant.company.website || '—'}</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Contacto</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Nombre</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {viewTenant.contact.firstName} {viewTenant.contact.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{viewTenant.contact.email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Teléfono</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{viewTenant.contact.phone || '—'}</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Suscripción</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Plan</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 uppercase">{viewTenant.subscription.plan}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Estado</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 uppercase">{viewTenant.subscription.status}</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Uso de Recursos</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Usuarios</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {viewTenant.usage.users.current} / {viewTenant.usage.users.limit}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Clientes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {viewTenant.usage.clients.current} / {viewTenant.usage.clients.limit}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Campañas</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {viewTenant.usage.campaigns.current} / {viewTenant.usage.campaigns.limit}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Storage</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {viewTenant.usage.storage.usedMB} MB / {viewTenant.usage.storage.limitMB} MB
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null,
      }}
      // Crear/Editar
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: editingTenant ? 'Editar Tenant' : 'Nuevo Tenant',
        subtitle: 'Define la configuración del tenant',
        size: 'xl',
        actions: [
          {
            label: editingTenant ? 'Actualizar' : 'Crear',
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>('#tenant-form');
              form?.requestSubmit();
            },
            variant: 'primary',
          },
          {
            label: 'Cancelar',
            onClick: closeModal,
            variant: 'ghost',
          },
        ],
        content: (
          <form id="tenant-form" onSubmit={handleSubmit}>
            <div className="space-y-6">
              {/* Info básica */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Información</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                    <input type="text" required value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} className="input-field" placeholder="Mi Organización" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Slug *</label>
                    <input type="text" required value={formData.slug} onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} className="input-field\" placeholder="mi-organizacion" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Dominio</label>
                    <input type="text" value={formData.domain || ''} onChange={(e) => setFormData((prev) => ({ ...prev, domain: e.target.value }))} className="input-field" placeholder="miorganizacion.com" />
                  </div>
                </div>
              </div>

              {/* Empresa */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Empresa</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Razón Social *</label>
                    <input type="text" required value={formData.company.legalName} onChange={(e) => setFormData((prev) => ({ ...prev, company: { ...prev.company, legalName: e.target.value } }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tax ID</label>
                    <input type="text" value={formData.company.taxId || ''} onChange={(e) => setFormData((prev) => ({ ...prev, company: { ...prev.company, taxId: e.target.value } }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Industria</label>
                    <input type="text" value={formData.company.industry || ''} onChange={(e) => setFormData((prev) => ({ ...prev, company: { ...prev.company, industry: e.target.value } }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sitio Web</label>
                    <input type="text" value={formData.company.website || ''} onChange={(e) => setFormData((prev) => ({ ...prev, company: { ...prev.company, website: e.target.value } }))} className="input-field" placeholder="https://..." />
                  </div>
                </div>
              </div>

              {/* Contacto */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Contacto</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                    <input type="text" required value={formData.contact.firstName} onChange={(e) => setFormData((prev) => ({ ...prev, contact: { ...prev.contact, firstName: e.target.value } }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Apellido *</label>
                    <input type="text" required value={formData.contact.lastName} onChange={(e) => setFormData((prev) => ({ ...prev, contact: { ...prev.contact, lastName: e.target.value } }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email *</label>
                    <input type="email" required value={formData.contact.email} onChange={(e) => setFormData((prev) => ({ ...prev, contact: { ...prev.contact, email: e.target.value } }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Teléfono</label>
                    <input type="text" value={formData.contact.phone || ''} onChange={(e) => setFormData((prev) => ({ ...prev, contact: { ...prev.contact, phone: e.target.value } }))} className="input-field" />
                  </div>
                </div>
              </div>

              {/* Contraseña */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Contraseña del Usuario Administrador {editingTenant && <span className="text-xs font-normal text-gray-500">(Dejar vacío para mantener la contraseña actual)</span>}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contraseña {!editingTenant && <span className="text-red-500">*</span>}</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required={!editingTenant}
                        value={formData.contact.password || ''}
                        onChange={(e) => {
                          const pwd = e.target.value;
                          setFormData((prev) => ({ ...prev, contact: { ...prev.contact, password: pwd } }));

                          let strength = 0;
                          if (pwd.length >= 8) strength++;
                          if (pwd.length >= 12) strength++;
                          if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++;
                          if (/\d/.test(pwd)) strength++;
                          if (/[^a-zA-Z0-9]/.test(pwd)) strength++;
                          setPasswordStrength(strength);
                        }}
                        className="input-field pr-10"
                        placeholder="Mínimo 8 caracteres"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {formData.contact.password && (
                      <div className="mt-2">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((level) => (
                            <div key={level} className={`h-1 flex-1 rounded ${level <= passwordStrength ? (passwordStrength <= 2 ? 'bg-red-500' : passwordStrength <= 3 ? 'bg-blue-500' : 'bg-blue-500') : 'bg-gray-300 dark:bg-gray-600'}`} />
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {passwordStrength <= 2 && 'Contraseña débil'}
                          {passwordStrength === 3 && 'Contraseña media'}
                          {passwordStrength === 4 && 'Contraseña fuerte'}
                          {passwordStrength === 5 && 'Contraseña muy fuerte'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Confirmar Contraseña {!editingTenant && <span className="text-red-500">*</span>}</label>
                    <input type={showPassword ? 'text' : 'password'} required={!editingTenant} value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} className={`input-field ${passwordConfirm && formData.contact.password !== passwordConfirm ? 'border-red-500 focus:ring-red-500' : ''}`} placeholder="Confirmar contraseña" />
                    {passwordConfirm && formData.contact.password !== passwordConfirm && <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>}
                  </div>
                </div>
                {!editingTenant && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Esta contraseña será utilizada por el usuario administrador del tenant para iniciar sesión.</p>}
              </div>

              {/* Settings */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Configuración</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Zona Horaria</label>
                    <input type="text" value={formData.settings?.timezone} onChange={(e) => setFormData((prev) => ({ ...prev, settings: { ...prev.settings!, timezone: e.target.value } }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Moneda</label>
                    <input type="text" value={formData.settings?.currency} onChange={(e) => setFormData((prev) => ({ ...prev, settings: { ...prev.settings!, currency: e.target.value } }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Idioma</label>
                    <input type="text" value={formData.settings?.language} onChange={(e) => setFormData((prev) => ({ ...prev, settings: { ...prev.settings!, language: e.target.value } }))} className="input-field" />
                  </div>
                </div>
              </div>

              {/* Subscription */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Suscripción</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Plan</label>
                    <select value={formData.subscription?.plan} onChange={(e) => setFormData((prev) => ({ ...prev, subscription: { ...prev.subscription!, plan: e.target.value as 'free' | 'basic' | 'pro' | 'enterprise' } }))} className="input-field">
                      <option value="free">Free</option>
                      <option value="basic">Basic</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
                    <select value={formData.subscription?.status} onChange={(e) => setFormData((prev) => ({ ...prev, subscription: { ...prev.subscription!, status: e.target.value as 'active' | 'suspended' | 'cancelled' } }))} className="input-field">
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="flex items-center space-x-2">
                  <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tenant activo</span>
                </label>
              </div>
            </div>
          </form>
        ),
      }}
    >
      {/* Loading state */}
      {initialLoading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando tenants..." />
        </div>
      ) : (
        <>
          {/* Grid de tenants */}
          <div className="relative">
            {/* Indicador sutil de búsqueda en curso (no bloquea) */}
            {isFetching && <div className="absolute -top-6 right-0 text-xs text-gray-500 dark:text-gray-400">Buscando…</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
              {tenants.map((tenant) => (
                <Card
                  key={tenant._id}
                  onClick={() => openView(tenant)}
                  className="hover:scale-105 hover:shadow-lg transition-all duration-200"
                  header={{
                    title: tenant.name,
                    subtitle: tenant.slug,
                    icon: faBuilding,
                    badges: [],
                  }}
                  footer={
                    canManage
                      ? {
                          leftContent: <span className="text-xs text-gray-500 dark:text-gray-500">{tenant.usage.users.current} usuarios</span>,
                          actions: (tenant as any).isSystem
                            ? [
                                {
                                  icon: faLock,
                                  onClick: (e) => {
                                    e.stopPropagation();
                                    sweetAlert.info('Tenant Protegido', 'Este tenant del sistema no puede ser editado ni eliminado');
                                  },
                                  title: 'Protegido',
                                  variant: 'default',
                                },
                              ]
                            : [
                                {
                                  icon: faEdit,
                                  onClick: (e) => {
                                    e.stopPropagation();
                                    openEdit(tenant);
                                  },
                                  title: 'Editar',
                                  variant: 'default',
                                },
                                {
                                  icon: faTrash,
                                  onClick: (e) => {
                                    e.stopPropagation();
                                    handleDelete(tenant);
                                  },
                                  title: 'Eliminar',
                                  variant: 'default',
                                },
                              ],
                        }
                      : undefined
                  }
                >
                  {/* Contenido de la card */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Empresa</label>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{tenant.company.legalName}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Contacto</label>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {tenant.contact.firstName} {tenant.contact.lastName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500">{tenant.contact.email}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Uso</label>
                      <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                        <span>
                          {tenant.usage.users.current}/{tenant.usage.users.limit} users
                        </span>
                        <span>•</span>
                        <span>
                          {tenant.usage.clients.current}/{tenant.usage.clients.limit} clients
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}

              {canManage && (
                <Card
                  variant="create"
                  onClick={openCreate}
                  header={{
                    title: 'Nuevo Tenant',
                    subtitle: 'Crear un nuevo tenant en la plataforma',
                    icon: faBuilding,
                  }}
                />
              )}
            </div>
          </div>

          {/* Empty state */}
          {!initialLoading && tenants.length === 0 && !isFetching && (
            <EmptyState
              icon={faBuilding}
              title={startDate || endDate ? 'No hay tenants en este rango de fechas' : 'No hay tenants'}
              description={startDate || endDate ? `No se encontraron tenants ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : 'Crea tu primer tenant para comenzar.'}
              action={
                canManage
                  ? {
                      label: 'Nuevo Tenant',
                      onClick: openCreate,
                      icon: faPlus,
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
