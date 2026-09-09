import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileContract, faDownload, faPlus, faEdit, faTrash, faEye, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../components/ui/PageLayout';
import { getHelp, hasHelp } from '../data/help/helpContent';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Modal } from '../components/ui/Modal';
import { MembreteToggle } from '../components/MembreteToggle';
import { InfoModal } from '../components/ui/InfoModal';
import { Card } from '../components/ui/Card';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { sweetAlert } from '../utils/sweetAlert';
import { fuzzyMatch } from '../utils/searchHelpers';
import { contratoFrameAPI, ContratoFrameItem, contratoVariables } from '../api/contratosFrame';
import { contratosAPI, ContratoItem } from '../api/contratos';
import { RichTextEditor } from '../components/ui/RichTextEditor';

const emptyForm = { nombre: '', externalId: '', content: '', contratoId: '' };

/** El editor devuelve "<p></p>" cuando está vacío: chequeamos que haya texto real. */
const hasContent = (html: string): boolean =>
  !!html &&
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim().length > 0;

/** Primeros caracteres del contenido en texto plano (sin las etiquetas HTML del editor). */
const contentPreview = (html: string, max = 60): string => {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

export const ContratosFramePage: React.FC = () => {
  const navigate = useNavigate();
  const HELP_KEY = 'contratosFrame' as const;
  const helpEntry = getHelp(HELP_KEY);
  const [showInfo, setShowInfo] = useState(false);
  const [items, setItems] = useState<ContratoFrameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  // Vista (Tabla vs Tarjetas)
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) setViewMode('cards');
    };
    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem('contratosViewMode');
      if (saved === 'table' || saved === 'cards') setViewMode(saved as ViewMode);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => {
    if (isLarge) localStorage.setItem('contratosViewMode', viewMode);
  }, [viewMode, isLarge]);
  const effectiveViewMode: ViewMode = isLarge ? viewMode : 'cards';

  const [showSinContenidoInfo, setShowSinContenidoInfo] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ContratoFrameItem | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [usaMembrete, setUsaMembrete] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // Contratos (ABM Configuración → Contratos): cada Plantilla elige a cuál pertenece.
  const [contratos, setContratos] = useState<ContratoItem[]>([]);
  const contratoElegido = contratos.find((c) => c._id === form.contratoId) || null;
  const nombreContrato = (id?: string | { _id: string; name: string }) => {
    const contratoId = typeof id === 'object' ? id?._id : id;
    return contratos.find((c) => c._id === contratoId)?.name || (typeof id === 'object' ? id?.name : '') || 'Sin contrato';
  };

  const load = async () => {
    setLoading(true);
    try {
      const [plantillas, tiposDeContrato] = await Promise.all([contratoFrameAPI.list(), contratosAPI.list()]);
      setItems(plantillas);
      setContratos(tiposDeContrato);
    } catch {
      sweetAlert.error('Error', 'No se pudieron cargar los contratos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = items.filter((it) => {
    if (filterActive === 'active' && it.isActive === false) return false;
    if (filterActive === 'inactive' && it.isActive !== false) return false;
    return !search.trim() || fuzzyMatch(it.name || '', search);
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setUsaMembrete(false);
    setIsActive(true);
    setShowModal(true);
  };

  const openEdit = (item: ContratoFrameItem) => {
    setEditing(item);
    setForm({
      nombre: item.name || '',
      externalId: item.externalId || '',
      content: item.content || '',
      contratoId: typeof item.contratoId === 'object' ? item.contratoId?._id || '' : item.contratoId || '',
    });
    setUsaMembrete(!!item.usaMembrete);
    setIsActive(item.isActive ?? true);
    setShowModal(true);
  };

  // Abrir el editor de una plantilla puntual cuando se llega con ?edit=<id> (ej. desde el modal de
  // contratos de una persona, link "Sin contenido"). Se limpia el query param para no reabrirlo.
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || items.length === 0) return;
    const item = items.find((it) => it._id === editId);
    if (item) {
      openEdit(item);
      const next = new URLSearchParams(searchParams);
      next.delete('edit');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, searchParams]);

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      sweetAlert.error('Falta el nombre', 'El nombre de la plantilla es obligatorio.');
      return;
    }
    if (!form.contratoId) {
      sweetAlert.error('Falta el Contrato', 'Elegí a qué Contrato pertenece esta plantilla.');
      return;
    }
    // El contenido es opcional: se puede crear la plantilla y redactarla más adelante.
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        contratoId: form.contratoId,
        externalId: form.externalId.trim(),
        content: form.content,
        usaMembrete,
        isActive,
      };

      if (editing) {
        await contratoFrameAPI.update(editing._id, payload);
        sweetAlert.success('Actualizado', 'Contrato actualizado correctamente.');
      } else {
        await contratoFrameAPI.create(payload);
        sweetAlert.success('Creado', 'Contrato creado.');
      }
      setShowModal(false);
      await load();
    } catch {
      sweetAlert.error('Error', 'No se pudo guardar el contrato.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    handleSave();
  };

  const handleDelete = async (item: ContratoFrameItem) => {
    const result = await sweetAlert.confirm('¿Eliminar?', `Se eliminará "${item.name}". Esta acción no se puede deshacer.`);
    if (!result.isConfirmed) return;
    try {
      await contratoFrameAPI.remove(item._id);
      sweetAlert.success('Eliminado', 'Contrato eliminado correctamente.');
      await load();
    } catch {
      sweetAlert.error('Error', 'No se pudo eliminar el contrato.');
    }
  };

  /*
   * Los dos avisan que están trabajando, y no es cosmético: el PDF lo arma un navegador headless en
   * el server, así que entre el click y el resultado pasan varios segundos con la pantalla igual que
   * antes. Sin señal, lo que pasa es que se vuelve a hacer click y se encolan más generaciones.
   */
  const handleDownloadFile = async (item: ContratoFrameItem) => {
    try {
      sweetAlert.loading('Generando el archivo…', 'Puede tardar unos segundos.');
      await contratoFrameAPI.download(item);
    } catch {
      sweetAlert.error('Error', 'No se pudo descargar el archivo.');
    } finally {
      sweetAlert.close();
    }
  };

  /** Abre la previsualización del contrato (PDF de ejemplo) en una pestaña nueva, sin entrar a editar. */
  const handlePreviewItem = async (item: ContratoFrameItem) => {
    if (!hasContent(item.content || '')) {
      sweetAlert.error('Sin contenido', 'Este contrato no tiene contenido para previsualizar.');
      return;
    }
    try {
      sweetAlert.loading('Generando la previsualización…', 'Se abre en una pestaña nueva cuando esté lista.');
      const blob = await contratoFrameAPI.preview(item.content || '', item.usaMembrete);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      sweetAlert.error('Error', 'No se pudo generar la previsualización.');
    } finally {
      sweetAlert.close();
    }
  };

  /** Genera y descarga un PDF de ejemplo con el contenido actual del editor (sin guardar). */
  const handlePreview = async () => {
    if (!hasContent(form.content)) {
      sweetAlert.error('Sin contenido', 'Escribí el contenido del contrato para previsualizarlo.');
      return;
    }
    try {
      setPreviewing(true);
      // Este botón ya cambia a "Generando...", pero está en el pie del modal y con el editor scrolleado
      // queda fuera de la vista: el aviso es lo único que se ve desde donde uno estaba mirando.
      sweetAlert.loading('Generando la previsualización…', 'Puede tardar unos segundos.');
      const blob = await contratoFrameAPI.preview(form.content, usaMembrete);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Preview_${form.nombre || 'Contrato'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      sweetAlert.error('Error', 'No se pudo generar la previsualización.');
    } finally {
      sweetAlert.close();
      setPreviewing(false);
    }
  };

  const headerActions = (
    <div className="flex flex-wrap gap-2">
      <button onClick={openCreate} title="Nuevo contrato" aria-label="Nuevo contrato" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
        <FontAwesomeIcon icon={faPlus} />
      </button>
      <button onClick={() => navigate('/contratos')} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
        <FontAwesomeIcon icon={faFileContract} />
        <span className="hidden lg:block">Contratos</span>
      </button>
    </div>
  );

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input type={type} value={form[key]} placeholder={placeholder} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
    </div>
  );

  return (
    <PageLayout title="Plantillas | Contratos" subtitle="Catálogo de contratos de FRAME. Cargá registros manualmente o importá un Excel." faIcon={{ icon: faFileContract }} headerActions={headerActions} shouldShowInfo={hasHelp(HELP_KEY)} infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: helpEntry.title, size: helpEntry.size, content: helpEntry.content }}>
      {/* Búsqueda y filtros con el control compartido: botón de «Filtros», modal y badges de lo aplicado,
          igual que en Usuarios y Pedidos. El sentinela "all" queda adentro de la página —lo lee
          `filtered`— y se traduce a "" acá, que es lo que el componente entiende por "sin filtro". */}
      <div className="mb-4">
        <SearchAndFilters
          searchTerm={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar contrato..."
          radioFilters={[
            {
              label: 'Estado',
              value: filterActive === 'all' ? '' : filterActive,
              onChange: (v) => setFilterActive((v || 'all') as 'all' | 'active' | 'inactive'),
              options: [
                { value: 'active', label: 'Activos' },
                { value: 'inactive', label: 'Inactivos' },
                { value: 'all', label: 'Todos' },
              ],
            },
          ]}
          extraActions={isLarge ? <ViewToggle value={viewMode} onChange={setViewMode} /> : undefined}
        />
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">{items.length === 0 ? 'Todavía no hay contratos. Cargá uno con "Nuevo" o importá un Excel.' : 'No hay resultados para la búsqueda.'}</div>
      ) : effectiveViewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
          {filtered.map((item) => (
            <Card
              key={item._id}
              onClick={() => openEdit(item)}
              className="cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200"
              header={{
                title: item.name,
                icon: faFileContract,
                badges: [item.isActive === false ? { text: 'Inactivo', variant: 'destructive' } : { text: 'Activo', variant: 'green' }, item.usaMembrete ? { text: 'Membrete activo', variant: 'green' } : { text: 'Membrete inactivo', variant: 'default' }, ...(item.externalId ? [{ text: `ID ${item.externalId}`, variant: 'blue' as const }] : [])],
              }}
              footer={{
                leftContent: undefined,
                actions: [
                  ...(item.content
                    ? [
                        {
                          icon: faEye,
                          onClick: (e: React.MouseEvent) => {
                            e.stopPropagation();
                            handlePreviewItem(item);
                          },
                          title: 'Previsualizar',
                          variant: 'default' as const,
                        },
                        {
                          icon: faDownload,
                          onClick: (e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleDownloadFile(item);
                          },
                          title: 'Descargar PDF de ejemplo',
                          variant: 'default' as const,
                        },
                      ]
                    : []),
                  {
                    icon: faEdit,
                    onClick: (e) => {
                      e.stopPropagation();
                      openEdit(item);
                    },
                    title: 'Editar',
                    variant: 'default',
                  },
                  {
                    icon: faTrash,
                    onClick: (e) => {
                      e.stopPropagation();
                      handleDelete(item);
                    },
                    title: 'Eliminar',
                    variant: 'default',
                  },
                ],
              }}
            >
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Contrato</label>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300" title={`${item.data?.cantidadJornadas ?? 0} jornadas · x${item.data?.multiplicadorDiario ?? 0}${item.data?.esTiempoIndeterminado ? ' · Tiempo indeterminado' : ''}`}>
                  {nombreContrato(item.contratoId)}
                </div>
              </div>
            </Card>
          ))}
          <Card variant="create" onClick={openCreate} header={{ title: 'Nuevo', subtitle: 'Agregar contrato', icon: faFileContract }} />
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contrato</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Membrete | Firma</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">Contenido</th>
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {filtered.map((item) => {
                const sinContenido = !hasContent(item.content || '');
                return (
                  <tr key={item._id} className={`cursor-pointer ${sinContenido ? 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-900/20'}`} onClick={() => openEdit(item)}>
                    <td className={`px-5 py-3 text-sm font-medium ${sinContenido ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-white'}`}>
                      <span className="inline-flex items-center gap-2">
                        {item.name}
                        {sinContenido && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowSinContenidoInfo(true);
                            }}
                            className="text-red-500 hover:text-red-600 transition-colors"
                            title="Sin contenido"
                            aria-label="Sin contenido"
                          >
                            <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300" title={`${item.data?.cantidadJornadas ?? 0} jornadas · x${item.data?.multiplicadorDiario ?? 0}${item.data?.esTiempoIndeterminado ? ' · Tiempo indeterminado' : ''}`}>
                      {nombreContrato(item.contratoId)}
                    </td>
                    <td className="px-5 py-3 text-sm whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${item.isActive === false ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>{item.isActive === false ? 'Inactivo' : 'Activo'}</span>
                    </td>
                    <td className="px-5 py-3 text-sm whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${item.usaMembrete ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>{item.usaMembrete ? 'Activo' : 'Inactivo'}</span>
                    </td>
                    <td className="px-5 py-3 text-sm hidden lg:table-cell">
                      {sinContenido ? (
                        <span className="font-medium text-red-600 dark:text-red-400">Sin contenido</span>
                      ) : (
                        <span className="truncate max-w-[280px] block text-gray-500 dark:text-gray-400" title="Contenido redactado">
                          {contentPreview(item.content || '')}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {!sinContenido && (
                          <button onClick={() => handlePreviewItem(item)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Previsualizar">
                            <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
                          </button>
                        )}
                        {!sinContenido && (
                          <button onClick={() => handleDownloadFile(item)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Descargar PDF de ejemplo">
                            <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={() => openEdit(item)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Editar">
                          <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(item)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" title="Eliminar">
                          <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditing(null);
        }}
        title={editing ? 'Editar Contrato' : 'Nuevo Contrato'}
        size="lg"
        footer={
          <div className="flex justify-between gap-2 w-full">
            <button type="button" onClick={handlePreview} disabled={previewing} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">
              <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
              {previewing ? 'Generando...' : 'Previsualizar'}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                onClick={() => {
                  setShowModal(false);
                  setEditing(null);
                }}
              >
                Cancelar
              </button>
              <button type="submit" form="contrato-form" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        }
      >
        <form id="contrato-form" onSubmit={handleSubmitForm}>
          <div className="space-y-6">
            {field('Nombre *', 'nombre')}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contrato *</label>
              <select value={form.contratoId} onChange={(e) => setForm((f) => ({ ...f, contratoId: e.target.value }))} className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                <option value="">{contratos.length ? 'Selecciona un contrato...' : 'No hay contratos cargados'}</option>
                {contratos.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                    {c.isActive === false ? ' (inactivo)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Define jornadas, multiplicador y vigencia. Se administra en <strong>Configuración → Contratos</strong>.{!contratos.length && ' Todavía no hay contratos cargados: creá uno primero.'}
              </p>
              {contratoElegido && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                  <span>
                    <strong>{contratoElegido.data.cantidadJornadas}</strong> jornadas
                  </span>
                  <span>
                    Multiplicador <strong>{contratoElegido.data.multiplicadorDiario}</strong>
                  </span>
                  {contratoElegido.data.esTiempoIndeterminado && <span className="font-semibold text-blue-600 dark:text-blue-400">Tiempo indeterminado</span>}
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
              Contrato activo
            </label>

            <MembreteToggle checked={usaMembrete} onChange={setUsaMembrete} />

            {/* Contenido del contrato */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contenido</label>
              <RichTextEditor value={form.content} onChange={(html) => setForm((f) => ({ ...f, content: html }))} variables={contratoVariables} variablesTitle="Variables del contrato" />
              <p className="text-xs text-gray-500 mt-1">Opcional: podés crear el contrato y redactarlo más adelante, pero sin contenido no se puede generar el PDF. Las variables se reemplazan al descargar con los datos de la persona y de la empresa seteada en el proyecto (Empresa del Contrato).</p>
            </div>
          </div>
        </form>
      </Modal>

      <InfoModal isOpen={showSinContenidoInfo} onClose={() => setShowSinContenidoInfo(false)} title="Contrato sin contenido" subtitle="Por qué está marcado en rojo" size="sm" zIndex={100} actions={[{ label: 'Entendido', onClick: () => setShowSinContenidoInfo(false), variant: 'primary' }]}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Este contrato todavía <strong>no tiene contenido redactado</strong>.
          </p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Los contratos sin contenido <strong>no se pueden descargar desde los proyectos</strong> para enviarse a firmar.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Editá el contrato y redactá su contenido para habilitarlo.</span>
            </li>
          </ul>
        </div>
      </InfoModal>
    </PageLayout>
  );
};
