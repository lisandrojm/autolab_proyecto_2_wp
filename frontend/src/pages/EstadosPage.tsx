import React, { useEffect, useMemo, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faTags, faFileContract, faGrip, faTable } from '@fortawesome/free-solid-svg-icons';
import { infoAPI, InfoItem, EstadoPayload } from '../api/info';
import { contratoFrameAPI, ContratoFrameItem } from '../api/contratosFrame';
import { useEstadoCatalogStore } from '../stores/estadoCatalogStore';
import { estadoColorPorDefecto, colorTextoBadge } from '../components/EstadoSelect';
import { useThemeStore } from '../stores/themeStore';

/** Paleta sugerida: solo se elige el color de la tipografía; el fondo es ese color con transparencia. */
const COLORES = [
  { hex: '#16a34a', label: 'Verde' },
  { hex: '#0ea5e9', label: 'Celeste' },
  { hex: '#2563eb', label: 'Azul' },
  { hex: '#7c3aed', label: 'Violeta' },
  { hex: '#db2777', label: 'Rosa' },
  { hex: '#dc2626', label: 'Rojo' },
  { hex: '#ea580c', label: 'Naranja' },
  { hex: '#d97706', label: 'Ámbar' },
  { hex: '#0d9488', label: 'Verde azulado' },
  { hex: '#64748b', label: 'Gris' },
];

/** Color que muestra un estado que todavía no tiene uno propio: el histórico de la app. */
const colorEfectivo = (estado: InfoItem): string => estado.data?.color || estadoColorPorDefecto(estado.name);

const COLOR_POR_DEFECTO = '#64748b';

/** #rrggbb → rgba, para el fondo translúcido del badge. */
const conAlpha = (hex: string, alpha: number): string => {
  const m = /^#([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return 'transparent';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const normalizar = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

/** Activo/Inactivo se pisan con el estado del usuario: dentro del contrato tienen que llamarse distinto. */
const necesitaAlias = (name: string): boolean => ['activo', 'inactivo'].includes(normalizar(name));

/** Vista previa del badge tal cual se va a ver en Agregar/Configurar miembro. */
const BadgePreview: React.FC<{ texto: string; color: string }> = ({ texto, color }) => {
  const theme = useThemeStore((s) => s.theme);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide"
      style={{ color: colorTextoBadge(color, theme === 'dark'), backgroundColor: conAlpha(color, 0.14), border: `1px solid ${conAlpha(color, 0.35)}` }}
    >
      {texto || 'Estado'}
    </span>
  );
};

interface FormState {
  name: string;
  nombreEnContrato: string;
  color: string;
  contratoFrameIds: string[];
}

const FORM_VACIO: FormState = { name: '', nombreEnContrato: '', color: COLOR_POR_DEFECTO, contratoFrameIds: [] };

export const EstadosPage: React.FC = () => {
  const [estados, setEstados] = useState<InfoItem[]>([]);
  const [contratoFrames, setContratoFrames] = useState<ContratoFrameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [editando, setEditando] = useState<InfoItem | null>(null);
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
      const saved = localStorage.getItem('estadosViewMode');
      if (saved === 'table' || saved === 'cards') setViewMode(saved);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) localStorage.setItem('estadosViewMode', viewMode);
  }, [viewMode, isLarge]);

  const setCatalogo = useEstadoCatalogStore((s) => s.setEstados);
  const temaOscuro = useThemeStore((s) => s.theme) === 'dark';

  const cargar = async () => {
    try {
      setLoading(true);
      const [items, frames] = await Promise.all([infoAPI.listEstados(), contratoFrameAPI.list()]);
      setEstados(items);
      setContratoFrames(frames);
      setCatalogo(items); // los badges de toda la app usan este catálogo
    } catch (e) {
      console.error('Error cargando estados:', e);
      sweetAlert.error('Error', 'No se pudieron cargar los estados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    const q = normalizar(searchTerm);
    if (!q) return estados;
    return estados.filter((e) => normalizar(e.name).includes(q) || normalizar(e.data?.nombreEnContrato || '').includes(q));
  }, [estados, searchTerm]);

  const nombreTipoContrato = (id: string) => contratoFrames.find((cf) => String(cf._id) === String(id))?.name || 'Tipo eliminado';

  const abrirCrear = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setShowModal(true);
  };

  const abrirEditar = (estado: InfoItem) => {
    setEditando(estado);
    setForm({
      name: estado.name,
      nombreEnContrato: estado.data?.nombreEnContrato || '',
      color: colorEfectivo(estado),
      contratoFrameIds: estado.data?.contratoFrameIds || [],
    });
    setShowModal(true);
  };

  const toggleTipoContrato = (id: string) => {
    setForm((prev) => ({
      ...prev,
      contratoFrameIds: prev.contratoFrameIds.includes(id) ? prev.contratoFrameIds.filter((x) => x !== id) : [...prev.contratoFrameIds, id],
    }));
  };

  const guardar = async () => {
    const name = form.name.trim();
    if (!name) {
      sweetAlert.error('Falta el nombre', 'El estado necesita un nombre.');
      return;
    }
    if (necesitaAlias(name) && !form.nombreEnContrato.trim()) {
      sweetAlert.error('Falta el nombre en el contrato', `"${name}" se confunde con el estado del usuario: indicá cómo se llama dentro del contrato.`);
      return;
    }

    const payload: EstadoPayload = {
      name,
      color: form.color,
      nombreEnContrato: form.nombreEnContrato.trim(),
      contratoFrameIds: form.contratoFrameIds,
    };

    try {
      setSaving(true);
      if (editando) {
        await infoAPI.updateEstado(editando._id, payload);
        sweetAlert.success('Estado actualizado', 'Los cambios se guardaron con éxito.');
      } else {
        await infoAPI.createEstado(payload);
        sweetAlert.success('Estado creado', 'Ya podés usarlo en los contratos.');
      }
      setShowModal(false);
      await cargar();
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo guardar el estado.');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (estado: InfoItem) => {
    const result = await sweetAlert.confirm('¿Eliminar estado?', `Se va a eliminar "${estado.name}". Los contratos que ya lo tengan guardado conservan el nombre.`);
    if (!result.isConfirmed) return;
    try {
      await infoAPI.deleteEstado(estado._id);
      sweetAlert.success('Eliminado', 'El estado fue eliminado.');
      await cargar();
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo eliminar el estado.');
    }
  };

  return (
    <PageLayout
      title="Contratos | Estados"
      itemCount={estados.length}
      subtitle="Estados del contrato que se eligen al agregar o configurar un miembro"
      faIcon={{ icon: faTags }}
      infoModal={{
        isOpen: showInfoModal,
        onOpen: () => setShowInfoModal(true),
        onClose: () => setShowInfoModal(false),
        title: 'Guía de Estados',
        content: (
          <div className="space-y-4 text-gray-400">
            <p>
              Estos son los estados que aparecen en el campo <strong>Estado</strong> del contrato, en Agregar y Configurar miembro.
            </p>
            <div className="space-y-2">
              <h4 className="text-white font-medium">Color</h4>
              <p className="text-sm">Elegís el color de la tipografía; el fondo del badge se genera automáticamente con ese mismo color y transparencia.</p>
            </div>
            <div className="space-y-2">
              <h4 className="text-white font-medium">Tipos de contrato</h4>
              <p className="text-sm">Si vinculás el estado a uno o varios tipos de contrato, solo se ofrece cuando el contrato es de ese tipo. Sin ninguno, está disponible siempre.</p>
            </div>
            <div className="space-y-2">
              <h4 className="text-white font-medium">Nombre en el contrato</h4>
              <p className="text-sm">
                Es cómo se muestra el estado dentro del contrato. Es obligatorio para <strong>Activo</strong> e <strong>Inactivo</strong>, que ya se usan para el estado del usuario.
              </p>
            </div>
          </div>
        ),
      }}
      headerActions={
        <button onClick={abrirCrear} title="Nuevo estado" aria-label="Nuevo estado" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          <FontAwesomeIcon icon={faPlus} />
        </button>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar estado..." />
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
          <LoadingSpinner message="Cargando estados..." />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState icon={faTags} title={searchTerm ? 'Sin resultados' : 'Todavía no hay estados'} description={searchTerm ? 'Probá con otra búsqueda.' : 'Creá el primer estado para usarlo en los contratos.'} />
      ) : viewMode === 'table' ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Badge</th>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Nombre en el contrato</th>
                  <th className="px-4 py-3 font-semibold">Tipos de contrato</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtrados.map((estado) => {
                  const tipos = estado.data?.contratoFrameIds || [];
                  return (
                    <tr key={estado._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <BadgePreview texto={estado.data?.nombreEnContrato?.trim() || estado.name} color={colorEfectivo(estado)} />
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100">{estado.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{estado.data?.nombreEnContrato || '—'}</td>
                      <td className="px-4 py-3">
                        {tipos.length === 0 ? (
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">Todos los tipos</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {tipos.map((id) => (
                              <span key={id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                                <FontAwesomeIcon icon={faFileContract} className="h-2.5 w-2.5" />
                                {nombreTipoContrato(id)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => abrirEditar(estado)} className="p-2 text-gray-400 hover:text-blue-500 transition-colors" title="Editar estado">
                            <FontAwesomeIcon icon={faEdit} />
                          </button>
                          <button onClick={() => eliminar(estado)} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="Eliminar estado">
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
          {filtrados.map((estado) => {
            const color = colorEfectivo(estado);
            const tipos = estado.data?.contratoFrameIds || [];
            return (
              <div key={estado._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <BadgePreview texto={estado.data?.nombreEnContrato?.trim() || estado.name} color={color} />
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{estado.name}</span>
                    {estado.data?.nombreEnContrato ? <span className="text-[11px] text-gray-500 dark:text-gray-400">En el contrato: {estado.data.nombreEnContrato}</span> : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => abrirEditar(estado)} className="p-2 text-gray-400 hover:text-blue-500 transition-colors" title="Editar estado">
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button onClick={() => eliminar(estado)} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="Eliminar estado">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                  {tipos.length === 0 ? (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 pt-2">Disponible en todos los tipos de contrato</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {tipos.map((id) => (
                        <span key={id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                          <FontAwesomeIcon icon={faFileContract} className="h-2.5 w-2.5" />
                          {nombreTipoContrato(id)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editando ? 'Editar Estado' : 'Nuevo Estado'}
        subtitle={editando ? estados.find((e) => e._id === editando._id)?.name : 'Se va a poder elegir en el contrato del miembro'}
        size="md"
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
            <input className="input-field w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Firma pendiente" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Nombre en el contrato {necesitaAlias(form.name) ? '*' : ''}</label>
            <input
              className="input-field w-full"
              value={form.nombreEnContrato}
              onChange={(e) => setForm((p) => ({ ...p, nombreEnContrato: e.target.value }))}
              placeholder={necesitaAlias(form.name) ? 'Obligatorio: cómo se llama dentro del contrato' : 'Opcional: si dentro del contrato se llama distinto'}
            />
            {necesitaAlias(form.name) && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 ml-1">"{form.name.trim()}" ya se usa para el estado del usuario: dentro del contrato tiene que llamarse distinto.</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Color de la tipografía</label>
            <div className="flex flex-wrap gap-2">
              {COLORES.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, color: c.hex }))}
                  title={c.label}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${form.color.toLowerCase() === c.hex.toLowerCase() ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: conAlpha(c.hex, 0.2), color: colorTextoBadge(c.hex, temaOscuro) }}
                >
                  <span className="text-sm font-black">A</span>
                </button>
              ))}
              <label className="flex items-center gap-2 ml-1">
                <input type="color" value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} className="w-8 h-8 rounded-lg bg-transparent cursor-pointer" title="Color personalizado" />
                <span className="text-[11px] text-gray-500 dark:text-gray-400">{form.color}</span>
              </label>
            </div>
            <div className="flex items-center gap-2 pt-1 ml-1">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Así se va a ver:</span>
              <BadgePreview texto={form.nombreEnContrato.trim() || form.name} color={form.color} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Tipos de contrato</label>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">Sin ninguno seleccionado, el estado se ofrece en todos los tipos de contrato.</p>
            <div className="max-h-52 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
              {contratoFrames.length === 0 ? (
                <p className="px-3 py-3 text-sm text-gray-500">No hay tipos de contrato cargados.</p>
              ) : (
                contratoFrames.map((cf) => (
                  <label key={cf._id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                    <input type="checkbox" checked={form.contratoFrameIds.includes(String(cf._id))} onChange={() => toggleTipoContrato(String(cf._id))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{cf.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
};

export default EstadosPage;
