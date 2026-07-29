import React, { useEffect, useMemo, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faFileContract, faGrip, faTable } from '@fortawesome/free-solid-svg-icons';
import { contratosAPI, ContratoItem } from '../api/contratos';
import { contratoFrameAPI, ContratoFrameItem } from '../api/contratosFrame';

const normalizar = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

interface FormState {
  name: string;
  cantidadJornadas: string;
  multiplicadorDiario: string;
  esTiempoIndeterminado: boolean;
  isActive: boolean;
}

const FORM_VACIO: FormState = { name: '', cantidadJornadas: '', multiplicadorDiario: '', esTiempoIndeterminado: false, isActive: true };

export const ContratosPage: React.FC = () => {
  const [contratos, setContratos] = useState<ContratoItem[]>([]);
  const [plantillas, setPlantillas] = useState<ContratoFrameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [editando, setEditando] = useState<ContratoItem | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);

  // Vista tarjetas/tabla, como el resto de los ABM: la tabla solo en pantallas grandes.
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) setViewMode('cards');
    };
    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem('contratosAbmViewMode');
      if (saved === 'table' || saved === 'cards') setViewMode(saved);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) localStorage.setItem('contratosAbmViewMode', viewMode);
  }, [viewMode, isLarge]);

  const cargar = async () => {
    try {
      setLoading(true);
      const [tiposDeContrato, listaPlantillas] = await Promise.all([contratosAPI.list(), contratoFrameAPI.list()]);
      setContratos(tiposDeContrato);
      setPlantillas(listaPlantillas);
    } catch (e) {
      console.error('Error cargando contratos:', e);
      sweetAlert.error('Error', 'No se pudieron cargar los contratos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    const q = normalizar(searchTerm);
    if (!q) return contratos;
    return contratos.filter((c) => normalizar(c.name).includes(q));
  }, [contratos, searchTerm]);

  // Cuántas Plantillas ("Plantillas | Contratos") tiene asignadas cada Contrato.
  const plantillasPorContrato = useMemo(() => {
    const conteo = new Map<string, number>();
    plantillas.forEach((p) => {
      const id = typeof p.contratoId === 'object' ? p.contratoId?._id : p.contratoId;
      if (id) conteo.set(id, (conteo.get(id) || 0) + 1);
    });
    return conteo;
  }, [plantillas]);

  const abrirCrear = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setShowModal(true);
  };

  const abrirEditar = (contrato: ContratoItem) => {
    setEditando(contrato);
    setForm({
      name: contrato.name,
      cantidadJornadas: String(contrato.data?.cantidadJornadas ?? ''),
      multiplicadorDiario: String(contrato.data?.multiplicadorDiario ?? ''),
      esTiempoIndeterminado: !!contrato.data?.esTiempoIndeterminado,
      isActive: contrato.isActive !== false,
    });
    setShowModal(true);
  };

  const guardar = async () => {
    const name = form.name.trim();
    if (!name) {
      sweetAlert.error('Falta el nombre', 'El contrato necesita un nombre.');
      return;
    }

    const payload = {
      nombre: name,
      cantidadJornadas: form.cantidadJornadas,
      multiplicadorDiario: form.multiplicadorDiario,
      esTiempoIndeterminado: form.esTiempoIndeterminado,
      isActive: form.isActive,
    };

    try {
      setSaving(true);
      if (editando) {
        await contratosAPI.update(editando._id, payload);
        sweetAlert.success('Contrato actualizado', 'Los cambios se guardaron con éxito.');
      } else {
        await contratosAPI.create(payload);
        sweetAlert.success('Contrato creado', 'Ya podés asignarle una Plantilla desde Plantillas | Contratos.');
      }
      setShowModal(false);
      await cargar();
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo guardar el contrato.');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (contrato: ContratoItem) => {
    const enUso = plantillasPorContrato.get(contrato._id) || 0;
    if (enUso > 0) {
      sweetAlert.error('No se puede eliminar', `Hay ${enUso} plantilla${enUso === 1 ? '' : 's'} asignada${enUso === 1 ? '' : 's'} a este contrato. Reasignalas o eliminalas primero desde Plantillas | Contratos.`);
      return;
    }
    const result = await sweetAlert.confirm('¿Eliminar contrato?', `Se va a eliminar "${contrato.name}".`);
    if (!result.isConfirmed) return;
    try {
      await contratosAPI.remove(contrato._id);
      sweetAlert.success('Eliminado', 'El contrato fue eliminado.');
      await cargar();
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo eliminar el contrato.');
    }
  };

  return (
    <PageLayout
      title="Contratos"
      itemCount={contratos.length}
      subtitle="Tipos de contrato: jornadas, multiplicador y vigencia. Cada uno puede tener una o varias Plantillas asignadas"
      faIcon={{ icon: faFileContract }}
      infoModal={{
        isOpen: showInfoModal,
        onOpen: () => setShowInfoModal(true),
        onClose: () => setShowInfoModal(false),
        title: 'Guía de Contratos',
        content: (
          <div className="space-y-4 text-gray-400">
            <p>
              Un <strong>Contrato</strong> es el tipo real (Jornada, Plazo fijo 5x7, Tiempo Indeterminado, ...): define cuántas jornadas tiene, su multiplicador diario y si es de tiempo indeterminado. Es
              lo que elegís en <strong>Agregar/Configurar miembro</strong>.
            </p>
            <div className="space-y-2">
              <h4 className="text-white font-medium">Plantillas</h4>
              <p className="text-sm">
                El documento PDF (contenido + membrete) se administra aparte, en <strong>Plantillas | Contratos</strong>. Cada Plantilla elige a qué Contrato pertenece; un mismo Contrato puede tener más
                de una Plantilla (por ejemplo variantes con y sin membrete).
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-white font-medium">Eliminar</h4>
              <p className="text-sm">No se puede eliminar un Contrato mientras tenga Plantillas asignadas: primero hay que reasignarlas o eliminarlas.</p>
            </div>
          </div>
        ),
      }}
      headerActions={
        <button onClick={abrirCrear} title="Nuevo contrato" aria-label="Nuevo contrato" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          <FontAwesomeIcon icon={faPlus} />
        </button>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar contrato..." />
          </div>
          {isLarge && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setViewMode('cards')} title="Vista de tarjetas" className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'cards' ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('table')} title="Vista de tabla" className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'table' ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando contratos..." />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState icon={faFileContract} title={searchTerm ? 'Sin resultados' : 'Todavía no hay contratos'} description={searchTerm ? 'Probá con otra búsqueda.' : 'Creá el primer contrato para poder asignarle una Plantilla.'} />
      ) : viewMode === 'table' ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Jornadas</th>
                  <th className="px-4 py-3 font-semibold">Mult. Diario</th>
                  <th className="px-4 py-3 font-semibold">Tiempo Indet.</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Plantillas</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtrados.map((contrato) => {
                  const cantPlantillas = plantillasPorContrato.get(contrato._id) || 0;
                  return (
                    <tr key={contrato._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100">{contrato.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{contrato.data?.cantidadJornadas ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{contrato.data?.multiplicadorDiario ?? '—'}</td>
                      <td className="px-4 py-3">{contrato.data?.esTiempoIndeterminado ? <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Sí</span> : <span className="text-xs text-gray-400">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${contrato.isActive === false ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                          {contrato.isActive === false ? 'Inactivo' : 'Activo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {cantPlantillas} plantilla{cantPlantillas === 1 ? '' : 's'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => abrirEditar(contrato)} className="p-2 text-gray-400 hover:text-blue-500 transition-colors" title="Editar contrato">
                            <FontAwesomeIcon icon={faEdit} />
                          </button>
                          <button onClick={() => eliminar(contrato)} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="Eliminar contrato">
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtrados.map((contrato) => {
            const cantPlantillas = plantillasPorContrato.get(contrato._id) || 0;
            return (
              <div key={contrato._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <span className={`inline-flex items-center w-fit px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${contrato.isActive === false ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                      {contrato.isActive === false ? 'Inactivo' : 'Activo'}
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{contrato.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => abrirEditar(contrato)} className="p-2 text-gray-400 hover:text-blue-500 transition-colors" title="Editar contrato">
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button onClick={() => eliminar(contrato)} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="Eliminar contrato">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                  <span>
                    <strong>{contrato.data?.cantidadJornadas ?? 0}</strong> jornadas
                  </span>
                  <span>
                    Multiplicador <strong>{contrato.data?.multiplicadorDiario ?? 0}</strong>
                  </span>
                  {contrato.data?.esTiempoIndeterminado && <span className="font-semibold text-blue-600 dark:text-blue-400">Tiempo indeterminado</span>}
                </div>

                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  {cantPlantillas} plantilla{cantPlantillas === 1 ? '' : 's'} asignada{cantPlantillas === 1 ? '' : 's'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editando ? 'Editar Contrato' : 'Nuevo Contrato'}
        subtitle={editando ? editando.name : 'Se va a poder asignar a una o varias Plantillas'}
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
            <input className="input-field w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Plazo fijo 5x7" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Cantidad de Jornadas</label>
              <input type="number" className="input-field w-full" value={form.cantidadJornadas} onChange={(e) => setForm((p) => ({ ...p, cantidadJornadas: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Multiplicador Diario</label>
              <input type="number" className="input-field w-full" value={form.multiplicadorDiario} onChange={(e) => setForm((p) => ({ ...p, multiplicadorDiario: e.target.value }))} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.esTiempoIndeterminado} onChange={(e) => setForm((p) => ({ ...p, esTiempoIndeterminado: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
            <span className="text-gray-700 dark:text-gray-300">Es tiempo indeterminado</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
            <span className="text-gray-700 dark:text-gray-300">Contrato activo</span>
          </label>
        </div>
      </Modal>
    </PageLayout>
  );
};

export default ContratosPage;
