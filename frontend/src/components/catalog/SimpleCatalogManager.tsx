import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faDownload, faUpload, faPlus, faEdit, faTrash, faTimes, faFileExcel, faStar, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../ui/PageLayout';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Card } from '../ui/Card';
import { ViewToggle, ViewMode } from '../ui/ViewToggle';
import { sweetAlert } from '../../utils/sweetAlert';
import { fuzzyMatch } from '../../utils/searchHelpers';
import { SimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { getHelp, hasHelp, HelpKey } from '../../data/help/helpContent';

/** Descriptor de un campo extra propio de un catálogo (además de nombre / ID externo). */
export interface CatalogExtraField {
  key: string;
  label: string;
  type?: 'text' | 'select';
  /** Opciones para type "select". El value es lo que se persiste; el label lo que se muestra. */
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  /** Si se muestra como columna en la vista de tabla. */
  showColumn?: boolean;
  /** Encabezado de la columna (por defecto usa `label`). */
  columnLabel?: string;
  placeholder?: string;
}

interface SimpleCatalogManagerProps {
  title: string;
  subtitle?: string;
  icon: IconDefinition;
  /** Etiqueta singular, ej. "banco", "obra social". */
  entityLabel: string;
  api: SimpleCatalogApi;
  /** Nombre base para el archivo descargado, ej. "bancos". */
  templateBaseName: string;
  /** Campos extra propios del catálogo (ej. Bancos → "Tipo de Entidad"). */
  extraFields?: CatalogExtraField[];
  /** Clave de ayuda para el modal de info (i). */
  helpKey?: HelpKey;
  /** Etiqueta de "ID Externo" (columna, campo del form, badge de tarjeta), por si en este catálogo
   *  ese id tiene otro nombre de dominio (ej. Obras Sociales → "RNOS"). Default: "ID Externo". */
  externalIdLabel?: string;
  /** Placeholder del input de "ID Externo". Default: "ID de FRAME". */
  externalIdPlaceholder?: string;
  /** Formatea `externalId` SOLO para mostrarlo (columna, tarjeta, input al editar), ej. agregarle guiones al RNOS. */
  formatExternalId?: (value: string) => string;
  /** Normaliza lo que se escribió (ej. sacar los guiones que puso `formatExternalId`) antes de guardar. */
  sanitizeExternalId?: (value: string) => string;
  /**
   * Señala en el listado cuál es el registro marcado como valor por defecto. Es SOLO INFORMATIVO:
   * la marca se configura en otra pestaña, no acá, para no mezclar el ABM del catálogo con la
   * configuración de qué se aplica cuando falta el dato.
   */
  porDefecto?: {
    /** Texto del badge, ej. "Por defecto (global)". */
    etiqueta: string;
    /** Dónde se configura — se muestra en el ⓘ al lado del badge. */
    ayuda: string;
    /** Devuelve true si este item es el marcado. */
    esPorDefecto: (item: SimpleCatalogItem) => boolean;
  };
  /**
   * Pestañas extra junto al listado (ej. "Por defecto" en Obras Sociales). El catálogo es siempre
   * la primera. Al pararse en otra se ocultan el buscador y las acciones de ABM: pertenecen al
   * listado, no a la configuración.
   */
  pestanas?: Array<{ id: string; label: string; icon?: IconDefinition; render: (items: SimpleCatalogItem[], recargar: () => Promise<void>) => React.ReactNode }>;
}

export const SimpleCatalogManager: React.FC<SimpleCatalogManagerProps> = ({ title, subtitle, icon, entityLabel, api, templateBaseName, extraFields = [], helpKey, externalIdLabel = 'ID Externo', externalIdPlaceholder = 'ID de FRAME', formatExternalId, sanitizeExternalId, porDefecto, pestanas }) => {
  const [items, setItems] = useState<SimpleCatalogItem[]>([]);
  const [tabActiva, setTabActiva] = useState<string>('catalogo');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const helpEntry = helpKey ? getHelp(helpKey) : null;

  // Vista (Tabla vs Tarjetas)
  const storageKey = `catalog_${templateBaseName}_viewMode`;
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) setViewMode('cards');
    };
    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'table' || saved === 'cards') setViewMode(saved as ViewMode);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (isLarge) localStorage.setItem(storageKey, viewMode);
  }, [viewMode, isLarge, storageKey]);
  const effectiveViewMode: ViewMode = isLarge ? viewMode : 'cards';

  // ABM modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SimpleCatalogItem | null>(null);
  const [nombre, setNombre] = useState('');
  const [externalId, setExternalId] = useState('');
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Valor por defecto de un campo extra al crear (primer option del select, o "").
  const defaultExtra = (f: CatalogExtraField): string => (f.type === 'select' && f.options && f.options.length > 0 ? f.options[0].value : '');
  // Etiqueta legible de un valor guardado (mapea value → label en selects).
  const extraDisplay = (f: CatalogExtraField, value: unknown): string => {
    const v = value == null ? '' : String(value);
    if (!v) return '—';
    if (f.type === 'select') return f.options?.find((o) => o.value === v)?.label ?? v;
    return v;
  };

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.list();
      setItems(data);
    } catch {
      sweetAlert.error('Error', `No se pudieron cargar los registros de ${entityLabel}.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = items.filter((it) => !search.trim() || fuzzyMatch(it.name || '', search));

  const openCreate = () => {
    setEditing(null);
    setNombre('');
    setExternalId('');
    setExtraValues(Object.fromEntries(extraFields.map((f) => [f.key, defaultExtra(f)])));
    setShowModal(true);
  };

  const openEdit = (item: SimpleCatalogItem) => {
    setEditing(item);
    setNombre(item.name || '');
    setExternalId((formatExternalId ? formatExternalId(item.externalId || '') : item.externalId) || '');
    setExtraValues(Object.fromEntries(extraFields.map((f) => [f.key, item[f.key] != null ? String(item[f.key]) : defaultExtra(f)])));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!nombre.trim()) {
      sweetAlert.error('Falta el nombre', 'El nombre es obligatorio.');
      return;
    }
    const missing = extraFields.find((f) => f.required && !String(extraValues[f.key] ?? '').trim());
    if (missing) {
      sweetAlert.error(`Falta ${missing.label.toLowerCase()}`, `El campo "${missing.label}" es obligatorio.`);
      return;
    }
    const extraPayload = Object.fromEntries(extraFields.map((f) => [f.key, String(extraValues[f.key] ?? '').trim()]));
    const cleanExternalId = sanitizeExternalId ? sanitizeExternalId(externalId.trim()) : externalId.trim();
    setSaving(true);
    try {
      if (editing) {
        await api.update(editing._id, { nombre: nombre.trim(), externalId: cleanExternalId, ...extraPayload });
        sweetAlert.success('Actualizado', `${title} actualizado correctamente.`);
      } else {
        await api.create({ nombre: nombre.trim(), externalId: cleanExternalId, ...extraPayload });
        sweetAlert.success('Creado', `Registro de ${entityLabel} creado.`);
      }
      setShowModal(false);
      await load();
    } catch {
      sweetAlert.error('Error', 'No se pudo guardar el registro.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: SimpleCatalogItem) => {
    const result = await sweetAlert.confirm('¿Eliminar?', `Se eliminará "${item.name}". Esta acción no se puede deshacer.`);
    if (!result.isConfirmed) return;
    try {
      await api.remove(item._id);
      sweetAlert.success('Eliminado', 'Registro eliminado correctamente.');
      await load();
    } catch {
      sweetAlert.error('Error', 'No se pudo eliminar el registro.');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await api.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plantilla_${templateBaseName}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      sweetAlert.error('Error', 'No se pudo descargar la plantilla.');
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const res = await api.importExcel(importFile);
      sweetAlert.success('Importación completada', `${res.count} registros procesados.`);
      setShowImport(false);
      setImportFile(null);
      await load();
    } catch (err: any) {
      const details = err?.response?.data?.details;
      sweetAlert.error('Error al importar', Array.isArray(details) ? details.slice(0, 5).join('\n') : err?.response?.data?.error || 'No se pudo importar el archivo.');
    } finally {
      setImporting(false);
    }
  };

  const enCatalogo = tabActiva === 'catalogo';
  const headerActions = !enCatalogo ? null : (
    <div className="flex flex-wrap gap-2">
      <button onClick={handleDownloadTemplate} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
        <FontAwesomeIcon icon={faDownload} /> Plantilla
      </button>
      <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
        <FontAwesomeIcon icon={faUpload} /> Importar Excel
      </button>
      <button onClick={openCreate} title={`Nuevo ${entityLabel}`} aria-label={`Nuevo ${entityLabel}`} className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
        <FontAwesomeIcon icon={faPlus} />
      </button>
    </div>
  );

  return (
    <PageLayout
      title={title}
      subtitle={subtitle}
      faIcon={{ icon }}
      headerActions={headerActions}
      shouldShowInfo={!!helpKey && hasHelp(helpKey)}
      infoModal={
        helpKey && helpEntry
          ? {
              isOpen: showInfo,
              onOpen: () => setShowInfo(true),
              onClose: () => setShowInfo(false),
              title: helpEntry.title,
              size: helpEntry.size,
              content: helpEntry.content,
            }
          : undefined
      }
    >
      {pestanas && pestanas.length > 0 && (
        <div className="mb-5 border-b border-gray-200 dark:border-gray-700 flex gap-1 overflow-x-auto">
          {[{ id: 'catalogo', label: title, icon }, ...pestanas].map((t) => (
            <button
              key={t.id}
              onClick={() => setTabActiva(t.id)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                tabActiva === t.id
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t.icon && <FontAwesomeIcon icon={t.icon} className="mr-2 h-3.5 w-3.5" />}
              {t.label}
            </button>
          ))}
        </div>
      )}

      {!enCatalogo ? (
        pestanas?.find((t) => t.id === tabActiva)?.render(items, load)
      ) : (
        <>
      <div className="mb-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar ${entityLabel}...`} className="w-full max-w-md px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
        {isLarge && <ViewToggle value={viewMode} onChange={setViewMode} />}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">{items.length === 0 ? `Todavía no hay registros de ${entityLabel}. Cargá uno con "Nuevo" o importá un Excel.` : 'No hay resultados para la búsqueda.'}</div>
      ) : effectiveViewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
          {filtered.map((item) => (
            <Card
              key={item._id}
              onClick={() => openEdit(item)}
              className="cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200"
              header={{
                title: item.name,
                icon,
                badges: [...(porDefecto && porDefecto.esPorDefecto(item) ? [{ text: porDefecto.etiqueta, variant: 'warning' as const, icon: faStar }] : []), ...extraFields.filter((f) => f.showColumn && item[f.key]).map((f) => ({ text: extraDisplay(f, item[f.key]), variant: 'cyan' as const })), ...(item.externalId ? [{ text: `${externalIdLabel} ${formatExternalId ? formatExternalId(item.externalId) : item.externalId}`, variant: 'blue' as const }] : [])],
              }}
              footer={{
                actions: [
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
            />
          ))}
          <Card variant="create" onClick={openCreate} header={{ title: `Nuevo`, subtitle: `Agregar ${entityLabel}`, icon }} />
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                {extraFields
                  .filter((f) => f.showColumn)
                  .map((f) => (
                    <th key={f.key} className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {f.columnLabel || f.label}
                    </th>
                  ))}
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{externalIdLabel}</th>
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {filtered.map((item) => (
                <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      {item.name}
                      {porDefecto && porDefecto.esPorDefecto(item) && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          <FontAwesomeIcon icon={faStar} className="h-3 w-3" />
                          {porDefecto.etiqueta}
                          <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3 opacity-70 cursor-help" title={porDefecto.ayuda} />
                        </span>
                      )}
                    </span>
                  </td>
                  {extraFields
                    .filter((f) => f.showColumn)
                    .map((f) => (
                      <td key={f.key} className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {extraDisplay(f, item[f.key])}
                      </td>
                    ))}
                  <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">{item.externalId ? (formatExternalId ? formatExternalId(item.externalId) : item.externalId) : '—'}</td>
                  <td className="px-5 py-3 text-sm text-right">
                    <button onClick={() => openEdit(item)} className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 mr-3" title="Editar">
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button onClick={() => handleDelete(item)} className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300" title="Eliminar">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}

      {/* ABM Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? 'Editar' : 'Nuevo'} {title}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white" />
              </div>
              {extraFields.map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {f.label}
                    {f.required ? ' *' : ''}
                  </label>
                  {f.type === 'select' ? (
                    <select value={extraValues[f.key] ?? ''} onChange={(e) => setExtraValues((prev) => ({ ...prev, [f.key]: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
                      {!f.required && <option value="">—</option>}
                      {(f.options || []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value={extraValues[f.key] ?? ''} onChange={(e) => setExtraValues((prev) => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.placeholder} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white" />
                  )}
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{externalIdLabel} (opcional)</label>
                <input type="text" value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder={externalIdPlaceholder} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Importar {title} desde Excel</h3>
              <button
                onClick={() => {
                  setShowImport(false);
                  setImportFile(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">Descargá la plantilla, completala y subila acá. Los registros se actualizan/crean por nombre o {externalIdLabel.toLowerCase()}.</p>
              <label className="flex items-center gap-3 px-4 py-6 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/30">
                <FontAwesomeIcon icon={faFileExcel} className="text-emerald-600 text-xl" />
                <span className="text-sm text-gray-600 dark:text-gray-300">{importFile ? importFile.name : 'Seleccionar archivo .xlsx'}</span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-4">
              <button
                onClick={() => {
                  setShowImport(false);
                  setImportFile(null);
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
              >
                Cancelar
              </button>
              <button onClick={handleImport} disabled={!importFile || importing} className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">
                {importing ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};
