import React, { useState, useEffect } from 'react';
import { fuzzyMatch } from '../utils/searchHelpers';
import { useAuthStore } from '../stores/authStore';
import { levelsAPI, Level, LevelFormData as APILevelFormData } from '../api/levels';
import { positionsAPI, Position } from '../api/positions';
import { PageLayout } from '../components/ui/PageLayout';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Card } from '../components/ui/Card';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserTie, faUserGraduate, faEdit, faTrash, faPlus, faShieldHalved, faGlobe, faUserGear, faTable, faGrip, faClock, faUserShield, faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import { getHelp, hasHelp } from '../data/help/helpContent';
import { useNavigate } from 'react-router-dom';

const HELP_KEY = 'levels' as const;

interface LevelFormData {
  name: string;
  description: string;
  type: 'general' | 'position-specific';
  positionId: string;
}

export const LevelsPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  const [levels, setLevels] = useState<Level[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [formData, setFormData] = useState<LevelFormData>({
    name: '',
    description: '',
    type: 'general',
    positionId: '',
  });

  const [viewOpen, setViewOpen] = useState(false);
  const [viewLevel, setViewLevel] = useState<Level | null>(null);

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
      const saved = localStorage.getItem('levelsViewMode');
      if (saved === 'table' || saved === 'cards') {
        setViewMode(saved as 'table' | 'cards');
      }
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) {
      localStorage.setItem('levelsViewMode', viewMode);
    }
  }, [viewMode, isLarge]);

  const [openInfo, setOpenInfo] = useState(false);
  const helpEntry = getHelp(HELP_KEY);

  const canManage = hasPermission('admin_levels:view');

  useEffect(() => {
    fetchLevels();
    fetchPositions();
  }, []);

  const fetchLevels = async () => {
    try {
      setLoading(true);
      const response = await levelsAPI.list({});
      setLevels(response.levels);
    } catch (error) {
      console.error('Error fetching levels:', error);
      sweetAlert.error('Error', 'No se pudieron cargar los niveles');
    } finally {
      setLoading(false);
    }
  };

  const fetchPositions = async () => {
    try {
      const response = await positionsAPI.list({ limit: 100 });
      setPositions(response.positions);
    } catch (error) {
      console.error('Error fetching positions:', error);
    }
  };

  const openCreate = () => {
    setEditingLevel(null);
    setFormData({
      name: '',
      description: '',
      type: 'general',
      positionId: '',
    });
    setShowModal(true);
  };

  const openEdit = (level: Level) => {
    setEditingLevel(level);
    setFormData({
      name: level.name,
      description: level.description || '',
      type: level.type,
      positionId: typeof level.positionId === 'object' && level.positionId ? level.positionId._id : (level.positionId as string) || '',
    });
    setShowModal(true);
  };

  const openView = (level: Level) => {
    setViewLevel(level);
    setViewOpen(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingLevel(null);
  };

  const closeView = () => {
    setViewOpen(false);
    setViewLevel(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.type === 'position-specific' && !formData.positionId) {
      sweetAlert.error('Error', 'Debes seleccionar un cargo para niveles específicos');
      return;
    }

    try {
      if (editingLevel) {
        const updateData: Partial<APILevelFormData> = {
          name: formData.name,
          description: formData.description,
        };
        await levelsAPI.update(editingLevel._id, updateData);
        sweetAlert.success('Nivel actualizado', 'Los cambios se han guardado correctamente');
      } else {
        const createData: APILevelFormData = {
          name: formData.name,
          description: formData.description,
          type: formData.type,
          positionId: formData.type === 'position-specific' ? formData.positionId : undefined,
        };
        await levelsAPI.create(createData);
        sweetAlert.success('Nivel creado', 'El nivel se ha creado correctamente');
      }
      closeModal();
      fetchLevels();
    } catch (error: any) {
      const message = error.response?.data?.error || 'Error al guardar el nivel';
      sweetAlert.error('Error', message);
    }
  };

  const handleDelete = async (level: Level) => {
    const result = await sweetAlert.confirm('¿Eliminar nivel?', `¿Estás seguro de que quieres eliminar el nivel "${level.name}"?`);
    if (result.isConfirmed) {
      try {
        await levelsAPI.remove(level._id);
        sweetAlert.success('Nivel eliminado', 'El nivel ha sido eliminado correctamente');
        fetchLevels();
      } catch (error: any) {
        const message = error.response?.data?.error || 'Error al eliminar el nivel';
        sweetAlert.error('Error', message);
      }
    }
  };

  const filteredLevels = levels.filter((l) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = q.length === 0 || fuzzyMatch(l.name, q) || fuzzyMatch(l.description || '', q);

    let matchesDate = true;
    if (startDate || endDate) {
      const createdAt = l.createdAt ? new Date(l.createdAt).getTime() : 0;
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
      title="Niveles"
      itemCount={filteredLevels.length}
      subtitle="Gestiona los niveles de experiencia de la organización"
      faIcon={{ icon: faUserGraduate }}
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
        <div className="flex items-center gap-3">
          {canManage && (
            <button onClick={openCreate} title="Nuevo nivel" aria-label="Nuevo nivel" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
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
          <button onClick={() => navigate('/areas')} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Áreas</span>
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
              searchPlaceholder="Buscar niveles..."
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
        title: viewLevel ? viewLevel.name : 'Nivel',
        subtitle: viewLevel?.description,
        size: 'md',
        actions: [
          ...(canManage
            ? [
                {
                  label: 'Editar nivel',
                  onClick: () => {
                    if (viewLevel) openEdit(viewLevel);
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
        content: viewLevel ? (
          <div className="space-y-4">
            {/* Tenant Badge */}
            {viewLevel.tenant?.name && (
              <div>
                <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">{viewLevel.tenant.name}</span>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Tipo</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {viewLevel.type === 'general' ? (
                  <span className="inline-flex items-center gap-2">
                    <FontAwesomeIcon icon={faGlobe} className="text-blue-600" />
                    General (disponible para todos los cargos)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <FontAwesomeIcon icon={faUserTie} className="text-blue-600" />
                    Específico de cargo: {typeof viewLevel.positionId === 'object' && viewLevel.positionId ? viewLevel.positionId.name : '—'}
                  </span>
                )}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Descripción</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{viewLevel.description || '—'}</p>
            </div>
          </div>
        ) : null,
      }}
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: editingLevel ? 'Editar Nivel' : 'Nuevo Nivel',
        subtitle: 'Define nombre y descripción',
        size: 'md',
        actions: [
          {
            label: editingLevel ? 'Actualizar' : 'Crear',
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>('#level-form');
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
          <form id="level-form" onSubmit={handleSubmit}>
            <div className="space-y-6">
              {!editingLevel && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de Nivel *</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        value="general"
                        checked={formData.type === 'general'}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            type: e.target.value as 'general' | 'position-specific',
                            positionId: '',
                          }))
                        }
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <FontAwesomeIcon icon={faGlobe} className="text-blue-600" />
                        General
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        value="position-specific"
                        checked={formData.type === 'position-specific'}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            type: e.target.value as 'general' | 'position-specific',
                          }))
                        }
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <FontAwesomeIcon icon={faUserTie} className="text-blue-600" />
                        Específico de Cargo
                      </span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formData.type === 'general' ? 'Este nivel estará disponible para todos los cargos' : 'Este nivel solo estará disponible para el cargo seleccionado'}</p>
                </div>
              )}

              {editingLevel && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Nota:</strong> El tipo y cargo de un nivel no pueden modificarse una vez creado.
                  </p>
                </div>
              )}

              {!editingLevel && formData.type === 'position-specific' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cargo *</label>
                  <select
                    required
                    value={formData.positionId}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        positionId: e.target.value,
                      }))
                    }
                    className="input-field"
                  >
                    <option value="">Seleccionar cargo...</option>
                    {positions.map((position) => (
                      <option key={position._id} value={position._id}>
                        {position.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="input-field"
                  placeholder="Nombre del nivel"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                  className="input-field resize-none"
                  placeholder="Descripción del nivel"
                />
              </div>
            </div>
          </form>
        ),
      }}
    >
      {/* Loading state */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando niveles..." />
        </div>
      ) : (
        <>
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
              {filteredLevels.map((level) => (
                <Card
                  key={level._id}
                  onClick={() => openView(level)}
                  className="hover:scale-105 hover:shadow-lg transition-all duration-200"
                  header={{
                    title: level.name,
                    subtitle: level.description,
                    icon: level.type === 'general' ? faGlobe : faUserGraduate,
                    badges: [
                      ...(level.type === 'general' ? [{ text: 'General', variant: 'blue' as const }] : []),
                      ...(level.tenant && level.tenant.name
                        ? [
                            {
                              text: level.tenant.name,
                              variant: 'default' as const,
                              className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                            },
                          ]
                        : []),
                    ],
                  }}
                  footer={
                    canManage
                      ? {
                          leftContent: <span className="text-xs text-gray-500 dark:text-gray-500">{level.createdAt ? new Date(level.createdAt).toLocaleDateString() : ''}</span>,
                          actions: [
                            {
                              icon: faEdit,
                              onClick: (e) => {
                                e.stopPropagation();
                                openEdit(level);
                              },
                              title: 'Editar',
                              variant: 'default',
                            },
                            {
                              icon: faTrash,
                              onClick: (e) => {
                                e.stopPropagation();
                                handleDelete(level);
                              },
                              title: 'Eliminar',
                              variant: 'default',
                            },
                          ],
                        }
                      : undefined
                  }
                >
                  {/* 🚀 NUEVO BLOQUE INTERNO — Igual a Usuarios */}
                  {level.type === 'position-specific' && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                        <FontAwesomeIcon icon={faUserTie} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
                        Cargo
                      </label>

                      {typeof level.positionId === 'object' && level.positionId?.name ? (
                        <div className="flex flex-wrap gap-1">
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">{level.positionId.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-gray-500">Sin cargo asignado</span>
                      )}
                    </div>
                  )}
                </Card>
              ))}
              {canManage && (
                <Card
                  variant="create"
                  onClick={openCreate}
                  header={{
                    title: 'Nuevo Nivel',
                    subtitle: 'Crear un nuevo nivel de experiencia',
                    icon: faUserGraduate,
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
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cargo</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descripción</th>
                      {canManage && <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {filteredLevels.map((level) => (
                      <tr key={level._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group cursor-pointer" onClick={() => openView(level)}>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{level.name}</span>
                            {level.tenant && level.tenant.name && <span className="text-[10px] text-gray-500">{level.tenant.name}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {level.type === 'general' ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/20 text-xs font-medium text-blue-700 dark:text-blue-300">
                              <FontAwesomeIcon icon={faGlobe} className="h-3 w-3" />
                              General
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-purple-50 dark:bg-purple-900/20 text-xs font-medium text-purple-700 dark:text-purple-300">
                              <FontAwesomeIcon icon={faUserTie} className="h-3 w-3" />
                              Específico
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">{level.type === 'position-specific' && typeof level.positionId === 'object' && level.positionId?.name ? <span className="text-sm text-gray-700 dark:text-gray-300">{level.positionId.name}</span> : <span className="text-xs text-gray-400">—</span>}</td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{level.description || '—'}</span>
                        </td>
                        {canManage && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(level);
                                }}
                                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                title="Editar"
                              >
                                <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(level);
                                }}
                                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                title="Eliminar"
                              >
                                <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                              </button>
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

          {!loading && filteredLevels.length === 0 && (
            <EmptyState
              icon={faShieldHalved}
              title={startDate || endDate ? 'No hay niveles en este rango de fechas' : 'No hay niveles'}
              description={startDate || endDate ? `No se encontraron niveles ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : 'Crea tu primer nivel para comenzar.'}
              action={
                canManage
                  ? {
                      label: 'Nuevo Nivel',
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
