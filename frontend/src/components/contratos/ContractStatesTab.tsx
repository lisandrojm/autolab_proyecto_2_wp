import React, { useEffect, useMemo, useState } from 'react';
import { SearchAndFilters } from '../ui/SearchAndFilters';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { sweetAlert } from '../../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faTags, faFileContract, faGrip, faTable, faFileInvoiceDollar, faGripVertical, faCheck, faMultiply } from '@fortawesome/free-solid-svg-icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { infoAPI, InfoItem, EstadoPayload } from '../../api/info';
import { contratoFrameAPI, ContratoFrameItem } from '../../api/contratosFrame';
import { useEstadoCatalogStore } from '../../stores/estadoCatalogStore';
import { estadoColorPorDefecto, colorTextoBadge } from '../EstadoSelect';
import { useThemeStore } from '../../stores/themeStore';

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
const BadgePreview: React.FC<{ texto: string; color: string; esImpositivo?: boolean }> = ({ texto, color, esImpositivo }) => {
  const theme = useThemeStore((s) => s.theme);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide"
      style={{ color: colorTextoBadge(color, theme === 'dark'), backgroundColor: conAlpha(color, 0.14), border: `1px solid ${conAlpha(color, 0.35)}` }}
    >
      {esImpositivo && <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" title="Estado impositivo" />}
      {texto || 'Estado'}
    </span>
  );
};

/** Marca visual de los estados de índole impositiva. */
const ChipImpositivo: React.FC = () => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-100 dark:border-purple-800">
    <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" />
    Impositivo
  </span>
);

interface FormState {
  name: string;
  nombreEnContrato: string;
  color: string;
  contratoFrameIds: string[];
  esImpositivo: boolean;
}

const FORM_VACIO: FormState = { name: '', nombreEnContrato: '', color: COLOR_POR_DEFECTO, contratoFrameIds: [], esImpositivo: false };

export const ContractStatesTab: React.FC = () => {
  const [estados, setEstados] = useState<InfoItem[]>([]);
  const [contratoFrames, setContratoFrames] = useState<ContratoFrameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<InfoItem | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);

  // Vista tarjetas/tabla, como el resto de los ABM: la tabla solo en pantallas grandes.
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  const [isReorderMode, setIsReorderMode] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

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

  // En modo reorder siempre se opera sobre el array completo: nunca sobre el resultado filtrado
  // por la búsqueda, para no pisar mal los índices de los estados que quedaron ocultos.
  const mostrar = isReorderMode ? estados : filtrados;

  const handleStartReorder = () => {
    setSearchTerm('');
    setIsReorderMode(true);
  };

  const handleCancelReorder = () => {
    setIsReorderMode(false);
    cargar();
  };

  const handleSaveReorder = async () => {
    const items = estados.map((e, i) => ({ id: e._id, orden: i + 1 }));
    try {
      await infoAPI.reorderEstados(items);
      setIsReorderMode(false);
      sweetAlert.success('Orden guardado', 'El nuevo orden se guardó con éxito.');
      await cargar();
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo guardar el orden.');
      await cargar();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setEstados((items) => {
        const oldIndex = items.findIndex((item) => item._id === active.id);
        const newIndex = items.findIndex((item) => item._id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const nombreTipoContrato = (id: string) => contratoFrames.find((cf) => String(cf._id) === String(id))?.name || 'Tipo eliminado';

  /**
   * Tipos de contrato que ya tomó OTRO estado impositivo: un tipo puede tener un solo estado
   * impositivo, así que al marcar el check esos tipos quedan bloqueados.
   */
  const tiposTomadosPorOtroImpositivo = useMemo(() => {
    const tomados = new Map<string, string>();
    estados
      .filter((e) => e.data?.esImpositivo && e._id !== editando?._id)
      .forEach((e) => (e.data?.contratoFrameIds || []).forEach((id: string) => tomados.set(String(id), e.name)));
    return tomados;
  }, [estados, editando]);

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
      esImpositivo: !!estado.data?.esImpositivo,
    });
    setShowModal(true);
  };

  /** Tipos que se pueden elegir ahora: si el estado es impositivo, los tomados por otro quedan afuera. */
  const tiposSeleccionables = useMemo(
    () => contratoFrames.filter((cf) => !(form.esImpositivo && tiposTomadosPorOtroImpositivo.has(String(cf._id)))),
    [contratoFrames, form.esImpositivo, tiposTomadosPorOtroImpositivo],
  );

  const seleccionarTodosLosTipos = () => setForm((prev) => ({ ...prev, contratoFrameIds: tiposSeleccionables.map((cf) => String(cf._id)) }));
  const limpiarTiposContrato = () => setForm((prev) => ({ ...prev, contratoFrameIds: [] }));

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
    if (form.esImpositivo && form.contratoFrameIds.length === 0) {
      sweetAlert.error('Faltan los tipos de contrato', 'Un estado impositivo tiene que indicar a qué tipos de contrato corresponde.');
      return;
    }

    const payload: EstadoPayload = {
      name,
      color: form.color,
      nombreEnContrato: form.nombreEnContrato.trim(),
      contratoFrameIds: form.contratoFrameIds,
      esImpositivo: form.esImpositivo,
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
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
        <div className="flex-1 w-full">
          {isReorderMode ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic px-1">Arrastrá para reordenar. La búsqueda se deshabilita mientras tanto.</p>
          ) : (
            <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar estado..." />
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isReorderMode && (
            <button onClick={abrirCrear} title="Nuevo estado" aria-label="Nuevo estado" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              <FontAwesomeIcon icon={faPlus} />
            </button>
          )}
          {isReorderMode ? (
            <div className="flex items-center gap-2">
              <button onClick={handleCancelReorder} className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-sm flex items-center gap-2">
                <FontAwesomeIcon icon={faMultiply} />
                Cancelar
              </button>
              <button onClick={handleSaveReorder} className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-all text-sm flex items-center gap-2">
                <FontAwesomeIcon icon={faCheck} />
                Guardar Orden
              </button>
            </div>
          ) : (
            <button onClick={handleStartReorder} disabled={estados.length < 2} title="Ordenar estados" className="px-3 py-2 rounded-md border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-sm flex items-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
              <FontAwesomeIcon icon={faGripVertical} />
              <span>Ordenar</span>
            </button>
          )}
          {isLarge && !isReorderMode && (
            <div className="flex items-center gap-2">
              <button onClick={() => setViewMode('cards')} title="Vista de tarjetas" className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'cards' ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('table')} title="Vista de tabla" className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'table' ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando estados..." />
        </div>
      ) : mostrar.length === 0 ? (
        <EmptyState icon={faTags} title={searchTerm ? 'Sin resultados' : 'Todavía no hay estados'} description={searchTerm ? 'Probá con otra búsqueda.' : 'Creá el primer estado para usarlo en los contratos.'} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {viewMode === 'table' ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      <th className="px-4 py-3 font-semibold text-center w-14">Ordenar</th>
                      <th className="px-4 py-3 font-semibold text-center w-14">Orden</th>
                      <th className="px-4 py-3 font-semibold">Badge</th>
                      <th className="px-4 py-3 font-semibold">Nombre</th>
                      <th className="px-4 py-3 font-semibold">Nombre en el contrato</th>
                      <th className="px-4 py-3 font-semibold">Impositivo</th>
                      <th className="px-4 py-3 font-semibold">Tipos de contrato</th>
                      <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <SortableContext items={mostrar.map((e) => e._id)} strategy={verticalListSortingStrategy}>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {mostrar.map((estado, index) => (
                        <SortableEstadoRow
                          key={estado._id}
                          estado={estado}
                          index={index}
                          isReorderMode={isReorderMode}
                          nombreTipoContrato={nombreTipoContrato}
                          abrirEditar={abrirEditar}
                          eliminar={eliminar}
                          onEnableReorder={handleStartReorder}
                        />
                      ))}
                    </tbody>
                  </SortableContext>
                </table>
              </div>
            </div>
          ) : (
            <SortableContext items={mostrar.map((e) => e._id)} strategy={verticalListSortingStrategy}>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {mostrar.map((estado) => (
                  <SortableEstadoCard key={estado._id} estado={estado} isReorderMode={isReorderMode} nombreTipoContrato={nombreTipoContrato} abrirEditar={abrirEditar} eliminar={eliminar} />
                ))}
              </div>
            </SortableContext>
          )}
        </DndContext>
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
              <BadgePreview texto={form.nombreEnContrato.trim() || form.name} color={form.color} esImpositivo={form.esImpositivo} />
            </div>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
            <input
              type="checkbox"
              checked={form.esImpositivo}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  esImpositivo: e.target.checked,
                  // Los tipos que ya tiene otro impositivo dejan de estar disponibles.
                  contratoFrameIds: e.target.checked ? p.contratoFrameIds.filter((id) => !tiposTomadosPorOtroImpositivo.has(String(id))) : p.contratoFrameIds,
                }))
              }
              className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Estado impositivo</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Marcalo si el estado es de índole impositiva, para poder distinguirlo y darle otro tratamiento.</span>
            </span>
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 ml-1">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">
                Tipos de contrato
                {form.contratoFrameIds.length > 0 ? <span className="ml-1.5 normal-case tracking-normal text-gray-500 dark:text-gray-400">({form.contratoFrameIds.length} de {tiposSeleccionables.length})</span> : null}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={seleccionarTodosLosTipos}
                  disabled={tiposSeleccionables.length === 0 || form.contratoFrameIds.length === tiposSeleccionables.length}
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                >
                  Seleccionar todos
                </button>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <button
                  type="button"
                  onClick={limpiarTiposContrato}
                  disabled={form.contratoFrameIds.length === 0}
                  className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                >
                  Limpiar
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">
              {form.esImpositivo
                ? 'Cada tipo de contrato puede tener un solo estado impositivo: los que ya tomó otro aparecen bloqueados.'
                : 'Sin ninguno seleccionado, el estado se ofrece en todos los tipos de contrato.'}
            </p>
            <div className="max-h-52 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
              {contratoFrames.length === 0 ? (
                <p className="px-3 py-3 text-sm text-gray-500">No hay tipos de contrato cargados.</p>
              ) : (
                contratoFrames.map((cf) => {
                  const tomadoPor = form.esImpositivo ? tiposTomadosPorOtroImpositivo.get(String(cf._id)) : undefined;
                  return (
                    <label
                      key={cf._id}
                      className={`flex items-center gap-3 px-3 py-2 transition-colors ${tomadoPor ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}
                      title={tomadoPor ? `Ya lo usa el estado impositivo "${tomadoPor}"` : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={form.contratoFrameIds.includes(String(cf._id))}
                        disabled={!!tomadoPor}
                        onChange={() => toggleTipoContrato(String(cf._id))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{cf.name}</span>
                      {tomadoPor ? <span className="ml-auto text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">ya lo usa "{tomadoPor}"</span> : null}
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

interface SortableEstadoProps {
  estado: InfoItem;
  isReorderMode: boolean;
  nombreTipoContrato: (id: string) => string;
  abrirEditar: (estado: InfoItem) => void;
  eliminar: (estado: InfoItem) => void;
}

const SortableEstadoRow: React.FC<SortableEstadoProps & { index: number; onEnableReorder: () => void }> = ({ estado, index, isReorderMode, nombreTipoContrato, abrirEditar, eliminar, onEnableReorder }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: estado._id, disabled: !isReorderMode });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 1 : 0 };
  const tipos = estado.data?.contratoFrameIds || [];

  return (
    <tr
      ref={setNodeRef}
      style={style}
      {...(isReorderMode ? { ...attributes, ...listeners } : {})}
      className={`transition-colors ${isReorderMode ? 'bg-blue-50/50 dark:bg-blue-900/10 cursor-grab active:cursor-grabbing' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}
    >
      <td
        className={`px-4 py-3 text-center ${!isReorderMode ? 'cursor-pointer' : ''}`}
        onClick={(e) => {
          if (!isReorderMode) {
            e.preventDefault();
            e.stopPropagation();
            onEnableReorder();
          }
        }}
        title={!isReorderMode ? 'Clic para activar el modo ordenar' : ''}
      >
        <div className={`flex items-center justify-center ${isReorderMode ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-600 hover:text-blue-500'}`}>
          <FontAwesomeIcon icon={faGripVertical} className="h-4 w-4" />
        </div>
      </td>
      <td className="px-4 py-3 text-center font-medium text-gray-700 dark:text-gray-300">{index + 1}</td>
      <td className="px-4 py-3">
        <BadgePreview texto={estado.data?.nombreEnContrato?.trim() || estado.name} color={colorEfectivo(estado)} esImpositivo={!!estado.data?.esImpositivo} />
      </td>
      <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">
        {estado.name}
        <span className="ml-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400" title={tipos.length === 0 ? 'Se ofrece en todos los tipos de contrato' : `${tipos.length} tipo${tipos.length === 1 ? '' : 's'} de contrato`}>
          ({tipos.length || 'Todos'})
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{estado.data?.nombreEnContrato || '—'}</td>
      <td className="px-4 py-3">{estado.data?.esImpositivo ? <ChipImpositivo /> : <span className="text-xs text-gray-400">—</span>}</td>
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
          <button onClick={() => abrirEditar(estado)} disabled={isReorderMode} className={`p-2 text-gray-400 hover:text-blue-500 transition-colors ${isReorderMode ? 'opacity-50 cursor-not-allowed' : ''}`} title="Editar estado">
            <FontAwesomeIcon icon={faEdit} />
          </button>
          <button onClick={() => eliminar(estado)} disabled={isReorderMode} className={`p-2 text-gray-400 hover:text-red-500 transition-colors ${isReorderMode ? 'opacity-50 cursor-not-allowed' : ''}`} title="Eliminar estado">
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>
      </td>
    </tr>
  );
};

/** Botón de acción del footer de una tarjeta: mismo color/hover/tooltip que usa Clientes (Card.tsx, variant "default"). */
const CardFooterAction: React.FC<{ icon: typeof faEdit; title: string; onClick: () => void }> = ({ icon, title, onClick }) => (
  <div className="relative group/action flex items-center">
    <button onClick={onClick} className="p-1 rounded transition-colors hover:text-gray-800 dark:hover:text-gray-300 text-gray-600 dark:text-gray-400">
      <FontAwesomeIcon icon={icon} className="h-4 w-4" />
    </button>
    <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/action:opacity-100 dark:bg-gray-700">
      {title}
    </span>
  </div>
);

const SortableEstadoCard: React.FC<SortableEstadoProps> = ({ estado, isReorderMode, nombreTipoContrato, abrirEditar, eliminar }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: estado._id, disabled: !isReorderMode });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 1 : 0 };
  const color = colorEfectivo(estado);
  const tipos = estado.data?.contratoFrameIds || [];

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {isReorderMode && (
        <div {...attributes} {...listeners} className="absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center cursor-grab active:cursor-grabbing shadow-lg">
          <FontAwesomeIcon icon={faGrip} className="h-3.5 w-3.5" />
        </div>
      )}
      <div className={`bg-white dark:bg-gray-800 rounded-xl border p-4 flex flex-col gap-3 ${isReorderMode ? 'border-2 border-blue-500/50 shadow-blue-500/10' : 'border-gray-200 dark:border-gray-700'}`}>
        <div className="flex flex-col gap-1.5 min-w-0">
          <BadgePreview texto={estado.data?.nombreEnContrato?.trim() || estado.name} color={color} esImpositivo={!!estado.data?.esImpositivo} />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{estado.name}</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0" title={tipos.length === 0 ? 'Se ofrece en todos los tipos de contrato' : `${tipos.length} tipo${tipos.length === 1 ? '' : 's'} de contrato`}>
              ({tipos.length || 'Todos'})
            </span>
            {estado.data?.esImpositivo ? <ChipImpositivo /> : null}
          </div>
          {estado.data?.nombreEnContrato ? <span className="text-[11px] text-gray-500 dark:text-gray-400">En el contrato: {estado.data.nombreEnContrato}</span> : null}
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

        <div className={`flex items-center justify-end gap-1 pt-2 mt-auto border-t border-gray-100 dark:border-gray-700/60 ${isReorderMode ? 'opacity-20 pointer-events-none' : ''}`}>
          <CardFooterAction icon={faEdit} title="Editar estado" onClick={() => abrirEditar(estado)} />
          <CardFooterAction icon={faTrash} title="Eliminar estado" onClick={() => eliminar(estado)} />
        </div>
      </div>
    </div>
  );
};

export default ContractStatesTab;
