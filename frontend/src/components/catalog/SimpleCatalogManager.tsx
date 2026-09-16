import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faDownload, faUpload, faPlus, faEdit, faTrash, faTimes, faFileExcel, faTriangleExclamation, faFilter, faCheck, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
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
  /**
   * `ref` es un select BUSCABLE sobre otro catálogo (ej. Convenios → Sindicato).
   *
   * Va aparte de `select` porque el `<select>` nativo no se puede buscar, y con 180 opciones
   * encontrar una es scrollear a ojo. Se persiste el `_id`, y VACÍO SE MANDA COMO CADENA VACÍA:
   * el server la traduce a `null` (desvincular), que es distinto de no mandar la clave (no tocar).
   */
  /*
    `estado` es un sí/no (ej. Bancos → `activo`): interruptor en la tabla, que se guarda al tocarlo, y
    en el formulario. AUSENTE CUENTA COMO SÍ, así los registros cargados antes de que existiera el
    campo no se apagan solos. `options` pone los rótulos: `[{value:'true'}, {value:'false'}]`.
  */
  type?: 'text' | 'select' | 'ref' | 'estado';
  /** Opciones para type "select" y "ref". El value es lo que se persiste; el label lo que se muestra. */
  /**
   * `oculta`: la opción existe —la columna y el filtro la muestran con su nombre— pero el formulario
   * no la ofrece, salvo en el registro que ya la tiene puesta (ej. un tipo de entidad inactivo).
   */
  options?: Array<{ value: string; label: string; oculta?: boolean }>;
  /** Solo `ref`: texto de ayuda del buscador. */
  searchPlaceholder?: string;
  required?: boolean;
  /** Si se muestra como columna en la vista de tabla. */
  showColumn?: boolean;
  /** Encabezado de la columna (por defecto usa `label`). */
  columnLabel?: string;
  placeholder?: string;
  /** Aparece en el modal de «Filtrar» (sólo `select` y `estado`, que tienen opciones cerradas). */
  filtrable?: boolean;
  /**
   * Con qué valor cuenta un registro que no tiene el campo cargado, al FILTRAR. Ej. Bancos: una
   * entidad sin tipo se ofrece como banco en todos los selectores, así que filtrar por «Banco» la trae.
   */
  valorPorDefecto?: string;
  /** Texto de ayuda debajo del campo, en el formulario. */
  ayuda?: string;
  /**
   * El campo es un NÚMERO: el input descarta todo lo que no sea un dígito.
   *
   * Opt-in, como `externalIdNumerico` y por lo mismo: el id de FRAME de un centro de costo se guarda
   * y se compara como número contra el `centroCostoId` del proyecto, y un «22 » o un «O22» se guarda
   * sin chistar y después no matchea con nada. El síntoma aparece lejos del error.
   */
  soloNumeros?: boolean;
  /**
   * Qué decir cuando el valor de un registro es una opción `oculta` (ej. una entidad cuyo TIPO está
   * inactivo). La fila puede figurar como activa y aun así no ofrecerse en ningún lado, y eso no se
   * adivina mirando la tabla: se marca con un «i» amarillo que abre esta explicación.
   * `pestana` agrega un botón para ir a la pestaña donde se resuelve.
   */
  avisoOculta?: { titulo: string; texto: (etiqueta: string) => string; pestana?: { id: string; label: string } };
}

interface SimpleCatalogManagerProps {
  title: string;
  subtitle?: React.ReactNode;
  /** Badge del encabezado, junto al título y al contador. Lo usa el ámbito de los nomencladores. */
  badge?: { text: string; variant?: 'default' | 'success' | 'warning' | 'blue' | 'info'; tooltip?: string };
  icon: IconDefinition;
  /** Etiqueta singular, ej. "banco", "obra social". */
  entityLabel: string;
  api: SimpleCatalogApi;
  /** Nombre base para el archivo descargado, ej. "bancos". */
  templateBaseName: string;
  /** Campos extra propios del catálogo (ej. Bancos → "Tipo de Entidad"). */
  extraFields?: CatalogExtraField[];
  /** Texto con el que arranca el buscador, para poder linkear a este catálogo ya filtrado. */
  busquedaInicial?: string;
  /**
   * Un filtro que resuelve el SERVIDOR, al lado del buscador.
   *
   * Distinto del buscador y de `filtroDestacado`, que trabajan sobre lo ya cargado: acá cada cambio
   * vuelve a pedir la lista con el parámetro puesto. Es lo que corresponde cuando el subconjunto no
   * se puede sacar de lo que hay en memoria —o cuando lo que hay en memoria es todo el catálogo y
   * traer menos es justamente el punto—.
   *
   * `clienteOnly` marca las opciones que el server NO sabe resolver: se piden sin filtro y se
   * recortan acá. Existe para "Con sindicato", que necesitaría `$ne: null` y el filtro del server es
   * por igualdad. Es un recorrido por cambio de opción, no por tecla.
   */
  filtroServidor?: {
    /**
     * Nombre del query param, ej. "sindicatoId". Opcional: un filtro cuyas opciones son TODAS
     * `clienteOnly` no tiene nada que mandarle al server, y obligarlo a inventar un nombre haría
     * creer que hay una consulta detrás.
     */
    param?: string;
    /** Texto de la opción vacía (sin filtro). */
    etiquetaTodos: string;
    opciones: Array<{ value: string; label: string; clienteOnly?: (item: SimpleCatalogItem) => boolean }>;
    /** Valor elegido desde afuera, para poder abrir la pantalla ya filtrada por un link. */
    valorInicial?: string;
  };
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
  columnasCalculadas?: Array<{
    label: string;
    /** Qué dibujar en el encabezado, si hace falta más que el texto de `label` (ej.: un «Limpiar»). */
    encabezado?: React.ReactNode;
    render: (item: SimpleCatalogItem) => React.ReactNode;
  }>;
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
    /**
     * Si la pantalla abre ya acotada. Default `true`.
     *
     * En Convenios sí: el universo de 2.669 es referencia y lo que se trabaja son los pocos que
     * alguna empresa registró. En un catálogo que se ADMINISTRA es al revés — abrir Sindicatos
     * mostrando 2 de 180 se lee como que se perdieron 178, y el filtro pasa a ser algo de lo que hay
     * que salir antes de poder trabajar.
     */
    arrancaAcotado?: boolean;
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
  /**
   * Cómo se llama el campo obligatorio en ESTE catálogo. Default "Nombre".
   *
   * En Centros de Costos es el «Código» (el número real del centro, el de FRAME): pedir «Nombre» en
   * una pantalla cuya columna dice «Código» hace dudar de si son el mismo campo.
   */
  nombreLabel?: string;
  /** Clave de ayuda para el modal de info (i). */
  helpKey?: HelpKey;
  /**
   * ¿Este catálogo EXPONE su `externalId`? Default `true`.
   *
   * En `false` desaparece de la pantalla —columna, tarjeta y campo del formulario— y deja de viajar
   * en los payloads de alta y edición. El campo sigue existiendo en el modelo y el backend lo sigue
   * aceptando: lo que cambia es que esta pantalla no lo pide ni lo muestra.
   *
   * Existe para los catálogos que NO vienen de FRAME ni de un nomenclador de ARCA, donde ese id no
   * tiene ningún significado y aparecía como una columna vacía que hay que explicar (Sindicatos es
   * el primero: se carga a mano, no lo identifica ningún organismo).
   */
  showExternalId?: boolean;
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
   * El ID externo de este catálogo es un NÚMERO: el campo acepta solo dígitos.
   *
   * OPT-IN Y NO GLOBAL, porque no todos lo son. El RNOS de las obras sociales se escribe con guiones
   * de presentación y los códigos de ARCA —tipo de servicio, modalidad— son cadenas de tres dígitos
   * donde el cero de la izquierda es parte del código: forzarlos a número los rompería.
   *
   * Donde sí aplica, dejar entrar texto no es inofensivo: `data.id` se guarda como Number y se compara
   * como Number contra el `centroCostoId` del proyecto. Un «22 » o un «O22» se guarda sin chistar y
   * después no matchea con nada, y el síntoma aparece lejos —una columna que muestra «ID: 22» en vez
   * del nombre— sin ninguna pista de que el problema fue un carácter de más al cargarlo.
   */
  externalIdNumerico?: boolean;
  /**
   * Pestañas extra junto al listado (ej. "Por defecto" en Obras Sociales). El catálogo es siempre
   * la primera. Al pararse en otra se ocultan el buscador y las acciones de ABM: pertenecen al
   * listado, no a la configuración.
   */
  pestanas?: Array<{ id: string; label: string; icon?: IconDefinition; render: (items: SimpleCatalogItem[], recargar: () => Promise<void>) => React.ReactNode }>;
}

/**
 * Selector buscable de una referencia, para `type: 'ref'`.
 *
 * Un combo y no un modal: el formulario ya vive adentro de uno, y anidar ventanas para elegir un
 * valor de una lista es más ceremonia de la que el campo merece.
 *
 * VACÍO ES UN VALOR, no la ausencia de uno: limpiar deja `''`, que el manager manda igual y el
 * server traduce a `null`. Si en vez de eso se omitiera la clave, desvincular sería imposible —el
 * server dejaría el valor anterior— y limpiar el campo se vería como que no pasó nada.
 */
const RefField: React.FC<{ campo: CatalogExtraField; valor: string; onChange: (v: string) => void }> = ({ campo, valor, onChange }) => {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const opciones = campo.options || [];
  const elegida = opciones.find((o) => o.value === valor);
  // `fuzzyMatch` sobre el label, que ya trae sigla y nombre juntos: así "SATSAID" y "televisión"
  // encuentran el mismo registro sin pedirle al que busca que sepa cuál de los dos está cargado.
  const filtradas = busqueda.trim() ? opciones.filter((o) => fuzzyMatch(o.label, busqueda)) : opciones;

  if (elegida && !abierto) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white truncate" title={elegida.label}>
          {elegida.label}
        </span>
        <button type="button" onClick={() => { setBusqueda(''); setAbierto(true); }} className="px-2 py-2 text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0">
          Cambiar
        </button>
        {/* Limpiar manda `''`, que el server convierte en `null`. Es la única forma de desvincular. */}
        <button type="button" onClick={() => onChange('')} title="Quitar" className="px-2 py-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 shrink-0">
          <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        type="text"
        autoFocus={abierto}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder={campo.searchPlaceholder || 'Buscar...'}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
      />
      <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
        {filtradas.slice(0, 50).map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => { onChange(o.value); setAbierto(false); setBusqueda(''); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            {o.label}
          </button>
        ))}
        {filtradas.length === 0 && <div className="px-3 py-4 text-center text-xs text-gray-500 italic">Sin resultados</div>}
        {/* El corte se dice: una lista que se queda en 50 sin avisar parece que no tiene el resto. */}
        {filtradas.length > 50 && <div className="px-3 py-2 text-center text-[11px] text-gray-400">y {filtradas.length - 50} más — afiná la búsqueda</div>}
      </div>
    </div>
  );
};

export const SimpleCatalogManager: React.FC<SimpleCatalogManagerProps> = ({ title, subtitle, badge, icon, entityLabel, api, templateBaseName, extraFields = [], busquedaInicial, filtroServidor, extraSeccion, nombreLabel = 'Nombre', helpKey, showExternalId = true, externalIdLabel = 'ID Externo', externalIdPlaceholder = 'ID de FRAME', formatExternalId, sanitizeExternalId, externalIdNumerico, pestanas, columnasCalculadas = [], filtroDestacado, tablaPropia, extraSuperior, resumen }) => {
  const [items, setItems] = useState<SimpleCatalogItem[]>([]);
  const [filtroServidorValor, setFiltroServidorValor] = useState(filtroServidor?.valorInicial || '');
  const [tabActiva, setTabActiva] = useState<string>('catalogo');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(busquedaInicial || '');
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
  const defaultExtra = (f: CatalogExtraField): string => (f.type === 'estado' ? 'true' : f.type === 'select' && f.options && f.options.length > 0 ? (f.options.find((o) => !o.oculta) || f.options[0]).value : '');
  /** El valor de formulario de un campo del registro. Para `ref` es el id, venga poblado o pelado. */
  const idDeRef = (f: CatalogExtraField, valor: unknown): string => {
    if (f.type === 'estado') return valor === false ? 'false' : 'true';
    if (valor == null) return defaultExtra(f);
    if (f.type === 'ref') return typeof valor === 'object' ? String((valor as { _id?: unknown })._id ?? '') : String(valor);
    return String(valor);
  };
  // Etiqueta legible de un valor guardado (mapea value → label en selects).
  const extraDisplay = (f: CatalogExtraField, value: unknown): string => {
    if (f.type === 'estado') {
      const clave = value === false ? 'false' : 'true';
      return f.options?.find((o) => o.value === clave)?.label ?? (clave === 'true' ? 'Activo' : 'Inactivo');
    }
    const v = value == null ? '' : String(value);
    if (!v) return '—';
    if (f.type === 'select' || f.type === 'ref') return f.options?.find((o) => o.value === v)?.label ?? v;
    return v;
  };

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // Filtros por campo (modal «Filtrar»): por cada campo, los valores marcados. Vacío = sin filtro.
  const [filtrosCampo, setFiltrosCampo] = useState<Record<string, string[]>>({});
  const [showFiltros, setShowFiltros] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState<string | null>(null);
  // El aviso de «opción inactiva» abierto (ver `avisoOculta`).
  const [avisoAbierto, setAvisoAbierto] = useState<{ campo: CatalogExtraField; etiqueta: string } | null>(null);

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

  const load = async (valorFiltro = filtroServidorValor) => {
    setLoading(true);
    try {
      // La opción marcada `clienteOnly` no viaja: el server no la sabe resolver, así que se pide todo
      // y se recorta abajo, en `base`.
      const opcion = filtroServidor?.opciones.find((o) => o.value === valorFiltro);
      const params = filtroServidor?.param && valorFiltro && !opcion?.clienteOnly ? { [filtroServidor.param]: valorFiltro } : undefined;
      const data = await api.list(params);
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

  // Arranca acotado salvo que el catálogo diga lo contrario (ver `arrancaAcotado`).
  const [soloDestacados, setSoloDestacados] = useState(filtroDestacado?.arrancaAcotado !== false);
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
    // Con la columna oculta el id sale del buscador: si no está en pantalla, un registro que aparece
    // por coincidir con él se lee como un resultado sin causa —el problema inverso al que este
    // buscador vino a resolver—.
    const id = showExternalId ? String(it.externalId || '') : '';
    const partes = [it.name || '', id, id.replace(/[^a-zA-Z0-9]/g, ''), formatExternalId && id ? formatExternalId(id) : ''];
    // Los campos extra son columnas de la tabla en varios catálogos (el signatario del convenio, el
    // tipo de entidad de un banco). Se toman los de texto: un select guarda un id que nadie tipea.
    for (const f of extraFields) {
      if (f.type === 'select' || f.type === 'estado') continue;
      const v = (it as Record<string, unknown>)[f.key];
      /*
        Una `ref` guarda un id que nadie tipea, pero SÍ se busca por lo que la columna muestra: en
        Convenios, escribir «SATSAID» tiene que traer los convenios de ese gremio. Se resuelve el id
        —venga poblado o pelado— contra las opciones del campo, que es de donde sale la etiqueta.
      */
      if (f.type === 'ref') {
        const id = v && typeof v === 'object' ? String((v as { _id?: unknown })._id ?? '') : v ? String(v) : '';
        const etiqueta = id ? f.options?.find((o) => o.value === id)?.label : undefined;
        if (etiqueta) partes.push(etiqueta);
        continue;
      }
      if (typeof v === 'string' || typeof v === 'number') partes.push(String(v));
    }
    return partes.filter(Boolean).join(' ');
  };

  /*
    LA BÚSQUEDA SE APLICA PRIMERO, y de ahí salen los recuentos de los botones.

    Antes contaban sobre el catálogo entero mientras la tabla mostraba el cruce de búsqueda y filtro,
    así que con algo escrito en el buscador los números no correspondían a nada de lo que se veía: el
    botón decía «(2)» sobre una tabla de 1 fila, y pasar a «Ver todos (180)» no cambiaba ninguna fila
    porque la búsqueda seguía mandando. El filtro parecía inerte.

    Contando sobre lo buscado, el número de cada botón es exactamente lo que aparece al tocarlo.

    VA DESPUÉS de `textoBuscable` y no antes: `coincideBusqueda` lo invoca, y `buscados` corre en la
    línea siguiente. Declarado más arriba, ese `const` todavía está en su zona muerta temporal y la
    pantalla muere con "Cannot access 'textoBuscable' before initialization". No lo ve `tsc`: la
    referencia vive dentro de una closure y el compilador no sigue cuándo se la llama.
  */
  const coincideBusqueda = (it: SimpleCatalogItem) => !search.trim() || fuzzyMatch(textoBuscable(it), search);

  /*
    FILTROS DEL MODAL «FILTRAR»: se suman a la búsqueda, antes que todo lo demás, por la misma razón
    que la búsqueda (ver arriba): los recuentos de abajo tienen que corresponder a lo que se ve.

    Dentro de un campo, los valores marcados se suman (Banco O Billetera); entre campos, se cruzan
    (Banco Y Activa). `excepto` deja afuera el propio campo al contar sus opciones: si no, con «Banco»
    marcado, «Billetera» diría 0 y parecería que no hay ninguna.
  */
  const camposFiltrables = extraFields.filter((f) => f.filtrable && (f.type === 'select' || f.type === 'estado') && (f.options?.length || 0) > 0);
  const valorFiltrable = (f: CatalogExtraField, it: SimpleCatalogItem): string => {
    const v = (it as Record<string, unknown>)[f.key];
    if (f.type === 'estado') return v === false ? 'false' : 'true';
    return v == null || v === '' ? f.valorPorDefecto ?? '' : String(v);
  };
  const coincideFiltros = (it: SimpleCatalogItem, excepto?: string) => camposFiltrables.every((f) => f.key === excepto || !filtrosCampo[f.key]?.length || filtrosCampo[f.key].includes(valorFiltrable(f, it)));
  const cantidadFiltros = Object.values(filtrosCampo).reduce((n, vs) => n + vs.length, 0);
  const alternarFiltro = (key: string, valor: string) =>
    setFiltrosCampo((prev) => {
      const actuales = prev[key] || [];
      return { ...prev, [key]: actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor] };
    });

  const buscadosSinFiltros = items.filter(coincideBusqueda);
  const buscados = cantidadFiltros ? buscadosSinFiltros.filter((it) => coincideFiltros(it)) : buscadosSinFiltros;
  const destacados = filtroDestacado ? buscados.filter(filtroDestacado.aplica) : buscados;
  const recorteCliente = filtroServidor?.opciones.find((o) => o.value === filtroServidorValor)?.clienteOnly;
  const itemsFiltrados = recorteCliente ? buscados.filter(recorteCliente) : buscados;
  const base = filtroDestacado && soloDestacados ? destacados : itemsFiltrados;

  // `base` ya viene con la búsqueda aplicada (ver `buscados`): volver a filtrar acá sería hacer dos
  // veces el mismo recorrido sobre los 2.669 de Convenios, en cada tecla.
  const filtered = base;

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
  }, [search, soloDestacados, tabActiva, filtrosCampo]);
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
    /*
      Una `ref` poblada llega como `{_id, name, sigla}`, no como un id: `String(objeto)` daría
      "[object Object]", que después se mandaría como sindicatoId y el server lo rechazaría por id
      inválido. Se extrae el `_id`; si vino sin popular (un id pelado), se usa tal cual.
    */
    setExtraValues(Object.fromEntries(extraFields.map((f) => [f.key, idDeRef(f, item[f.key])])));
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
    /*
      Con el campo oculto el id NO viaja, y la diferencia importa al EDITAR: mandarlo como `''`
      —que es lo que tendría el input que nunca se dibujó— le borraría al registro el `externalId`
      que ya tuviera guardado. Omitir la clave deja el valor intacto del lado del servidor.
    */
    const externalIdPayload = showExternalId ? { externalId: sanitizeExternalId ? sanitizeExternalId(externalId.trim()) : externalId.trim() } : {};
    setSaving(true);
    try {
      if (editing) {
        await api.update(editing._id, { nombre: nombre.trim(), ...externalIdPayload, ...extraPayload });
        sweetAlert.success('Actualizado', `${title} actualizado correctamente.`);
      } else {
        await api.create({ nombre: nombre.trim(), ...externalIdPayload, ...extraPayload });
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

  /**
   * Activar / desactivar desde la tabla, sin abrir el formulario: es un cambio de un toque y se hace
   * de a muchos (apagar todas las billeteras que no se usan). Se ve al instante y, si falla, vuelve.
   */
  const cambiarEstado = async (item: SimpleCatalogItem, f: CatalogExtraField) => {
    const nuevo = item[f.key] === false;
    const poner = (valor: boolean) => setItems((prev) => prev.map((x) => (x._id === item._id ? { ...x, [f.key]: valor } : x)));
    setCambiandoEstado(item._id);
    poner(nuevo);
    try {
      await api.update(item._id, { [f.key]: nuevo });
    } catch {
      poner(!nuevo);
      sweetAlert.error('Error', 'No se pudo cambiar el estado.');
    } finally {
      setCambiandoEstado(null);
    }
  };

  const interruptorEstado = (f: CatalogExtraField, item: SimpleCatalogItem) => {
    const activo = item[f.key] !== false;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void cambiarEstado(item, f);
        }}
        disabled={cambiandoEstado === item._id}
        title={activo ? 'Desactivar: deja de ofrecerse en los selectores' : 'Activar: vuelve a ofrecerse en los selectores'}
        className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${activo ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50' : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
      >
        <span className={`relative inline-flex h-3.5 w-6 shrink-0 rounded-full transition-colors ${activo ? 'bg-emerald-500' : 'bg-gray-400'}`}>
          <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${activo ? 'left-3' : 'left-0.5'}`} />
        </span>
        {extraDisplay(f, item[f.key])}
      </button>
    );
  };

  /** Un registro con algún campo `estado` apagado: se atenúa su nombre para que se distinga de un vistazo. */
  /**
   * La opción `oculta` que tiene puesta este registro en un campo con `avisoOculta`, si la hay. Sin valor
   * cargado cuenta `valorPorDefecto`: una entidad sin tipo se ofrece como banco, así que si «Banco» se
   * apaga, también a ella le corresponde el aviso.
   */
  const opcionOcultaDe = (f: CatalogExtraField, item: SimpleCatalogItem) => {
    if (f.type !== 'select' || !f.avisoOculta) return null;
    const v = item[f.key];
    const valor = v == null || v === '' ? f.valorPorDefecto ?? '' : String(v);
    const opcion = f.options?.find((o) => o.value === valor);
    return opcion?.oculta ? opcion : null;
  };

  /** Una celda de campo extra: su valor y, si es una opción inactiva, el «i» amarillo que lo explica. */
  const celdaExtra = (f: CatalogExtraField, item: SimpleCatalogItem) => {
    const texto = extraDisplay(f, item[f.key]);
    const oculta = opcionOcultaDe(f, item);
    if (!oculta) return texto;
    return (
      <span className="inline-flex items-center gap-1.5">
        {texto === '—' ? oculta.label : texto}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAvisoAbierto({ campo: f, etiqueta: oculta.label });
          }}
          title={`«${oculta.label}» está inactivo: no se ofrece. Tocá para ver qué significa.`}
          aria-label={`${oculta.label} inactivo: ver qué significa`}
          className="text-amber-500 transition-colors hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
        >
          <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  };

  const estaInactivo = (item: SimpleCatalogItem) => extraFields.some((f) => (f.type === 'estado' && item[f.key] === false) || !!opcionOcultaDe(f, item));

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
      badge={badge}
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
        <div className="flex w-full max-w-md items-center gap-2">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar ${entityLabel}...`} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
          {camposFiltrables.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFiltros(true)}
              className={`inline-flex shrink-0 items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${cantidadFiltros ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <FontAwesomeIcon icon={faFilter} className="h-3.5 w-3.5" />
              Filtrar{cantidadFiltros ? ` (${cantidadFiltros})` : ''}
            </button>
          )}
        </div>
        {filtroServidor && (
          <select
            value={filtroServidorValor}
            onChange={(e) => {
              setFiltroServidorValor(e.target.value);
              // Se le pasa el valor nuevo: `load` leería el del estado, que en este tick todavía es
              // el viejo, y la lista quedaría un cambio atrás.
              void load(e.target.value);
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          >
            <option value="">{filtroServidor.etiquetaTodos}</option>
            {filtroServidor.opciones.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-3 shrink-0">
          {/* Dos estados, no un checkbox suelto: el contador de cada uno dice cuánto es "el universo"
              y cuánto "lo que se usa", que es la diferencia que hace útil el filtro. */}
          {filtroDestacado && (
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-xs font-semibold">
              <button type="button" onClick={() => setSoloDestacados(true)} className={`px-3 py-2 transition-colors ${soloDestacados ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                {filtroDestacado.etiqueta} ({destacados.length})
              </button>
              <button type="button" onClick={() => setSoloDestacados(false)} className={`px-3 py-2 border-l border-gray-300 dark:border-gray-600 transition-colors ${!soloDestacados ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                Ver todos ({buscados.length})
              </button>
            </div>
          )}
          {isLarge && <ViewToggle value={viewMode} onChange={setViewMode} />}
        </div>
      </div>

      {/* Qué se está filtrando, escrito y con su X: sin esto, «Filtrar (2)» avisa que hay filtros pero no cuáles. */}
      {cantidadFiltros > 0 && (
        <div className="mb-4 -mt-1 flex flex-wrap items-center gap-2">
          {camposFiltrables.flatMap((f) =>
            (filtrosCampo[f.key] || []).map((v) => (
              <span key={`${f.key}-${v}`} className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 py-1 pl-3 pr-1 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                {f.columnLabel || f.label}: {f.options?.find((o) => o.value === v)?.label ?? v}
                <button type="button" onClick={() => alternarFiltro(f.key, v)} aria-label="Quitar filtro" className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40">
                  <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
                </button>
              </span>
            )),
          )}
          {cantidadFiltros > 1 && (
            <button type="button" onClick={() => setFiltrosCampo({})} className="text-xs font-semibold text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400">
              Quitar todos
            </button>
          )}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-6 flex items-start gap-3">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{loadError}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">No es que el catálogo esté vacío: la consulta no llegó a responder. Si el problema sigue, revisá que el servidor esté levantado.</p>
            <button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-400 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
              Reintentar
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">{items.length === 0 ? `Todavía no hay registros de ${entityLabel}. Cargá uno con "Nuevo" o importá un Excel.` : cantidadFiltros ? 'No hay resultados con estos filtros.' : 'No hay resultados para la búsqueda.'}</div>
      ) : effectiveViewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
          {visibles.map((item) => (
            <Card
              key={item._id}
              onClick={() => openEdit(item)}
              className="cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200"
              header={{
                title: item.name,
                // Los nombres de catálogo son largos y se parecen entre sí: ver `titleLines` en Card.
                titleLines: 2 as const,
                icon,
                badges: [...extraFields.filter((f) => f.showColumn && (f.type === 'estado' || item[f.key])).map((f) => ({ text: `${extraDisplay(f, item[f.key])}${opcionOcultaDe(f, item) ? ' (inactivo)' : ''}`, variant: 'cyan' as const })), ...(showExternalId && item.externalId ? [{ text: `${externalIdLabel} ${formatExternalId ? formatExternalId(item.externalId) : item.externalId}`, variant: 'blue' as const }] : [])],
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
                {/* `w-px` + `whitespace-nowrap`: la columna se encoge a lo que mide el código y no
                    lo parte. Un RNOS cortado en dos renglones ("9-0500-" / "8") deja de leerse como
                    un código y no se puede cotejar de un vistazo contra un padrón de ARCA. */}
                {showExternalId && <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">{externalIdLabel}</th>}
                {/*
                  ÚLTIMAS ANTES DE ACCIONES, en todas las pantallas.

                  Estaban antes del código, así que la ★ caía en un lugar distinto según qué columnas
                  tuviera cada catálogo: segunda en Actividades, primera en otros. Es un control que
                  se busca con el ojo recorriendo siempre el mismo borde de la tabla, y para eso tiene
                  que estar en la misma posición en todas.
                */}
                {columnasCalculadas.map((c) => (
                  <th key={c.label} className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {c.encabezado ?? c.label}
                  </th>
                ))}
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {visibles.map((item) => (
                <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                  <td className={`px-5 py-3 text-sm font-medium ${estaInactivo(item) ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>{item.name}</td>
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
                        {f.type === 'estado' ? interruptorEstado(f, item) : celdaExtra(f, item)}
                      </td>
                    ))}
                  {showExternalId && <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap w-px">{item.externalId ? (formatExternalId ? formatExternalId(item.externalId) : item.externalId) : '—'}</td>}
                  {columnasCalculadas.map((c) => (
                    <td key={c.label} className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {c.render(item)}
                    </td>
                  ))}
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{nombreLabel} *</label>
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
                      {(f.options || [])
                        .filter((o) => !o.oculta || o.value === extraValues[f.key])
                        .map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                            {o.oculta ? ' (inactivo)' : ''}
                          </option>
                        ))}
                    </select>
                  ) : f.type === 'estado' ? (
                    <button type="button" onClick={() => setExtraValues((prev) => ({ ...prev, [f.key]: prev[f.key] === 'false' ? 'true' : 'false' }))} className="inline-flex items-center gap-3" aria-pressed={extraValues[f.key] !== 'false'}>
                      <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${extraValues[f.key] !== 'false' ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${extraValues[f.key] !== 'false' ? 'left-5' : 'left-0.5'}`} />
                      </span>
                      <span className="text-sm text-gray-700 dark:text-gray-200">{extraDisplay(f, extraValues[f.key] === 'false' ? false : true)}</span>
                    </button>
                  ) : f.type === 'ref' ? (
                    <RefField campo={f} valor={extraValues[f.key] ?? ''} onChange={(v) => setExtraValues((prev) => ({ ...prev, [f.key]: v }))} />
                  ) : (
                    <input type="text" inputMode={f.soloNumeros ? 'numeric' : undefined} value={extraValues[f.key] ?? ''} onChange={(e) => setExtraValues((prev) => ({ ...prev, [f.key]: f.soloNumeros ? e.target.value.replace(/\D/g, '') : e.target.value }))} placeholder={f.placeholder} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white" />
                  )}
                  {f.ayuda && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{f.ayuda}</p>}
                  {f.type === 'select' && f.avisoOculta && f.options?.find((o) => o.value === extraValues[f.key])?.oculta && (
                    <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                      <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 h-3 w-3 shrink-0" />
                      {f.avisoOculta.texto(f.options.find((o) => o.value === extraValues[f.key])?.label || '').split('\n\n')[0]} {f.avisoOculta.pestana ? `Se activa en «${f.avisoOculta.pestana.label.replace(/^Ir a /, '')}».` : ''}
                    </p>
                  )}
                </div>
              ))}
              {showExternalId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{externalIdLabel} (opcional)</label>
                {/*
                  Se filtra al ESCRIBIR y no al guardar: `type="number"` deja pegar «22a» y muestra el
                  valor vacío sin decir por qué, y validar recién al guardar obliga a descubrir el
                  problema después de haber escrito todo. Acá el carácter que no corresponde
                  simplemente no entra.
                */}
                <input
                  type="text"
                  inputMode={externalIdNumerico ? 'numeric' : undefined}
                  value={externalId}
                  onChange={(e) => setExternalId(externalIdNumerico ? e.target.value.replace(/\D/g, '') : e.target.value)}
                  placeholder={externalIdPlaceholder}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                />
                {externalIdNumerico && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Solo números: es el id con el que FRAME lo identifica, y se compara como número.</p>}
              </div>
              )}
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
              <p className="text-sm text-gray-500 dark:text-gray-400">Descargá la plantilla, completala y subila acá. Los registros se actualizan/crean por nombre{showExternalId ? ` o ${externalIdLabel.toLowerCase()}` : ''}.</p>
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

      {/*
        FILTRAR: una ventana y no selects sueltos al lado del buscador. Un catálogo puede sumar campos
        filtrables sin que la barra crezca, y cada opción muestra cuántos hay antes de tocarla.
      */}
      <Modal
        isOpen={showFiltros}
        onClose={() => setShowFiltros(false)}
        title="Filtrar"
        size="sm"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <button type="button" onClick={() => setFiltrosCampo({})} disabled={!cantidadFiltros} className="text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-40 dark:text-red-400">
              Limpiar
            </button>
            <button type="button" onClick={() => setShowFiltros(false)} className="btn-primary">
              Ver {buscados.length} {buscados.length === 1 ? 'resultado' : 'resultados'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {camposFiltrables.map((f) => {
            const marcados = filtrosCampo[f.key] || [];
            return (
              <div key={f.key}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{f.columnLabel || f.label}</p>
                <div className="flex flex-wrap gap-2">
                  {(f.options || []).map((o) => {
                    const elegido = marcados.includes(o.value);
                    const cuenta = buscadosSinFiltros.filter((it) => coincideFiltros(it, f.key) && valorFiltrable(f, it) === o.value).length;
                    return (
                      <button key={o.value} type="button" onClick={() => alternarFiltro(f.key, o.value)} aria-pressed={elegido} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${elegido ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'}`}>
                        {elegido && <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
                        {o.label}
                        <span className={elegido ? 'text-blue-100' : 'text-gray-400'}>{cuenta}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-gray-400">{marcados.length ? 'Se muestran los que tengan cualquiera de los marcados.' : 'Sin marcar, se muestran todos.'}</p>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Qué significa que el valor de una fila esté inactivo (ver `avisoOculta`). */}
      <Modal
        isOpen={!!avisoAbierto}
        onClose={() => setAvisoAbierto(null)}
        title={avisoAbierto?.campo.avisoOculta?.titulo || ''}
        size="sm"
        footer={
          <div className="flex w-full items-center justify-end gap-3">
            <button type="button" onClick={() => setAvisoAbierto(null)} className="btn-secondary">
              Cerrar
            </button>
            {avisoAbierto?.campo.avisoOculta?.pestana && (
              <button
                type="button"
                onClick={() => {
                  const destino = avisoAbierto.campo.avisoOculta!.pestana!.id;
                  setAvisoAbierto(null);
                  setTabActiva(destino);
                }}
                className="btn-primary"
              >
                {avisoAbierto.campo.avisoOculta.pestana.label}
              </button>
            )}
          </div>
        }
      >
        {avisoAbierto?.campo.avisoOculta && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
            <p className="whitespace-pre-line text-sm leading-relaxed text-amber-900 dark:text-amber-200">{avisoAbierto.campo.avisoOculta.texto(avisoAbierto.etiqueta)}</p>
          </div>
        )}
      </Modal>
    </PageLayout>
  );
};
