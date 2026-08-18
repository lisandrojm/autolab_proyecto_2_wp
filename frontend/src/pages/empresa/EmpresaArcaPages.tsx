import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBriefcaseMedical, faFileContract, faLocationDot, faListCheck, faSliders, faSearch, faXmark, faStar, faTriangleExclamation, faArrowUpRightFromSquare, faSpinner, faPlus, faChevronDown, faChevronRight, faCheck, faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';
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
import { InfoModal } from '../../components/ui/InfoModal';
import { CONVENIO_EXCLUIDO } from '../../components/contratos/afipCompleteness';
import { ConveniosTable } from '../../components/convenios/ConveniosTable';

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

/** Un convenio del catálogo con su obra social sindical resuelta. */
type ConvenioConOS = SimpleCatalogItem & { obraSocialDefaultId?: number | null };
/** Excepción de obra social de un convenio, para una empleadora concreta. */
type Override = { convenioId: string; obraSocialId: number };
const conveniosApi = createSimpleCatalogApi('/convenios');
const tiposServicioApi = createSimpleCatalogApi('/arca/tipos-servicio');
const modalidadesLiqApi = createSimpleCatalogApi('/arca/modalidades-liquidacion');

/** Botón de guardar compartido: todas estas pantallas guardan un campo de `Company`. */
const BotonGuardar: React.FC<{ onClick: () => void; guardando: boolean; sucio: boolean }> = ({ onClick, guardando, sucio }) => (
  <button onClick={onClick} disabled={guardando || !sucio} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
    {guardando && <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4" />}
    {/* El botón se llama por su ACCIÓN, no por su estado: "Sin cambios" nombraba la situación y
        dejaba al operador buscando dónde estaba el botón de guardar. Deshabilitado ya lo dice. */}
    {guardando ? 'Guardando...' : 'Guardar cambios'}
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
  <EmpresaContextLayout titulo="Obras Sociales" icono={faBriefcaseMedical} ayuda="empresaObrasSociales">
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

  /** A quién alcanza cada obra social de esta empleadora, para poder avisar antes de quitarla. */
  const [enUso, setEnUso] = useState<{ contratos: Record<string, number>; convenios: Record<string, string[]> }>({ contratos: {}, convenios: {} });
  useEffect(() => {
    companiesAPI
      .obrasSocialesEnUso(empresa._id)
      // Si falla, se puede seguir trabajando: lo que se pierde es el aviso, no la operación.
      .then(setEnUso)
      .catch(() => setEnUso({ contratos: {}, convenios: {} }));
  }, [empresa._id]);

  const registradas = useMemo(() => catalogo.filter((o) => ids.includes(o._id)), [catalogo, ids]);
  const dataId = (o: SimpleCatalogItem) => Number((o.data as { id?: number } | undefined)?.id);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return catalogo.filter((o) => !ids.includes(o._id) && (o.name.toLowerCase().includes(q) || String(o.externalId || '').includes(q.replace(/\D/g, '') || ' ')));
  }, [catalogo, busqueda, ids]);

  const sucio = JSON.stringify([...ids].sort()) !== JSON.stringify([...(empresa.obrasSocialesIds || [])].sort()) || defaultId !== (empresa.obraSocialDefaultId ?? empresa.obraSocialId ?? null);

  /**
   * Quitar una obra social del padrón de la empleadora, avisando a quién alcanza.
   *
   * Sacarla no rompe nada en el momento: rompe DESPUÉS, cuando esos contratos generen el TXT y ARCA
   * los rechace por declarar una obra social que el CUIT no tiene registrada. Por eso el número va
   * antes de la confirmación y no en un error posterior.
   */
  const quitar = async (id: string) => {
    const os = catalogo.find((o) => o._id === id);
    const osId = os ? dataId(os) : NaN;

    if (os && Number.isFinite(osId)) {
      const contratos = enUso.contratos[String(osId)] || 0;
      const convenios = enUso.convenios[String(osId)] || [];
      if (contratos > 0 || convenios.length > 0) {
        const partes = [
          contratos > 0 ? `${contratos} contrato(s) la tienen cargada` : "",
          convenios.length > 0 ? `${convenios.length === 1 ? "el convenio" : "los convenios"} ${convenios.join(", ")} la usa${convenios.length === 1 ? "" : "n"}` : "",
        ].filter(Boolean);
        const r = await sweetAlert.confirm(`¿Quitar ${os.name}?`, `${partes.join(" y ")}. Al quitarla, esas altas van a ser rechazadas por ARCA.`, "Sí, quitar");
        if (!r.isConfirmed) return;
      }
    }

    setIds((prev) => prev.filter((x) => x !== id));
    // Sacar la de excluidos del conjunto la dejaría apuntando a algo que ARCA no acepta: se limpia.
    if (os && osId === defaultId) setDefaultId(null);
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

      {/*
       * LO PRIMERO Y ÚNICO QUE SE DECIDE ACÁ: la obra social de los excluidos de convenio.
       *
       * Antes esto era un botón "Marcar" repetido en cada una de las 494 filas, lo que sugería que
       * elegir la default era la acción principal de la pantalla. No lo es: con los convenios
       * cargados, este valor casi nunca se usa — solo alcanza a quienes están bajo 9999/99, que por
       * definición no tienen sindicato del que heredar.
       */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Para trabajadores excluidos de convenio</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-3">
          Solo aplica a quienes están bajo <span className="font-mono">{CONVENIO_EXCLUIDO}</span>. El resto hereda la obra social de su convenio.
        </p>
        <select
          value={defaultId ?? ''}
          onChange={(e) => setDefaultId(e.target.value ? Number(e.target.value) : null)}
          className="w-full max-w-xl px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
        >
          <option value="">— Sin definir: se usa la global del catálogo —</option>
          {registradas
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
            .map((o) => (
              <option key={o._id} value={dataId(o)}>
                {formatRnos(o.externalId)} — {o.name}
              </option>
            ))}
        </select>
        {registradas.length === 0 && <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">Registrá primero las obras sociales de esta empleadora para poder elegir una.</p>}
      </div>

      {/* El chequeo de consistencia, visible aunque esté en cero: es lo que se rompe cuando alguien
          cambia la obra social de un convenio o quita una registrada. */}
      <ObraSocialPorConvenio empresa={empresa} catalogo={catalogo} registradas={ids} />

      {/* Las 494 son REFERENCIA, no acción: van colapsadas al final. */}
      <details className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden group">
        <summary className="px-4 py-3 cursor-pointer select-none flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40">
          <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 text-gray-400 group-open:hidden" />
          <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3 text-gray-400 hidden group-open:inline" />
          Ver las {registradas.length} registradas
          <span className="ml-auto text-[11px] font-normal text-gray-400">de {catalogo.length} del catálogo</span>
        </summary>

        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700/60 pt-3">
          <div className="relative">
            <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en el catálogo para registrar otra…" className="w-full pl-9 pr-9 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30" />
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
                      <FontAwesomeIcon icon={faPlus} className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">{formatRnos(o.externalId)}</span>
                      <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{o.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {registradas.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Todavía no hay ninguna registrada para esta empleadora.</p>
          ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700/60 max-h-96 overflow-y-auto">
              {registradas.map((o) => (
                <div key={o._id} className="px-3 py-2 flex items-center gap-3">
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">{formatRnos(o.externalId)}</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100 truncate flex-1">{o.name}</span>
                  {dataId(o) === defaultId && (
                    <span title="Es la que se usa para los excluidos de convenio" className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      <FontAwesomeIcon icon={faStar} className="h-2.5 w-2.5" />
                      Excluidos
                    </span>
                  )}
                  <button type="button" onClick={() => quitar(o._id)} title="Quitar de las registradas" className="shrink-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1">
                    <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Cascada al resolver el RNOS: <strong>obra social de la persona</strong> &gt; <strong>la del convenio de su categoría</strong> (o la excepción que ponga esta empresa) &gt; para los excluidos de convenio, la de arriba. Si ninguna resuelve, el dato falta y el contrato no entra en el TXT: no hay una obra social por defecto que lo tape.
      </p>
    </SeccionEmpleador>
  );
};

/**
 * Qué obra social le toca a cada convenio registrado por esta empleadora.
 *
 * Es lo que realmente decide el RNOS de la mayoría de los contratos, y no se configura acá: la obra
 * social la define el sindicato, y al sindicato lo define el CCT. Esta tabla es de solo lectura y
 * existe para poder ver de un vistazo dos cosas que rompen el alta:
 *
 *  - un convenio **sin** obra social cargada (salvo 9999/99, que no tiene sindicato);
 *  - una obra social que el convenio asigna pero que la empleadora **no tiene registrada** — ARCA
 *    rechaza esas altas, y el error alcanza a todos los contratos de ese CCT.
 */
const ObraSocialPorConvenio: React.FC<{ empresa: Company; catalogo: SimpleCatalogItem[]; registradas: string[] }> = ({ empresa, catalogo, registradas }) => {
  const [convenios, setConvenios] = useState<Array<SimpleCatalogItem & { obraSocialDefaultId?: number | null }>>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    conveniosApi
      .list()
      .then((cs) => setConvenios(cs as Array<SimpleCatalogItem & { obraSocialDefaultId?: number | null }>))
      .catch(() => setConvenios([]))
      .finally(() => setCargando(false));
  }, []);

  const delaEmpresa = useMemo(() => convenios.filter((c) => (empresa.convenioIds || []).map(String).includes(c._id)).sort((a, b) => String(a.externalId || '').localeCompare(String(b.externalId || ''))), [convenios, empresa]);

  if (cargando) return <LoadingSpinner message="Verificando la obra social de cada convenio..." />;
  if (delaEmpresa.length === 0) return null;

  const porDataId = (id?: number | null) => (id == null ? undefined : catalogo.find((o) => Number((o.data as { id?: number } | undefined)?.id) === id));
  const overrides = empresa.convenioObraSocialOverrides || [];

  /** Convenios cuya obra social resuelta NO está entre las registradas: ARCA rechaza esas altas. */
  const rotos = delaEmpresa.filter((cv) => {
    if (String(cv.externalId || '').trim() === CONVENIO_EXCLUIDO) return false;
    const os = porDataId(overrides.find((o) => String(o.convenioId) === cv._id)?.obraSocialId ?? cv.obraSocialDefaultId);
    return !!os && !registradas.map(String).includes(os._id);
  });
  /** Convenios sin obra social: sus contratos NO pueden generar el alta — el RNOS queda sin resolver. */
  const sinCargar = delaEmpresa.filter((cv) => String(cv.externalId || '').trim() !== CONVENIO_EXCLUIDO && !overrides.some((o) => String(o.convenioId) === cv._id) && cv.obraSocialDefaultId == null);

  const Chequeo: React.FC<{ mal: boolean; texto: string; detalle?: string }> = ({ mal, texto, detalle }) => (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${mal ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/20' : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20'}`}>
      <FontAwesomeIcon icon={mal ? faTriangleExclamation : faCheck} className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${mal ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
      <div className="min-w-0">
        <p className={`text-sm ${mal ? 'text-red-800 dark:text-red-300 font-semibold' : 'text-emerald-800 dark:text-emerald-300'}`}>{texto}</p>
        {detalle && <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{detalle}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Consistencia con los convenios</p>
      {/* Se muestran SIEMPRE, también en verde: son los chequeos que se rompen cuando alguien cambia
          la obra social de un convenio o saca una de las registradas, y en cero avisan que están vivos. */}
      <Chequeo
        mal={rotos.length > 0}
        texto={rotos.length === 0 ? 'Ningún convenio apunta a una obra social no registrada' : `${rotos.length} convenio(s) apuntan a una obra social que esta empleadora no tiene registrada`}
        detalle={rotos.length === 0 ? undefined : `${rotos.map((c) => c.externalId).join(', ')} — ARCA va a rechazar esas altas. Registralas acá, o poné una excepción en ARCA → Convenios.`}
      />
      <Chequeo
        mal={sinCargar.length > 0}
        texto={sinCargar.length === 0 ? 'Todos los convenios tienen su obra social cargada' : `${sinCargar.length} convenio(s) no tienen obra social cargada`}
        detalle={sinCargar.length === 0 ? undefined : `${sinCargar.map((c) => c.externalId).join(', ')} — sus contratos no van a poder generar el alta: el RNOS queda sin resolver. Se carga en Configuración → ARCA → Convenios.`}
      />
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        El detalle de qué obra social resuelve cada convenio está en{' '}
        <Link to={`/empresas/${empresa._id}/arca/convenios`} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          ARCA → Convenios
        </Link>
        , que es donde se edita.
      </p>
    </div>
  );
};

// ───────────────────────────────────────────────────────────── Convenios

export const EmpresaConveniosPage: React.FC = () => (
  <EmpresaContextLayout titulo="Convenios Colectivos" icono={faFileContract} ayuda="empresaConvenios">
    {(empresa, recargar) => <ConveniosBody empresa={empresa} recargar={recargar} />}
  </EmpresaContextLayout>
);

const ConveniosBody: React.FC<{ empresa: Company; recargar: () => Promise<void> }> = ({ empresa, recargar }) => {
  const { guardar, guardando } = useGuardarEmpresa(empresa, recargar);
  const [convenios, setConvenios] = useState<ConvenioConOS[]>([]);
  const [obrasSociales, setObrasSociales] = useState<SimpleCatalogItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ids, setIds] = useState<string[]>(empresa.convenioIds || []);
  const [overrides, setOverrides] = useState<Override[]>(empresa.convenioObraSocialOverrides || []);
  const [agregando, setAgregando] = useState(false);
  /** Convenio cuya excepción de obra social se está editando. */
  const [editandoOverride, setEditandoOverride] = useState<ConvenioConOS | null>(null);

  useEffect(() => {
    Promise.all([conveniosApi.list().catch(() => []), obrasSocialesApi.list().catch(() => [])])
      .then(([cs, os]) => {
        setConvenios(cs as ConvenioConOS[]);
        setObrasSociales(os);
      })
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => {
    setIds(empresa.convenioIds || []);
    setOverrides(empresa.convenioObraSocialOverrides || []);
  }, [empresa]);

  const registrados = useMemo(() => convenios.filter((c) => ids.includes(c._id)).sort((a, b) => String(a.externalId || '').localeCompare(String(b.externalId || ''))), [convenios, ids]);

  const porDataId = (id?: number | null) => (id == null ? undefined : obrasSociales.find((o) => Number((o.data as { id?: number } | undefined)?.id) === id));
  const registradasIds = (empresa.obrasSocialesIds || []).map(String);

  const sucio = JSON.stringify([...ids].sort()) !== JSON.stringify([...(empresa.convenioIds || [])].sort()) || JSON.stringify(overrides) !== JSON.stringify(empresa.convenioObraSocialOverrides || []);

  const guardarTodo = () =>
    // Los overrides de convenios que se dejaron de registrar se descartan al guardar: quedarían
    // huérfanos y aplicarían a un CCT que esta empleadora ya no tiene.
    guardar({ convenioIds: ids, convenioObraSocialOverrides: overrides.filter((o) => ids.includes(String(o.convenioId))) }, `${ids.length} convenio(s) registrado(s) para ${empresa.razonSocial}.`);

  return (
    <SeccionEmpleador
      titulo="Convenios Colectivos registrados"
      descripcion="Los CCT que este CUIT tiene registrados ante ARCA. De cada uno cuelgan DOS cosas: qué categorías profesionales se le pueden dar de alta, y qué obra social le corresponde a quien trabaja bajo él."
      nota="La obra social y la escala salarial son del CONVENIO, iguales para todas las empleadoras que lo tengan registrado: se editan en Configuración → ARCA → Convenios. Acá solo se registra cuáles aplican y, si hace falta, se pisa la obra social como excepción."
    >
      <div className="flex justify-end gap-2">
        <button onClick={() => setAgregando((v) => !v)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
          {agregando ? 'Cerrar buscador' : 'Agregar convenio'}
        </button>
        <BotonGuardar guardando={guardando} sucio={sucio} onClick={guardarTodo} />
      </div>

      {agregando && <ConvenioSelector convenios={convenios} cargando={cargando} value={ids} onChange={setIds} />}

      {cargando ? (
        <LoadingSpinner message="Cargando convenios..." />
      ) : registrados.length === 0 ? (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
          <p className="text-sm text-amber-800 dark:text-amber-300">Sin convenios registrados no hay ninguna categoría que se le pueda dar de alta a esta empleadora.</p>
        </div>
      ) : (
        // MISMA tabla que el nomenclador: solo cambian las acciones y la columna "Empresas".
        <ConveniosTable
          convenios={registrados}
          // Acá la falta SÍ es accionable: ese convenio le afecta los contratos a esta empleadora.
          // En el nomenclador va un guion, porque serían 2.664 avisos sobre convenios que nadie usa.
          ayudaSinObraSocial="Asignásela al convenio en Configuración → ARCA → Convenios."
          obraSocialDe={(cv) => {
            const override = overrides.find((o) => String(o.convenioId) === cv._id);
            const guardado = (empresa.convenioObraSocialOverrides || []).find((o) => String(o.convenioId) === cv._id);
            const os = porDataId(override?.obraSocialId ?? cv.obraSocialDefaultId);
            return {
              os,
              esOverride: !!override,
              // Marca la excepción que todavía no se persistió: el modal la aplica en memoria y recién
              // el "Guardar cambios" de afuera la escribe.
              pendiente: override?.obraSocialId !== guardado?.obraSocialId,
              noRegistrada: !!os && !registradasIds.includes(os._id),
              sinSindicato: String(cv.externalId || '').trim() === CONVENIO_EXCLUIDO,
            };
          }}
          renderAcciones={(cv) => (
            // Mismos íconos que el resto de los listados de la app (✎ / 🗑): el verbo cambia según
            // dónde estés parado —acá se edita la excepción y se quita el convenio de la empleadora,
            // no se toca el registro maestro—, pero el gesto tiene que ser el mismo en todas.
            <>
              <button
                onClick={() => setEditandoOverride(cv)}
                title={overrides.some((o) => String(o.convenioId) === cv._id) ? 'Cambiar la excepción de obra social' : 'Usar otra obra social para este convenio'}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 mr-3"
              >
                <FontAwesomeIcon icon={faEdit} />
              </button>
              <button onClick={() => setIds((prev) => prev.filter((x) => x !== cv._id))} title="Quitar el convenio de esta empleadora" className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300">
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </>
          )}
        />
      )}

      <OverrideModal
        convenio={editandoOverride}
        obrasSociales={obrasSociales}
        registradasIds={registradasIds}
        actual={editandoOverride ? overrides.find((o) => String(o.convenioId) === editandoOverride._id)?.obraSocialId : undefined}
        onClose={() => setEditandoOverride(null)}
        onGuardar={(obraSocialId) => {
          const convenioId = editandoOverride!._id;
          setOverrides((prev) => {
            const sinEste = prev.filter((o) => String(o.convenioId) !== convenioId);
            return obraSocialId == null ? sinEste : [...sinEste, { convenioId, obraSocialId }];
          });
          setEditandoOverride(null);
        }}
      />
    </SeccionEmpleador>
  );
};

/** La excepción de obra social de un convenio, para ESTA empleadora. */
const OverrideModal: React.FC<{
  convenio: ConvenioConOS | null;
  obrasSociales: SimpleCatalogItem[];
  registradasIds: string[];
  actual?: number;
  onClose: () => void;
  onGuardar: (obraSocialId: number | null) => void;
}> = ({ convenio, obrasSociales, registradasIds, actual, onClose, onGuardar }) => {
  const [elegida, setElegida] = useState<string>('');
  useEffect(() => setElegida(actual != null ? String(actual) : ''), [convenio, actual]);

  if (!convenio) return null;

  // Solo se ofrecen las REGISTRADAS por la empleadora: elegir una que ARCA no le acepta sería crear
  // el error que esta pantalla existe para evitar.
  const elegibles = obrasSociales.filter((o) => registradasIds.includes(o._id)).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  return (
    <InfoModal
      isOpen
      onClose={onClose}
      title="Excepción de obra social"
      subtitle={`${convenio.externalId} — ${convenio.name}`}
      size="md"
      actions={[
        // "Aplicar" y NO "Guardar": esto solo la deja puesta en pantalla. Lo que persiste es el
        // "Guardar cambios" de la ficha. Dos botones con la palabra "guardar" en el mismo flujo, y
        // solo uno escribiendo, es la forma más barata de perder trabajo sin enterarse.
        { label: 'Aplicar excepción', onClick: () => onGuardar(elegida ? Number(elegida) : null), variant: 'primary' },
        { label: 'Cancelar', onClick: onClose, variant: 'ghost' },
      ]}
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Lo normal es que la obra social la resuelva el convenio: la define el sindicato y vale para todas las empleadoras. Usá esto solo si <strong>para esta empresa</strong> corresponde otra.
        </p>
        <select value={elegida} onChange={(e) => setElegida(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">
          <option value="">— Sin excepción: usar la del convenio —</option>
          {elegibles.map((o) => (
            <option key={o._id} value={String((o.data as { id?: number } | undefined)?.id ?? '')}>
              {formatRnos(o.externalId)} — {o.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Solo aparecen las {elegibles.length} obras sociales que esta empleadora tiene registradas ante ARCA. Si la que buscás no está, registrala primero en Obras Sociales.</p>
        <p className="text-[11px] text-amber-700 dark:text-amber-400">La excepción queda marcada como «sin guardar» hasta que apretés <strong>Guardar cambios</strong> en la pantalla de Convenios.</p>
      </div>
    </InfoModal>
  );
};

// ───────────────────────────────────────────────────────────── Domicilios

export const EmpresaDomiciliosPage: React.FC = () => (
  <EmpresaContextLayout titulo="Domicilios de Explotación" icono={faLocationDot} ayuda="empresaDomicilios">
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
  <EmpresaContextLayout titulo="Categorías" icono={faListCheck} ayuda="empresaCategorias">
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
  <EmpresaContextLayout titulo="Defaults de ARCA" icono={faSliders} ayuda="empresaDefaults">
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
