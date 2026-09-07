import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { arcaCategoriasAPI, CategoriaArca, CategoriaHuerfana, ConvenioConCategorias, ConvenioDetalle, GrupoConvenio } from '../../api/arcaCategorias';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { SearchAndFilters } from '../ui/SearchAndFilters';
import { EmptyState } from '../ui/EmptyState';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { InfoModal } from '../ui/InfoModal';
import { BannerFuncionesRotas } from './BannerFuncionesRotas';
import { BannerContratosHuerfanos } from './BannerContratosHuerfanos';
import { BannerEscalasVencidas } from './BannerEscalasVencidas';
import { sweetAlert } from '../../utils/sweetAlert';
import { formatearFechaCalendario } from '../../utils/fechas';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faListCheck, faChevronRight, faChevronDown, faDownload, faUpload, faFileExcel, faPlus, faEdit, faTrash, faTriangleExclamation, faLayerGroup, faArrowLeft, faEye, faEyeSlash, faArrowRightArrowLeft, faCircleInfo, faGrip, faTable } from '@fortawesome/free-solid-svg-icons';
import { DefaultArcaStar, LimpiarDefaultArca } from '../arca/DefaultArcaStar';
import { TablaCategorias, FilaCategoria } from './TablaCategorias';
import { useAuthStore } from '../../stores/authStore';

/**
 * ABM de Categorías, navegado como ARCA lo modela:
 *
 *   1. Convenio      — obligatorio, sin opción "todos"
 *   2. Grupo         — una fila por grupo, con la ESCALA. Es la pantalla de paritarias.
 *   3. Categoría     — código de 6 dígitos y nombre, colgando del grupo. SIN importes.
 *
 * La pantalla anterior era la lista plana heredada de FRAME con chips de convenio encima: 106 filas
 * repitiendo 12 escalas (el Grupo 7 aparecía 23 veces con los mismos cinco importes), el número de
 * grupo presentado como "Nº Cat." —un atributo suelto de la categoría— y el código de ARCA sin sus
 * ceros a la izquierda. Eso no era estética: mantenía vivo el modelo viejo, en el que "categoría" era
 * una función con sueldo de UN convenio.
 *
 * Los grupos van colapsables en una sola grilla, en vez de tres pantallas encadenadas: la escala se
 * ve una vez, en el encabezado del grupo, y las categorías debajo sin repetir importes.
 */

/** Catálogo de convenios, solo para poder dar de alta un convenio que todavía no tiene categorías. */
const conveniosApi = createSimpleCatalogApi('/convenios');

const CONVENIO_ELEGIDO_KEY = 'arcaCategoriasConvenio';

const formatCurrency = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '—';
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
};

/**
 * `fechaActualizacion` es la fecha DEL ACUERDO, no un instante: «rige desde el 6 de julio» es el 6
 * de julio en cualquier huso. Se guarda como "2026-07-06" y se mostraba con
 * `new Date(...).toLocaleDateString()`, que la lee como medianoche UTC — en Argentina, el día
 * anterior a las 21:00. Por eso aparecía un día antes.
 */
const formatDate = formatearFechaCalendario;

/** Fecha en el formato que espera un `<input type="date">`. */
const aInputDate = (value: string | null | undefined): string => {
  if (!value) return new Date().toISOString().split('T')[0];
  try {
    return new Date(value).toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

/** Canónico de ARCA: 6 dígitos con ceros a la izquierda. Lo que se muestra y lo que se guarda. */
const aCodigoArca = (v: string): string => v.replace(/\D/g, '').slice(0, 6).padStart(6, '0');

const esCodigoValido = (v: string): boolean => /^\d{6}$/.test(v) && v !== '000000';

const mensajeDeError = (error: any, porDefecto: string): string => error?.response?.data?.error || porDefecto;

const ESCALA_VACIA = {
  nombre: '',
  sueldoBasico: '',
  sueldoAdicional: '',
  presentismo: '',
  sueldoBruto: '',
  sueldoBrutoLetras: '',
  neto: '',
  sueldoNetoLetras: '',
  fechaActualizacion: '',
};

type FormEscala = typeof ESCALA_VACIA;

/** Dónde queda pegada la barra de convenios. Ver el comentario de `tabsConvenios`. */
const TOPE_TABS = 177;

const MOTIVO_TEXTO: Record<CategoriaHuerfana['motivo'], string> = {
  sin_convenio_ni_codigo: 'no tiene convenio ni código de ARCA',
  sin_convenio: 'no tiene convenio',
  codigo_invalido: 'no tiene un código de ARCA válido',
};

export const CategoriasArcaTab: React.FC = () => {
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('config_holidays:view');

  const [convenios, setConvenios] = useState<ConvenioConCategorias[]>([]);
  const [catalogoConvenios, setCatalogoConvenios] = useState<SimpleCatalogItem[]>([]);
  const [huerfanas, setHuerfanas] = useState<CategoriaHuerfana[]>([]);
  const [huerfanasInfoOpen, setHuerfanasInfoOpen] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  /**
   * Cambia de convenio dejando la vista donde el trabajo sigue: con la barra de tabs pegada arriba y
   * la lista nueva empezando abajo.
   *
   * Sin esto, el salto lo daba el propio documento: cada convenio tiene una cantidad de filas muy
   * distinta —218 categorías contra 4—, así que al cambiar de tab la página se acorta de golpe y el
   * navegador arrastra el scroll hasta donde todavía hay contenido. Desde media lista, elegir otro
   * convenio te dejaba en un lugar arbitrario de la lista nueva.
   *
   * Solo sube cuando hace falta: si ya estás por encima de los tabs, no se toca el scroll. Bajar la
   * vista de alguien que está mirando la parte de arriba sería el mismo problema al revés.
   */
  const elegirConvenio = (codigo: string) => {
    setConvenioSel(codigo);
    const el = tabsRef.current;
    if (!el) return;
    const destino = Math.max(0, window.scrollY + el.getBoundingClientRect().top - TOPE_TABS);
    if (window.scrollY <= destino) return;
    /*
      Después del render, no antes.

      Al cambiar de convenio el documento se acorta —de 218 filas a 4— y el navegador recorta el
      scroll a lo que quedó de página. Scrollear en este mismo tick es escribir un valor que ese
      recorte pisa un instante después; en el frame siguiente la altura nueva ya está aplicada y el
      destino se respeta.
    */
    requestAnimationFrame(() => window.scrollTo({ top: destino, behavior: 'auto' }));
  };
  const [convenioSel, setConvenioSel] = useState<string>(() => localStorage.getItem(CONVENIO_ELEGIDO_KEY) || '');
  /*
    VISTA DE TABLA PARA «TODOS»: todas las categorías juntas, de todos los convenios.

    Las tarjetas contestan «qué convenios hay y cuál está flojo», que es la pregunta con la que se
    entra. No contestan «dónde está la categoría 210053»: para eso había que adivinar de qué convenio
    era y abrirlo. Son dos preguntas distintas sobre los mismos datos, así que son dos vistas y no un
    reemplazo — la de tarjetas sigue siendo la que abre.
  */
  const [vistaTabla, setVistaTabla] = useState<boolean>(() => localStorage.getItem('arcaCategoriasVistaTabla') === 'true');
  const [todasLasCategorias, setTodasLasCategorias] = useState<FilaCategoria[]>([]);
  const [cargandoTodas, setCargandoTodas] = useState(false);
  const [buscaTabla, setBuscaTabla] = useState('');
  const [detalle, setDetalle] = useState<ConvenioDetalle | null>(null);
  const [cargandoNivel1, setCargandoNivel1] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  /*
    LAS DADAS DE BAJA SE ESCONDEN, y el filtro es del cliente a propósito.

    Después de reconstruir 0131/75 quedan 206 categorías históricas —desactivadas y sin grupo—, así
    que sin esto el convenio abre con una lista plana de 206 filas de baja y las 12 vigentes perdidas
    adentro. Filtrarlas en el backend habría sido más barato, pero ese mismo GET alimenta la lista de
    grupos del formulario y la plantilla de paritarias: cambiarle el default les cambia el contenido
    a los dos, y ninguno pidió nada. Acá el dato completo llega igual y la pantalla decide qué muestra.
  */
  const [verHistoricas, setVerHistoricas] = useState(false);

  // Escala del grupo (crear / editar)
  const [grupoEnEdicion, setGrupoEnEdicion] = useState<GrupoConvenio | null>(null);
  const [creandoGrupo, setCreandoGrupo] = useState(false);
  const [numeroGrupo, setNumeroGrupo] = useState('');
  const [formEscala, setFormEscala] = useState<FormEscala>(ESCALA_VACIA);

  // Categoría (crear / editar). `categoriaHuerfana` marca que se abrió desde el banner.
  const [showCategoria, setShowCategoria] = useState(false);
  const [categoriaEnEdicion, setCategoriaEnEdicion] = useState<{ _id: string; contratos: number } | null>(null);
  const [formCategoria, setFormCategoria] = useState({ convenio: '', numeroGrupo: '', codigoArca: '', nombre: '', descripcionArca: '', isActive: true });
  /*
    La escala PROPIA de la categoría, para los convenios sin grupo.

    Arranca siempre desde `escalaPropia` y nunca desde los importes resueltos: una categoría con
    grupo trae el bruto del grupo, y precargarlo acá lo escribiría como propio al guardar. Desde ese
    momento la categoría deja de seguir al grupo y la próxima paritaria la saltea, sin ningún aviso.
  */
  const [formEscalaCat, setFormEscalaCat] = useState<FormEscala>(ESCALA_VACIA);
  const [gruposDelConvenioForm, setGruposDelConvenioForm] = useState<GrupoConvenio[]>([]);

  // Carga masiva de escalas
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const cargarNivel1 = useCallback(async () => {
    try {
      setCargandoNivel1(true);
      const [convs, hs] = await Promise.all([arcaCategoriasAPI.convenios(), arcaCategoriasAPI.huerfanas()]);
      setConvenios(convs);
      setHuerfanas(hs);
      // El catálogo es solo para el alta: si falla, se puede seguir trabajando con lo que ya hay.
      conveniosApi
        .list()
        .then(setCatalogoConvenios)
        .catch(() => setCatalogoConvenios([]));
      return convs;
    } catch (error) {
      console.error('Error cargando convenios con categorías:', error);
      return [] as ConvenioConCategorias[];
    } finally {
      setCargandoNivel1(false);
    }
  }, []);

  const cargarDetalle = useCallback(async (convenio: string) => {
    if (!convenio) {
      setDetalle(null);
      return;
    }
    try {
      setCargandoDetalle(true);
      setDetalle(await arcaCategoriasAPI.detalle(convenio));
    } catch (error) {
      console.error('Error cargando el convenio:', error);
      setDetalle(null);
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  /**
   * Aplana TODAS las categorías, resolviendo el detalle de cada convenio en paralelo.
   *
   * No hay endpoint que las traiga juntas: `detalle` es por convenio. Son pocos —los que tienen
   * categorías cargadas—, así que N requests en paralelo es aceptable; se hace UNA vez, al entrar a
   * la vista de tabla, y no al abrir la pantalla, para no pagarlo cuando nadie la usa.
   */
  const cargarTodasLasCategorias = useCallback(async () => {
    setCargandoTodas(true);
    try {
      const detalles = await Promise.all(convenios.map((c) => arcaCategoriasAPI.detalle(c.convenio).catch(() => null)));
      const filas: FilaCategoria[] = [];
      for (const d of detalles) {
        if (!d) continue;
        for (const g of d.grupos) for (const cat of g.categorias) filas.push({ cat, convenio: d.convenio, nombreConvenio: d.nombre || '', grupo: `G${g.numero}` });
        // Las que no cuelgan de ningún grupo: en varios convenios ARCA publica la escala en la
        // categoría, y dejarlas afuera de esta tabla las volvería invisibles desde acá.
        for (const cat of d.sinGrupo || []) filas.push({ cat, convenio: d.convenio, nombreConvenio: d.nombre || '', grupo: '—' });
      }
      setTodasLasCategorias(filas);
    } finally {
      setCargandoTodas(false);
    }
  }, [convenios]);

  useEffect(() => {
    if (vistaTabla && !convenioSel && convenios.length > 0 && todasLasCategorias.length === 0) void cargarTodasLasCategorias();
  }, [vistaTabla, convenioSel, convenios.length, todasLasCategorias.length, cargarTodasLasCategorias]);

  useEffect(() => {
    cargarNivel1().then((convs) => {
      // Si el convenio recordado ya no tiene categorías, se vuelve al selector en vez de quedar en
      // una pantalla vacía sin explicación.
      setConvenioSel((actual) => (actual && convs.some((c) => c.convenio === actual) ? actual : ''));
    });
  }, [cargarNivel1]);

  useEffect(() => {
    if (convenioSel) localStorage.setItem(CONVENIO_ELEGIDO_KEY, convenioSel);
    else localStorage.removeItem(CONVENIO_ELEGIDO_KEY);
    setExpandidos(new Set());
    setSearchTerm('');
    cargarDetalle(convenioSel);
  }, [convenioSel, cargarDetalle]);

  const refrescar = useCallback(async () => {
    await Promise.all([cargarNivel1(), cargarDetalle(convenioSel)]);
  }, [cargarNivel1, cargarDetalle, convenioSel]);

  // ───────────────────────────────── Búsqueda
  // Filtra CATEGORÍAS, pero conserva el grupo como contenedor: buscar "utilero" tiene que dejar ver
  // de qué grupo cuelga y con qué escala, que es justamente el dato que la lista plana escondía.
  /** Una categoría entra en la búsqueda por nombre, código o descripción de ARCA. */
  const coincide = (c: CategoriaArca, q: string) => c.nombre.toLowerCase().includes(q) || c.codigoArca.includes(q) || c.descripcionArca.toLowerCase().includes(q);

  const gruposVisibles = useMemo(() => {
    if (!detalle) return [];
    const q = searchTerm.trim().toLowerCase();
    return detalle.grupos
      .map((g) => ({ ...g, categorias: g.categorias.filter((c) => (verHistoricas || c.isActive) && (!q || coincide(c, q))) }))
      .filter((g) => !q || g.categorias.length > 0 || String(g.numero).includes(q) || g.nombre.toLowerCase().includes(q));
  }, [detalle, searchTerm, verHistoricas]);

  /**
   * Las categorías sin grupo, que son una SECCIÓN APARTE y no una vista alternativa.
   *
   * Un convenio puede tener grupos y sueltas al mismo tiempo —0131/75 tiene 12 grupos vigentes y 206
   * categorías históricas—, así que las dos secciones se dibujan juntas cuando las dos traen algo.
   */
  const sinGrupoVisibles = useMemo(() => {
    if (!detalle) return [];
    const q = searchTerm.trim().toLowerCase();
    return (detalle.sinGrupo || []).filter((c) => (verHistoricas || c.isActive) && (!q || coincide(c, q)));
  }, [detalle, searchTerm, verHistoricas]);

  /** Cuántas quedaron escondidas por estar de baja. Es lo que rotula el interruptor. */
  const historicas = useMemo(() => {
    if (!detalle) return 0;
    return detalle.grupos.reduce((acc, g) => acc + g.categorias.filter((c) => !c.isActive).length, 0) + (detalle.sinGrupo || []).filter((c) => !c.isActive).length;
  }, [detalle]);

  // Con una búsqueda activa los grupos se abren solos: si no, el resultado quedaría escondido detrás
  // de un chevron.
  const estaExpandido = (g: GrupoConvenio) => !!searchTerm.trim() || expandidos.has(g._id);

  const alternar = (id: string) =>
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalCategorias = useMemo(() => (detalle ? detalle.grupos.reduce((acc, g) => acc + g.categorias.length, 0) + (detalle.sinGrupo || []).length : 0), [detalle]);

  /** Registrados ante ARCA por alguna empleadora, y de esos los que no tienen ni una categoría. */
  const registrados = useMemo(() => convenios.filter((c) => c.registrado), [convenios]);
  const vacios = useMemo(() => registrados.filter((c) => c.categorias === 0), [registrados]);

  // ───────────────────────────────── Escala del grupo
  const abrirEscala = (grupo: GrupoConvenio) => {
    setCreandoGrupo(false);
    setGrupoEnEdicion(grupo);
    setNumeroGrupo(String(grupo.numero));
    setFormEscala({
      nombre: grupo.nombre || '',
      sueldoBasico: String(grupo.sueldoBasico ?? ''),
      sueldoAdicional: String(grupo.sueldoAdicional ?? ''),
      presentismo: String(grupo.presentismo ?? ''),
      sueldoBruto: String(grupo.sueldoBruto ?? ''),
      sueldoBrutoLetras: grupo.sueldoBrutoLetras || '',
      neto: String(grupo.neto ?? ''),
      sueldoNetoLetras: grupo.sueldoNetoLetras || '',
      fechaActualizacion: aInputDate(grupo.fechaActualizacion),
    });
  };

  const abrirNuevoGrupo = () => {
    setCreandoGrupo(true);
    setGrupoEnEdicion(null);
    const siguiente = detalle && detalle.grupos.length > 0 ? Math.max(...detalle.grupos.map((g) => g.numero)) + 1 : 1;
    setNumeroGrupo(String(siguiente));
    setFormEscala({ ...ESCALA_VACIA, fechaActualizacion: aInputDate(null) });
  };

  const cerrarEscala = () => {
    setGrupoEnEdicion(null);
    setCreandoGrupo(false);
  };

  const guardarEscala = async () => {
    const numero = Number(numeroGrupo);
    if (!Number.isFinite(numero)) {
      sweetAlert.error('Error', 'El número de grupo es obligatorio');
      return;
    }
    const payload = {
      numero,
      nombre: formEscala.nombre.trim(),
      sueldoBasico: Number(formEscala.sueldoBasico || 0),
      sueldoAdicional: Number(formEscala.sueldoAdicional || 0),
      presentismo: Number(formEscala.presentismo || 0),
      sueldoBruto: Number(formEscala.sueldoBruto || 0),
      sueldoBrutoLetras: formEscala.sueldoBrutoLetras.trim(),
      neto: Number(formEscala.neto || 0),
      sueldoNetoLetras: formEscala.sueldoNetoLetras.trim(),
      fechaActualizacion: formEscala.fechaActualizacion,
    };

    try {
      if (creandoGrupo) {
        await arcaCategoriasAPI.crearGrupo({ convenio: convenioSel, ...payload });
        sweetAlert.success('Grupo creado', `El grupo ${numero} del convenio ${convenioSel} quedó creado. Ahora podés colgarle categorías.`);
      } else if (grupoEnEdicion) {
        const { categoriasAlcanzadas } = await arcaCategoriasAPI.actualizarGrupo(grupoEnEdicion._id, payload);
        // La escala vive en el grupo: se dice a cuántas categorías alcanzó, en vez de dejar creer
        // que se editó una fila suelta.
        sweetAlert.success('Escala actualizada', categoriasAlcanzadas === 1 ? 'La escala se aplicó a la única categoría del grupo.' : `La escala se aplicó a las ${categoriasAlcanzadas} categorías del grupo ${numero}.`);
      }
      cerrarEscala();
      await refrescar();
    } catch (error) {
      sweetAlert.error('Error', mensajeDeError(error, 'No se pudo guardar la escala'));
    }
  };

  const eliminarGrupo = async (grupo: GrupoConvenio) => {
    const r = await sweetAlert.confirm('¿Eliminar grupo?', `El grupo ${grupo.numero} del convenio ${convenioSel} y su escala se eliminan. Esta acción no se puede deshacer.`);
    if (!r.isConfirmed) return;
    try {
      await arcaCategoriasAPI.eliminarGrupo(grupo._id);
      sweetAlert.success('Grupo eliminado', 'El grupo salarial se eliminó correctamente');
      await refrescar();
    } catch (error) {
      sweetAlert.error('No se puede eliminar', mensajeDeError(error, 'No se pudo eliminar el grupo'));
    }
  };

  // ───────────────────────────────── Categorías
  /** Los grupos que puede elegir el formulario. Se piden aparte cuando el convenio no es el abierto. */
  const cargarGruposPara = useCallback(
    async (convenio: string) => {
      if (!convenio) {
        setGruposDelConvenioForm([]);
        return;
      }
      if (detalle && detalle.convenio === convenio) {
        setGruposDelConvenioForm(detalle.grupos);
        return;
      }
      try {
        setGruposDelConvenioForm((await arcaCategoriasAPI.detalle(convenio)).grupos);
      } catch {
        setGruposDelConvenioForm([]);
      }
    },
    [detalle],
  );

  const abrirNuevaCategoria = () => {
    setCategoriaEnEdicion(null);
    setFormCategoria({ convenio: convenioSel, numeroGrupo: '', codigoArca: '', nombre: '', descripcionArca: '', isActive: true });
    setFormEscalaCat(ESCALA_VACIA);
    cargarGruposPara(convenioSel);
    setShowCategoria(true);
  };

  /** El formulario, cargado con la escala PROPIA. Ver `formEscalaCat`: la heredada no se precarga. */
  const escalaPropiaAlForm = (cat: CategoriaArca): FormEscala => {
    const e = cat.escalaPropia;
    if (!e) return ESCALA_VACIA;
    return {
      nombre: '',
      sueldoBasico: String(e.sueldoBasico || ''),
      sueldoAdicional: String(e.sueldoAdicional || ''),
      presentismo: String(e.presentismo || ''),
      sueldoBruto: String(e.sueldoBruto || ''),
      sueldoBrutoLetras: e.sueldoBrutoLetras || '',
      neto: String(e.neto || ''),
      sueldoNetoLetras: e.sueldoNetoLetras || '',
      fechaActualizacion: aInputDate(e.fechaActualizacion),
    };
  };

  /** `grupo` es `null` para las categorías sueltas: no todas cuelgan de uno. */
  const abrirEditarCategoria = (cat: CategoriaArca, grupo: GrupoConvenio | null, convenio: string) => {
    setCategoriaEnEdicion({ _id: cat._id, contratos: cat.contratos });
    setFormCategoria({ convenio, numeroGrupo: grupo ? String(grupo.numero) : '', codigoArca: cat.codigoArca, nombre: cat.nombre, descripcionArca: cat.descripcionArca, isActive: cat.isActive });
    setFormEscalaCat(escalaPropiaAlForm(cat));
    cargarGruposPara(convenio);
    setShowCategoria(true);
  };

  /**
   * Abre una huérfana para repararla. El convenio arranca vacío a propósito: es el dato que falta y
   * el que hay que elegir, no algo que se pueda heredar del contexto.
   */
  const abrirHuerfana = (h: CategoriaHuerfana) => {
    setCategoriaEnEdicion({ _id: h._id, contratos: h.contratos });
    setFormCategoria({ convenio: h.convenio, numeroGrupo: '', codigoArca: esCodigoValido(h.codigoArca) ? h.codigoArca : '', nombre: h.nombre, descripcionArca: '', isActive: true });
    setFormEscalaCat(ESCALA_VACIA);
    cargarGruposPara(h.convenio);
    setShowCategoria(true);
  };

  const guardarCategoria = async () => {
    const convenio = formCategoria.convenio.trim();
    const codigo = formCategoria.codigoArca.trim() ? aCodigoArca(formCategoria.codigoArca) : '';
    if (!convenio) {
      sweetAlert.error('Falta el convenio', 'Una categoría pertenece a un convenio: sin eso, ARCA no la reconoce.');
      return;
    }
    if (!esCodigoValido(codigo)) {
      sweetAlert.error('Código de ARCA inválido', 'Son 6 dígitos, con ceros a la izquierda (ej. 035283). "0" y vacío no son códigos.');
      return;
    }
    if (!formCategoria.nombre.trim()) {
      sweetAlert.error('Falta el nombre', 'El nombre de la categoría es obligatorio.');
      return;
    }

    const conGrupo = !!formCategoria.numeroGrupo;
    /*
      La escala propia se manda SOLO cuando la categoría no cuelga de un grupo.

      Con grupo, la escala es del grupo: mandar importes acá los grabaría como propios y la categoría
      quedaría congelada en el número de hoy, ignorando la próxima paritaria. El formulario ni
      siquiera muestra los campos en ese caso, y esto lo vuelve a garantizar del lado del envío.
    */
    const payload = {
      convenio,
      numeroGrupo: conGrupo ? Number(formCategoria.numeroGrupo) : ('' as const),
      codigoArca: codigo,
      nombre: formCategoria.nombre.trim(),
      descripcionArca: formCategoria.descripcionArca.trim(),
      isActive: formCategoria.isActive,
      ...(conGrupo
        ? {}
        : {
            sueldoBasico: Number(formEscalaCat.sueldoBasico || 0),
            sueldoAdicional: Number(formEscalaCat.sueldoAdicional || 0),
            presentismo: Number(formEscalaCat.presentismo || 0),
            sueldoBruto: Number(formEscalaCat.sueldoBruto || 0),
            sueldoBrutoLetras: formEscalaCat.sueldoBrutoLetras.trim(),
            neto: Number(formEscalaCat.neto || 0),
            sueldoNetoLetras: formEscalaCat.sueldoNetoLetras.trim(),
            fechaActualizacion: formEscalaCat.fechaActualizacion,
          }),
    };

    try {
      if (categoriaEnEdicion) {
        await arcaCategoriasAPI.actualizarCategoria(categoriaEnEdicion._id, payload);
        sweetAlert.success('Categoría actualizada', categoriaEnEdicion.contratos > 0 ? `Los ${categoriaEnEdicion.contratos} contratos que la usan pasan a resolver contra ${convenio} · ${codigo}.` : 'Los cambios se guardaron correctamente.');
      } else {
        await arcaCategoriasAPI.crearCategoria(payload);
        sweetAlert.success('Categoría creada', conGrupo ? `${codigo} — ${payload.nombre} quedó en el grupo ${payload.numeroGrupo} de ${convenio}.` : `${codigo} — ${payload.nombre} quedó en ${convenio}, sin grupo: su escala es la que se cargó acá.`);
      }
      setShowCategoria(false);
      // Si se reparó una huérfana de otro convenio, se abre ese convenio: si no, el usuario guarda y
      // no ve nada cambiar.
      if (convenio !== convenioSel) setConvenioSel(convenio);
      await refrescar();
    } catch (error) {
      sweetAlert.error('Error', mensajeDeError(error, 'No se pudo guardar la categoría'));
    }
  };

  const alternarActiva = async (cat: CategoriaArca) => {
    try {
      await arcaCategoriasAPI.actualizarCategoria(cat._id, { isActive: !cat.isActive });
      sweetAlert.success(cat.isActive ? 'Categoría desactivada' : 'Categoría activada', cat.isActive ? 'Deja de ofrecerse en contratos nuevos. Los que ya la usan siguen resolviendo su escala y su código.' : 'Vuelve a ofrecerse al cargar un contrato.');
      await refrescar();
    } catch (error) {
      sweetAlert.error('Error', mensajeDeError(error, 'No se pudo cambiar el estado'));
    }
  };

  const eliminarCategoria = async (cat: CategoriaArca) => {
    const r = await sweetAlert.confirm('¿Eliminar categoría?', `Se elimina "${cat.nombre}" (${cat.codigoArca}).`);
    if (!r.isConfirmed) return;
    try {
      await arcaCategoriasAPI.eliminarCategoria(cat._id);
      sweetAlert.success('Categoría eliminada', 'La categoría se eliminó correctamente');
      await refrescar();
    } catch (error) {
      sweetAlert.error('No se puede eliminar', mensajeDeError(error, 'No se pudo eliminar la categoría'));
    }
  };

  // ───────────────────────────────── Plantilla / carga masiva
  const descargarPlantilla = async () => {
    try {
      const blob = await arcaCategoriasAPI.plantilla(convenioSel);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `escalas_${convenioSel.replace(/\W/g, '_')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      sweetAlert.success('Descarga exitosa', `La plantilla sale con los ${detalle?.grupos.length ?? 0} grupos de ${convenioSel} y su escala vigente.`);
    } catch (error) {
      sweetAlert.error('Error', mensajeDeError(error, 'No se pudo descargar la plantilla'));
    }
  };

  const importar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;
    try {
      setImporting(true);
      setImportErrors([]);
      const res = await arcaCategoriasAPI.importar(importFile);
      sweetAlert.success('Actualización completada', res.message);
      setShowImport(false);
      setImportFile(null);
      await refrescar();
    } catch (error: any) {
      const detalles = error?.response?.data?.details;
      if (Array.isArray(detalles)) setImportErrors(detalles);
      else sweetAlert.error('Error de importación', mensajeDeError(error, 'No se pudo importar el archivo'));
    } finally {
      setImporting(false);
    }
  };

  // ───────────────────────────────── Render
  if (cargandoNivel1) {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner message="Cargando convenios..." />
      </div>
    );
  }

  /**
   * Los convenios como TABS, no como una pantalla previa de tarjetas.
   *
   * Antes había que entrar a un convenio y salir con «Cambiar convenio» para ver otro: dos clicks y
   * una pantalla que se iba, cuando lo que se hace acá es justamente comparar entre convenios —
   * cuáles tienen escala cargada, cuántas categorías tiene cada uno.
   *
   * La primera pestaña, «Todos», conserva la vista de tarjetas: es la única que muestra de un vistazo
   * el estado de TODOS los convenios y la advertencia de los registrados sin categorías. Sacarla para
   * dejar solo las pestañas habría cambiado navegación por información.
   */
  /*
    LA BARRA DE CONVENIOS SE PEGA DEBAJO DE LA DE ARRIBA.

    `top-[177px]` es el borde inferior de la barra «Categorías | Funciones FRAME», que está sticky a
    140px y mide 39: quedan a tope, sin la ranura por la que se vería pasar el contenido. El número
    está escrito y no calculado porque los dos valores viven en archivos distintos —esta barra acá, la
    otra en `ArcaCategoriasPage`— y no hay medición en tiempo de layout que valga la pena para dos
    barras de alto fijo. Si alguna cambia de alto, este número cambia con ella.

    `z-10` y no `z-20`: la de arriba tiene que ganarle a esta cuando se superponen.
  */
  const tabsConvenios = (
    <div ref={tabsRef} className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto sticky top-[177px] z-10 bg-gray-100 dark:bg-gray-900">
      <button
        type="button"
        onClick={() => elegirConvenio('')}
        className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
          convenioSel === '' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
        }`}
      >
        Todos
      </button>
      {convenios.map((c) => (
        <button
          key={c.convenio}
          type="button"
          onClick={() => elegirConvenio(c.convenio)}
          title={`${c.convenio} — ${c.nombre || 'sin descripción'} · ${c.categorias} categoría(s)`}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
            convenioSel === c.convenio ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          <span className="font-mono">{c.convenio}</span>
          {/* El nombre distingue lo que el código no: esta empleadora tiene dos TELEVISIÓN y dos ACTORES. */}
          <span className="hidden lg:inline font-normal">{c.nombre}</span>
          <span className="text-[10px] font-normal text-gray-400">{c.categorias}</span>
        </button>
      ))}
    </div>
  );

  /*
    EL AVISO DE HUÉRFANAS ES UNA LÍNEA, no un panel.

    Era un bloque rojo con una fila por categoría y un botón de acción en cada una, arriba de todo y
    en las dos pantallas. Ocupaba un tercio de la vista para decir algo que no cambia de un día para
    el otro: son dos categorías rotas heredadas de FRAME, y arreglarlas es un trabajo puntual, no una
    tarea diaria. Un aviso permanente del tamaño del contenido que tapa deja de leerse y empieza a
    esquivarse — que es lo contrario de lo que un aviso tiene que lograr.

    Sigue siendo rojo y sigue estando arriba, así que no se pierde. Lo que cambia es que el detalle
    —cuál es cada una, por qué está rota, cuántos contratos la usan, y el botón para repararla— vive
    en el modal, a un click.
  */
  const banner = huerfanas.length > 0 && (
    <div className="flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-3 py-2">
      <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
      <span className="text-xs text-red-800 dark:text-red-300 min-w-0 truncate mr-0.5">
        {huerfanas.length === 1 ? (
          <>
            Hay <strong>1 categoría</strong> que ARCA no puede aceptar
          </>
        ) : (
          <>
            Hay <strong>{huerfanas.length} categorías</strong> que ARCA no puede aceptar
          </>
        )}
        {/* El nombre entra en la línea cuando hay lugar: sin él, el aviso no dice de qué habla. */}
        <span className="hidden sm:inline text-red-700/80 dark:text-red-400/80"> — {huerfanas.map((h) => h.nombre).join(', ')}</span>
      </span>
      <button
        type="button"
        onClick={() => setHuerfanasInfoOpen(true)}
        title="Ver cuáles son y cómo se arreglan"
        aria-label="Ver las categorías que ARCA no puede aceptar"
        className="shrink-0 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
      >
        <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  /** El detalle que antes ocupaba el panel: una ficha por categoría, con su reparación. */
  const modalHuerfanas = (
    <InfoModal
      isOpen={huerfanasInfoOpen}
      onClose={() => setHuerfanasInfoOpen(false)}
      title={huerfanas.length === 1 ? 'Una categoría que ARCA no puede aceptar' : `${huerfanas.length} categorías que ARCA no puede aceptar`}
      size="md"
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-700 dark:text-gray-200">
          Sin convenio o sin código, el alta no se puede generar: el TXT sale sin categoría profesional y ARCA lo rechaza. Asignales el convenio y el código reales, o dalas de baja si no las usa nadie.
        </p>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
          {huerfanas.map((h) => (
            <div key={h._id} className="px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 text-sm">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{h.nombre}</span>
                <span className="text-red-700 dark:text-red-400"> — {MOTIVO_TEXTO[h.motivo]}</span>
                <span className="block text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  {h.contratos > 0 ? (
                    <>
                      <strong className="text-red-700 dark:text-red-400">{h.contratos} contrato(s)</strong> la usan y hoy no pueden generar TXT. No se puede dar de baja: hay que asignarle convenio y código.
                    </>
                  ) : (
                    'Ningún contrato la usa: se puede dar de baja.'
                  )}
                </span>
              </div>
              {canManage && (
                <button
                  onClick={() => {
                    setHuerfanasInfoOpen(false);
                    abrirHuerfana(h);
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Asignar convenio y código
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {/* Se dice porque es la pregunta que sigue: «¿entonces las borro?». No: los contratos
              históricos necesitan que la categoría exista para resolver su nombre. */}
          Dar de baja no borra: la categoría deja de ofrecerse al cargar un contrato nuevo, pero sigue resolviendo el nombre y el código de los que ya la usan.
        </p>
      </div>
    </InfoModal>
  );

  // ── Nivel 1: elegir convenio. No hay "todos": una categoría se lee dentro de su convenio.
  if (!convenioSel) {
    return (
      <div className="space-y-4">
        {banner}
        <BannerFuncionesRotas />
      <BannerContratosHuerfanos />
      <BannerEscalasVencidas />
        {modalHuerfanas}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">{vistaTabla ? 'Todas las categorías' : 'Elegí un convenio'}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Las categorías profesionales cuelgan de un Convenio Colectivo. La escala salarial vive en sus grupos —o en la categoría, en los convenios que ARCA publica sin grupos.</p>
          </div>
          {/* Mismo par de botones que el resto de los catálogos, para que la vista se cambie igual. */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setVistaTabla(false);
                localStorage.setItem('arcaCategoriasVistaTabla', 'false');
              }}
              title="Vista de tarjetas, por convenio"
              className={`px-3 py-2 rounded-md transition-all border dark:border-gray-700 ${!vistaTabla ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setVistaTabla(true);
                localStorage.setItem('arcaCategoriasVistaTabla', 'true');
              }}
              title="Vista de tabla, con todas las categorías juntas"
              className={`px-3 py-2 rounded-md transition-all border dark:border-gray-700 ${vistaTabla ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
            </button>
          </div>
        </div>

        {tabsConvenios}
        {/*
         * Chequeo de consistencia, arriba: un convenio registrado ante ARCA y sin categorías es un
         * bloqueo, no un detalle — ningún alta bajo ese CCT se puede generar. Mismo patrón que los
         * chequeos de Obras Sociales, y es lo que evita que vuelva a pasar en silencio.
         */}
        {vacios.length > 0 && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {vacios.length} de {registrados.length} convenios registrados no tienen categorías cargadas
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Ningún contrato puede darse de alta bajo esos convenios: ARCA solo ofrece categorías de los CCT que el CUIT registró, y acá no hay ninguna.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {vacios.map((c) => (
                  <button key={c.convenio} type="button" onClick={() => setConvenioSel(c.convenio)} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-amber-400 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
                    <span className="font-mono">{c.convenio}</span>
                    {c.nombre}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {convenios.length === 0 ? (
          <EmptyState icon={faListCheck} title="No hay convenios registrados" description="Ninguna empleadora tiene convenios registrados ante ARCA. Registralos desde Configuración → ARCA → Convenios, marcando las empresas que lo tienen." />
        ) : vistaTabla ? (
          <TablaCategorias
            filas={todasLasCategorias}
            cargando={cargandoTodas}
            busqueda={buscaTabla}
            onBuscar={setBuscaTabla}
            encabezadoPorDefecto={
              <span className="inline-flex items-center gap-2">
                Por defecto
                <LimpiarDefaultArca campo="categoria" queEs="la categoría que se ofrece primero" />
              </span>
            }
            renderPorDefecto={(f) => <DefaultArcaStar campo="categoria" valor={f.cat.codigoArca} nombre={`${f.cat.codigoArca} — ${f.cat.nombre}`} queEs="la categoría que se ofrece primero" />}
            onAbrirConvenio={(convenio) => elegirConvenio(convenio)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {convenios.map((c) => {
              // Vacío = registrado ante ARCA pero sin categorías. Va en ÁMBAR y no en gris: gris se
              // lee como "no aplica" y esto es trabajo pendiente que bloquea altas.
              const vacio = c.categorias === 0;
              return (
                <button
                  key={c.convenio}
                  onClick={() => elegirConvenio(c.convenio)}
                  className={`text-left rounded-xl border p-4 hover:shadow-md transition-all ${
                    vacio
                      ? 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 hover:border-amber-500 dark:hover:border-amber-600'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-mono text-sm font-bold ${vacio ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400'}`}>{c.convenio}</span>
                    <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 text-gray-400" />
                  </div>
                  <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100 truncate" title={c.nombre}>
                    {c.nombre || '(sin descripción en el catálogo de Convenios)'}
                  </div>
                  {vacio ? (
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      {/* "0 grupos · 0 categorías" describe; "Sin categorías cargadas" acciona. */}
                      <span className="font-semibold text-amber-700 dark:text-amber-400">Sin categorías cargadas</span>
                      <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-amber-400 dark:border-amber-700 text-amber-800 dark:text-amber-300 font-semibold">
                        <FontAwesomeIcon icon={faUpload} className="h-2.5 w-2.5" />
                        Importar de ARCA
                      </span>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        <strong className="text-gray-700 dark:text-gray-300">{c.grupos}</strong> {c.grupos === 1 ? 'grupo' : 'grupos'}
                      </span>
                      <span>
                        <strong className="text-gray-700 dark:text-gray-300">{c.categorias}</strong> {c.categorias === 1 ? 'categoría' : 'categorías'}
                      </span>
                      <span className="ml-auto">Escala: {formatDate(c.ultimaActualizacion)}</span>
                    </div>
                  )}
                  {/* Categorías de un CCT que ninguna empleadora registró: ARCA las va a rechazar. */}
                  {!c.registrado && <p className="mt-2 text-[11px] text-red-700 dark:text-red-400">Ninguna empleadora tiene este convenio registrado ante ARCA.</p>}
                </button>
              );
            })}
          </div>
        )}
        {modalCategoria()}
      </div>
    );
  }

  // ── Niveles 2 y 3: grupos del convenio, con sus categorías colapsables.
  return (
    <div className="space-y-4">
      {banner}
      <BannerFuncionesRotas />
      <BannerContratosHuerfanos />
      <BannerEscalasVencidas />
      {modalHuerfanas}

      {tabsConvenios}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400">{convenioSel}</span>
          <span className="text-sm text-gray-600 dark:text-gray-300"> — {detalle?.nombre || '(sin descripción)'}</span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            {detalle?.grupos.length ?? 0} grupos · {totalCategorias} categorías
            {(detalle?.sinGrupo?.length ?? 0) > 0 && <> · {detalle!.sinGrupo.length} sin grupo</>}
          </span>
        </div>
        {historicas > 0 && (
          <label className="inline-flex items-center gap-2 cursor-pointer select-none ml-auto" title="Las dadas de baja siguen resolviendo el sueldo y el código de los contratos que ya las usan, pero no se ofrecen al cargar uno nuevo.">
            <input type="checkbox" checked={verHistoricas} onChange={(e) => setVerHistoricas(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-xs text-gray-600 dark:text-gray-300">
              Ver históricas <span className="font-semibold">({historicas})</span>
            </span>
          </label>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
        <div className="flex-1 w-full">
          <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar categoría por nombre o código ARCA..." />
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {canManage && (
            <>
              <button onClick={abrirNuevaCategoria} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center gap-2 text-sm font-semibold active:scale-95" title="Nueva categoría">
                <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
                <span className="hidden md:block">Categoría</span>
              </button>
              <button onClick={abrirNuevoGrupo} className="px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center gap-2 text-sm font-semibold active:scale-95" title="Nuevo grupo salarial">
                <FontAwesomeIcon icon={faLayerGroup} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="hidden md:block">Grupo</span>
              </button>
            </>
          )}
          <button onClick={descargarPlantilla} className="px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center gap-2 text-sm font-semibold active:scale-95" title={`Descargar las escalas de ${convenioSel}`}>
            <FontAwesomeIcon icon={faDownload} className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="hidden md:block">Plantilla</span>
          </button>
          {canManage && (
            <button
              onClick={() => {
                setImportFile(null);
                setImportErrors([]);
                setShowImport(true);
              }}
              className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md shadow-green-500/20 active:scale-95"
              title="Aplicar una paritaria desde Excel"
            >
              <FontAwesomeIcon icon={faUpload} className="h-4 w-4" />
              <span className="hidden md:block">Paritaria</span>
            </button>
          )}
        </div>
      </div>

      {cargandoDetalle ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando el convenio..." />
        </div>
      ) : gruposVisibles.length === 0 && sinGrupoVisibles.length === 0 ? (
        <EmptyState
          icon={faListCheck}
          title={searchTerm ? 'Sin resultados' : 'Este convenio no tiene categorías'}
          description={
            searchTerm
              ? `Ninguna categoría de ${convenioSel} coincide con la búsqueda.`
              : historicas > 0
                ? `Las ${historicas} categorías de ${convenioSel} están dadas de baja. Tildá «Ver históricas» para verlas.`
                : 'Creá un grupo salarial con su escala y colgale las categorías del nomenclador de ARCA.'
          }
          action={canManage && !searchTerm ? { label: 'Nuevo grupo', onClick: abrirNuevoGrupo, icon: faLayerGroup } : undefined}
        />
      ) : (
        <div className="space-y-4">
          {gruposVisibles.length > 0 && (
            <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm mx-0.5 lg:mx-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-3 w-8" />
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Grupo</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sueldo Básico</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Adicional</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sueldo Bruto</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden xl:table-cell">Presentismo</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Neto</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">Actualización</th>
                      {canManage && <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {gruposVisibles.map((g) => {
                      const abierto = estaExpandido(g);
                      const sinEscala = !g.sueldoBruto;
                      return (
                        <React.Fragment key={g._id}>
                          <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer" onClick={() => alternar(g._id)}>
                            <td className="px-3 py-3 text-gray-400">
                              <FontAwesomeIcon icon={abierto ? faChevronDown : faChevronRight} className="h-3 w-3" />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center h-7 w-10 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold">{g.numero}</span>
                                <div className="min-w-0">
                                  {g.nombre && <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{g.nombre}</span>}
                                  <span className="block text-xs text-gray-500 dark:text-gray-400">{g.categorias.length === 1 ? '1 categoría' : `${g.categorias.length} categorías`}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-medium">{formatCurrency(g.sueldoBasico)}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-medium">{formatCurrency(g.sueldoAdicional)}</td>
                            <td className="px-4 py-3">
                              <span className={`text-sm font-semibold ${sinEscala ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{formatCurrency(g.sueldoBruto)}</span>
                              {sinEscala && (
                                <span className="block text-[10px] text-red-600 dark:text-red-400" title="Sin sueldo bruto, la retribución del TXT queda en 0 y ARCA rechaza el alta.">
                                  Sin escala: bloquea el alta
                                </span>
                              )}
                              {!sinEscala && g.sueldoBrutoLetras && (
                                <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[170px]" title={g.sueldoBrutoLetras}>
                                  {g.sueldoBrutoLetras}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-medium hidden xl:table-cell">{formatCurrency(g.presentismo)}</td>
                            <td className="px-4 py-3 text-sm text-blue-700 dark:text-blue-400 font-bold">{formatCurrency(g.neto)}</td>
                            <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">{formatDate(g.fechaActualizacion)}</td>
                            {canManage && (
                              <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => abrirEscala(g)} className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors" title="Editar la escala del grupo (aplicar paritaria)">
                                    <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                                  </button>
                                  <button onClick={() => eliminarGrupo(g)} disabled={g.categorias.length > 0} className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={g.categorias.length > 0 ? 'Tiene categorías: movelas o eliminalas antes' : 'Eliminar grupo'}>
                                    <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>

                          {abierto && (
                            <tr>
                              <td colSpan={canManage ? 9 : 8} className="p-0 bg-gray-50/70 dark:bg-gray-900/30">
                                {g.categorias.length === 0 ? (
                                  <div className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">Este grupo no tiene categorías.</div>
                                ) : (
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="border-b border-gray-200 dark:border-gray-700/60">
                                        <th className="pl-14 pr-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cód. ARCA</th>
                                        <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nombre</th>
                                        <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden lg:table-cell">Descripción de ARCA</th>
                                        <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Contratos</th>
                                        {/* Última antes de Acciones, como en todos los nomencladores. */}
                                        <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                                          <span className="inline-flex items-center gap-2">
                                            Por defecto
                                            <LimpiarDefaultArca campo="categoria" queEs="la categoría que se ofrece primero" />
                                          </span>
                                        </th>
                                        {canManage && <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Acciones</th>}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                      {g.categorias.map((c) => (
                                        <tr key={c._id} className="hover:bg-white dark:hover:bg-gray-800/60 transition-colors">
                                          <td className="pl-14 pr-4 py-2">
                                            {/* 6 dígitos, como lo escribe ARCA: así se coteja de un vistazo contra un export del organismo. */}
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">{c.codigoArca}</span>
                                          </td>
                                          <td className="px-4 py-2">
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.nombre}</span>
                                            {!c.isActive && (
                                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600" title="Resuelve para los contratos que ya la usan, pero no se ofrece al cargar uno nuevo.">
                                                NO ELEGIBLE
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">{c.descripcionArca || '—'}</td>
                                          <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{c.contratos > 0 ? c.contratos : '—'}</td>
                                          <td className="px-4 py-2">
                                            <DefaultArcaStar campo="categoria" valor={c.codigoArca} nombre={`${c.codigoArca} — ${c.nombre}`} queEs="la categoría que se ofrece primero" />
                                          </td>
                                          {canManage && (
                                            <td className="px-4 py-2 text-right whitespace-nowrap">
                                              <div className="flex items-center justify-end gap-1.5">
                                                <button onClick={() => abrirEditarCategoria(c, g, convenioSel)} className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors" title="Editar">
                                                  <FontAwesomeIcon icon={faEdit} className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => alternarActiva(c)} className="p-1.5 text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 rounded transition-colors" title={c.isActive ? 'Dejar de ofrecerla en contratos nuevos' : 'Volver a ofrecerla'}>
                                                  <FontAwesomeIcon icon={c.isActive ? faEye : faEyeSlash} className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => eliminarCategoria(c)} disabled={c.contratos > 0} className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={c.contratos > 0 ? `${c.contratos} contrato(s) la usan: desactivala en vez de eliminarla` : 'Eliminar'}>
                                                  <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                                                </button>
                                              </div>
                                            </td>
                                          )}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {convenioSel} · <span className="font-bold text-gray-700 dark:text-gray-300">{gruposVisibles.length}</span> grupo(s) y <span className="font-bold text-gray-700 dark:text-gray-300">{gruposVisibles.reduce((acc, g) => acc + g.categorias.length, 0)}</span> categoría(s)
                  {searchTerm ? ` de ${totalCategorias}` : ''}
                </span>
              </div>
            </div>
          )}

          {/*
            SECCIÓN PLANA: las categorías que no cuelgan de ningún grupo.

            No es una vista alternativa a la de arriba — se dibujan las dos cuando las dos tienen
            algo. 0131/75 tiene 12 grupos vigentes y 206 categorías históricas sueltas al mismo
            tiempo, y elegir una vista según `grupos.length` haría desaparecer 206 filas en silencio.

            Acá la escala se muestra por fila y no en un encabezado: sin grupo del cual heredar, cada
            categoría tiene la suya o no tiene ninguna.
          */}
          {sinGrupoVisibles.length > 0 && (
            <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm mx-0.5 lg:mx-0">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Categorías sin grupo salarial</span>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  ARCA no publica grupo en todos los convenios. Sin grupo del cual heredar, la escala vive en cada categoría.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cód. ARCA</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sueldo Bruto</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden xl:table-cell">Neto</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">Actualización</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contratos</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          Por defecto
                          <LimpiarDefaultArca campo="categoria" queEs="la categoría que se ofrece primero" />
                        </span>
                      </th>
                      {canManage && <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {sinGrupoVisibles.map((c) => (
                      <tr key={c._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">{c.codigoArca}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.nombre}</span>
                          {!c.isActive && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600" title="Resuelve para los contratos que ya la usan, pero no se ofrece al cargar uno nuevo.">
                              NO ELEGIBLE
                            </span>
                          )}
                          {c.descripcionArca && <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate max-w-[380px]">{c.descripcionArca}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {/*
                            «Sin escala» y «$ 0» NO son lo mismo, y el color los separa: el primero es
                            un dato que falta y bloquea el alta; el segundo sería una decisión.
                            `escalaOrigen` es lo único que permite distinguirlos desde acá.
                          */}
                          {c.escalaOrigen === null ? (
                            <span className="text-xs font-semibold text-red-600 dark:text-red-400" title="Sin sueldo bruto, la retribución del TXT queda en 0 y ARCA rechaza el alta.">
                              Sin escala: bloquea el alta
                            </span>
                          ) : (
                            <>
                              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(c.sueldoBruto)}</span>
                              {c.sueldoBrutoLetras && (
                                <span className="block text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[170px]" title={c.sueldoBrutoLetras}>
                                  {c.sueldoBrutoLetras}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-blue-700 dark:text-blue-400 font-bold hidden xl:table-cell">{c.escalaOrigen === null ? '—' : formatCurrency(c.neto)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">{formatDate(c.fechaActualizacion)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{c.contratos > 0 ? c.contratos : '—'}</td>
                        <td className="px-4 py-2.5">
                          <DefaultArcaStar campo="categoria" valor={c.codigoArca} nombre={`${c.codigoArca} — ${c.nombre}`} queEs="la categoría que se ofrece primero" />
                        </td>
                        {canManage && (
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button onClick={() => abrirEditarCategoria(c, null, convenioSel)} className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors" title="Editar la categoría y su escala">
                                <FontAwesomeIcon icon={faEdit} className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => alternarActiva(c)} className="p-1.5 text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 rounded transition-colors" title={c.isActive ? 'Dejar de ofrecerla en contratos nuevos' : 'Volver a ofrecerla'}>
                                <FontAwesomeIcon icon={c.isActive ? faEye : faEyeSlash} className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => eliminarCategoria(c)} disabled={c.contratos > 0} className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={c.contratos > 0 ? `${c.contratos} contrato(s) la usan: desactivala en vez de eliminarla` : 'Eliminar'}>
                                <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-bold text-gray-700 dark:text-gray-300">{sinGrupoVisibles.length}</span> categoría(s) sin grupo
                  {searchTerm || !verHistoricas ? ` de ${detalle?.sinGrupo.length ?? 0}` : ''}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Escala del grupo: acá se aplica una paritaria */}
      <InfoModal
        isOpen={creandoGrupo || !!grupoEnEdicion}
        onClose={cerrarEscala}
        title={creandoGrupo ? 'Nuevo grupo salarial' : `Escala del grupo ${grupoEnEdicion?.numero ?? ''}`}
        subtitle={creandoGrupo ? `Convenio ${convenioSel}` : `Convenio ${convenioSel} · alcanza a ${grupoEnEdicion?.categorias.length ?? 0} categoría(s)`}
        size="lg"
        actions={[
          { label: creandoGrupo ? 'Crear' : 'Guardar escala', onClick: guardarEscala, variant: 'primary' },
          { label: 'Cancelar', onClick: cerrarEscala, variant: 'ghost' },
        ]}
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            La escala es del <strong>grupo</strong>, no de cada categoría: lo que se guarde acá vale para todas las categorías que cuelgan de él. Es lo que reemplazó a &laquo;Actualizar por Categoría&raquo;, que existía solo para no tener que editar las mismas cifras fila por fila.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nº de grupo *</label>
              <input type="number" value={numeroGrupo} onChange={(e) => setNumeroGrupo(e.target.value)} className="input-field" placeholder="Ej: 1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre del grupo</label>
              <input type="text" value={formEscala.nombre} onChange={(e) => setFormEscala((p) => ({ ...p, nombre: e.target.value }))} className="input-field" placeholder="Opcional, si el convenio le da uno" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Básico</label>
              <input type="number" step="0.01" value={formEscala.sueldoBasico} onChange={(e) => setFormEscala((p) => ({ ...p, sueldoBasico: e.target.value }))} className="input-field" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Adicional</label>
              <input type="number" step="0.01" value={formEscala.sueldoAdicional} onChange={(e) => setFormEscala((p) => ({ ...p, sueldoAdicional: e.target.value }))} className="input-field" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Presentismo</label>
              <input type="number" step="0.01" value={formEscala.presentismo} onChange={(e) => setFormEscala((p) => ({ ...p, presentismo: e.target.value }))} className="input-field" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Bruto</label>
              {/* Es el que viaja al TXT como retribución: en 0, ARCA rechaza el alta. */}
              <input type="number" step="0.01" value={formEscala.sueldoBruto} onChange={(e) => setFormEscala((p) => ({ ...p, sueldoBruto: e.target.value }))} className="input-field" placeholder="0.00" />
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Es la retribución que viaja al TXT de alta. En 0, el alta no se puede generar.</p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sueldo Bruto en letras</label>
              <input type="text" value={formEscala.sueldoBrutoLetras} onChange={(e) => setFormEscala((p) => ({ ...p, sueldoBrutoLetras: e.target.value }))} className="input-field" placeholder="Ej: DOS MILLONES CIENTO VEINTIDÓS MIL..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Neto</label>
              <input type="number" step="0.01" value={formEscala.neto} onChange={(e) => setFormEscala((p) => ({ ...p, neto: e.target.value }))} className="input-field" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha de la escala</label>
              <input type="date" value={formEscala.fechaActualizacion} onChange={(e) => setFormEscala((p) => ({ ...p, fechaActualizacion: e.target.value }))} className="input-field" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Neto en letras</label>
              <input type="text" value={formEscala.sueldoNetoLetras} onChange={(e) => setFormEscala((p) => ({ ...p, sueldoNetoLetras: e.target.value }))} className="input-field" placeholder="Ej: UN MILLÓN SETECIENTOS DIECIOCHO MIL..." />
            </div>
          </div>
        </div>
      </InfoModal>

      {modalCategoria()}

      {/* ── Carga masiva de paritarias */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faFileExcel} className="text-green-600 dark:text-green-400 h-5 w-5" />
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">Aplicar una paritaria</h3>
              </div>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700">
                <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={importar} className="p-5 space-y-4">
              <div className="text-sm text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                <p className="font-semibold mb-1">Cómo funciona:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Bajá la plantilla: sale con los grupos reales del convenio y su escala vigente.</li>
                  <li>
                    Pisá los importes con los de la paritaria. Las columnas <strong>convenio</strong> y <strong>grupo</strong> identifican cada fila: no las toques.
                  </li>
                  <li>Subí el archivo. Se actualizan solo escalas: no se crean ni se borran grupos ni categorías.</li>
                </ol>
                <p className="text-xs mt-2 text-gray-500 dark:text-gray-400">La columna de convenio es obligatoria. Sin ella, un &laquo;grupo 7&raquo; podría ser el de cualquier CCT.</p>
              </div>

              <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900/20 hover:border-blue-500 dark:hover:border-blue-500 transition-all cursor-pointer relative group">
                <input type="file" accept=".xlsx, .xls" required onChange={(e) => { if (e.target.files?.length) { setImportFile(e.target.files[0]); setImportErrors([]); } }} className="absolute inset-0 opacity-0 cursor-pointer" />
                <FontAwesomeIcon icon={faFileExcel} className="h-10 w-10 text-green-500 dark:text-green-400 mb-3 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{importFile ? importFile.name : 'Selecciona o arrastra tu archivo Excel'}</span>
                <span className="text-xs text-gray-500 mt-1">Soporta .xlsx y .xls</span>
              </div>

              {importErrors.length > 0 && (
                <div className="max-h-40 overflow-y-auto bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 rounded-lg text-xs text-red-600 dark:text-red-400 space-y-1">
                  <p className="font-bold mb-1">Se encontraron los siguientes errores:</p>
                  {importErrors.map((err, idx) => (
                    <p key={idx}>{err}</p>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowImport(false)} className="flex-1 rounded-lg h-10 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={importing || !importFile} className="flex-1 rounded-lg h-10 bg-green-600 hover:bg-green-700 text-white font-semibold shadow-md shadow-green-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100">
                  {importing ? 'Aplicando...' : 'Aplicar paritaria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  /** El alta/edición de categoría se usa desde los dos niveles (el banner de huérfanas y la grilla). */
  function modalCategoria() {
    const convenioForm = formCategoria.convenio.trim();
    const opcionesConvenio = (() => {
      /**
       * Primero los REGISTRADOS por alguna empleadora, tengan o no categorías.
       *
       * Antes iban primero "los que ya tienen categorías", que es el criterio equivocado para el caso
       * que este modal resuelve: "Actor" hay que mudarla a un CCT de actores, y esos son justamente
       * los que no tienen ninguna categoría cargada. El primer grupo del combo mostraba entonces todo
       * menos el destino correcto, y los 2.669 del catálogo quedaban abajo, mezclados.
       *
       * ARCA solo acepta categorías de los convenios que el CUIT registró: elegir uno no registrado
       * produce un alta rechazada, así que ese es el corte que importa.
       */
      const registrados = convenios.filter((c) => c.registrado).map((c) => ({ codigo: c.convenio, nombre: c.nombre, categorias: c.categorias }));
      const yaListados = new Set(registrados.map((c) => c.codigo));
      const resto = catalogoConvenios
        .map((c) => ({ codigo: String(c.externalId || '').trim(), nombre: c.name }))
        .filter((c) => c.codigo && !yaListados.has(c.codigo))
        .sort((a, b) => a.codigo.localeCompare(b.codigo));
      return { registrados, resto };
    })();

    /** El convenio elegido está registrado pero sin categorías: importarlas es mejor que sumar una suelta. */
    const elegidoVacio = opcionesConvenio.registrados.find((c) => c.codigo === convenioForm && c.categorias === 0);

    return (
      <InfoModal
        isOpen={showCategoria}
        onClose={() => setShowCategoria(false)}
        title={categoriaEnEdicion ? 'Editar categoría' : 'Nueva categoría'}
        subtitle="El código y el nombre son de la categoría. Los importes los hereda del grupo."
        size="lg"
        actions={[
          { label: categoriaEnEdicion ? 'Guardar' : 'Crear', onClick: guardarCategoria, variant: 'primary' },
          { label: 'Cancelar', onClick: () => setShowCategoria(false), variant: 'ghost' },
        ]}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categoriaEnEdicion && categoriaEnEdicion.contratos > 0 && (
            <div className="md:col-span-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <FontAwesomeIcon icon={faArrowRightArrowLeft} className="h-3 w-3 mr-1.5" />
              <strong>{categoriaEnEdicion.contratos} contrato(s)</strong> usan esta categoría. Lo que se guarde acá es lo que van a mandar al TXT de ARCA.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Convenio (CCT) *</label>
            <select
              value={convenioForm}
              onChange={(e) => {
                const nuevo = e.target.value;
                // Cambiar de convenio invalida el grupo: el grupo 7 de un CCT no es el 7 de otro.
                setFormCategoria((p) => ({ ...p, convenio: nuevo, numeroGrupo: '' }));
                cargarGruposPara(nuevo);
              }}
              className="input-field w-full"
            >
              <option value="">— Elegir convenio —</option>
              {opcionesConvenio.registrados.length > 0 && (
                <optgroup label="Registrados ante ARCA por alguna empleadora">
                  {opcionesConvenio.registrados.map((c) => (
                    <option key={c.codigo} value={c.codigo}>
                      {c.codigo} — {c.nombre || 'sin descripción'}
                      {c.categorias === 0 ? ' · sin categorías cargadas' : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {opcionesConvenio.resto.length > 0 && (
                <optgroup label="Resto del catálogo de ARCA (ninguna empleadora los registró)">
                  {opcionesConvenio.resto.map((c) => (
                    <option key={c.codigo} value={c.codigo}>
                      {c.codigo} — {c.nombre}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">No viaja al TXT: ARCA lo infiere del código de categoría. Se usa para verificar que la empleadora tenga ese convenio habilitado.</p>
            {/*
             * El convenio destino no tiene categorías: crear una suelta a mano deja el convenio con
             * UNA categoría inventada y las 4 (o 219) reales sin cargar — que es exactamente cómo
             * nació "Actor". El camino correcto es traerlas del nomenclador.
             */}
            {elegidoVacio && (
              <div className="mt-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-2.5">
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  <strong>{elegidoVacio.codigo}</strong> no tiene ninguna categoría cargada. Sus categorías reales están en el nomenclador de ARCA: importalas en vez de crear una suelta, o vas a terminar con
                  una categoría inventada y las del convenio sin cargar.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowCategoria(false);
                    setConvenioSel(elegidoVacio.codigo);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-amber-400 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                >
                  <FontAwesomeIcon icon={faUpload} className="h-2.5 w-2.5" />
                  Ir a importar las categorías de {elegidoVacio.codigo}
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Grupo salarial</label>
            <select value={formCategoria.numeroGrupo} onChange={(e) => setFormCategoria((p) => ({ ...p, numeroGrupo: e.target.value }))} className="input-field w-full" disabled={!convenioForm}>
              {/*
                «Sin grupo» es una opción válida, no la ausencia de una elección: ARCA no publica
                grupo en todos los convenios. Exigirlo fue lo que llevó a inventar un grupo por
                categoría en los convenios de actores, y a tomar «1ª CATEGORIA» —que es la categoría
                de la emisora— como si fuera una escala en 0131/75.
              */}
              <option value="">{convenioForm ? 'Sin grupo — la escala se carga acá abajo' : 'Elegí primero el convenio'}</option>
              {gruposDelConvenioForm.map((g) => (
                <option key={g._id} value={g.numero}>
                  Grupo {g.numero}
                  {g.nombre ? ` — ${g.nombre}` : ''} · bruto {formatCurrency(g.sueldoBruto)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              {formCategoria.numeroGrupo ? 'De acá salen el básico, el bruto, el presentismo y el neto: la categoría los hereda y sigue sus paritarias.' : 'Sin grupo, la escala es propia de esta categoría y se carga abajo.'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Código de ARCA *</label>
            <input
              type="text"
              inputMode="numeric"
              value={formCategoria.codigoArca}
              onChange={(e) => setFormCategoria((p) => ({ ...p, codigoArca: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
              onBlur={(e) => setFormCategoria((p) => ({ ...p, codigoArca: e.target.value ? aCodigoArca(e.target.value) : '' }))}
              className={`input-field font-mono ${formCategoria.codigoArca && !esCodigoValido(aCodigoArca(formCategoria.codigoArca)) ? 'border-red-400 dark:border-red-600' : ''}`}
              placeholder="035283"
            />
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">6 dígitos, con los ceros a la izquierda, tal como lo escribe ARCA.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
            <input type="text" value={formCategoria.nombre} onChange={(e) => setFormCategoria((p) => ({ ...p, nombre: e.target.value }))} className="input-field" placeholder="Ej: Director de Programas" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción de ARCA</label>
            <input type="text" value={formCategoria.descripcionArca} onChange={(e) => setFormCategoria((p) => ({ ...p, descripcionArca: e.target.value }))} className="input-field" placeholder="Tal como viene del organismo, ej: DIRECTOR DE PROGRAMAS - GRUPO 1" />
          </div>

          {/*
            LA ESCALA PROPIA SOLO APARECE SIN GRUPO, y no es una decisión estética.

            Con grupo, estos campos no se muestran ni se mandan: cargar un importe acá lo grabaría
            como propio y la categoría dejaría de seguir al grupo — la próxima paritaria se aplicaría
            al grupo y esta categoría se quedaría con el número viejo, sin que nada lo diga. Es la
            razón por la que el formulario se precarga desde `escalaPropia` y nunca desde los
            importes resueltos, que para una categoría con grupo son los del grupo.
          */}
          {!formCategoria.numeroGrupo && (
            <div className="md:col-span-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
              <div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Escala salarial de esta categoría</span>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Sin bruto, la retribución del TXT queda en 0 y ARCA rechaza el alta.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Sueldo básico</label>
                  <input type="number" value={formEscalaCat.sueldoBasico} onChange={(e) => setFormEscalaCat((p) => ({ ...p, sueldoBasico: e.target.value }))} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Adicional</label>
                  <input type="number" value={formEscalaCat.sueldoAdicional} onChange={(e) => setFormEscalaCat((p) => ({ ...p, sueldoAdicional: e.target.value }))} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Presentismo</label>
                  <input type="number" value={formEscalaCat.presentismo} onChange={(e) => setFormEscalaCat((p) => ({ ...p, presentismo: e.target.value }))} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Sueldo bruto</label>
                  <input type="number" value={formEscalaCat.sueldoBruto} onChange={(e) => setFormEscalaCat((p) => ({ ...p, sueldoBruto: e.target.value }))} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Neto</label>
                  <input type="number" value={formEscalaCat.neto} onChange={(e) => setFormEscalaCat((p) => ({ ...p, neto: e.target.value }))} className="input-field" placeholder="0" />
                </div>
                <div>
                  {/* La fecha es la de VIGENCIA de la paritaria, no la de carga: es lo que permite
                      saber si la escala está vencida. */}
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Vigencia de la escala</label>
                  <input type="date" value={formEscalaCat.fechaActualizacion} onChange={(e) => setFormEscalaCat((p) => ({ ...p, fechaActualizacion: e.target.value }))} className="input-field" />
                </div>
              </div>
            </div>
          )}

          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={formCategoria.isActive} onChange={(e) => setFormCategoria((p) => ({ ...p, isActive: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Se puede elegir al cargar un contrato nuevo</span>
            </label>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Desmarcado, sigue resolviendo el sueldo y el código de los contratos que ya la usan, pero deja de ofrecerse.</p>
          </div>
        </div>
      </InfoModal>
    );
  }
};

export default CategoriasArcaTab;
