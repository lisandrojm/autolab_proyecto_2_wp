import React, { useEffect, useMemo, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faRocket } from '@fortawesome/free-solid-svg-icons';
import { releaseTiposAPI, ReleaseTipoItem } from '../api/releaseTipos';

const normalizar = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

interface FormState {
  name: string;
  isActive: boolean;
}

const FORM_VACIO: FormState = { name: '', isActive: true };

export const ReleaseTiposPage: React.FC = () => {
  const [tipos, setTipos] = useState<ReleaseTipoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [editando, setEditando] = useState<ReleaseTipoItem | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);

  // Vista tarjetas/tabla, como el resto de los ABM: la tabla solo en pantallas grandes.
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) setViewMode('cards');
    };
    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem('releaseTiposViewMode');
      if (saved === 'table' || saved === 'cards') setViewMode(saved as ViewMode);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) localStorage.setItem('releaseTiposViewMode', viewMode);
  }, [viewMode, isLarge]);

  const effectiveViewMode: ViewMode = isLarge ? viewMode : 'cards';

  const cargar = async () => {
    try {
      setLoading(true);
      setTipos(await releaseTiposAPI.list());
    } catch (e) {
      console.error('Error cargando tipos de release:', e);
      sweetAlert.error('Error', 'No se pudieron cargar los tipos de release.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    const q = normalizar(searchTerm);
    if (!q) return tipos;
    return tipos.filter((t) => normalizar(t.name).includes(q));
  }, [tipos, searchTerm]);

  const abrirCrear = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setShowModal(true);
  };

  const abrirEditar = (tipo: ReleaseTipoItem) => {
    setEditando(tipo);
    setForm({ name: tipo.name, isActive: tipo.isActive !== false });
    setShowModal(true);
  };

  const guardar = async () => {
    const name = form.name.trim();
    if (!name) {
      sweetAlert.error('Falta el nombre', 'El tipo de release necesita un nombre.');
      return;
    }

    try {
      setSaving(true);
      if (editando) {
        await releaseTiposAPI.update(editando._id, { name, isActive: form.isActive });
        sweetAlert.success('Tipo actualizado', 'Los cambios se guardaron con éxito.');
      } else {
        await releaseTiposAPI.create({ name, isActive: form.isActive });
        sweetAlert.success('Tipo creado', 'Ya podés asignarlo en Plantillas | Release.');
      }
      setShowModal(false);
      await cargar();
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo guardar el tipo de release.');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (tipo: ReleaseTipoItem) => {
    const result = await sweetAlert.confirm('¿Eliminar tipo de release?', `Se va a eliminar "${tipo.name}".`);
    if (!result.isConfirmed) return;
    try {
      await releaseTiposAPI.remove(tipo._id);
      sweetAlert.success('Eliminado', 'El tipo de release fue eliminado.');
      await cargar();
    } catch (e: any) {
      sweetAlert.error('No se pudo eliminar', e?.response?.data?.error || 'Intentá de nuevo.');
    }
  };

  return (
    <PageLayout
      title="Releases"
      itemCount={tipos.length}
      subtitle="Tipos de release. Cada Plantilla de Plantillas | Release pertenece a uno de estos tipos"
      faIcon={{ icon: faRocket }}
      infoModal={{
        isOpen: showInfoModal,
        onOpen: () => setShowInfoModal(true),
        onClose: () => setShowInfoModal(false),
        title: 'Guía de Releases',
        content: (
          <div className="space-y-4 text-gray-400">
            <p>
              Un <strong>tipo de Release</strong> es la categoría que agrupa a las Plantillas de <strong>Plantillas | Release</strong>. Es lo que se elige ahí al crear o editar una Plantilla.
            </p>
            <div className="space-y-2">
              <h4 className="text-white font-medium">Eliminar</h4>
              <p className="text-sm">No se puede eliminar un tipo mientras tenga Plantillas asignadas: primero hay que reasignarlas o eliminarlas.</p>
            </div>
          </div>
        ),
      }}
      headerActions={
        <button onClick={abrirCrear} title="Nuevo tipo de release" aria-label="Nuevo tipo de release" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          <FontAwesomeIcon icon={faPlus} />
        </button>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar tipo de release..." />
          </div>
          {isLarge && <ViewToggle value={viewMode} onChange={setViewMode} />}
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando tipos de release..." />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState icon={faRocket} title={searchTerm ? 'Sin resultados' : 'Todavía no hay tipos de release'} description={searchTerm ? 'Probá con otra búsqueda.' : 'Creá el primer tipo para usarlo en Plantillas | Release.'} />
      ) : effectiveViewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtrados.map((tipo) => (
            <Card
              key={tipo._id}
              onClick={() => abrirEditar(tipo)}
              className="cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200"
              header={{
                title: tipo.name,
                icon: faRocket,
                badges: [{ text: tipo.isActive === false ? 'Inactivo' : 'Activo', variant: tipo.isActive === false ? 'destructive' : 'green' }],
              }}
              footer={{
                actions: [
                  {
                    icon: faEdit,
                    onClick: (e) => {
                      e.stopPropagation();
                      abrirEditar(tipo);
                    },
                    title: 'Editar',
                    variant: 'default',
                  },
                  {
                    icon: faTrash,
                    onClick: (e) => {
                      e.stopPropagation();
                      eliminar(tipo);
                    },
                    title: 'Eliminar',
                    variant: 'default',
                  },
                ],
              }}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtrados.map((tipo) => (
                  <tr key={tipo._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100">{tipo.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${tipo.isActive === false ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                        {tipo.isActive === false ? 'Inactivo' : 'Activo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => abrirEditar(tipo)} className="p-2 text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 transition-colors" title="Editar tipo de release">
                          <FontAwesomeIcon icon={faEdit} />
                        </button>
                        <button onClick={() => eliminar(tipo)} className="p-2 text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 transition-colors" title="Eliminar tipo de release">
                          <FontAwesomeIcon icon={faTrash} />
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

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editando ? 'Editar Tipo de Release' : 'Nuevo Tipo de Release'}
        subtitle={editando ? editando.name : 'Se va a poder asignar a una o varias Plantillas de Release'}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button onClick={() => setShowModal(false)} className="btn-secondary" disabled={saving}>
              Cancelar
            </button>
            <button onClick={guardar} className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : editando ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Nombre *</label>
            <input className="input-field w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Acuerdo de titularidad de la obra" />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
            <span className="text-gray-700 dark:text-gray-300">Tipo activo</span>
          </label>
        </div>
      </Modal>
    </PageLayout>
  );
};

export default ReleaseTiposPage;
