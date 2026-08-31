import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuilding, faPlus, faEdit, faTrash, faSearch, faFilePdf, faStar } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../components/ui/PageLayout';
import { Modal } from '../components/ui/Modal';
import { InfoModal } from '../components/ui/InfoModal';
import { EstadoArcaBadge, ArcaRequisitosModal } from '../components/empresas/ArcaEstado';
import { formatRnos } from '../utils/rnos';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { sweetAlert } from '../utils/sweetAlert';
import { fuzzyMatch } from '../utils/searchHelpers';
import { companiesAPI, Company, CompanyInput } from '../api/companies';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../api/simpleCatalog';
import { ConvenioSelector } from '../components/empresas/ConvenioSelector';
import { ObraSocialSelector } from '../components/empresas/ObraSocialSelector';
import { SucursalSelector } from '../components/empresas/SucursalSelector';
import { arcaSucursalesAPI, ArcaSucursal } from '../api/arcaSucursales';
import { getHelp, hasHelp } from '../data/help/helpContent';

const HELP_KEY = 'empresas' as const;

/** Catálogo de convenios: se carga una vez para toda la página y se reusa en cada apertura del modal. */
const conveniosApi = createSimpleCatalogApi('/convenios');
const obrasSocialesApi = createSimpleCatalogApi('/obras-sociales');

const EMPTY_FORM: CompanyInput = {
  razonSocial: '',
  cuit: '',
  domicilioCalle: '',
  domicilioNumero: '',
  domicilioPisoDepto: '',
  localidad: '',
  provincia: '',
  codigoPostal: '',
  firmanteNombre: '',
  firmanteDni: '',
  firmanteCargo: '',
  firmanteEmail: '',
  representanteLegalNombre: '',
  representanteLegalEmail: '',
  convenioIds: [],
  sucursalIds: [],
  obrasSocialesIds: [],
};

/**
 * Qué le falta a la empleadora para poder dar altas en ARCA.
 *
 * Convierte un `—` en una acción: sin convenios no hay categorías posibles y sin domicilios no hay
 * dónde declarar el alta, así que la fila no está "incompleta" — está inhabilitada. Es la misma idea
 * de resolver por configuración y no por persona, aplicada al listado: se ve de un vistazo cuál de
 * las empleadoras va a frenar a todos sus contratos.
 */
// El estado de ARCA —los cuatro requisitos, el badge y el modal— vive en `components/empresas/
// ArcaEstado`: lo comparten este listado y la ficha de cada empresa, que antes contaban distinto.

/**
 * Detalle de una de las listas de la empresa.
 *
 * Lleva buscador porque el caso real es de 494 obras sociales registradas: sin filtro, "ver el
 * detalle" es scrollear a ciegas. Con 12 o menos no aparece — sería ruido.
 */
const DetalleListaModal: React.FC<{
  detalle: { empresa: Company; tipo: 'convenios' | 'obrasSociales' | 'sucursales' } | null;
  onClose: () => void;
  convenios: SimpleCatalogItem[];
  obrasSociales: SimpleCatalogItem[];
  sucursales: ArcaSucursal[];
  obraSocialPorDefectoId?: string;
}> = ({ detalle, onClose, convenios, obrasSociales, sucursales, obraSocialPorDefectoId }) => {
  const [q, setQ] = useState('');
  // El filtro se limpia al cambiar de lista: si no, se abre otra y aparece vacía sin motivo visible.
  useEffect(() => setQ(''), [detalle?.empresa._id, detalle?.tipo]);

  if (!detalle) return null;

  const { empresa, tipo } = detalle;
  const meta = {
    convenios: { titulo: 'Convenios colectivos', ayuda: 'Definen qué categorías profesionales se le pueden dar de alta.' },
    obrasSociales: { titulo: 'Obras sociales registradas', ayuda: 'ARCA solo acepta altas con una de estas. La ⭐ es la que se usa por defecto cuando la persona no tiene una propia y su convenio tampoco.' },
    sucursales: { titulo: 'Sucursales de ARCA', ayuda: 'Domicilios de explotación declarados. El alta usa uno de ellos y una de sus actividades.' },
  }[tipo];

  const coincide = (texto: string) => texto.toLowerCase().includes(q.trim().toLowerCase());
  const cv = convenios.filter((c) => !q.trim() || coincide(`${c.externalId || ''} ${c.name}`));
  const os = obrasSociales.filter((o) => !q.trim() || coincide(`${formatRnos(o.externalId)} ${o.externalId || ''} ${o.name}`));
  const su = sucursales.filter((s) => !q.trim() || coincide(`${s.codigo} ${s.domicilio}`));
  const total = tipo === 'convenios' ? cv.length : tipo === 'obrasSociales' ? os.length : su.length;
  const totalSinFiltrar = tipo === 'convenios' ? convenios.length : tipo === 'obrasSociales' ? obrasSociales.length : sucursales.length;

  return (
    <InfoModal isOpen onClose={onClose} title={meta.titulo} subtitle={empresa.razonSocial} size="lg" actions={[{ label: 'Cerrar', onClick: onClose, variant: 'primary' }]}>
      <div className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">{meta.ayuda}</p>

        {totalSinFiltrar > 12 && (
          <div className="relative">
            <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar…" className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30" />
          </div>
        )}

        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          {total} de {totalSinFiltrar}
        </p>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700/60 max-h-[55vh] overflow-y-auto">
          {total === 0 && <p className="px-3 py-4 text-xs text-gray-400 italic">Sin resultados.</p>}

          {tipo === 'convenios' &&
            cv.map((c) => (
              <div key={c._id} className="px-3 py-2 flex items-baseline gap-3">
                <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400 shrink-0 whitespace-nowrap">{c.externalId}</span>
                <span className="text-sm text-gray-900 dark:text-gray-100 min-w-0">
                  {c.name}
                  {(c as { signatario?: string }).signatario && <span className="block text-xs text-gray-500 dark:text-gray-400">{(c as { signatario?: string }).signatario}</span>}
                </span>
              </div>
            ))}

          {tipo === 'obrasSociales' &&
            os.map((o) => (
              <div key={o._id} className="px-3 py-2 flex items-center gap-3">
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">{formatRnos(o.externalId)}</span>
                <span className="text-sm text-gray-900 dark:text-gray-100 truncate flex-1">{o.name}</span>
                {o._id === obraSocialPorDefectoId && (
                  <span title="Se usa por defecto cuando ni la persona ni su convenio definen una" className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    <FontAwesomeIcon icon={faStar} className="h-2.5 w-2.5" />
                    Por defecto
                  </span>
                )}
              </div>
            ))}

          {tipo === 'sucursales' &&
            su.map((s) => (
              <div key={s._id} className="px-3 py-2">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400 shrink-0">{s.codigo}</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100">{s.domicilio}</span>
                </div>
                {s.actividades.length === 0 ? (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">Sin actividades declaradas: los contratos de este domicilio no pueden generar el alta.</p>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {s.actividades.map((a) => (
                      <span key={a.codigo} className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300">
                        <span className="font-mono">{a.codigo}</span>
                        <span className="truncate max-w-[18rem]">{a.descripcion}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </InfoModal>
  );
};

export const EmpresasPage: React.FC = () => {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [convenios, setConvenios] = useState<SimpleCatalogItem[]>([]);
  const [cargandoConvenios, setCargandoConvenios] = useState(true);
  // Catálogo global de Obras Sociales: la empresa registra cuáles tiene declaradas ante ARCA.
  const [obrasSociales, setObrasSociales] = useState<SimpleCatalogItem[]>([]);
  const [cargandoObrasSociales, setCargandoObrasSociales] = useState(true);
  // Catálogo de Sucursales de ARCA: la empresa solo elige cuáles le corresponden.
  const [sucursales, setSucursales] = useState<ArcaSucursal[]>([]);
  const [cargandoSucursales, setCargandoSucursales] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<CompanyInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  // Empresa cuyo aviso "Sin configurar para ARCA" se está explicando. El modal es UNO para toda la
  // página y no uno por fila: el contenido es el mismo y solo cambia qué le falta a esta empleadora.
  const [infoArca, setInfoArca] = useState<Company | null>(null);
  /**
   * Qué lista se está viendo en detalle. Las columnas muestran un CONTADOR y no los ítems: FZERO
   * tiene 494 obras sociales registradas, y volcarlas en la celda hacía una fila de pantalla y media
   * en la que no se podía comparar nada entre empresas. El número sí se compara de un vistazo.
   */
  const [detalleLista, setDetalleLista] = useState<{ empresa: Company; tipo: 'convenios' | 'obrasSociales' | 'sucursales' } | null>(null);
  const helpEntry = getHelp(HELP_KEY);

  // Vista tabla/tarjetas, como el resto de los ABM: la tabla solo en pantallas grandes.
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) setViewMode('cards');
    };
    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem('empresasViewMode');
      if (saved === 'table' || saved === 'cards') setViewMode(saved as ViewMode);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) localStorage.setItem('empresasViewMode', viewMode);
  }, [viewMode, isLarge]);

  // El catálogo de convenios se pide una sola vez: son miles y el modal se abre muchas veces.
  useEffect(() => {
    conveniosApi
      .list()
      .then(setConvenios)
      .catch(() => sweetAlert.error('Error', 'No se pudieron cargar los convenios.'))
      .finally(() => setCargandoConvenios(false));
  }, []);

  useEffect(() => {
    arcaSucursalesAPI
      .list()
      .then(setSucursales)
      .catch(() => sweetAlert.error('Error', 'No se pudieron cargar las sucursales de ARCA.'))
      .finally(() => setCargandoSucursales(false));
  }, []);

  // Mismo criterio que los convenios: son ~500 y el modal se abre muchas veces.
  useEffect(() => {
    obrasSocialesApi
      .list()
      .then(setObrasSociales)
      .catch(() => sweetAlert.error('Error', 'No se pudieron cargar las obras sociales.'))
      .finally(() => setCargandoObrasSociales(false));
  }, []);

  const effectiveViewMode: ViewMode = isLarge ? viewMode : 'cards';

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      setCompanies(await companiesAPI.list());
    } catch (error) {
      // Sin empresas o endpoint aún no disponible: mostramos el estado vacío en vez de un error.
      console.error('Error fetching companies:', error);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return companies;
    return companies.filter((c) => fuzzyMatch(c.razonSocial || '', search) || fuzzyMatch(c.cuit || '', search) || fuzzyMatch(c.representanteLegalNombre || '', search));
  }, [companies, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (c: Company) => {
    setEditing(c);
    setForm({
      razonSocial: c.razonSocial || '',
      cuit: c.cuit || '',
      domicilioCalle: c.domicilioCalle || '',
      domicilioNumero: c.domicilioNumero || '',
      domicilioPisoDepto: c.domicilioPisoDepto || '',
      localidad: c.localidad || '',
      provincia: c.provincia || '',
      codigoPostal: c.codigoPostal || '',
      firmanteNombre: c.firmanteNombre || '',
      firmanteDni: c.firmanteDni || '',
      firmanteCargo: c.firmanteCargo || '',
      firmanteEmail: c.firmanteEmail || '',
      representanteLegalNombre: c.representanteLegalNombre || '',
      representanteLegalEmail: c.representanteLegalEmail || '',
      convenioIds: (c.convenioIds || []).map((x) => String(x)),
      sucursalIds: (c.sucursalIds || []).map((x) => String(x)),
      obrasSocialesIds: (c.obrasSocialesIds || []).map((x) => String(x)),
    });
    setShowModal(true);
  };

  /** Convenios de la empresa resueltos contra el catálogo ya cargado (se guardan como referencias). */
  const conveniosDe = (c: Company): SimpleCatalogItem[] => {
    const ids = (c.convenioIds || []).map((x) => String(x));
    if (ids.length === 0) return [];
    return convenios.filter((cv) => ids.includes(cv._id));
  };

  /** Obras sociales REGISTRADAS ante ARCA para el CUIT, resueltas contra el catálogo ya cargado. */
  const obrasSocialesDe = (c: Company): SimpleCatalogItem[] => {
    const ids = (c.obrasSocialesIds || []).map((x) => String(x));
    if (ids.length === 0) return [];
    return obrasSociales.filter((o) => ids.includes(o._id)).sort((a, b) => String(a.externalId || '').localeCompare(String(b.externalId || '')));
  };

  /** Cuál de las registradas se usa cuando la persona no tiene obra social propia (`data.id` = RNOS). */
  const obraSocialPorDefectoDe = (c: Company): SimpleCatalogItem | undefined => {
    const id = c.obraSocialDefaultId ?? c.obraSocialId;
    return id == null ? undefined : obrasSociales.find((o) => Number((o.data as { id?: number } | undefined)?.id) === id);
  };


  /**
   * Celda de una lista larga: el CONTADOR es el dato, y abre el detalle.
   *
   * Con 0 no es un botón — no hay nada que abrir, y un botón muerto invita a clickear en vano.
   */
  const ContadorLista: React.FC<{
    empresa: Company;
    tipo: 'convenios' | 'obrasSociales' | 'sucursales';
    total: number;
    cargando: boolean;
    singular: string;
    plural: string;
    /**
     * En la TABLA va solo el número: el encabezado de la columna ya dice de qué es, y repetirlo
     * ensancha la celda y parte el texto en dos renglones. En las TARJETAS no hay encabezado, así
     * que sin la etiqueta serían tres números sueltos sin significado.
     */
    conEtiqueta?: boolean;
  }> = ({ empresa, tipo, total, cargando, singular, plural, conEtiqueta = false }) => {
    if (total === 0) return <span className="text-gray-400 dark:text-gray-600">—</span>;
    if (cargando) return <span className="text-xs text-gray-400 italic">cargando…</span>;
    const nombre = total === 1 ? singular : plural;
    return (
      <button
        type="button"
        onClick={() => setDetalleLista({ empresa, tipo })}
        // El tooltip conserva el nombre aunque no se muestre: es lo que hace legible el botón pelado.
        title={`Ver ${total} ${nombre} de ${empresa.razonSocial}`}
        aria-label={`Ver ${total} ${nombre} de ${empresa.razonSocial}`}
        className="inline-flex items-center justify-center gap-1.5 min-w-[2rem] px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
      >
        <span className="text-sm font-bold tabular-nums">{total}</span>
        {conEtiqueta && <span className="text-[11px] text-gray-500 dark:text-gray-400">{nombre}</span>}
      </button>
    );
  };

  /** Sucursales de ARCA de la empresa, resueltas contra el catálogo ya cargado (se guardan como refs). */
  const sucursalesDe = (c: Company): ArcaSucursal[] => {
    const ids = (c.sucursalIds || []).map((x) => String(x));
    if (ids.length === 0) return [];
    // Ordenadas por código para que el mismo listado se lea igual en todas las empresas.
    return sucursales.filter((s) => ids.includes(s._id)).sort((a, b) => a.codigo.localeCompare(b.codigo));
  };

  const setField = (key: keyof CompanyInput, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.razonSocial.trim()) {
      sweetAlert.error('Datos incompletos', 'La razón social es obligatoria');
      return;
    }
    const payload: CompanyInput = form;
    try {
      setSaving(true);
      if (editing) {
        await companiesAPI.update(editing._id, payload);
        sweetAlert.success('Empresa actualizada', 'Los cambios se guardaron correctamente');
      } else {
        await companiesAPI.create(payload);
        sweetAlert.success('Empresa creada', 'La empresa se creó correctamente');
      }
      setShowModal(false);
      fetchCompanies();
    } catch (error: any) {
      console.error('Error saving company:', error);
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo guardar la empresa');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: Company) => {
    const result = await sweetAlert.confirm('¿Eliminar empresa?', `¿Seguro que querés eliminar "${c.razonSocial}"? Esta acción no se puede deshacer.`);
    if (!result.isConfirmed) return;
    try {
      await companiesAPI.remove(c._id);
      sweetAlert.success('Empresa eliminada', 'La empresa fue eliminada correctamente');
      fetchCompanies();
    } catch (error: any) {
      console.error('Error deleting company:', error);
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo eliminar la empresa');
    }
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm';
  const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

  const field = (label: string, key: keyof CompanyInput, opts?: { required?: boolean; placeholder?: string; type?: string }) => (
    <div>
      <label className={labelClass}>
        {label} {opts?.required && <span className="text-red-500">*</span>}
      </label>
      <input type={opts?.type || 'text'} className={inputClass} value={(form[key] as string) || ''} onChange={(e) => setField(key, e.target.value)} placeholder={opts?.placeholder} required={opts?.required} />
    </div>
  );

  const domicilioResumen = (c: Company) => [c.domicilioCalle, c.domicilioNumero].filter(Boolean).join(' ') + (c.localidad ? `, ${c.localidad}` : '') + (c.codigoPostal ? ` (${c.codigoPostal})` : '');

  return (
    <PageLayout
      title="Empresas"
      subtitle="Empresas / productoras con sus datos para armar los contratos."
      faIcon={{ icon: faBuilding }}
      itemCount={filtered.length}
      shouldShowInfo={hasHelp(HELP_KEY)}
      infoModal={{
        isOpen: showInfo,
        onOpen: () => setShowInfo(true),
        onClose: () => setShowInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      headerActions={
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/empresas-membretes')} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faFilePdf} />
            <span className="hidden lg:block">Plantillas | Empresa/s | Membrete/s y firma</span>
          </button>
          <button onClick={openCreate} title="Nueva empresa" aria-label="Nueva empresa" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </div>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="relative flex-1 w-full">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <FontAwesomeIcon icon={faSearch} />
            </span>
            <input type="text" className={`${inputClass} pl-10 h-10`} placeholder="Buscar por razón social, CUIT o representante..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {isLarge && <ViewToggle value={viewMode} onChange={setViewMode} />}
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner message="Cargando empresas..." />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No hay empresas" description={search ? 'No se encontraron empresas con esa búsqueda.' : 'Creá la primera empresa con el botón "Nueva Empresa".'} icon={faBuilding} />
      ) : effectiveViewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-6">
          {filtered.map((c) => (
            <Card
              key={c._id}
              onClick={() => openEdit(c)}
              className="cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200"
              header={{
                title: c.razonSocial,
                subtitle: c.cuit || undefined,
                icon: faBuilding,
              }}
              footer={{
                actions: [
                  {
                    icon: faEdit,
                    onClick: (e) => {
                      e.stopPropagation();
                      openEdit(c);
                    },
                    title: 'Editar',
                    variant: 'default',
                  },
                  {
                    icon: faTrash,
                    onClick: (e) => {
                      e.stopPropagation();
                      handleDelete(c);
                    },
                    title: 'Eliminar',
                    variant: 'default',
                  },
                ],
              }}
            >
              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
                <EstadoArcaBadge empresa={c} onClick={setInfoArca} />
                {domicilioResumen(c) && (
                  <p className="truncate" title={domicilioResumen(c)}>
                    {domicilioResumen(c)}
                  </p>
                )}
                {c.firmanteNombre && (
                  <div>
                    <span className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Firmante</span>
                    <span className="text-gray-800 dark:text-gray-200">{c.firmanteNombre}</span>
                    {c.firmanteCargo && <span className="text-[11px] text-gray-400 ml-1">({c.firmanteCargo})</span>}
                  </div>
                )}
                {c.representanteLegalNombre && (
                  <div>
                    <span className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Representante legal</span>
                    <span className="text-gray-800 dark:text-gray-200">{c.representanteLegalNombre}</span>
                    {c.representanteLegalEmail && <span className="block text-[11px] text-gray-400">{c.representanteLegalEmail}</span>}
                  </div>
                )}
                {/* Mismos contadores que la tabla, pero CON etiqueta: acá no hay encabezado de columna
                    que diga de qué es cada número. */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <ContadorLista conEtiqueta empresa={c} tipo="convenios" total={(c.convenioIds || []).length} cargando={cargandoConvenios} singular="convenio" plural="convenios" />
                  <ContadorLista conEtiqueta empresa={c} tipo="obrasSociales" total={(c.obrasSocialesIds || []).length} cargando={cargandoObrasSociales} singular="obra social" plural="obras sociales" />
                  <ContadorLista conEtiqueta empresa={c} tipo="sucursales" total={(c.sucursalIds || []).length} cargando={cargandoSucursales} singular="sucursal" plural="sucursales" />
                </div>
              </div>
            </Card>
          ))}
          <Card variant="create" onClick={openCreate} header={{ title: 'Nueva Empresa', subtitle: 'Agregar empresa', icon: faBuilding }} />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/50 shadow-sm">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3">Razón Social</th>
                {/* `w-px` + `nowrap`: el CUIT es un identificador y se cotea de un vistazo contra
                    ARCA. Partido en dos renglones ("30-" / "71706837-4") deja de leerse como uno. */}
                <th className="px-4 py-3 whitespace-nowrap w-px">CUIT</th>
                <th className="px-4 py-3">Domicilio Legal</th>
                <th className="px-4 py-3">Firmante</th>
                <th className="px-4 py-3">Representante Legal</th>
                {/* El estado va JUNTO a los tres números que lo componen: la columna dice si puede
                    dar altas, y las tres de al lado, con qué cuenta para hacerlo. */}
                <th className="px-4 py-3 whitespace-nowrap w-px">ARCA</th>
                <th className="px-4 py-3">Convenios</th>
                <th className="px-4 py-3">Obras Sociales</th>
                <th className="px-4 py-3">Sucursales ARCA</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {filtered.map((c) => (
                <tr key={c._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{c.razonSocial}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap w-px">{c.cuit || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[280px] truncate" title={domicilioResumen(c)}>
                    {domicilioResumen(c) || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {c.firmanteNombre ? (
                      <div className="flex flex-col">
                        <span className="text-gray-800 dark:text-gray-200">{c.firmanteNombre}</span>
                        {c.firmanteCargo && <span className="text-[11px] text-gray-400">{c.firmanteCargo}</span>}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {c.representanteLegalNombre ? (
                      <div className="flex flex-col">
                        <span className="text-gray-800 dark:text-gray-200">{c.representanteLegalNombre}</span>
                        {c.representanteLegalEmail && <span className="text-[11px] text-gray-400">{c.representanteLegalEmail}</span>}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap w-px">
                    <EstadoArcaBadge empresa={c} onClick={setInfoArca} />
                  </td>
                  <td className="px-4 py-3">
                    <ContadorLista empresa={c} tipo="convenios" total={(c.convenioIds || []).length} cargando={cargandoConvenios} singular="convenio" plural="convenios" />
                  </td>
                  <td className="px-4 py-3">
                    <ContadorLista empresa={c} tipo="obrasSociales" total={(c.obrasSocialesIds || []).length} cargando={cargandoObrasSociales} singular="obra social" plural="obras sociales" />
                  </td>
                  <td className="px-4 py-3">
                    <ContadorLista empresa={c} tipo="sucursales" total={(c.sucursalIds || []).length} cargando={cargandoSucursales} singular="sucursal" plural="sucursales" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 rounded transition-colors" title="Editar">
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 rounded transition-colors" title="Eliminar">
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Editar Empresa' : 'Nueva Empresa'}
        subtitle="Datos de la empresa para armar los contratos"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              Cancelar
            </button>
            <button type="submit" form="company-form" disabled={saving} className="btn-primary px-6 py-2 disabled:opacity-50">
              {saving ? 'Guardando...' : editing ? 'Guardar' : 'Crear'}
            </button>
          </div>
        }
      >
        <form id="company-form" onSubmit={handleSave} className="space-y-6">
          {/* Datos generales */}
          <div>
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Datos generales</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('Razón Social', 'razonSocial', { required: true, placeholder: 'Ej: 2030 S.R.L.' })}
              {field('CUIT', 'cuit', { placeholder: '30-71706837-4' })}
            </div>
          </div>

          {/* Domicilio legal */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Domicilio legal</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('Calle', 'domicilioCalle', { placeholder: 'Ruiz Huidobro' })}
              {field('Número', 'domicilioNumero', { placeholder: '4365' })}
              {field('Piso / Depto', 'domicilioPisoDepto')}
              {field('Localidad', 'localidad', { placeholder: 'CABA' })}
              {field('Provincia', 'provincia')}
              {field('Código Postal', 'codigoPostal', { placeholder: '1430' })}
            </div>
          </div>

          {/* Firmante */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Firmante</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {field('Nombre', 'firmanteNombre', { placeholder: 'Norma Olivo' })}
              {field('DNI', 'firmanteDni', { placeholder: '5.453.082' })}
              {field('Cargo', 'firmanteCargo', { placeholder: 'Socio Gerente' })}
              {/* Va acá y no en Representante legal: son dos personas distintas. En 2030 S.R.L. firma
                  Norma Olivo y el representante legal es Hernán Pellegrini — el bloque de partes del
                  contrato imprime el nombre y el DNI del FIRMANTE, así que el mail que va al lado
                  tiene que ser el suyo. */}
              {field('Email', 'firmanteEmail', { type: 'email', placeholder: 'norma.olivo@frame.com.ar' })}
            </div>
          </div>

          {/* Convenios */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Convenios colectivos</h4>
            <ConvenioSelector convenios={convenios} cargando={cargandoConvenios} value={form.convenioIds || []} onChange={(ids) => setForm((prev) => ({ ...prev, convenioIds: ids }))} />
          </div>

          {/* Obras sociales registradas ante ARCA para este CUIT */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Obras sociales</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Las que este CUIT tiene registradas ante ARCA (&laquo;obras sociales relacionadas a su actividad&raquo;). El organismo solo acepta altas con una de ellas. Cuál se usa por defecto se elige en la ficha de la empresa, en ARCA &rarr; Obras Sociales.
            </p>
            <ObraSocialSelector obrasSociales={obrasSociales} cargando={cargandoObrasSociales} value={form.obrasSocialesIds || []} onChange={(ids) => setForm((prev) => ({ ...prev, obrasSocialesIds: ids }))} />
          </div>

          {/* Sucursales de ARCA asignadas */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Sucursales de ARCA</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Cuáles de las sucursales del padrón le corresponden a esta empresa. Los datos de cada una (código, domicilio, actividades) se cargan en Configuración → ARCA → Sucursales.
            </p>
            <SucursalSelector sucursales={sucursales} cargando={cargandoSucursales} value={form.sucursalIds || []} onChange={(ids) => setForm((prev) => ({ ...prev, sucursalIds: ids }))} />
          </div>

          {/* Representante legal */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Representante legal</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('Nombre', 'representanteLegalNombre', { placeholder: 'Hernán Marcelo Pellegrini' })}
              {field('Email', 'representanteLegalEmail', { type: 'email', placeholder: 'hernan.pellegrini@frame.com.ar' })}
            </div>
          </div>
        </form>
      </Modal>

      {/* Detalle de una lista (convenios / obras sociales / sucursales) de UNA empresa. */}
      <DetalleListaModal
        detalle={detalleLista}
        onClose={() => setDetalleLista(null)}
        convenios={detalleLista ? conveniosDe(detalleLista.empresa) : []}
        obrasSociales={detalleLista ? obrasSocialesDe(detalleLista.empresa) : []}
        sucursales={detalleLista ? sucursalesDe(detalleLista.empresa) : []}
        obraSocialPorDefectoId={detalleLista ? obraSocialPorDefectoDe(detalleLista.empresa)?._id : undefined}
      />

      {/* Los cuatro requisitos de ARCA para ESTA empleadora. Es el MISMO modal que abre su ficha:
          una sola definición de qué hace falta, mostrada en las dos pantallas. */}
      <ArcaRequisitosModal empresa={infoArca} onClose={() => setInfoArca(null)} />
    </PageLayout>
  );
};
