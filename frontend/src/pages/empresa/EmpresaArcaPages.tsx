import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBriefcaseMedical, faFileContract, faLocationDot, faListCheck, faSliders, faSearch, faXmark, faStar, faCircleInfo, faTriangleExclamation, faArrowUpRightFromSquare, faSpinner, faPlus, faChevronDown, faChevronRight, faCheck, faEdit, faTrash, faLayerGroup, faEye } from '@fortawesome/free-solid-svg-icons';
import { EmpresaContextLayout, SeccionEmpleador } from '../../components/empresa/EmpresaContextLayout';
import { ActividadesDelDomicilio, ActividadDomicilio } from '../../components/arca/ActividadesDelDomicilio';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Modal } from '../../components/ui/Modal';
import { ConvenioSelector } from '../../components/empresas/ConvenioSelector';
import { SucursalSelector } from '../../components/empresas/SucursalSelector';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { arcaSucursalesAPI, ArcaSucursal } from '../../api/arcaSucursales';
import { arcaCategoriasAPI, ConvenioDetalle } from '../../api/arcaCategorias';
import { companiesAPI, Company } from '../../api/companies';
import { paritariasAPI, EstadoParitarias } from '../../api/paritarias';
import { CeldaFuenteParitarias } from '../../components/convenios/CeldaFuenteParitarias';
import { CeldaSindicato } from '../../components/convenios/CeldaSindicato';
import { sweetAlert } from '../../utils/sweetAlert';
import { formatRnos } from '../../utils/rnos';
import { useGuardarEmpresa } from '../../components/empresa/useGuardarEmpresa';
import { DefaultArcaEmpresa } from '../../components/empresa/DefaultArcaEmpresa';
import { HerenciaGlobal } from '../../components/arca/HerenciaGlobal';
import { useArcaDefaults } from '../../components/arca/DefaultArcaStar';
import { CONVENIO_EXCLUIDO } from '../../components/contratos/afipCompleteness';
import { ConveniosTable } from '../../components/convenios/ConveniosTable';
import { BannerParitarias } from '../../components/paritarias/BannerParitarias';

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
const conveniosApi = createSimpleCatalogApi('/convenios');
const tiposServicioApi = createSimpleCatalogApi('/arca/tipos-servicio');
const gruposTipoServicioApi = createSimpleCatalogApi('/arca/grupos-tipo-servicio');
const modalidadesLiqApi = createSimpleCatalogApi('/arca/modalidades-liquidacion');
const modalidadesContratacionApi = createSimpleCatalogApi('/arca/modalidades-contratacion');

/**
 * De qué grupo es un tipo de servicio, según su código: por debajo de 500 CONTINUOS, de ahí para
 * arriba DISCONTINUOS. Es la regla de ARCA, verificada sobre los 293 tipos sin excepciones, y la
 * misma que aplica el server al guardar (`server/src/utils/grupoTipoServicio.ts`).
 *
 * Solo AUTOCOMPLETA el grupo cuando se elige primero el tipo. Para FILTRAR se usa `grupoDelItem`,
 * que lee el campo que el nomenclador ya trae cargado.
 */
const grupoDelCodigo = (codigo: string): string => {
  const d = String(codigo || '').replace(/\D/g, '');
  return d === '' ? '' : Number(d) < 500 ? '1' : '2';
};

/** El grupo con el que quedó clasificado un tipo en el nomenclador. Vacío = todavía sin clasificar. */
const grupoDelItem = (t: SimpleCatalogItem): string => String((t as { grupo?: unknown }).grupo ?? '');

/** Botón de guardar compartido: todas estas pantallas guardan un campo de `Company`. */
const BotonGuardar: React.FC<{ onClick: () => void; guardando: boolean; sucio: boolean }> = ({ onClick, guardando, sucio }) => (
  <button onClick={onClick} disabled={guardando || !sucio} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
    {guardando && <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4" />}
    {/* El botón se llama por su ACCIÓN, no por su estado: "Sin cambios" nombraba la situación y
        dejaba al operador buscando dónde estaba el botón de guardar. Deshabilitado ya lo dice. */}
    {guardando ? 'Guardando...' : 'Guardar cambios'}
  </button>
);

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
        const partes = [contratos > 0 ? `${contratos} contrato(s) la tienen cargada` : '', convenios.length > 0 ? `${convenios.length === 1 ? 'el convenio' : 'los convenios'} ${convenios.join(', ')} la usa${convenios.length === 1 ? '' : 'n'}` : ''].filter(Boolean);
        const r = await sweetAlert.confirm(`¿Quitar ${os.name}?`, `${partes.join(' y ')}. Al quitarla, esas altas van a ser rechazadas por ARCA.`, 'Sí, quitar');
        if (!r.isConfirmed) return;
      }
    }

    setIds((prev) => prev.filter((x) => x !== id));
    // Sacar la de excluidos del conjunto la dejaría apuntando a algo que ARCA no acepta: se limpia.
    if (os && osId === defaultId) setDefaultId(null);
  };

  /**
   * Registrar de una vez todas las del catálogo.
   *
   * Es una acción de carga, no un atajo de configuración, y por eso pregunta antes: la sección existe
   * porque cada CUIT declara ante ARCA un SUBCONJUNTO, y con las 496 puestas el chequeo de
   * consistencia deja de decir nada —cualquier obra social pasa—. El rechazo entonces no lo da la
   * plataforma sino ARCA, al subir el TXT, que es exactamente lo que este control viene a evitar.
   *
   * Solo AGREGA: no toca lo ya registrado ni la default de excluidos. Y como todo en esta pantalla,
   * no se escribe nada hasta Guardar, así que se puede deshacer saliendo sin guardar.
   */
  const registrarTodas = async () => {
    const faltan = catalogo.filter((o) => !ids.includes(o._id));
    if (faltan.length === 0) return;
    const r = await sweetAlert.confirm(`¿Registrar las ${faltan.length} que faltan?`, `Van a quedar registradas las ${catalogo.length} del catálogo. Tené en cuenta que ARCA solo acepta las que este CUIT tenga declaradas en su padrón: con todas puestas, el chequeo de consistencia deja pasar cualquiera y el rechazo aparece recién al subir el TXT. Todavía no se guarda nada.`, 'Sí, registrar todas');
    if (!r.isConfirmed) return;
    setIds((prev) => [...prev, ...faltan.map((o) => o._id)]);
  };

  if (cargando) return <LoadingSpinner message="Cargando el catálogo de obras sociales..." />;

  return (
    <SeccionEmpleador>
      <div className="flex justify-end">
        <BotonGuardar guardando={guardando} sucio={sucio} onClick={() => guardar({ obrasSocialesIds: ids, obraSocialDefaultId: defaultId }, `${ids.length} obra(s) social(es) registrada(s) para ${empresa.razonSocial}.`)} />
      </div>

      {ids.length === 0 && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300">Sin obras sociales registradas no se puede verificar que la del contrato sea válida para esta empleadora. El chequeo de Datos ARCA deja pasar cualquiera, y ARCA la rechaza al subir el archivo.</p>
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
        <select value={defaultId ?? ''} onChange={(e) => setDefaultId(e.target.value ? Number(e.target.value) : null)} className="w-full max-w-xl px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">
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
          {/* Buscar de a una y traer todas son las dos formas de poblar esto, así que van juntas. El
              botón queda a la derecha y en secundario: registrar de a una es lo correcto casi siempre. */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en el catálogo para registrar otra…" className="w-full pl-9 pr-9 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30" />
              {busqueda && (
                <button type="button" onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button type="button" onClick={registrarTodas} disabled={registradas.length === catalogo.length} title={registradas.length === catalogo.length ? 'Ya están registradas las del catálogo' : `Registrar las ${catalogo.length - registradas.length} que faltan`} className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
              Registrar todas
            </button>
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

  /** Convenios cuya obra social resuelta NO está entre las registradas: ARCA rechaza esas altas. */
  const rotos = delaEmpresa.filter((cv) => {
    if (String(cv.externalId || '').trim() === CONVENIO_EXCLUIDO) return false;
    const os = porDataId(cv.obraSocialDefaultId);
    return !!os && !registradas.map(String).includes(os._id);
  });
  /** Convenios sin obra social: sus contratos NO pueden generar el alta — el RNOS queda sin resolver. */
  const sinCargar = delaEmpresa.filter((cv) => String(cv.externalId || '').trim() !== CONVENIO_EXCLUIDO && cv.obraSocialDefaultId == null);

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
      <Chequeo mal={rotos.length > 0} texto={rotos.length === 0 ? 'Ningún convenio apunta a una obra social no registrada' : `${rotos.length} convenio(s) apuntan a una obra social que esta empleadora no tiene registrada`} detalle={rotos.length === 0 ? undefined : `${rotos.map((c) => c.externalId).join(', ')} — ARCA va a rechazar esas altas. Registralas acá, o poné una excepción en ARCA → Convenios.`} />
      <Chequeo mal={sinCargar.length > 0} texto={sinCargar.length === 0 ? 'Todos los convenios tienen su obra social cargada' : `${sinCargar.length} convenio(s) no tienen obra social cargada`} detalle={sinCargar.length === 0 ? undefined : `${sinCargar.map((c) => c.externalId).join(', ')} — sus contratos no van a poder generar el alta: el RNOS queda sin resolver. Se carga en Configuración → ARCA → Convenios.`} />
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
  <EmpresaContextLayout titulo="Convenios" icono={faFileContract} ayuda="empresaConvenios">
    {(empresa, recargar) => <ConveniosBody empresa={empresa} recargar={recargar} />}
  </EmpresaContextLayout>
);

const ConveniosBody: React.FC<{ empresa: Company; recargar: () => Promise<void> }> = ({ empresa, recargar }) => {
  const { guardar, guardando } = useGuardarEmpresa(empresa, recargar);
  const [convenios, setConvenios] = useState<ConvenioConOS[]>([]);
  const [obrasSociales, setObrasSociales] = useState<SimpleCatalogItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ids, setIds] = useState<string[]>(empresa.convenioIds || []);
  const [agregando, setAgregando] = useState(false);
  /*
    Estado de paritarias, para la columna «Fuente de paritarias».

    Es la MISMA celda que el nomenclador (`CeldaFuenteParitarias`), en modo lectura: acá se registra
    qué convenios tiene el CUIT, y dónde publica sus acuerdos un gremio es una propiedad del convenio
    que se administra en Configuración → ARCA → Convenios. Por eso no se le pasa `onAnotar`.
  */
  const [vigilancia, setVigilancia] = useState<EstadoParitarias['porConvenio']>({});
  const [declarado, setDeclarado] = useState<EstadoParitarias['declarado']>({});

  useEffect(() => {
    Promise.all([conveniosApi.list().catch(() => []), obrasSocialesApi.list().catch(() => [])])
      .then(([cs, os]) => {
        setConvenios(cs as ConvenioConOS[]);
        setObrasSociales(os);
      })
      .finally(() => setCargando(false));
    // Aparte y con su propio catch: si el estado de paritarias no responde, esta pantalla —que es
    // para registrar convenios— tiene que seguir funcionando con esa columna en "Sin revisar".
    void paritariasAPI
      .estado()
      .then((e) => {
        setVigilancia(e.porConvenio || {});
        setDeclarado(e.declarado || {});
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    setIds(empresa.convenioIds || []);
  }, [empresa]);

  const registrados = useMemo(() => convenios.filter((c) => ids.includes(c._id)).sort((a, b) => String(a.externalId || '').localeCompare(String(b.externalId || ''))), [convenios, ids]);

  const porDataId = (id?: number | null) => (id == null ? undefined : obrasSociales.find((o) => Number((o.data as { id?: number } | undefined)?.id) === id));
  const registradasIds = (empresa.obrasSocialesIds || []).map(String);

  const sucio = JSON.stringify([...ids].sort()) !== JSON.stringify([...(empresa.convenioIds || [])].sort());
  const convenioPorDefectoId = empresa.defaultsArca?.convenioId || '';
  const { defaults: arcaDefaultsDeLaInstalacion } = useArcaDefaults();

  /** Marca o desmarca el convenio habitual. Se guarda con el click. */
  const marcarConvenioPorDefecto = async (convenioId: string) => {
    const nuevo = convenioPorDefectoId === convenioId ? null : convenioId;
    await guardar({ defaultsArca: { ...(empresa.defaultsArca || {}), convenioId: nuevo } } as any, nuevo ? `${convenios.find((c) => c._id === nuevo)?.externalId || 'El convenio'} queda por defecto para ${empresa.razonSocial}.` : 'Se quitó el convenio por defecto.');
  };

  const guardarTodo = () => {
    // Si se le saca el convenio que era el habitual, el default se va con él: sugerir uno que la
    // empleadora ya no tiene registrado es sugerir un alta que ARCA rechaza.
    const pierdeElDefault = !!convenioPorDefectoId && !ids.includes(convenioPorDefectoId);
    guardar(
      {
        convenioIds: ids,
        ...(pierdeElDefault ? { defaultsArca: { ...(empresa.defaultsArca || {}), convenioId: null } } : {}),
      } as any,
      `${ids.length} convenio(s) registrado(s) para ${empresa.razonSocial}.${pierdeElDefault ? ' Se quitó el convenio por defecto: ya no está registrado.' : ''}`,
    );
  };

  return (
    <SeccionEmpleador>
      {/*
        Los avisos de paritarias, ACOTADOS A ESTA EMPLEADORA.

        La revisión es una sola para toda la plataforma —la página del gremio se baja una vez por día,
        no una vez por empresa—, pero acá solo se muestra lo que sale de fuentes que alimentan
        convenios que este CUIT tiene registrados. Un acuerdo de un gremio que esta empleadora no usa
        no es una novedad suya, y mostrárselo entrena a ignorar el cartel.
      */}
      <BannerParitarias empresaId={empresa._id} />

      <div className="flex justify-end gap-2">
        <button onClick={() => setAgregando((v) => !v)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
          {agregando ? 'Cerrar buscador' : 'Agregar convenio'}
        </button>
        <BotonGuardar guardando={guardando} sucio={sucio} onClick={guardarTodo} />
      </div>

      {/* El convenio por defecto tiene un escalón debajo, y hasta acá no se veía: ver `HerenciaGlobal`. */}
      <HerenciaGlobal
        campo="convenioId"
        valorEmpresa={convenioPorDefectoId}
        nombreDe={(id) => {
          const cv = convenios.find((c) => c._id === id);
          return cv ? `${cv.externalId || ''} ${cv.name}`.trim() : '';
        }}
        /* ARCA solo acepta categorías de los convenios que ESTE CUIT registró, así que un global que
           esta empleadora no tiene no rige: decir que se hereda mandaría a buscar un efecto que no
           existe. Es el mismo descarte que hace la cascada del TXT. */
        noAplica={(() => {
          const g = String(arcaDefaultsDeLaInstalacion.convenioId || '');
          return g && !ids.includes(g) ? 'esta empleadora no lo tiene registrado.' : undefined;
        })()}
      />

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
          /*
            Las mismas columnas que el nomenclador salvo «Empresas», que acá no aporta: la empleadora
            ES el contexto de la pantalla, y la columna diría en cuántas OTRAS está registrado.
          */
          renderSindicato={(cv) => <CeldaSindicato convenio={cv} />}
          renderVigilancia={(cv) => <CeldaFuenteParitarias convenio={cv} vigilancia={vigilancia} declarado={declarado} />}
          // Acá la falta SÍ es accionable: ese convenio le afecta los contratos a esta empleadora.
          // En el nomenclador va un guion, porque serían 2.664 avisos sobre convenios que nadie usa.
          ayudaSinObraSocial="Asignásela al convenio en Configuración → ARCA → Convenios."
          // La obra social sale del CONVENIO y de ningún otro lado: la define el sindicato y vale
          // para todas las empleadoras que lo tengan registrado.
          obraSocialDe={(cv) => {
            const os = porDataId(cv.obraSocialDefaultId);
            return {
              os,
              noRegistrada: !!os && !registradasIds.includes(os._id),
              sinSindicato: String(cv.externalId || '').trim() === CONVENIO_EXCLUIDO,
            };
          }}
          /*
            ★ EL CONVENIO HABITUAL DE ESTA EMPLEADORA.

            Es una SUGERENCIA, no un candado: en el alta aparece primero y marcado, y los otros
            registrados se siguen pudiendo elegir. Existe porque el caso normal es que una misma
            productora dé de alta casi todo bajo el mismo CCT, y hoy eso se elige de cero cada vez.

            Mismo gesto que la ★ de Domicilios: se guarda con el click, no espera al «Guardar cambios»
            de arriba — es una decisión sola, no parte del formulario de registro.
          */
          renderPorDefecto={(cv) => (
            <button onClick={() => marcarConvenioPorDefecto(cv._id)} disabled={guardando} title={convenioPorDefectoId === cv._id ? 'Es el convenio por defecto. Click para quitarlo.' : 'Marcar como convenio por defecto de esta empleadora'} className={`transition-colors disabled:opacity-50 ${convenioPorDefectoId === cv._id ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 dark:text-gray-600 hover:text-amber-500'}`}>
              <FontAwesomeIcon icon={faStar} />
            </button>
          )}
          /*
            Solo QUITAR el convenio de esta empleadora. Acá no se toca el registro maestro.

            Había también un ✎ para poner una «excepción de obra social» por empresa. Se quitó: la
            obra social la define el SINDICATO del convenio y vale para todas las empleadoras que lo
            tengan registrado, así que una excepción por empresa no es un caso real — era una forma
            de declarar mal la obra social sin que nada lo frenara. No había ninguna cargada.
          */
          renderAcciones={(cv) => (
            <button onClick={() => setIds((prev) => prev.filter((x) => x !== cv._id))} title="Quitar el convenio de esta empleadora" className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300">
              <FontAwesomeIcon icon={faTrash} />
            </button>
          )}
        />
      )}
    </SeccionEmpleador>
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
  /*
    LAS ACTIVIDADES QUE ESTA EMPLEADORA DECLARÓ EN CADA DOMICILIO.

    Se cargan acá y en ningún otro lado. ARCA las declara POR CUIT, no por dirección: dos empleadoras
    en el mismo domicilio pueden tener declaradas distintas, y el organismo rechaza un alta con una
    que ESE CUIT no declaró ahí. Mientras se editaban en el ABM del domicilio, el formulario de
    contrato les ofrecía las mismas a todas.

    Se guarda la actividad COMPLETA (`codigo` + `descripcion`), igual que hacía el domicilio: el
    import del padrón trae códigos y no ids del catálogo, así que la descripción tiene que viajar con
    el dato o se pierde si el catálogo cambia.
  */
  const mapaDeclaradas = (e: Company): Record<string, ActividadDomicilio[]> => Object.fromEntries((e.sucursalActividades || []).map((x) => [String(x.sucursalId), (x.actividades || []).map((a) => ({ codigo: String(a.codigo), descripcion: a.descripcion || '' }))]));

  const [actividadesPorSucursal, setActividadesPorSucursal] = useState<Record<string, ActividadDomicilio[]>>(() => mapaDeclaradas(empresa));
  /** El domicilio cuyas actividades se están editando. `null` = modal cerrado. */
  const [editandoActividades, setEditandoActividades] = useState<ArcaSucursal | null>(null);

  useEffect(() => {
    arcaSucursalesAPI
      .list()
      .then(setSucursales)
      .catch(() => setSucursales([]))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => {
    setIds(empresa.sucursalIds || []);
    setActividadesPorSucursal(mapaDeclaradas(empresa));
  }, [empresa]);

  const normalizar = (m: Record<string, ActividadDomicilio[]>) => JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v].map((a) => a.codigo).sort()])));
  const sucio = JSON.stringify([...ids].sort()) !== JSON.stringify([...(empresa.sucursalIds || [])].sort()) || normalizar(actividadesPorSucursal) !== normalizar(mapaDeclaradas(empresa));
  const elegidas = useMemo(() => sucursales.filter((s) => ids.includes(s._id)), [sucursales, ids]);
  const porDefectoId = empresa.defaultsArca?.sucursalId || '';
  const { defaults: arcaDefaultsDeLaInstalacion } = useArcaDefaults();

  /** Marca o desmarca el domicilio habitual. Se guarda solo: es un click, no un formulario. */
  const marcarPorDefecto = async (sucursalId: string) => {
    const nuevo = porDefectoId === sucursalId ? null : sucursalId;
    // Los otros defaults se mandan tal cual están: el PATCH reemplaza el subdocumento entero, y
    // omitirlos los borraría.
    await guardar({ defaultsArca: { ...(empresa.defaultsArca || {}), sucursalId: nuevo } } as any, nuevo ? `${sucursales.find((s) => s._id === nuevo)?.domicilio || 'El domicilio'} queda por defecto para ${empresa.razonSocial}.` : 'Se quitó el domicilio por defecto.');
  };

  return (
    <SeccionEmpleador>
      <div className="flex justify-end">
        <BotonGuardar
          guardando={guardando}
          sucio={sucio}
          onClick={() => {
            // Si se le saca el domicilio que era el habitual, el default se va con él: dejarlo
            // apuntando a uno que la empleadora ya no tiene declarado precarga un alta que ARCA
            // rechaza, y el error aparecería lejos de esta pantalla.
            const pierdeElDefault = !!porDefectoId && !ids.includes(porDefectoId);
            return guardar(
              {
                sucursalIds: ids,
                /*
                  El recorte por empleadora se manda ENTERO y solo de los domicilios que siguen
                  asignados: una fila para un domicilio que se acaba de quitar quedaría huérfana y
                  volvería a aplicar si alguien lo reasigna, con un recorte que nadie recuerda.
                */
                sucursalActividades: Object.entries(actividadesPorSucursal)
                  .filter(([sucursalId]) => ids.includes(sucursalId))
                  .map(([sucursalId, actividades]) => ({ sucursalId, actividades })),
                ...(pierdeElDefault ? { defaultsArca: { ...(empresa.defaultsArca || {}), sucursalId: null } } : {}),
              } as any,
              `${ids.length} domicilio(s) asignado(s) a ${empresa.razonSocial}.${pierdeElDefault ? ' Se quitó el domicilio por defecto: ya no está entre los declarados.' : ''}`,
            );
          }}
        />
      </div>

      <HerenciaGlobal
        campo="sucursalId"
        valorEmpresa={porDefectoId}
        nombreDe={(id) => {
          const s = sucursales.find((x) => x._id === id);
          return s ? `${s.codigo} — ${s.domicilio}` : '';
        }}
        /* El código de domicilio es POR CUIT: uno global puede no existir para este CUIT, y ARCA
           rechazaría el alta. La cascada del TXT lo descarta por lo mismo. */
        noAplica={(() => {
          const g = String(arcaDefaultsDeLaInstalacion.sucursalId || '');
          return g && !ids.includes(g) ? 'no está entre los domicilios declarados por este CUIT.' : undefined;
        })()}
      />

      {cargando ? <LoadingSpinner message="Cargando el padrón de domicilios..." /> : <SucursalSelector sucursales={sucursales} cargando={cargando} value={ids} onChange={setIds} />}

      {/* Nivel 2b: lo que queda disponible para los contratos de esta empleadora. */}
      {elegidas.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Actividades disponibles para sus contratos</p>
            {/* Mismo rótulo y misma explicación que la columna «Por defecto» de Convenios: es el
                mismo concepto y no puede llamarse de dos formas. */}
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              <FontAwesomeIcon icon={faStar} className="h-3 w-3" />
              Por defecto
              <FontAwesomeIcon icon={faCircleInfo} title="El domicilio habitual de esta empleadora: en el alta aparece PRIMERO en el select y marcado con ★. No obliga a usarlo — se puede elegir cualquiera de los otros declarados." className="h-3 w-3 normal-case" />
            </span>
          </div>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700/60">
            {elegidas.map((s) => (
              // El ✎ va centrado respecto de TODO el bloque —encabezado y badges—, no del renglón del
              // título: alineado arriba quedaba flotando y no se leía como la acción de la fila.
              <div key={s._id} className="px-3 py-2.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {/*
                    ★ EL DOMICILIO HABITUAL DE ESTA EMPLEADORA.

                    Es por empleadora y no global porque el código de domicilio es POR CUIT: el mismo
                    domicilio declarado por dos empresas son dos registros distintos, así que un
                    default único apuntaría a uno que la otra no tiene.

                    Marcarlo NO lo escribe en ningún contrato: en el alta se ofrece primero, con la
                    estrella, y hay que elegirlo. Un default que se autocompleta deja el formulario
                    viéndose completo con un domicilio que nadie miró — y el domicilio es el que
                    decide qué actividades acepta ARCA.
                  */}
                    <button type="button" onClick={() => marcarPorDefecto(s._id)} disabled={guardando} title={porDefectoId === s._id ? 'Es el domicilio por defecto. Click para quitarlo.' : 'Marcar como domicilio por defecto de esta empleadora'} className={`shrink-0 transition-colors disabled:opacity-50 ${porDefectoId === s._id ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 dark:text-gray-600 hover:text-amber-500'}`}>
                      <FontAwesomeIcon icon={faStar} className="h-3.5 w-3.5" />
                    </button>
                    <span className="font-mono text-xs text-blue-700 dark:text-blue-400 font-bold">{s.codigo}</span>
                    <span className="text-sm text-gray-900 dark:text-gray-100">{s.domicilio}</span>
                    {porDefectoId === s._id && <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">por defecto</span>}
                  </div>
                  {/*
                  BADGES + LÁPIZ, y la edición en un modal.

                  Estaban como filas de ancho completo, una debajo de la otra: cuatro domicilios con
                  sus actividades ocupaban la pantalla entera para mostrar cuatro códigos. Como badges
                  se ve de un vistazo qué declaró esta empleadora en cada domicilio, que es la
                  pregunta que se viene a contestar acá.

                  La ✕ del badge quita en el acto; agregar abre el modal, porque elegir del catálogo
                  necesita buscador y no entra en una fila.
                */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {(actividadesPorSucursal[s._id] || []).length === 0 ? (
                      <span className="text-xs text-amber-700 dark:text-amber-400">Sin actividades declaradas para esta empleadora: sus contratos en este domicilio no pueden generar el alta.</span>
                    ) : (
                      (actividadesPorSucursal[s._id] || []).map((a) => (
                        <span key={a.codigo} title={a.descripcion} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded text-[11px] bg-blue-50 dark:bg-blue-900/25 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          <span className="font-mono font-semibold">{a.codigo}</span>
                          {a.descripcion && <span className="truncate max-w-[16rem]">{a.descripcion}</span>}
                          <button type="button" onClick={() => setActividadesPorSucursal((prev) => ({ ...prev, [s._id]: (prev[s._id] || []).filter((x) => x.codigo !== a.codigo) }))} title={`Quitar ${a.codigo} de este domicilio`} className="ml-0.5 text-blue-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                            <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>
                {/*
                  EXACTAMENTE el ✎ de la columna «Acciones» de las tablas de catálogo: mismas clases
                  y mismo tamaño por defecto del ícono. Copiado y no aproximado — un ícono del mismo
                  gesto que se ve apenas distinto en cada pantalla hace dudar de si hace lo mismo.
                */}
                <button type="button" onClick={() => setEditandoActividades(s)} title="Editar" className="shrink-0 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300">
                  <FontAwesomeIcon icon={faEdit} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*
        EL MODAL DE ACTIVIDADES, uno por domicilio.

        Elegir del catálogo necesita buscador y una lista que respire: metido en la fila, el
        formulario ocupaba más que todo lo demás junto. Acá se abre solo cuando hace falta.

        Lo que se toca acá NO se guarda solo: queda en el formulario y se aplica con «Guardar
        cambios», igual que la asignación de domicilios. Es lo que distingue esta pantalla del
        nomenclador de Configuración, donde cada registro se guarda al instante — y mezclar los dos
        comportamientos en una misma pantalla es cómo alguien cierra un modal creyendo que guardó.
      */}
      {editandoActividades && (
        <Modal
          isOpen
          onClose={() => setEditandoActividades(null)}
          title={`Actividades en ${editandoActividades.domicilio}`}
          subtitle={`${empresa.razonSocial} · domicilio ${editandoActividades.codigo}. ARCA las declara por CUIT: esta lista es de esta empleadora.`}
          size="lg"
          footer={
            <button type="button" onClick={() => setEditandoActividades(null)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
              Listo
            </button>
          }
        >
          <ActividadesDelDomicilio actividades={actividadesPorSucursal[editandoActividades._id] || []} onChange={(actividades) => setActividadesPorSucursal((prev) => ({ ...prev, [editandoActividades._id]: actividades }))} />
          <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-400">Los cambios se aplican al apretar «Guardar cambios» en la pantalla, no al cerrar este modal.</p>
        </Modal>
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
  /** El convenio cuyo detalle se está mirando. `null` = modal cerrado. */
  const [viendoConvenio, setViendoConvenio] = useState<ConvenioDetalle | null>(null);
  const [detalles, setDetalles] = useState<ConvenioDetalle[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const catalogo = await conveniosApi.list();
        setConvenios(catalogo);
        const codigos = catalogo
          .filter((c) => (empresa.convenioIds || []).map(String).includes(c._id))
          .map((c) => String(c.externalId || '').trim())
          .filter(Boolean);
        const resueltos = await Promise.all(codigos.map((c) => arcaCategoriasAPI.detalle(c).catch(() => null)));
        setDetalles(resueltos.filter(Boolean) as ConvenioDetalle[]);
      } finally {
        setCargando(false);
      }
    })();
  }, [empresa]);

  if (cargando) return <LoadingSpinner message="Resolviendo las categorías de sus convenios..." />;

  return (
    <SeccionEmpleador>
      {(empresa.convenioIds || []).length === 0 ? (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
          <p className="text-sm text-amber-800 dark:text-amber-300">Esta empleadora no tiene convenios registrados, así que no hay ninguna categoría que se le pueda dar de alta.</p>
        </div>
      ) : (
        <>
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/60">
            {/*
            UNA FILA POR CONVENIO, Y EL DETALLE EN UN MODAL.

            Esto listaba los grupos y las 107 categorías de los cuatro convenios, una debajo de la
            otra: pantallas de chips para una pantalla que es SOLO LECTURA y que se abre para
            contestar «¿qué le puedo dar de alta a esta empleadora?». La respuesta a esa pregunta es
            el conteo; el detalle es para cuando alguien lo busca, y por eso está detrás del ojito.
          */}
            {detalles.map((d) => {
              const categorias = d.grupos.reduce((a, g) => a + g.categorias.length, 0);
              const sinEscala = d.grupos.filter((g) => !g.sueldoBruto).length;
              return (
                <div key={d.convenio} className="px-4 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400">{d.convenio}</span>
                    <span className="text-sm text-gray-600 dark:text-gray-300"> — {d.nombre || 'sin descripción'}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {d.grupos.length} grupo(s) · {categorias} categoría(s)
                      {/* Lo que BLOQUEA el alta se dice en la fila: es lo único accionable de acá. */}
                      {sinEscala > 0 && (
                        <span className="text-red-600 dark:text-red-400">
                          {' '}
                          · {sinEscala} sin escala: bloquea{sinEscala === 1 ? '' : 'n'} el alta
                        </span>
                      )}
                    </span>
                  </div>
                  <button type="button" onClick={() => setViendoConvenio(d)} title={`Ver las ${categorias} categorías de ${d.convenio}`} className="shrink-0 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300">
                    <FontAwesomeIcon icon={faEye} />
                  </button>
                  <Link to="/arca/categorias" title="Editar las escalas de este convenio" className="shrink-0 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300">
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                  </Link>
                </div>
              );
            })}
          </div>
          <div className="mt-4 space-y-4">
            {/* Un convenio registrado que no resolvió es un convenio sin categorías cargadas. */}
            {detalles.length < (empresa.convenioIds || []).length && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {(empresa.convenioIds || []).length - detalles.length} convenio(s) registrado(s) todavía no tienen categorías cargadas: sus altas no van a poder generarse.
                {convenios.length === 0 ? '' : ' Cargalas desde Configuración → ARCA → Convenios.'}
              </p>
            )}
          </div>
        </>
      )}

      {/*
        EL DETALLE, cuando alguien lo pide. Solo lectura: acá no se configura nada — la escala es del
        CCT y se edita en el nomenclador, no por empresa.
      */}
      {viendoConvenio && (
        <Modal isOpen onClose={() => setViendoConvenio(null)} title={`${viendoConvenio.convenio} — ${viendoConvenio.nombre || 'sin descripción'}`} subtitle={`${viendoConvenio.grupos.length} grupo(s) · ${viendoConvenio.grupos.reduce((a, g) => a + g.categorias.length, 0)} categoría(s) que se le pueden dar de alta a ${empresa.razonSocial}`} size="lg">
          <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {viendoConvenio.grupos.map((g) => (
              <div key={g._id} className="py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center justify-center h-6 w-9 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] font-bold">G{g.numero}</span>
                  {g.nombre && <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{g.nombre}</span>}
                  <span className={`text-xs font-semibold ${g.sueldoBruto ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{g.sueldoBruto ? `Bruto ${g.sueldoBruto.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}` : 'Sin escala: bloquea el alta'}</span>
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
        </Modal>
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
/**
 * GRUPOS DE TIPO DE SERVICIO, DENTRO DE LA EMPLEADORA.
 *
 * El catálogo es global y tiene DOS filas —CONTINUOS y DISCONTINUOS—, iguales para todo el mundo: no
 * hay nada que registrar por empresa. Lo que sí es de cada empleadora es CUÁL usa habitualmente, y
 * eso vivía escondido en un `<select>` de la pantalla de Defaults.
 *
 * Acá se marca con ★, igual que el convenio y el domicilio habituales. La razón de tener las tres
 * decisiones con el mismo gesto no es estética: son la misma clase de decisión —«de todo lo posible,
 * esto es lo que esta empleadora usa casi siempre»— y aprender un gesto distinto para cada una es lo
 * que hace que ninguna se use.
 *
 * NO ES UN CANDADO. En el alta el grupo marcado aparece primero; el otro se sigue pudiendo elegir.
 */
export const EmpresaGruposTipoServicioPage: React.FC = () => (
  <EmpresaContextLayout titulo="Grupos de Tipo de Servicio" icono={faLayerGroup} ayuda="empresaGruposTipoServicio">
    {(empresa, recargar) => <GruposTipoServicioBody empresa={empresa} recargar={recargar} />}
  </EmpresaContextLayout>
);

const GruposTipoServicioBody: React.FC<{ empresa: Company; recargar: () => Promise<void> }> = ({ empresa, recargar }) => {
  const { guardar, guardando } = useGuardarEmpresa(empresa, recargar);
  const [grupos, setGrupos] = useState<SimpleCatalogItem[]>([]);
  const [tipos, setTipos] = useState<SimpleCatalogItem[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([gruposTipoServicioApi.list().catch(() => []), tiposServicioApi.list().catch(() => [])])
      .then(([g, t]) => {
        setGrupos(g);
        setTipos(t);
      })
      .finally(() => setCargando(false));
  }, []);

  const porDefecto = empresa.defaultsArca?.grupoTipoServicio || '';
  const nombreDeGrupo = (codigo: string): string => {
    const g = grupos.find((x) => String(x.externalId || '') === codigo);
    return g ? `${g.externalId} — ${g.name}` : '';
  };

  /**
   * Marca o desmarca el grupo habitual. Se guarda con el click, como las otras ★.
   *
   * CAMBIAR DE GRUPO LIMPIA EL TIPO DE SERVICIO POR DEFECTO si ya no pertenece. Dejarlo puesto
   * guardaría una combinación imposible —grupo CONTINUOS con un tipo discontinuo— que además se ve
   * bien en pantalla, porque el select muestra el código aunque no esté entre sus opciones. El server
   * la rechaza con 422, pero llegar hasta ahí para enterarse es peor que no ofrecerla.
   */
  const marcarPorDefecto = async (codigo: string) => {
    const nuevo = porDefecto === codigo ? '' : codigo;
    const tipoActual = empresa.defaultsArca?.tipoServicio || '';
    const pierdeElTipo = !!tipoActual && !!nuevo && grupoDelCodigo(tipoActual) !== nuevo;
    const nombre = grupos.find((g) => String(g.externalId) === nuevo)?.name || 'El grupo';
    await guardar({ defaultsArca: { ...(empresa.defaultsArca || {}), grupoTipoServicio: nuevo, ...(pierdeElTipo ? { tipoServicio: '' } : {}) } } as any, nuevo ? `${nombre} queda por defecto para ${empresa.razonSocial}.${pierdeElTipo ? ' Se limpió el tipo de servicio por defecto: era del otro grupo.' : ''}` : 'Se quitó el grupo por defecto.');
  };

  return (
    <SeccionEmpleador>
      {/* El grupo también tiene el escalón de la instalación debajo. */}
      <HerenciaGlobal campo="grupoTipoServicio" valorEmpresa={porDefecto} nombreDe={nombreDeGrupo} />
      {cargando ? (
        <LoadingSpinner message="Cargando grupos..." />
      ) : (
        <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Grupo</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Código</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipos de servicio</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    Por defecto
                    <button type="button" title="El grupo marcado aparece primero al cargar un contrato y deja preseleccionado el filtro de Tipo de Servicio. Se puede elegir el otro igual: es una sugerencia, no un candado." className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 normal-case tracking-normal font-normal">
                      <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                    </button>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {grupos.map((g) => {
                const codigo = String(g.externalId || '');
                const cuantos = tipos.filter((t) => grupoDelItem(t) === codigo).length;
                const esDefecto = porDefecto === codigo;
                return (
                  <tr key={g._id} className={`transition-colors ${esDefecto ? 'bg-amber-50/60 dark:bg-amber-950/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{g.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">{codigo || '—'}</span>
                    </td>
                    {/* Cuántos tipos cuelgan de cada grupo: es lo que hace entendible por qué el
                        filtro importa — sin él, el combo del alta son 293 opciones. */}
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{cuantos > 0 ? `${cuantos} de ${tipos.length}` : 'sin clasificar'}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => marcarPorDefecto(codigo)} disabled={guardando || !codigo} title={esDefecto ? 'Es el grupo por defecto. Click para quitarlo.' : `Marcar ${g.name} como grupo por defecto de esta empleadora`} className={`transition-colors disabled:opacity-50 ${esDefecto ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 dark:text-gray-600 hover:text-amber-500'}`}>
                        <FontAwesomeIcon icon={faStar} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SeccionEmpleador>
  );
};

// ──────────────────────────────────── Defaults por ítem: los códigos del TXT

/**
 * TIPO DE SERVICIO, MODALIDAD DE CONTRATACIÓN Y MODALIDAD DE LIQUIDACIÓN DE ESTA EMPLEADORA.
 *
 * Antes eran tres combos de una sola pantalla, «Defaults de ARCA». Ahora se marcan con ★ sobre el
 * nomenclador, que es donde está el dato y donde ya se marcan el convenio, el domicilio y el grupo.
 * El motivo está en `components/empresa/DefaultArcaEmpresa.tsx`.
 *
 * Los tres viajan al archivo de altas y los tres tienen un escalón debajo —el default de la
 * instalación—, así que cada pantalla dice qué hay ahí y si esta empleadora lo está pisando.
 */
export const EmpresaTiposServicioPage: React.FC = () => (
  <EmpresaContextLayout titulo="Tipos de Servicio" icono={faListCheck} ayuda="empresaDefaults">
    {(empresa, recargar) => (
      <DefaultArcaEmpresa
        empresa={empresa}
        recargar={recargar}
        campo="tipoServicio"
        api={tiposServicioApi}
        queEs="el tipo de servicio"
        nota="Posiciones 107-109 del TXT de alta."
        filtrarPorGrupoDeLaEmpresa
      />
    )}
  </EmpresaContextLayout>
);

export const EmpresaModalidadContratacionPage: React.FC = () => (
  <EmpresaContextLayout titulo="Modalidad de Contratación" icono={faFileContract} ayuda="empresaDefaults">
    {(empresa, recargar) => <DefaultArcaEmpresa empresa={empresa} recargar={recargar} campo="modalidadContratacion" api={modalidadesContratacionApi} queEs="la modalidad de contratación" nota="Posiciones 17-19 del TXT de alta." />}
  </EmpresaContextLayout>
);

export const EmpresaModalidadLiquidacionPage: React.FC = () => (
  <EmpresaContextLayout titulo="Modalidad de Liquidación" icono={faSliders} ayuda="empresaDefaults">
    {(empresa, recargar) => <DefaultArcaEmpresa empresa={empresa} recargar={recargar} campo="modalidadLiquidacion" api={modalidadesLiqApi} queEs="la modalidad de liquidación" nota="Posición 73 del TXT de alta." />}
  </EmpresaContextLayout>
);
