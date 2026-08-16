import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBriefcaseMedical, faFileContract, faLocationDot, faListCheck, faSliders, faSearch, faXmark, faStar, faTriangleExclamation, faArrowUpRightFromSquare, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { EmpresaContextLayout, SeccionEmpleador } from '../../components/empresa/EmpresaContextLayout';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ConvenioSelector } from '../../components/empresas/ConvenioSelector';
import { SucursalSelector } from '../../components/empresas/SucursalSelector';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { arcaSucursalesAPI, ArcaSucursal } from '../../api/arcaSucursales';
import { arcaCategoriasAPI, ConvenioDetalle } from '../../api/arcaCategorias';
import { companiesAPI, Company } from '../../api/companies';
import { useEmpresaContextStore } from '../../stores/empresaContextStore';
import { sweetAlert } from '../../utils/sweetAlert';
import { formatRnos } from '../../utils/rnos';

/**
 * "Datos del Empleador" de ARCA, por CUIT.
 *
 * Todo lo de este archivo es el SUBCONJUNTO que una empleadora registró del nomenclador universal
 * (que vive en Configuración → ARCA). ARCA solo acepta altas dentro de ese subconjunto: una obra
 * social, un convenio o un domicilio de otro CUIT se rechaza, y el error no se ve hasta que el
 * organismo devuelve el archivo.
 *
 * Hay que repetir la extracción del padrón logueado con CADA empleadora: no hay forma de derivarlo.
 */

const obrasSocialesApi = createSimpleCatalogApi('/obras-sociales');
const conveniosApi = createSimpleCatalogApi('/convenios');
const tiposServicioApi = createSimpleCatalogApi('/arca/tipos-servicio');
const modalidadesLiqApi = createSimpleCatalogApi('/arca/modalidades-liquidacion');

/** Botón de guardar compartido: todas estas pantallas guardan un campo de `Company`. */
const BotonGuardar: React.FC<{ onClick: () => void; guardando: boolean; sucio: boolean }> = ({ onClick, guardando, sucio }) => (
  <button onClick={onClick} disabled={guardando || !sucio} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
    {guardando && <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4" />}
    {guardando ? 'Guardando...' : sucio ? 'Guardar cambios' : 'Sin cambios'}
  </button>
);

/** Guarda un parche en la empresa y refresca el contexto (el nav muestra sus datos). */
const useGuardarEmpresa = (empresa: Company, recargar: () => Promise<void>) => {
  const { refreshSelectedEmpresa } = useEmpresaContextStore();
  const [guardando, setGuardando] = useState(false);
  const guardar = async (patch: Partial<Company>, mensaje: string) => {
    setGuardando(true);
    try {
      await companiesAPI.update(empresa._id, patch as any);
      await recargar();
      await refreshSelectedEmpresa();
      window.dispatchEvent(new Event('empresasChanged'));
      sweetAlert.success('Guardado', mensaje);
      return true;
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo guardar');
      return false;
    } finally {
      setGuardando(false);
    }
  };
  return { guardar, guardando };
};

// ───────────────────────────────────────────────────────────── Obras Sociales

/**
 * Obras sociales REGISTRADAS para este CUIT, y cuál es la default.
 *
 * En ARCA son dos cosas distintas y acá también: el conjunto es lo que el organismo acepta, y la
 * default es solo cuál se usa cuando la persona no tiene una propia. Hasta esta versión el modelo
 * únicamente tenía la default, así que una empleadora no podía declarar más de una.
 */
export const EmpresaObrasSocialesPage: React.FC = () => (
  <EmpresaContextLayout titulo="Obras Sociales" icono={faBriefcaseMedical}>
    {(empresa, recargar) => <ObrasSocialesBody empresa={empresa} recargar={recargar} />}
  </EmpresaContextLayout>
);

const ObrasSocialesBody: React.FC<{ empresa: Company; recargar: () => Promise<void> }> = ({ empresa, recargar }) => {
  const { guardar, guardando } = useGuardarEmpresa(empresa, recargar);
  const [catalogo, setCatalogo] = useState<SimpleCatalogItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [ids, setIds] = useState<string[]>(empresa.obrasSocialesIds || []);
  const [defaultId, setDefaultId] = useState<number | null>(empresa.obraSocialDefaultId ?? empresa.obraSocialId ?? null);

  useEffect(() => {
    obrasSocialesApi
      .list()
      .then(setCatalogo)
      .catch(() => setCatalogo([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    setIds(empresa.obrasSocialesIds || []);
    setDefaultId(empresa.obraSocialDefaultId ?? empresa.obraSocialId ?? null);
  }, [empresa]);

  const registradas = useMemo(() => catalogo.filter((o) => ids.includes(o._id)), [catalogo, ids]);
  const dataId = (o: SimpleCatalogItem) => Number((o.data as { id?: number } | undefined)?.id);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return catalogo.filter((o) => !ids.includes(o._id) && (o.name.toLowerCase().includes(q) || String(o.externalId || '').includes(q.replace(/\D/g, '') || ' ')));
  }, [catalogo, busqueda, ids]);

  const sucio = JSON.stringify([...ids].sort()) !== JSON.stringify([...(empresa.obrasSocialesIds || [])].sort()) || defaultId !== (empresa.obraSocialDefaultId ?? empresa.obraSocialId ?? null);

  const quitar = (id: string) => {
    const os = catalogo.find((o) => o._id === id);
    setIds((prev) => prev.filter((x) => x !== id));
    // Sacar la default del conjunto la dejaría apuntando a algo que ARCA no acepta: se limpia.
    if (os && dataId(os) === defaultId) setDefaultId(null);
  };

  if (cargando) return <LoadingSpinner message="Cargando el catálogo de obras sociales..." />;

  return (
    <SeccionEmpleador
      titulo="Obras sociales relacionadas a su actividad"
      descripcion={`Son las que este CUIT tiene registradas ante ARCA. El organismo solo acepta altas con una de ellas: el catálogo tiene ${catalogo.length} obras sociales, pero cada empleadora declara su subconjunto.`}
      nota="El listado real sale del padrón, en Datos del Empleador → Obras Sociales, logueado con este CUIT. Acá se refleja cuáles son."
    >
      <div className="flex justify-end">
        <BotonGuardar guardando={guardando} sucio={sucio} onClick={() => guardar({ obrasSocialesIds: ids, obraSocialDefaultId: defaultId }, `${ids.length} obra(s) social(es) registrada(s) para ${empresa.razonSocial}.`)} />
      </div>

      {ids.length === 0 && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Sin obras sociales registradas no se puede verificar que la del contrato sea válida para esta empleadora. El chequeo de Datos ARCA deja pasar cualquiera, y ARCA la rechaza al subir el archivo.
          </p>
        </div>
      )}

      {/* Buscador del universo */}
      <div className="relative">
        <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en el catálogo por nombre o RNOS…" className="w-full pl-9 pr-9 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30" />
        {busqueda && (
          <button type="button" onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {busqueda.trim() && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Resultados ({resultados.length})</p>
          {resultados.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Sin resultados para “{busqueda}”.</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {resultados.slice(0, 40).map((o) => (
                <button key={o._id} type="button" onClick={() => setIds((prev) => [...prev, o._id])} className="w-full text-left px-3 py-2 rounded-lg border flex items-center gap-3 bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-900/40 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors">
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">{formatRnos(o.externalId)}</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{o.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Registradas + cuál es la default */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Registradas ({registradas.length})</p>
        {registradas.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Todavía no hay ninguna registrada para esta empleadora.</p>
        ) : (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700/60 max-h-96 overflow-y-auto">
            {registradas.map((o) => {
              const esDefault = dataId(o) === defaultId;
              return (
                <div key={o._id} className="px-3 py-2 flex items-center gap-3">
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">{formatRnos(o.externalId)}</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100 truncate flex-1">{o.name}</span>
                  <button
                    type="button"
                    onClick={() => setDefaultId(esDefault ? null : dataId(o))}
                    title={esDefault ? 'Dejar de usarla por defecto' : 'Usar por defecto cuando la persona no tiene obra social'}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${esDefault ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800' : 'text-gray-500 border-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-800'}`}
                  >
                    <FontAwesomeIcon icon={faStar} className="h-3 w-3" />
                    {esDefault ? 'Por defecto' : 'Marcar'}
                  </button>
                  <button type="button" onClick={() => quitar(o._id)} title="Quitar de las registradas" className="shrink-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1">
                    <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          La jerarquía al resolver el RNOS del contrato es: <strong>obra social de la persona</strong> &gt; <strong>la por defecto de esta empresa</strong> &gt; la global del catálogo.
        </p>
      </div>
    </SeccionEmpleador>
  );
};

// ───────────────────────────────────────────────────────────── Convenios

export const EmpresaConveniosPage: React.FC = () => (
  <EmpresaContextLayout titulo="Convenios Colectivos" icono={faFileContract}>
    {(empresa, recargar) => <ConveniosBody empresa={empresa} recargar={recargar} />}
  </EmpresaContextLayout>
);

const ConveniosBody: React.FC<{ empresa: Company; recargar: () => Promise<void> }> = ({ empresa, recargar }) => {
  const { guardar, guardando } = useGuardarEmpresa(empresa, recargar);
  const [convenios, setConvenios] = useState<SimpleCatalogItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ids, setIds] = useState<string[]>(empresa.convenioIds || []);

  useEffect(() => {
    conveniosApi
      .list()
      .then(setConvenios)
      .catch(() => setConvenios([]))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => setIds(empresa.convenioIds || []), [empresa]);

  const sucio = JSON.stringify([...ids].sort()) !== JSON.stringify([...(empresa.convenioIds || [])].sort());

  return (
    <SeccionEmpleador
      titulo="Convenios Colectivos registrados"
      descripcion="Los CCT que este CUIT tiene registrados ante ARCA. Determinan qué categorías profesionales se le pueden dar de alta: el combo del organismo viene filtrado por convenio."
      nota="La ESCALA salarial no vive acá: es del convenio y es la misma para todas las empleadoras que lo tengan registrado. Se edita en Configuración → ARCA → Convenios."
    >
      <div className="flex justify-end">
        <BotonGuardar guardando={guardando} sucio={sucio} onClick={() => guardar({ convenioIds: ids }, `${ids.length} convenio(s) registrado(s) para ${empresa.razonSocial}.`)} />
      </div>
      <ConvenioSelector convenios={convenios} cargando={cargando} value={ids} onChange={setIds} />
    </SeccionEmpleador>
  );
};

// ───────────────────────────────────────────────────────────── Domicilios

export const EmpresaDomiciliosPage: React.FC = () => (
  <EmpresaContextLayout titulo="Domicilios de Explotación" icono={faLocationDot}>
    {(empresa, recargar) => <DomiciliosBody empresa={empresa} recargar={recargar} />}
  </EmpresaContextLayout>
);

const DomiciliosBody: React.FC<{ empresa: Company; recargar: () => Promise<void> }> = ({ empresa, recargar }) => {
  const { guardar, guardando } = useGuardarEmpresa(empresa, recargar);
  const [sucursales, setSucursales] = useState<ArcaSucursal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ids, setIds] = useState<string[]>(empresa.sucursalIds || []);

  useEffect(() => {
    arcaSucursalesAPI
      .list()
      .then(setSucursales)
      .catch(() => setSucursales([]))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => setIds(empresa.sucursalIds || []), [empresa]);

  const sucio = JSON.stringify([...ids].sort()) !== JSON.stringify([...(empresa.sucursalIds || [])].sort());
  const elegidas = useMemo(() => sucursales.filter((s) => ids.includes(s._id)), [sucursales, ids]);

  return (
    <SeccionEmpleador
      titulo="Domicilios de explotación"
      descripcion="Los domicilios que este CUIT tiene declarados en el padrón, cada uno con sus actividades. El alta declara UNO de ellos y una de sus actividades."
      nota="Las actividades disponibles se DERIVAN de estos domicilios: no se configuran aparte. ARCA rechaza una actividad que no esté declarada para el domicilio elegido, aunque exista en el nomenclador."
    >
      <div className="flex justify-end">
        <BotonGuardar guardando={guardando} sucio={sucio} onClick={() => guardar({ sucursalIds: ids }, `${ids.length} domicilio(s) asignado(s) a ${empresa.razonSocial}.`)} />
      </div>

      {cargando ? <LoadingSpinner message="Cargando el padrón de domicilios..." /> : <SucursalSelector sucursales={sucursales} cargando={cargando} value={ids} onChange={setIds} />}

      {/* Nivel 2b: lo que queda disponible para los contratos de esta empleadora. */}
      {elegidas.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Actividades disponibles para sus contratos</p>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700/60">
            {elegidas.map((s) => (
              <div key={s._id} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-blue-700 dark:text-blue-400 font-bold">{s.codigo}</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100">{s.domicilio}</span>
                </div>
                {(s.actividades || []).length === 0 ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Sin actividades declaradas: los contratos de este domicilio no pueden generar el alta.</p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(s.actividades || []).map((a) => (
                      <span key={a.codigo} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300">
                        <span className="font-mono">{a.codigo}</span>
                        <span className="truncate max-w-[22rem]">{a.descripcion}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </SeccionEmpleador>
  );
};

// ───────────────────────────────────────────────────────────── Categorías (derivadas)

/**
 * Nivel 2b: NO se configura, se calcula. Las categorías disponibles para esta empleadora son las de
 * los convenios que registró. Mostrarlas como si fueran una configuración propia haría creer que se
 * pueden elegir de a una, y no es así: se elige el convenio, y las categorías vienen con él.
 */
export const EmpresaCategoriasPage: React.FC = () => (
  <EmpresaContextLayout titulo="Categorías" icono={faListCheck}>
    {(empresa) => <CategoriasBody empresa={empresa} />}
  </EmpresaContextLayout>
);

const CategoriasBody: React.FC<{ empresa: Company }> = ({ empresa }) => {
  const [convenios, setConvenios] = useState<SimpleCatalogItem[]>([]);
  const [detalles, setDetalles] = useState<ConvenioDetalle[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const catalogo = await conveniosApi.list();
        setConvenios(catalogo);
        const codigos = catalogo.filter((c) => (empresa.convenioIds || []).map(String).includes(c._id)).map((c) => String(c.externalId || '').trim()).filter(Boolean);
        const resueltos = await Promise.all(codigos.map((c) => arcaCategoriasAPI.detalle(c).catch(() => null)));
        setDetalles(resueltos.filter(Boolean) as ConvenioDetalle[]);
      } finally {
        setCargando(false);
      }
    })();
  }, [empresa]);

  const total = detalles.reduce((acc, d) => acc + d.grupos.reduce((a, g) => a + g.categorias.length, 0), 0);

  if (cargando) return <LoadingSpinner message="Resolviendo las categorías de sus convenios..." />;

  return (
    <SeccionEmpleador
      titulo="Categorías disponibles"
      descripcion={`Solo lectura: son las de los ${empresa.convenioIds?.length || 0} convenio(s) que esta empleadora registró — ${total} categoría(s) en total. No se configuran acá.`}
      nota="Para cambiarlas, registrá o quitá convenios. Para editar sus escalas, entrá a Configuración → ARCA → Convenios: la escala es del CCT, no de la empresa."
    >
      {(empresa.convenioIds || []).length === 0 ? (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
          <p className="text-sm text-amber-800 dark:text-amber-300">Esta empleadora no tiene convenios registrados, así que no hay ninguna categoría que se le pueda dar de alta.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {detalles.map((d) => (
            <div key={d.convenio} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400">{d.convenio}</span>
                  <span className="text-sm text-gray-600 dark:text-gray-300"> — {d.nombre || 'sin descripción'}</span>
                </div>
                <Link to="/arca/categorias" className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  Editar escalas
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />
                </Link>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {d.grupos.map((g) => (
                  <div key={g._id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center justify-center h-6 w-9 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] font-bold">G{g.numero}</span>
                      {g.nombre && <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{g.nombre}</span>}
                      <span className={`text-xs font-semibold ${g.sueldoBruto ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {g.sueldoBruto ? `Bruto ${g.sueldoBruto.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}` : 'Sin escala: bloquea el alta'}
                      </span>
                      <span className="text-xs text-gray-400">· {g.categorias.length} categoría(s)</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {g.categorias.map((c) => (
                        <span key={c._id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300">
                          <span className="font-mono">{c.codigoArca}</span>
                          {c.nombre}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Un convenio registrado que no resolvió es un convenio sin categorías cargadas. */}
          {detalles.length < (empresa.convenioIds || []).length && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {(empresa.convenioIds || []).length - detalles.length} convenio(s) registrado(s) todavía no tienen categorías cargadas: sus altas no van a poder generarse.
              {convenios.length === 0 ? '' : ' Cargalas desde Configuración → ARCA → Convenios.'}
            </p>
          )}
        </div>
      )}
    </SeccionEmpleador>
  );
};

// ───────────────────────────────────────────────────────────── Defaults

/**
 * Tipo de Servicio y Modalidad de Liquidación por defecto.
 *
 * Son la elección HABITUAL de esta empleadora dentro del nomenclador. No reemplazan al dato del
 * contrato (que lo sigue trayendo el Tipo de Contrato): son el valor de arranque, para no repetir en
 * cada alta lo que en la práctica es siempre lo mismo por CUIT.
 */
export const EmpresaDefaultsPage: React.FC = () => (
  <EmpresaContextLayout titulo="Defaults de ARCA" icono={faSliders}>
    {(empresa, recargar) => <DefaultsBody empresa={empresa} recargar={recargar} />}
  </EmpresaContextLayout>
);

const DefaultsBody: React.FC<{ empresa: Company; recargar: () => Promise<void> }> = ({ empresa, recargar }) => {
  const { guardar, guardando } = useGuardarEmpresa(empresa, recargar);
  const [tipos, setTipos] = useState<SimpleCatalogItem[]>([]);
  const [modalidades, setModalidades] = useState<SimpleCatalogItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState({ tipoServicio: empresa.defaultsArca?.tipoServicio || '', modalidadLiquidacion: empresa.defaultsArca?.modalidadLiquidacion || '' });

  useEffect(() => {
    Promise.all([tiposServicioApi.list().catch(() => []), modalidadesLiqApi.list().catch(() => [])])
      .then(([t, m]) => {
        setTipos(t);
        setModalidades(m);
      })
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => setForm({ tipoServicio: empresa.defaultsArca?.tipoServicio || '', modalidadLiquidacion: empresa.defaultsArca?.modalidadLiquidacion || '' }), [empresa]);

  const sucio = form.tipoServicio !== (empresa.defaultsArca?.tipoServicio || '') || form.modalidadLiquidacion !== (empresa.defaultsArca?.modalidadLiquidacion || '');

  const selectClass = 'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200';

  if (cargando) return <LoadingSpinner message="Cargando los nomencladores..." />;

  return (
    <SeccionEmpleador
      titulo="Valores por defecto de ARCA"
      descripcion="La elección habitual de esta empleadora dentro del nomenclador, para no repetirla en cada alta."
      nota="No pisan al Tipo de Contrato: si el contrato trae su propio código, manda el del contrato. Estos son el valor de arranque."
    >
      <div className="flex justify-end">
        <BotonGuardar guardando={guardando} sucio={sucio} onClick={() => guardar({ defaultsArca: form }, `Defaults de ARCA guardados para ${empresa.razonSocial}.`)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de Servicio</label>
          <select value={form.tipoServicio} onChange={(e) => setForm((p) => ({ ...p, tipoServicio: e.target.value }))} className={selectClass}>
            <option value="">— Sin valor por defecto —</option>
            {tipos.map((t) => (
              <option key={t._id} value={String(t.externalId || '')}>
                {t.externalId} — {t.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Posiciones 107-109 del TXT de alta.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Modalidad de Liquidación</label>
          <select value={form.modalidadLiquidacion} onChange={(e) => setForm((p) => ({ ...p, modalidadLiquidacion: e.target.value }))} className={selectClass}>
            <option value="">— Sin valor por defecto —</option>
            {modalidades.map((m) => (
              <option key={m._id} value={String(m.externalId || '')}>
                {m.externalId} — {m.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Posición 73 del TXT de alta.</p>
        </div>
      </div>
    </SeccionEmpleador>
  );
};
