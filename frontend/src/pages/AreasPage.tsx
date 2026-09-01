import React, { useState, useEffect } from 'react';
import { fuzzyMatch } from '../utils/searchHelpers';
import { useAuthStore } from '../stores/authStore';
import { areasAPI, Area } from '../api/areas';
import { PageLayout } from '../components/ui/PageLayout';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Card } from '../components/ui/Card';
import { sweetAlert } from '../utils/sweetAlert';
import { getHelp, hasHelp } from '../data/help/helpContent';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTrash, faPlus, faShieldHalved, faLayerGroup, faUserTie, faUserGraduate, faUserGear, faTable, faGrip, faClock, faUserShield, faLock } from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';

// const HELP_KEY = "areas" as const; // TODO: Add help content if needed

interface AreaFormData {
  name: string;
  description: string;
}

export const AreasPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  const helpEntry = getHelp('areas');
  const [showInfo, setShowInfo] = useState(false);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [formData, setFormData] = useState<AreaFormData>({
    name: '',
    description: '',
  });

  const [viewOpen, setViewOpen] = useState(false);
  const [viewArea, setViewArea] = useState<Area | null>(null);

  // View Mode Logic
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) {
        setViewMode('cards');
      }
    };

    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem('areasViewMode');
      if (saved === 'table' || saved === 'cards') {
        setViewMode(saved as 'table' | 'cards');
      }
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) {
      localStorage.setItem('areasViewMode', viewMode);
    }
  }, [viewMode, isLarge]);

  // const [openInfo, setOpenInfo] = useState(false);
  // const helpEntry = getHelp(HELP_KEY);

  const canManage = hasPermission('admin_areas:view'); // Assuming same permission as users/positions for now

  useEffect(() => {
    fetchAreas();
  }, []);

  const fetchAreas = async () => {
    try {
      setLoading(true);
      const response = await areasAPI.list({});
      setAreas(response.areas);
    } catch (error) {
      console.error('Error fetching areas:', error);
      sweetAlert.error('Error', 'No se pudieron cargar las áreas');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingArea(null);
    setFormData({
      name: '',
      description: '',
    });
    setShowModal(true);
  };

  const openEdit = (area: Area) => {
    setEditingArea(area);
    setFormData({
      name: area.name,
      description: area.description || '',
    });
    setShowModal(true);
  };

  const openView = (area: Area) => {
    setViewArea(area);
    setViewOpen(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingArea(null);
  };

  const closeView = () => {
    setViewOpen(false);
    setViewArea(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingArea) {
        await areasAPI.update(editingArea._id, formData);
        sweetAlert.success('Área actualizada', 'Los cambios se han guardado correctamente');
      } else {
        await areasAPI.create(formData);
        sweetAlert.success('Área creada', 'El área se ha creado correctamente');
      }
      closeModal();
      fetchAreas();
    } catch (error: any) {
      const message = error.response?.data?.error || 'Error al guardar el área';
      sweetAlert.error('Error', message);
    }
  };

  const handleDelete = async (area: Area) => {
    const result = await sweetAlert.confirm('¿Eliminar área?', `¿Estás seguro de que quieres eliminar el área "${area.name}"?`);
    if (result.isConfirmed) {
      try {
        await areasAPI.remove(area._id);
        sweetAlert.success('Área eliminada', 'El área ha sido eliminada correctamente');
        fetchAreas();
      } catch (error: any) {
        const message = error.response?.data?.error || 'Error al eliminar el área';
        sweetAlert.error('Error', message);
      }
    }
  };

  const filteredAreas = areas.filter((a) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = q.length === 0 || fuzzyMatch(a.name, q) || fuzzyMatch(a.description || '', q);

    let matchesDate = true;
    if (startDate || endDate) {
      const createdAt = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      if (startDate) {
        const start = new Date(startDate).getTime();
        matchesDate = matchesDate && createdAt >= start;
      }
      if (endDate) {
        const end = new Date(endDate).setHours(23, 59, 59, 999);
        matchesDate = matchesDate && createdAt <= end;
      }
    }

    return matchesSearch && matchesDate;
  });

  return (
    <PageLayout
      title="Áreas"
      itemCount={filteredAreas.length}
      subtitle="Gestiona las áreas de la organización"
      faIcon={{ icon: faLayerGroup }}
      shouldShowInfo={hasHelp('areas')}
      infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: helpEntry.title, size: helpEntry.size, content: helpEntry.content }}
      headerActions={
        <div className="flex items-center gap-3">
          {canManage && (
            <button onClick={openCreate} title="Nueva área" aria-label="Nueva área" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              <FontAwesomeIcon icon={faPlus} />
            </button>
          )}
          <button onClick={() => navigate('/users')} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserGear} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Usuarios</span>
          </button>
          <button onClick={() => navigate('/positions')} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserTie} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Cargos</span>
          </button>
          <button onClick={() => navigate('/levels')} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserGraduate} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Niveles</span>
          </button>
          <button onClick={() => navigate('/shifts')} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faClock} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Turnos</span>
          </button>
          <button onClick={() => navigate('/roles')} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserShield} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Roles</span>
          </button>
        </div>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar áreas..."
              dateFilter={{
                startDate,
                endDate,
                onStartDateChange: setStartDate,
                onEndDateChange: setEndDate,
              }}
            />
          </div>
          {isLarge && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setViewMode('cards')} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'cards' ? 'bg-blue-500 text-white shadow-sm border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Vista de tarjetas">
                <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('table')} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'table' ? 'bg-blue-500 text-white shadow-sm border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Vista de tabla">
                <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      }
      viewModal={{
        isOpen: viewOpen,
        onClose: closeView,
        title: viewArea ? viewArea.name : 'Área',
        subtitle: viewArea?.description,
        size: 'md',
        actions: [
          ...(canManage
            ? [
                {
                  label: 'Editar área',
                  onClick: () => {
                    if (viewArea) openEdit(viewArea);
                    closeView();
                  },
                  variant: 'secondary',
                } as const,
              ]
            : []),
          {
            label: 'Cancelar',
            onClick: closeView,
            variant: 'ghost',
          },
        ],
        content: viewArea ? (
          <div className="space-y-6">
            {/* Descripción */}
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Descripción</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{viewArea.description || '—'}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Detalles</h4>
              <p className="text-xs text-gray-500">Creado el: {viewArea.createdAt ? new Date(viewArea.createdAt).toLocaleDateString() : '-'}</p>
            </div>
          </div>
        ) : null,
      }}
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: editingArea ? 'Editar Área' : 'Nueva Área',
        subtitle: 'Define nombre y descripción',
        size: 'md',
        actions: [
          {
            label: editingArea ? 'Actualizar' : 'Crear',
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>('#area-form');
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
          <form id="area-form" onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                <input type="text" required disabled={!!editingArea?.isSystem} value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} className={`input-field ${editingArea?.isSystem ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : ''}`} placeholder="Nombre del área" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                <textarea value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Descripción del área" />
              </div>

              {editingArea?.isSystem && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-lg flex items-start gap-3">
                  <FontAwesomeIcon icon={faShieldHalved} className="text-amber-600 dark:text-amber-500 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wide">Área generada por sistema</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-500 leading-tight">Esta área es esencial para el funcionamiento del sistema. No se puede eliminar y su nombre está protegido.</p>
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
          <LoadingSpinner message="Cargando áreas..." />
        </div>
      ) : (
        <>
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
              {filteredAreas.map((area) => {
                return (
                  <Card
                    key={area._id}
                    onClick={() => openView(area)}
                    className="hover:scale-105 hover:shadow-lg transition-all duration-200"
                    header={{
                      title: area.name,
                      subtitle: area.description,
                      icon: faLayerGroup,
                      badges: area.isSystem
                        ? [
                            {
                              text: 'Sistema',
                              variant: 'default' as const,
                              className: 'bg-orange-500/10 text-orange-500 border border-orange-500/50',
                            },
                          ]
                        : [],
                    }}
                    footer={
                      canManage
                        ? {
                            leftContent: <span className="text-xs text-gray-500 dark:text-gray-500">{area.createdAt ? new Date(area.createdAt).toLocaleDateString() : ''}</span>,
                            actions: [
                              {
                                icon: faEdit,
                                onClick: (e) => {
                                  e.stopPropagation();
                                  openEdit(area);
                                },
                                title: 'Editar',
                                variant: 'default',
                              },
                              ...(!area.isSystem
                                ? [
                                    {
                                      icon: faTrash,
                                      onClick: (e: any) => {
                                        e.stopPropagation();
                                        handleDelete(area);
                                      },
                                      title: 'Eliminar',
                                      variant: 'default' as const,
                                    },
                                  ]
                                : [
                                    {
                                      icon: faLock,
                                      onClick: (e: any) => {
                                        e.stopPropagation();
                                      },
                                      title: 'Área de sistema protegida',
                                      variant: 'default' as const,
                                      disabled: true,
                                    },
                                  ]),
                            ],
                          }
                        : undefined
                    }
                  />
                );
              })}
              {canManage && (
                <Card
                  variant="create"
                  onClick={openCreate}
                  header={{
                    title: 'Nueva Área',
                    subtitle: 'Crear una nueva área para la organización',
                    icon: faLayerGroup,
                  }}
                />
              )}
            </div>
          ) : (
            <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm mx-0.5 lg:mx-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descripción</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Creado</th>
                      {canManage && <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {filteredAreas.map((area) => (
                      <tr key={area._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group cursor-pointer" onClick={() => openView(area)}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center shrink-0">
                              <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{area.name}</span>
                              <div className="flex items-center gap-2">
                                {area.isSystem && <span className="text-[9px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/50 px-1.5 py-0.5 rounded uppercase tracking-wider">Sistema</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{area.description || '—'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600 dark:text-gray-400">{area.createdAt ? new Date(area.createdAt).toLocaleDateString() : '—'}</span>
                        </td>
                        {canManage && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(area);
                                }}
                                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                title="Editar"
                              >
                                <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                              </button>
                              {!area.isSystem ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(area);
                                  }}
                                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                  title="Eliminar"
                                >
                                  <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                                </button>
                              ) : (
                                <div className="p-1.5 text-gray-400" title="Área de sistema protegida">
                                  <FontAwesomeIcon icon={faLock} className="h-4 w-4" />
                                </div>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && filteredAreas.length === 0 && (
            <EmptyState
              icon={faShieldHalved}
              title={startDate || endDate ? 'No hay áreas en este rango de fechas' : 'No hay áreas'}
              description={startDate || endDate ? `No se encontraron áreas ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : 'Crea tu primera área para comenzar.'}
              action={
                canManage
                  ? {
                      label: 'Nueva Área',
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
