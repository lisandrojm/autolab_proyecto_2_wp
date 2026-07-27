import React, { useEffect, useState, useMemo } from 'react';
import { roleFrameAPI, RoleFrameItem } from '../api/roleFrames';
import { categoriaSatAPI, CategoriaSatItem } from '../api/categoriasSat';
import { PageLayout } from '../components/ui/PageLayout';
import { getHelp, hasHelp } from '../data/help/helpContent';
import { Card } from '../components/ui/Card';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';
import { faUserShield, faLayerGroup, faTable, faGrip, faPlus, faEdit, faTrash, faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Modal } from '../components/ui/Modal';
import { sweetAlert } from '../utils/sweetAlert';

export const RolesFramePage: React.FC = () => {
  const HELP_KEY = 'funcionesFrame' as const;
  const helpEntry = getHelp(HELP_KEY);
  const [showInfo, setShowInfo] = useState(false);
  const [roles, setRoles] = useState<RoleFrameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleFrameItem | null>(null);
  const [allCategories, setAllCategories] = useState<CategoriaSatItem[]>([]);

  // CRUD Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleFrameItem | null>(null);
  const [formName, setFormName] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [catSearch, setCatSearch] = useState('');

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
      const saved = localStorage.getItem('rolesFrameViewMode');
      if (saved === 'table' || saved === 'cards') {
        setViewMode(saved as 'table' | 'cards');
      }
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) {
      localStorage.setItem('rolesFrameViewMode', viewMode);
    }
  }, [viewMode, isLarge]);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const data = await roleFrameAPI.list();
      setRoles(data);
    } catch (error) {
      console.error('Error fetching role frames:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await categoriaSatAPI.list();
      setAllCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  useEffect(() => {
    fetchRoles();
    fetchCategories();
  }, []);

  const filteredRoles = useMemo(() => {
    if (!searchTerm) return roles;
    const lowerSearch = searchTerm.toLowerCase();
    return roles.filter((r) => r.name.toLowerCase().includes(lowerSearch) || r.externalId.toLowerCase().includes(lowerSearch));
  }, [roles, searchTerm]);

  const getCategoryNumbersStr = (role: RoleFrameItem) => {
    return (
      role.data?.categoriasSat
        ?.map((c: any) => c.numeroCategoria ?? c.id)
        .filter((num: any) => num !== undefined && num !== null)
        .sort((a: number, b: number) => a - b)
        .join(', ') || ''
    );
  };

  const openCreate = () => {
    setEditingRole(null);
    setFormName('');
    setSelectedCategoryIds([]);
    setCatSearch('');
    setShowModal(true);
  };

  const openEdit = (role: RoleFrameItem) => {
    setEditingRole(role);
    setFormName(role.name);

    // Resolve associated category _ids from the loaded list
    const associatedNames = role.data?.categoriasSat?.map((c: any) => c.nombre || c.name) || [];
    const associatedNums = role.data?.categoriasSat?.map((c: any) => c.numeroCategoria) || [];

    const ids = allCategories
      .filter((cat) => {
        const catName = cat.data?.nombre || cat.name;
        const catNum = cat.data?.numeroCategoria;
        return associatedNames.includes(catName) || associatedNums.includes(catNum);
      })
      .map((cat) => cat._id);

    setSelectedCategoryIds(ids);
    setCatSearch('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      sweetAlert.error('Error', 'El nombre es obligatorio');
      return;
    }
    try {
      const payload = {
        name: formName.trim(),
        categoryIds: selectedCategoryIds,
      };

      if (editingRole) {
        await roleFrameAPI.update(editingRole._id, payload);
        sweetAlert.success('Función actualizada', 'La función se ha modificado correctamente');
      } else {
        await roleFrameAPI.create(payload);
        sweetAlert.success('Función creada', 'La función se ha creado correctamente');
      }
      setShowModal(false);
      fetchRoles();
    } catch (error: any) {
      const message = error.response?.data?.error || 'Error al guardar la función';
      sweetAlert.error('Error', message);
    }
  };

  const handleDelete = async (role: RoleFrameItem) => {
    const result = await sweetAlert.confirm('¿Eliminar función?', `¿Estás seguro de que quieres eliminar la función "${role.name}"?`);
    if (result.isConfirmed) {
      try {
        await roleFrameAPI.remove(role._id);
        sweetAlert.success('Función eliminada', 'La función ha sido eliminada correctamente');
        fetchRoles();
      } catch (error: any) {
        const message = error.response?.data?.error || 'Error al eliminar la función';
        sweetAlert.error('Error', message);
      }
    }
  };

  const filteredCatsForSelect = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    if (!q) return allCategories;
    return allCategories.filter((cat) => {
      const catName = cat.data?.nombre || cat.name || '';
      const catNum = String(cat.data?.numeroCategoria || '');
      return catName.toLowerCase().includes(q) || catNum.includes(q);
    });
  }, [allCategories, catSearch]);

  return (
    <PageLayout
      title="Funciones FRAME"
      subtitle="Todos los roles externos del sistema y su asociación con categorías SAT"
      shouldShowInfo={hasHelp(HELP_KEY)}
      infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: helpEntry.title, size: helpEntry.size, content: helpEntry.content }}
      itemCount={filteredRoles.length}
      faIcon={{ icon: faUserShield }}
      headerActions={
        <button onClick={openCreate} aria-label="Nueva función" title="Nueva función" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          <FontAwesomeIcon icon={faPlus} />
        </button>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por nombre o ID externo..." />
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
    >
      {loading ? (
        <LoadingSpinner message="Cargando funciones..." />
      ) : filteredRoles.length === 0 ? (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faUserShield} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No se encontraron funciones</h3>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {filteredRoles.map((role) => (
            <Card
              key={role._id}
              onClick={() => setSelectedRole(role)}
              className="hover:scale-[1.03] hover:shadow-lg transition-all duration-200 cursor-pointer"
              header={{
                title: role.name,
                subtitle: `Categorías: ${getCategoryNumbersStr(role) || 'Ninguna'}`,
                icon: faUserShield,
                actions: [
                  {
                    icon: faEdit,
                    title: 'Editar',
                    variant: 'blue',
                    onClick: () => openEdit(role),
                  },
                  {
                    icon: faTrash,
                    title: 'Eliminar',
                    variant: 'danger',
                    onClick: () => handleDelete(role),
                  },
                ],
              }}
              footer={{
                leftContent: (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                    <FontAwesomeIcon icon={faLayerGroup} />
                    <span>{role.data?.categoriasSat?.length || 0} Categorías SAT</span>
                  </div>
                ),
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID Externo</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Categorías SAT</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {filteredRoles.map((role) => (
                  <tr key={role._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group cursor-pointer" onClick={() => setSelectedRole(role)}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center shrink-0">
                          <FontAwesomeIcon icon={faUserShield} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{role.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">{role.externalId}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faLayerGroup} className="text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">{getCategoryNumbersStr(role) ? `Categorías: ${getCategoryNumbersStr(role)}` : 'Ninguna'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(role)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Editar">
                          <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(role)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" title="Eliminar">
                          <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedRole && (
        <Modal isOpen={!!selectedRole} onClose={() => setSelectedRole(null)} title={selectedRole.name} subtitle="Información detallada de la función" size="lg">
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nombre</label>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedRole.name}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ID Externo</label>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedRole.externalId}</p>
              </div>
            </div>

            {selectedRole.data?.categoriasSat?.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faLayerGroup} className="text-primary-500" />
                  Categorías SAT Asociadas
                </h4>
                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Nombre</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Bruto</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Neto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {selectedRole.data.categoriasSat.map((cat: any) => (
                        <tr key={cat.id || cat.numeroCategoria} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300 font-medium">{cat.nombre}</td>
                          <td className="px-4 py-2 text-xs text-right text-gray-700 dark:text-gray-300 font-mono">${cat.sueldoBruto?.toLocaleString()}</td>
                          <td className="px-4 py-2 text-xs text-right text-gray-700 dark:text-gray-300 font-mono">${cat.neto?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showModal && (
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editingRole ? 'Editar Función FRAME' : 'Nueva Función FRAME'}
          subtitle={editingRole ? 'Modifica los datos de la función' : 'Agrega una nueva función y asocia categorías SAT'}
          size="lg"
          actions={[
            {
              label: editingRole ? 'Actualizar' : 'Crear',
              onClick: () => {
                const form = document.querySelector<HTMLFormElement>('#role-frame-form');
                form?.requestSubmit();
              },
              variant: 'primary',
            },
            {
              label: 'Cancelar',
              onClick: () => setShowModal(false),
              variant: 'ghost',
            },
          ]}
        >
          <form id="role-frame-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre de la Función *</label>
              <input type="text" required value={formName} onChange={(e) => setFormName(e.target.value)} className="input-field w-full px-3 py-2 border rounded bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100" placeholder="Ej: Motion Graphic" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Categorías SAT *</label>
              <div className="relative mb-2">
                <input type="text" value={catSearch} onChange={(e) => setCatSearch(e.target.value)} className="input-field w-full pl-9 pr-8 py-2 border rounded bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100" placeholder="Buscar categorías por nombre o número..." />
                <div className="absolute inset-y-0 left-0 left-3 pl-3 flex items-center pointer-events-none text-gray-400">
                  <FontAwesomeIcon icon={faSearch} className="h-4 w-4" />
                </div>
                {catSearch && (
                  <button type="button" onClick={() => setCatSearch('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <FontAwesomeIcon icon={faTimes} className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-h-60 overflow-y-auto space-y-2 bg-gray-50 dark:bg-gray-900/50">
                {filteredCatsForSelect.length === 0 ? (
                  <p className="text-sm text-gray-500 italic p-2">No se encontraron categorías</p>
                ) : (
                  filteredCatsForSelect.map((cat) => {
                    const isChecked = selectedCategoryIds.includes(cat._id);
                    return (
                      <label key={cat._id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-1.5 rounded transition-colors select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedCategoryIds(selectedCategoryIds.filter((id) => id !== cat._id));
                            } else {
                              setSelectedCategoryIds([...selectedCategoryIds, cat._id]);
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Cat. {cat.data?.numeroCategoria} - {cat.data?.nombre || cat.name}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </form>
        </Modal>
      )}
    </PageLayout>
  );
};
