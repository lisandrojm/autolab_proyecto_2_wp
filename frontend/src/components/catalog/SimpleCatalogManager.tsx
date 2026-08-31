import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faDownload, faUpload, faPlus, faEdit, faTrash, faTimes, faFileExcel, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../ui/PageLayout';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Card } from '../ui/Card';
import { ViewToggle, ViewMode } from '../ui/ViewToggle';
import { Modal } from '../ui/Modal';
import { Paginador, POR_PAGINA } from '../ui/Paginador';
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
  /**
   * Bloque propio del catálogo, al final del formulario de edición.
   *
   * Para lo que no es un campo del registro: relaciones que viven en OTRA colección y se guardan por
   * su cuenta. En Convenios son las empresas que lo tienen registrado — el dato está en
   * `Company.convenioIds`, no en el convenio, así que no puede entrar por `extraFields` ni salir en
   * el mismo `update`.
   *
   * Solo se muestra al EDITAR: un registro que todavía no existe no tiene a qué relacionarse.
   */
  extraSeccion?: (item: SimpleCatalogItem) => React.ReactNode;
  /**
   * Columnas de solo lectura CALCULADAS, que no son campos del registro (ej. Convenios → "en cuántas
   * empresas está registrado"). Se distinguen de `extraFields` porque no se editan ni se guardan.
   */
  columnasCalculadas?: Array<{ label: string; render: (item: SimpleCatalogItem) => React.ReactNode }>;
  /**
   * Filtro destacado de dos estados, para catálogos donde el universo no es lo que se trabaja.
   *
   * El caso real son los Convenios: el nomenclador de ARCA tiene 2.669 y solo importan los 5 que
   * alguna empresa registró. Sin esto, la columna "Obra Social" muestra 2.664 guiones y parece que
   * faltan 2.664 configuraciones.
   */
  filtroDestacado?: {
    /** Texto del estado acotado, ej. "Registrados por alguna empresa". */
    etiqueta: string;
    /** `true` si el item pasa el filtro acotado. */
    aplica: (item: SimpleCatalogItem) => boolean;
  };
  /**
   * Reemplaza la tabla genérica por una propia del dominio, conservando el resto del manager
   * (buscador, filtro, import, plantilla y el ABM en modal).
   *
   * Existe para que Convenios use LA MISMA tabla que la ficha de empresa: eran dos tablas de la
   * misma entidad con encabezados distintos, y habían divergido. Recibe las acciones ya armadas
   * (editar / eliminar), que es lo único que el manager sabe y la tabla del dominio no.
   */
  tablaPropia?: (props: {
    items: SimpleCatalogItem[];
    renderAcciones: (item: SimpleCatalogItem) => React.ReactNode;
    /**
     * En qué estado del filtro destacado está la pantalla, por si alguna columna solo aplica a uno.
     *
     * Convenios lo usó un tiempo para esconder la columna de paritarias en «Ver todos», cuando esa
     * columna decía «No vigilado» y se leía como una falta. Ya no: separado el catálogo de fuentes
     * de la vigilancia, dónde publica sus acuerdos un convenio es una propiedad del convenio y vale
     * para los 2.669, los use alguien o no.
     */
    soloDestacados: boolean;
  }) => React.ReactNode;
  /**
   * Bloque propio del catálogo ARRIBA del buscador: avisos que pertenecen a esta entidad.
   *
   * Es donde van los banners —Convenios cuelga acá los de vigilancia de paritarias—, con la misma
   * forma que los de `/arca/categorias`. Va antes del buscador porque un aviso debajo del filtro se
   * lee como parte del resultado de la búsqueda y desaparece al filtrar.
   */
  extraSuperior?: React.ReactNode;
  /**
   * Una línea de recuento sobre el catálogo COMPLETO, arriba de la tabla.
   *
   * Recibe todos los items —no los de la página ni los del filtro— porque lo que cuenta es el
   * universo: «fuente conocida en 5 de 2.669» encuadra una columna mayormente vacía como
   * conocimiento que se acumula, en vez de como 2.664 pendientes. El mismo dato dentro de cada fila,
   * con un ícono de alerta, diría lo contrario.
   */
  resumen?: (items: SimpleCatalogItem[]) => React.ReactNode;
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
   * Pestañas extra junto al listado (ej. "Por defecto" en Obras Sociales). El catálogo es siempre
   * la primera. Al pararse en otra se ocultan el buscador y las acciones de ABM: pertenecen al
   * listado, no a la configuración.
   */
  pestanas?: Array<{ id: string; label: string; icon?: IconDefinition; render: (items: SimpleCatalogItem[], recargar: () => Promise<void>) => React.ReactNode }>;
}

export const SimpleCatalogManager: React.FC<SimpleCatalogManagerProps> = ({ title, subtitle, icon, entityLabel, api, templateBaseName, extraFields = [], extraSeccion, helpKey, externalIdLabel = 'ID Externo', externalIdPlaceholder = 'ID de FRAME', formatExternalId, sanitizeExternalId, pestanas, columnasCalculadas = [], filtroDestacado, tablaPropia, extraSuperior, resumen }) => {
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

  /**
   * Error de LECTURA, en la página y no en un modal.
   *
   * Un catálogo vacío no es un error —tiene su propio estado, "Todavía no hay registros"— y un
   * catálogo que no cargó tampoco es algo que el operador pueda contestar: un modal que hay que
   * cerrar para ver una pantalla vacía interrumpe sin aportar nada. Acá se dice qué pasó, en el lugar
   * donde iba la lista, y con un botón para reintentar.
   *
   * Los modales quedan para la ESCRITURA (guardar, borrar, importar), donde sí hubo una acción del
   * usuario que salió mal.
   */
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.list();
      setItems(data);
      setLoadError(null);
    } catch (err: any) {
      // El detalle importa: un 404 acá casi siempre es el server sin levantar la ruta nueva, y sin
      // el código uno se queda mirando una pantalla vacía sin saber si falta cargar datos o algo
      // está roto.
      const status = err?.response?.status;
      setLoadError(status ? `No se pudieron cargar los registros de ${entityLabel} (HTTP ${status}).` : `No se pudieron cargar los registros de ${entityLabel}: no hubo respuesta del servidor.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arranca ACOTADO cuando el catálogo trae filtro destacado: el universo es referencia, no trabajo.
  const [soloDestacados, setSoloDestacados] = useState(true);
  const destacados = filtroDestacado ? items.filter(filtroDestacado.aplica) : items;
  const base = filtroDestacado && soloDestacados ? destacados : items;
  /**
   * Dónde busca el buscador: en TODO lo que la tabla muestra.
   *
   * Buscaba solo en `name`, y en la mitad de los catálogos el nombre no es lo que uno tipea. En
   * Convenios las columnas son CÓDIGO · ACTIVIDAD · SIGNATARIO: el código es `externalId` y el
   * signatario un `extraField`, así que escribir «0609» —que está a la vista, en la primera
   * columna— devolvía «No hay resultados para la búsqueda». Un buscador que no encuentra lo que la
   * pantalla está mostrando se lee como que el dato no existe.
   *
   * El código entra DOS VECES, como se guarda y como se ve: `0609/03` y `060903`. Quien lo busca lo
   * copia de donde lo tenga, y ahí el separador puede estar o no. Lo mismo con el RNOS de las obras
   * sociales, que se muestra con guiones y se guarda sin ellos — de ahí que también entre la forma
   * que produce `formatExternalId`.
   */
  const textoBuscable = (it: SimpleCatalogItem): string => {
    const id = String(it.externalId || '');
    const partes = [it.name || '', id, id.replace(/[^a-zA-Z0-9]/g, ''), formatExternalId ? formatExternalId(id) : ''];
    // Los campos extra son columnas de la tabla en varios catálogos (el signatario del convenio, el
    // tipo de entidad de un banco). Se toman los de texto: un select guarda un id que nadie tipea.
    for (const f of extraFields) {
      if (f.type === 'select') continue;
      const v = (it as Record<string, unknown>)[f.key];
      if (typeof v === 'string' || typeof v === 'number') partes.push(String(v));
    }
    return partes.filter(Boolean).join(' ');
  };

  const filtered = base.filter((it) => !search.trim() || fuzzyMatch(textoBuscable(it), search));

  /*
    SE PAGINA LO QUE SE DIBUJA, NO LO QUE SE BUSCA.

    `filtered` es el resultado completo —de las 2.669 filas, no de las 50 que están a la vista— y
    recién después se recorta la página. Por eso el buscador encuentra un convenio que está en la
    página 47 y el resultado se vuelve a paginar solo. Al revés —paginar primero y buscar sobre la
    página— el buscador contestaría «no hay resultados» sobre datos que sí están cargados.

    Los datos siguen viniendo todos en una sola llamada (840 KB para convenios, que llegan en un
    suspiro). Lo que se sentía lento era el navegador armando 2.669 filas de tabla con tres columnas
    de texto largo, y eso es lo que esto corta.
  */
  const [pagina, setPagina] = useState(1);
  const visibles = filtered.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  /*
    Volver a la página 1 al cambiar lo que se está mirando.

    Sin esto, buscar algo estando en la página 30 muestra una lista vacía —el resultado tiene tres
    filas y no hay página 30— y se lee como «no encontró nada». Vale igual para el filtro de
    destacados y para una recarga que devuelva menos elementos que antes.
  */
  useEffect(() => {
    setPagina(1);
  }, [search, soloDestacados, tabActiva]);
  useEffect(() => {
    const ultima = Math.max(1, Math.ceil(filtered.length / POR_PAGINA));
    if (pagina > ultima) setPagina(ultima);
  }, [filtered.length, pagina]);

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
      // Contador al lado del título. En el catálogo acompaña a la búsqueda (cuántos quedaron
      // filtrados); en las otras pestañas no hay buscador, así que muestra el total cargado.
      itemCount={loading ? undefined : enCatalogo ? filtered.length : items.length}
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
      {extraSuperior && <div className="mb-4">{extraSuperior}</div>}
      {resumen && <div className="mb-4">{resumen(items)}</div>}
      <div className="mb-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar ${entityLabel}...`} className="w-full max-w-md px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
        <div className="flex items-center gap-3 shrink-0">
          {/* Dos estados, no un checkbox suelto: el contador de cada uno dice cuánto es "el universo"
              y cuánto "lo que se usa", que es la diferencia que hace útil el filtro. */}
          {filtroDestacado && (
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-xs font-semibold">
              <button type="button" onClick={() => setSoloDestacados(true)} className={`px-3 py-2 transition-colors ${soloDestacados ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                {filtroDestacado.etiqueta} ({destacados.length})
              </button>
              <button type="button" onClick={() => setSoloDestacados(false)} className={`px-3 py-2 border-l border-gray-300 dark:border-gray-600 transition-colors ${!soloDestacados ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                Ver todos ({items.length})
              </button>
            </div>
          )}
          {isLarge && <ViewToggle value={viewMode} onChange={setViewMode} />}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-6 flex items-start gap-3">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{loadError}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">No es que el catálogo esté vacío: la consulta no llegó a responder. Si el problema sigue, revisá que el servidor esté levantado.</p>
            <button type="button" onClick={load} className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-400 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
              Reintentar
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">{items.length === 0 ? `Todavía no hay registros de ${entityLabel}. Cargá uno con "Nuevo" o importá un Excel.` : 'No hay resultados para la búsqueda.'}</div>
      ) : effectiveViewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
          {visibles.map((item) => (
            <Card
              key={item._id}
              onClick={() => openEdit(item)}
              className="cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200"
              header={{
                title: item.name,
                icon,
                badges: [...extraFields.filter((f) => f.showColumn && item[f.key]).map((f) => ({ text: extraDisplay(f, item[f.key]), variant: 'cyan' as const })), ...(item.externalId ? [{ text: `${externalIdLabel} ${formatExternalId ? formatExternalId(item.externalId) : item.externalId}`, variant: 'blue' as const }] : [])],
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
        tablaPropia ? (
          // El catálogo trae su propia tabla (ej. Convenios, que la comparte con la ficha de empresa).
          // El manager solo aporta las acciones, que son lo único que la tabla del dominio no sabe.
          tablaPropia({
            items: visibles,
            soloDestacados: !filtroDestacado || soloDestacados,
            renderAcciones: (item) => (
              <>
                <button onClick={() => openEdit(item)} className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 mr-3" title="Editar">
                  <FontAwesomeIcon icon={faEdit} />
                </button>
                <button onClick={() => handleDelete(item)} className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300" title="Eliminar">
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </>
            ),
          })
        ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                {extraFields
                  .filter((f) => f.showColumn)
                  .map((f) => (
                    <th key={f.key} className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {f.columnLabel || f.label}
                    </th>
                  ))}
                {columnasCalculadas.map((c) => (
                  <th key={c.label} className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
                {/* `w-px` + `whitespace-nowrap`: la columna se encoge a lo que mide el código y no
                    lo parte. Un RNOS cortado en dos renglones ("9-0500-" / "8") deja de leerse como
                    un código y no se puede cotejar de un vistazo contra un padrón de ARCA. */}
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">{externalIdLabel}</th>
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {visibles.map((item) => (
                <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
                  {/*
                    Los valores de un `extraField` son etiquetas de catálogo —«2 — DISCONTINUOS»,
                    «1 — CONTINUOS»—, no texto corrido: partirlos en dos renglones por el guión hace
                    que una tabla de 293 filas tenga la mitad con doble alto y sin ninguna razón. La
                    columna se ensancha lo que haga falta; el ancho lo absorbe la de Nombre, que sí
                    es texto largo.
                  */}
                  {extraFields
                    .filter((f) => f.showColumn)
                    .map((f) => (
                      <td key={f.key} className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {extraDisplay(f, item[f.key])}
                      </td>
                    ))}
                  {columnasCalculadas.map((c) => (
                    <td key={c.label} className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {c.render(item)}
                    </td>
                  ))}
                  <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap w-px">{item.externalId ? (formatExternalId ? formatExternalId(item.externalId) : item.externalId) : '—'}</td>
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
        )
      )}

      {/* Uno solo para las tres vistas: es el mismo control sobre el mismo conjunto. */}
      {!loading && !loadError && <Paginador total={filtered.length} pagina={pagina} onCambiar={setPagina} entidadPlural={`${entityLabel}s`} />}
        </>
      )}

      {/* ABM Modal */}
      {/*
        Sale del componente compartido y no de un `fixed inset-0` propio.

        El de antes no tenía tope de altura: con un catálogo que aporta `extraSeccion` —Convenios suma
        dos listas de switches— el modal crecía más que la pantalla, el encabezado quedaba cortado
        arriba y el footer con Guardar caía abajo del pliegue, sin nada que scrollear. `Modal` acota a
        90vh, deja el cuerpo con su propio scroll y clava el footer.
      */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={`${editing ? 'Editar' : 'Nuevo'} ${title}`}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button onClick={() => setShowModal(false)} className="btn-secondary" disabled={saving}>
              Cancelar
            </button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
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
              {/* Va al final y separado: lo de arriba se guarda con «Guardar», esto se guarda solo. */}
              {editing && extraSeccion && <div className="border-t border-gray-200 dark:border-gray-700 pt-4">{extraSeccion(editing)}</div>}
        </div>
      </Modal>

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
