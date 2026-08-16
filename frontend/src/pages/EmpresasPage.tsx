import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuilding, faPlus, faEdit, faTrash, faSearch, faFilePdf, faTriangleExclamation, faCircleInfo, faStar, faCheck } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../components/ui/PageLayout';
import { Modal } from '../components/ui/Modal';
import { InfoModal } from '../components/ui/InfoModal';
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
/** Qué le falta registrar a la empleadora ante ARCA, con qué desbloquea cada cosa. */
const REQUISITOS_ARCA = [
  { clave: 'convenios' as const, titulo: 'Convenios colectivos', desbloquea: 'Definen qué categorías profesionales se le pueden dar de alta: ARCA solo ofrece las de los convenios que el CUIT tiene registrados. Sin convenio no hay categoría posible.' },
  { clave: 'domicilios' as const, titulo: 'Domicilios de explotación', desbloquea: 'El alta declara UN domicilio y UNA de sus actividades. Sin domicilios no hay dónde declarar el trabajo.' },
  { clave: 'obras sociales' as const, titulo: 'Obras sociales', desbloquea: 'ARCA solo acepta altas con una de las obras sociales que el CUIT tiene declaradas. Sin ninguna registrada no se puede verificar que la del contrato sea válida, y el organismo la rechaza al subir el archivo.' },
];

const faltantesArca = (c: Company) =>
  REQUISITOS_ARCA.filter((r) => (r.clave === 'convenios' ? (c.convenioIds || []).length === 0 : r.clave === 'domicilios' ? (c.sucursalIds || []).length === 0 : (c.obrasSocialesIds || []).length === 0));

/**
 * Marca que la empleadora todavía no puede dar altas en ARCA.
 *
 * El ⓘ no es decorativo: "Sin configurar para ARCA" no dice qué falta ni qué consecuencia tiene, y
 * antes eso vivía en un `title` que en la práctica nadie lee. El modal lo explica y nombra los tres
 * requisitos con lo que desbloquea cada uno.
 */
const EstadoArca: React.FC<{ c: Company; onInfo: (c: Company) => void }> = ({ c, onInfo }) => {
  const faltan = faltantesArca(c);
  if (faltan.length === 0) return null;
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 pl-1.5 pr-1 py-0.5">
      <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5 text-amber-800 dark:text-amber-300" />
      <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300">Sin configurar para ARCA</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onInfo(c);
        }}
        title="Qué significa"
        aria-label="Qué significa «Sin configurar para ARCA»"
        className="text-amber-700/70 hover:text-amber-900 dark:text-amber-400/70 dark:hover:text-amber-200 transition-colors"
      >
        <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
      </button>
    </span>
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

  /** Badge de obra social: el RNOS es el dato que viaja al TXT; el nombre ubica al lector. */
  const ObraSocialBadge: React.FC<{ o: SimpleCatalogItem; maxW: string; esPorDefecto: boolean }> = ({ o, maxW, esPorDefecto }) => (
    <span
      title={`${formatRnos(o.externalId)} — ${o.name}${esPorDefecto ? '\nEs la que se usa por defecto cuando la persona no tiene obra social propia.' : ''}`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${maxW} ${
        esPorDefecto ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
      }`}
    >
      {esPorDefecto && <FontAwesomeIcon icon={faStar} className="h-2 w-2 shrink-0" />}
      <span className="font-mono opacity-70 shrink-0">{formatRnos(o.externalId)}</span>
      <span className="truncate">{o.name}</span>
    </span>
  );

  /** Sucursales de ARCA de la empresa, resueltas contra el catálogo ya cargado (se guardan como refs). */
  const sucursalesDe = (c: Company): ArcaSucursal[] => {
    const ids = (c.sucursalIds || []).map((x) => String(x));
    if (ids.length === 0) return [];
    // Ordenadas por código para que el mismo listado se lea igual en todas las empresas.
    return sucursales.filter((s) => ids.includes(s._id)).sort((a, b) => a.codigo.localeCompare(b.codigo));
  };

  /** Badge de una sucursal: el código es lo que importa (va en el TXT); el domicilio ubica al lector. */
  const SucursalBadge: React.FC<{ s: ArcaSucursal; maxW: string }> = ({ s, maxW }) => (
    <span
      title={`${s.codigo} — ${s.domicilio}${s.actividades.length ? `\nActividades: ${s.actividades.map((a) => a.codigo).join(', ')}` : '\nSin actividades cargadas'}`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium rounded border border-indigo-200 dark:border-indigo-800 ${maxW}`}
    >
      <span className="font-mono opacity-70 shrink-0">{s.codigo}</span>
      <span className="truncate">{s.domicilio}</span>
      {/* Sin actividades la sucursal no sirve para el alta: se avisa acá y no recién en el TXT. */}
      {s.actividades.length === 0 && <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5 text-amber-500 shrink-0" title="Sin actividades cargadas" />}
    </span>
  );

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
                <EstadoArca c={c} onInfo={setInfoArca} />
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
                {(c.convenioIds || []).length > 0 && (
                  <div>
                    <span className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Convenios</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {conveniosDe(c).map((cv) => (
                        <span
                          key={cv._id}
                          title={`${cv.externalId ? `${cv.externalId} — ` : ''}${cv.name}`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-[10px] font-medium rounded border border-primary-200 dark:border-primary-800 max-w-[180px]"
                        >
                          {cv.externalId && <span className="font-mono opacity-70 shrink-0">{cv.externalId}</span>}
                          <span className="truncate">{cv.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(c.obrasSocialesIds || []).length > 0 && (
                  <div>
                    <span className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Obras sociales</span>
                    <div className="flex items-center gap-1.5 flex-wrap max-h-24 overflow-y-auto">
                      {obrasSocialesDe(c).map((o) => (
                        <ObraSocialBadge key={o._id} o={o} maxW="max-w-[180px]" esPorDefecto={obraSocialPorDefectoDe(c)?._id === o._id} />
                      ))}
                    </div>
                  </div>
                )}
                {(c.sucursalIds || []).length > 0 && (
                  <div>
                    <span className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Sucursales de ARCA</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {sucursalesDe(c).map((s) => (
                        <SucursalBadge key={s._id} s={s} maxW="max-w-[180px]" />
                      ))}
                    </div>
                  </div>
                )}
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
                <th className="px-4 py-3">CUIT</th>
                <th className="px-4 py-3">Domicilio Legal</th>
                <th className="px-4 py-3">Firmante</th>
                <th className="px-4 py-3">Representante Legal</th>
                <th className="px-4 py-3">Convenios</th>
                <th className="px-4 py-3">Obras Sociales</th>
                <th className="px-4 py-3">Sucursales ARCA</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {filtered.map((c) => (
                <tr key={c._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">
                    <span className="block">{c.razonSocial}</span>
                    <EstadoArca c={c} onInfo={setInfoArca} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.cuit || '—'}</td>
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
                  <td className="px-4 py-3">
                    {(c.convenioIds || []).length === 0 ? (
                      <span className="text-gray-400 dark:text-gray-600">—</span>
                    ) : cargandoConvenios ? (
                      <span className="text-xs text-gray-400 italic">cargando…</span>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap max-w-[320px]">
                        {conveniosDe(c).map((cv) => (
                          <span
                            key={cv._id}
                            title={`${cv.externalId ? `${cv.externalId} — ` : ''}${cv.name}${(cv as { signatario?: string }).signatario ? ` (${(cv as { signatario?: string }).signatario})` : ''}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-[10px] font-medium rounded border border-primary-200 dark:border-primary-800 max-w-[150px]"
                          >
                            {cv.externalId && <span className="font-mono opacity-70 shrink-0">{cv.externalId}</span>}
                            <span className="truncate">{cv.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(c.obrasSocialesIds || []).length === 0 ? (
                      <span className="text-gray-400 dark:text-gray-600">—</span>
                    ) : cargandoObrasSociales ? (
                      <span className="text-xs text-gray-400 italic">cargando…</span>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap max-w-[320px] max-h-24 overflow-y-auto">
                        {obrasSocialesDe(c).map((o) => (
                          <ObraSocialBadge key={o._id} o={o} maxW="max-w-[170px]" esPorDefecto={obraSocialPorDefectoDe(c)?._id === o._id} />
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(c.sucursalIds || []).length === 0 ? (
                      <span className="text-gray-400 dark:text-gray-600">—</span>
                    ) : cargandoSucursales ? (
                      <span className="text-xs text-gray-400 italic">cargando…</span>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap max-w-[320px]">
                        {sucursalesDe(c).map((s) => (
                          <SucursalBadge key={s._id} s={s} maxW="max-w-[170px]" />
                        ))}
                      </div>
                    )}
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

      {/* Qué significa "Sin configurar para ARCA", con lo que le falta a ESTA empleadora. */}
      <InfoModal
        isOpen={!!infoArca}
        onClose={() => setInfoArca(null)}
        title="Sin configurar para ARCA"
        subtitle={infoArca?.razonSocial}
        size="md"
        actions={[{ label: 'Entendido', onClick: () => setInfoArca(null), variant: 'primary' }]}
      >
        {infoArca && (
          <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <p>
              Esta empleadora todavía no tiene registrado ante ARCA todo lo que el organismo exige para dar un alta. Mientras falte algo, <strong>ninguno de sus contratos puede generar el TXT</strong>: el chequeo de Datos ARCA los va a marcar incompletos, o —peor— el archivo sale y el organismo lo rechaza.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No es un dato que se complete por contrato: se resuelve una vez para la empresa y vale para todos.
            </p>

            <div className="space-y-2">
              {REQUISITOS_ARCA.map((r) => {
                const falta = faltantesArca(infoArca).some((f) => f.clave === r.clave);
                return (
                  <div key={r.clave} className={`rounded-lg border p-3 ${falta ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20' : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20'}`}>
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={falta ? faTriangleExclamation : faCheck} className={`h-3.5 w-3.5 shrink-0 ${falta ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
                      <span className={`text-sm font-semibold ${falta ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-800 dark:text-emerald-300'}`}>{r.titulo}</span>
                      <span className="ml-auto text-[11px] font-bold uppercase tracking-wider text-gray-400">{falta ? 'falta' : 'listo'}</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">{r.desbloquea}</p>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Se cargan editando la empresa (el lápiz de esta fila) o desde su ficha, en <strong>ARCA</strong>. El dato real sale del padrón del organismo, logueado con este CUIT: en Datos del Empleador están las obras sociales, los convenios y los domicilios que tiene declarados.
            </p>
          </div>
        )}
      </InfoModal>
    </PageLayout>
  );
};
