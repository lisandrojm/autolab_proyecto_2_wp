import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchAndFilters } from '../ui/SearchAndFilters';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { InfoModal } from '../ui/InfoModal';
import { sweetAlert } from '../../utils/sweetAlert';
import { BloqueEstado } from '../ui/BloqueEstado';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTrash, faFileContract, faGrip, faTable, faFileInvoiceDollar, faInfinity, faFileSignature, faCircleInfo, faFilePdf, faArrowUpRightFromSquare, faTriangleExclamation, faUserShield } from '@fortawesome/free-solid-svg-icons';
import { contratosAPI, ContratoItem } from '../../api/contratos';
import { contratoFrameAPI, ContratoFrameItem } from '../../api/contratosFrame';
import { infoAPI, InfoItem } from '../../api/info';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { SelectorCodigoArca } from '../arca/SelectorCodigoArca';
import { MODALIDADES_OFRECIDAS } from './afipCompleteness';
import { EstadoBadge, EstadoSecundarioBadge } from '../EstadoSelect';
import { estadoImpositivoElegido, estadoGeneraAltaTemprana, conImpositivoGarantizado } from './altaTemprana';

// Nomencladores de ARCA de los que salen los tres códigos. Se leen enteros (153 / 293 / 8 / 2): son
// chicos y se cargan una vez al abrir la pestaña.
const modalidadesContratoApi = createSimpleCatalogApi('/arca/modalidades-contratacion');
const tiposServicioApi = createSimpleCatalogApi('/arca/tipos-servicio');
const modalidadesLiqApi = createSimpleCatalogApi('/arca/modalidades-liquidacion');
const gruposTipoServicioApi = createSimpleCatalogApi('/arca/grupos-tipo-servicio');

/** Los códigos van con ceros a la izquierda: es lo que espera el TXT. */
const padN = (n: number) => (raw: string): string => {
  const d = String(raw || '').replace(/\D/g, '');
  return d ? d.padStart(n, '0').slice(-n) : '';
};
const pad3 = padN(3);
const pad1 = padN(1);

const normalizar = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

interface FormState {
  name: string;
  cantidadJornadas: string;
  multiplicadorDiario: string;
  esTiempoIndeterminado: boolean;
  requiereFirma: boolean;
  isActive: boolean;
  /** Estados (no globales) que van a quedar vinculados a TODAS las Plantillas de este Contrato. */
  estadoIds: string[];
  /** Códigos ARCA para el TXT de Alta masiva (específicos de convenio/modalidad de este contrato). */
  afipModalidadContrato: string;
  afipTipoServicio: string;
  afipModalidadLiquidacion: string;
  generaAlta: boolean;
}

const FORM_VACIO: FormState = { name: '', cantidadJornadas: '', multiplicadorDiario: '', esTiempoIndeterminado: false, requiereFirma: true, isActive: true, estadoIds: [], afipModalidadContrato: '', afipTipoServicio: '', afipModalidadLiquidacion: '', generaAlta: true };

const BadgeTiempoIndeterminado: React.FC = () => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
    <FontAwesomeIcon icon={faInfinity} className="h-2.5 w-2.5" />
    Tiempo indeterminado
  </span>
);

const BadgeFirma: React.FC<{ activo: boolean }> = ({ activo }) => (
  <span
    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
      activo
        ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-100 dark:border-green-800'
        : 'bg-gray-50 text-gray-500 dark:bg-gray-700/30 dark:text-gray-400 border-gray-200 dark:border-gray-700'
    }`}
  >
    <FontAwesomeIcon icon={faFileSignature} className="h-2.5 w-2.5" />
    {activo ? 'Se envía a firmar' : 'No se envía a firmar'}
  </span>
);

/**
 * Ir a «Plantillas | Contratos». UN botón, no dos.
 *
 * Las dos secciones del tab Sistema —Plantillas asignadas y Estados— dicen lo mismo cuando el
 * contrato no tiene plantilla, y cada una traía su propio enlace al mismo lugar: dos invitaciones
 * a hacer exactamente el mismo click, una debajo de la otra. Ahora el botón se dibuja una sola vez,
 * en la sección que lo origina, y la de Estados solo explica por qué está vacía.
 *
 * Botón y no enlace de texto: es la única acción de esa pantalla vacía, y un enlace embebido en un
 * párrafo de 11px no se lee como algo que se puede tocar.
 */
const BotonIrAPlantillas: React.FC = () => (
  <Link
    to="/contratos-frame"
    target="_blank"
    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800/60 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
  >
    <FontAwesomeIcon icon={faFilePdf} className="h-3 w-3" />
    Plantillas | Contratos
    <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
  </Link>
);

/** Chip con link a una Plantilla ("Plantillas | Contratos"): abre su editor en una pestaña nueva. */
const PlantillaChip: React.FC<{ plantilla: ContratoFrameItem; className?: string }> = ({ plantilla, className = '' }) => (
  <Link
    to={`/contratos-frame?edit=${plantilla._id}`}
    target="_blank"
    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border border-violet-100 dark:border-violet-800/50 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors ${className}`}
    title="Abrir la plantilla en Plantillas | Contratos"
  >
    <FontAwesomeIcon icon={faFilePdf} className="h-2.5 w-2.5" />
    {plantilla.name}
  </Link>
);

/** Botón de acción del footer de una tarjeta: mismo color/hover/tooltip que usa Clientes (Card.tsx, variant "default"). */
const CardFooterAction: React.FC<{ icon: typeof faEdit; title: string; onClick: () => void }> = ({ icon, title, onClick }) => (
  <div className="relative group/action flex items-center">
    <button onClick={onClick} className="p-1 rounded transition-colors hover:text-gray-800 dark:hover:text-gray-300 text-gray-600 dark:text-gray-400">
      <FontAwesomeIcon icon={icon} className="h-4 w-4" />
    </button>
    <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/action:opacity-100 dark:bg-gray-700">
      {title}
    </span>
  </div>
);

/** Lo que la página puede pedirle a esta pestaña: el [+] de «Nuevo contrato» vive en el encabezado. */
export type ContractTypesTabHandle = { abrirCrear: () => void };

export const ContractTypesTab = forwardRef<ContractTypesTabHandle>((_props, ref) => {
  const [contratos, setContratos] = useState<ContratoItem[]>([]);
  const [plantillas, setPlantillas] = useState<ContratoFrameItem[]>([]);
  const [estados, setEstados] = useState<InfoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showFirmaInfo, setShowFirmaInfo] = useState(false);
  /** Para enfocar el nombre cuando falta: sin pestañas, el error se resuelve en la misma vista. */
  const nombreRef = React.useRef<HTMLInputElement | null>(null);
  const [showTiempoIndetInfo, setShowTiempoIndetInfo] = useState(false);
  const [editando, setEditando] = useState<ContratoItem | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  // Selección de Estados al abrir el modal: para diffear contra `form.estadoIds` al guardar.
  const [estadoIdsOriginal, setEstadoIdsOriginal] = useState<string[]>([]);

  // Vista tarjetas/tabla, como el resto de los ABM: la tabla solo en pantallas grandes.
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) setViewMode('cards');
    };
    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem('contratosAbmViewMode');
      if (saved === 'table' || saved === 'cards') setViewMode(saved);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) localStorage.setItem('contratosAbmViewMode', viewMode);
  }, [viewMode, isLarge]);

  const cargar = async () => {
    try {
      setLoading(true);
      const [tiposDeContrato, listaPlantillas, listaEstados] = await Promise.all([contratosAPI.list(), contratoFrameAPI.list(), infoAPI.listEstados()]);
      setContratos(tiposDeContrato);
      setPlantillas(listaPlantillas);
      setEstados(listaEstados);
    } catch (e) {
      console.error('Error cargando contratos:', e);
      sweetAlert.error('Error', 'No se pudieron cargar los contratos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  /*
   * Los nomencladores de ARCA, para los tres selectores de códigos. Van aparte de `cargar()` a
   * propósito: si ARCA está sin sembrar, la pestaña de Tipos de Contrato tiene que abrir igual. El
   * selector se encarga de decir que su catálogo está vacío y dónde se llena.
   */
  const [modalidadesContrato, setModalidadesContrato] = useState<SimpleCatalogItem[]>([]);

  /*
    ONCE DE 153. Ver `MODALIDADES_OFRECIDAS` para qué queda afuera y por qué.

    Lo ya cargado se sigue ofreciendo aunque no esté en la lista: si un tipo tiene guardada una
    modalidad que hoy no se ofrece, sacarla del desplegable la borraría al primer guardado del
    formulario, en silencio. Se acota lo que se PROPONE, no lo que se puede conservar.
  */
  const modalidadesOfrecidas = useMemo(() => {
    const permitidas = new Set(MODALIDADES_OFRECIDAS);
    const actual = pad3(form.afipModalidadContrato || '');
    return modalidadesContrato.filter((m) => permitidas.has(pad3(String(m.externalId || ''))) || (actual && pad3(String(m.externalId || '')) === actual));
  }, [modalidadesContrato, form.afipModalidadContrato]);
  const [tiposServicio, setTiposServicio] = useState<SimpleCatalogItem[]>([]);
  const [modalidadesLiq, setModalidadesLiq] = useState<SimpleCatalogItem[]>([]);
  const [gruposTipoServicio, setGruposTipoServicio] = useState<SimpleCatalogItem[]>([]);
  const [cargandoArca, setCargandoArca] = useState(true);

  useEffect(() => {
    const vacio = () => [] as SimpleCatalogItem[];
    Promise.all([modalidadesContratoApi.list().catch(vacio), tiposServicioApi.list().catch(vacio), modalidadesLiqApi.list().catch(vacio), gruposTipoServicioApi.list().catch(vacio)])
      .then(([mc, ts, ml, gts]) => {
        setModalidadesContrato(mc);
        setTiposServicio(ts);
        setModalidadesLiq(ml);
        setGruposTipoServicio(gts);
      })
      .finally(() => setCargandoArca(false));
  }, []);

  /**
   * Grupo de tipo de servicio: filtra el selector de abajo y NO se guarda.
   *
   * No es un campo del tipo de contrato — no viaja en el TXT y no aporta nada que el tipo de servicio
   * no diga ya. Al reabrir el formulario se DEDUCE del tipo de servicio guardado, que es de dónde
   * salió. Guardarlo sería inventar un dato que puede quedar contradiciendo al código.
   */
  const [grupoTipoServicio, setGrupoTipoServicio] = useState('');

  /**
   * EL VALOR DERIVADO QUE REEMPLAZÓ AL SWITCH.
   *
   * Antes esto era `form.generaAlta`, editable, y podía contradecir al estado impositivo elegido.
   * Ahora sale de una sola expresión compartida (`altaTemprana.ts`), la misma que usa el TXT.
   */
  const estadoImpositivo = useMemo(() => estadoImpositivoElegido(estados, form.estadoIds), [estados, form.estadoIds]);
  const generaAlta = estadoGeneraAltaTemprana(estadoImpositivo);
  /** Hay algo cargado en los códigos: decide si vale la pena avisar que se conservan. */
  const hayCodigosCargados = !!(form.afipModalidadContrato || form.afipTipoServicio || form.afipModalidadLiquidacion);
  /** Cuáles de los cuatro faltan. Vacío = se puede guardar. */
  const codigosFaltantes = useMemo(() => {
    if (!generaAlta) return [] as string[];
    const faltan: string[] = [];
    if (!form.afipModalidadContrato) faltan.push('afipModalidadContrato');
    if (!grupoTipoServicio) faltan.push('grupoTipoServicio');
    if (!form.afipTipoServicio) faltan.push('afipTipoServicio');
    if (!form.afipModalidadLiquidacion) faltan.push('afipModalidadLiquidacion');
    return faltan;
  }, [generaAlta, form.afipModalidadContrato, form.afipTipoServicio, form.afipModalidadLiquidacion, grupoTipoServicio]);
  /**
   * Los errores recién se muestran después del primer intento de guardar.
   *
   * Un formulario que se abre ya en rojo culpa a la persona por no haber empezado. El botón sí
   * queda deshabilitado desde el principio: eso informa sin acusar.
   */
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  /**
   * El error de UN campo, debajo de ese campo.
   *
   * Debajo del campo y no en un toast: un toast dice «faltan códigos» y deja a la persona
   * buscando cuál. Y solo después de intentar guardar, para no abrir el formulario en rojo.
   */
  const errorCodigo = (campo: string) =>
    intentoGuardar && codigosFaltantes.includes(campo) ? (
      <p className="text-[11px] text-red-600 dark:text-red-400 ml-1 mt-1 flex items-start gap-1.5">
        <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5 mt-0.5 shrink-0" />
        Falta este código: sin él no se puede generar el TXT del alta.
      </p>
    ) : null;
  /** Para llevar la vista al bloque cuando aparece, y para enfocar el primer campo que falta. */
  const bloqueArcaRef = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (generaAlta) bloqueArcaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [generaAlta]);

  useEffect(() => {
    if (!showModal) return;
    const ts = tiposServicio.find((t) => pad3(String(t.externalId || '')) === pad3(form.afipTipoServicio));
    setGrupoTipoServicio(String(ts?.grupo || ''));
    // Solo al abrir el modal o al llegar el catálogo: si dependiera del tipo de servicio elegido,
    // cambiar de tipo reescribiría el grupo que el operador acaba de elegir para filtrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, tiposServicio]);

  /**
   * Sin ningún tipo de servicio clasificado, filtrar por grupo deja la lista en cero y parece que el
   * catálogo está roto. Mientras eso pase, el grupo no filtra: solo se avisa.
   */
  const hayGruposCargados = useMemo(() => tiposServicio.some((t) => String(t.grupo || '').trim()), [tiposServicio]);
  const tiposServicioFiltrados = useMemo(() => {
    if (!hayGruposCargados || !grupoTipoServicio) return tiposServicio;
    return tiposServicio.filter((t) => String(t.grupo || '') === grupoTipoServicio);
  }, [tiposServicio, grupoTipoServicio, hayGruposCargados]);

  const filtrados = useMemo(() => {
    const q = normalizar(searchTerm);
    if (!q) return contratos;
    return contratos.filter((c) => normalizar(c.name).includes(q));
  }, [contratos, searchTerm]);

  // Cuántas Plantillas ("Plantillas | Contratos") tiene asignadas cada Contrato.
  const plantillasPorContrato = useMemo(() => {
    const conteo = new Map<string, number>();
    plantillas.forEach((p) => {
      const id = typeof p.contratoId === 'object' ? p.contratoId?._id : p.contratoId;
      if (id) conteo.set(id, (conteo.get(id) || 0) + 1);
    });
    return conteo;
  }, [plantillas]);

  /**
   * Estados (Configuración → Estados) que aplican a cada Contrato: los Estados no se vinculan al
   * Contrato directamente sino a sus Plantillas, así que se resuelve por ahí. Un Estado sin ningún
   * tipo de contrato marcado se ofrece para todos, así que aplica igual.
   */
  const estadosPorContrato = useMemo(() => {
    const plantillaIdsPorContrato = new Map<string, Set<string>>();
    plantillas.forEach((p) => {
      const contratoId = typeof p.contratoId === 'object' ? p.contratoId?._id : p.contratoId;
      if (!contratoId) return;
      if (!plantillaIdsPorContrato.has(contratoId)) plantillaIdsPorContrato.set(contratoId, new Set());
      plantillaIdsPorContrato.get(contratoId)!.add(p._id);
    });

    const mapa = new Map<string, InfoItem[]>();
    contratos.forEach((c) => {
      const misPlantillas = plantillaIdsPorContrato.get(c._id) || new Set<string>();
      const aplican = estados.filter((e) => {
        const vinculados: string[] = e.data?.contratoFrameIds || [];
        if (vinculados.length === 0) return true; // sin ninguno marcado = aplica a todos
        return vinculados.some((id) => misPlantillas.has(String(id)));
      });
      mapa.set(c._id, aplican);
    });
    return mapa;
  }, [contratos, plantillas, estados]);

  // Tipos de contrato que no tienen ningún Estado aplicable (ni propio ni global): hay que avisarlo.
  const contratosSinEstado = useMemo(() => contratos.filter((c) => (estadosPorContrato.get(c._id) || []).length === 0), [contratos, estadosPorContrato]);

  /** Plantillas ("Plantillas | Contratos") que ya tiene asignadas un Contrato (vacío si todavía no tiene ninguna). */
  const plantillasDe = (contratoId: string): ContratoFrameItem[] => plantillas.filter((p) => (typeof p.contratoId === 'object' ? p.contratoId?._id : p.contratoId) === contratoId);

  /**
   * Los códigos ARCA que tiene cargados un tipo de contrato, resueltos contra sus catálogos.
   *
   * Se compara con `pad3` porque el código se guarda como lo dejó el formulario ("2" o "002") y en el
   * catálogo vive con ceros a la izquierda: sin normalizar, un código perfectamente cargado aparecería
   * sin nombre. Es la misma normalización que ya usan los pickers del modal.
   *
   * Un código cargado que no resuelve a ningún nombre SE MUESTRA IGUAL, con su etiqueta: significa
   * que el catálogo no lo tiene —cambió o no se sembró— y esconderlo dejaría al TXT llevando un
   * código que en pantalla no existe.
   */
  const codigosArcaDe = (contrato: ContratoItem): Array<{ campo: string; etiqueta: string; codigo: string; nombre: string }> => {
    const buscar = (catalogo: SimpleCatalogItem[], crudo: unknown) => {
      const codigo = String(crudo ?? '').trim();
      if (!codigo) return null;
      return { codigo: pad3(codigo), nombre: catalogo.find((c) => pad3(String(c.externalId || '')) === pad3(codigo))?.name || '' };
    };
    return [
      { campo: 'modalidadContrato', etiqueta: 'Modalidad de contrato', ...buscar(modalidadesContrato, contrato.data?.afipModalidadContrato) },
      { campo: 'tipoServicio', etiqueta: 'Tipo de servicio', ...buscar(tiposServicio, contrato.data?.afipTipoServicio) },
      { campo: 'modalidadLiquidacion', etiqueta: 'Modalidad de liquidación', ...buscar(modalidadesLiq, contrato.data?.afipModalidadLiquidacion) },
    ].filter((c): c is { campo: string; etiqueta: string; codigo: string; nombre: string } => 'codigo' in c);
  };

  /** Ids de las Plantillas que ya tiene asignadas un Contrato (vacío si todavía no tiene ninguna). */
  const plantillaIdsDe = (contratoId: string): string[] => plantillasDe(contratoId).map((p) => String(p._id));

  /** Estados (no globales) que ya aplican a alguna de las Plantillas de ese Contrato. */
  const estadoIdsDe = (contratoId: string): string[] => {
    const misPlantillas = plantillaIdsDe(contratoId);
    return estados.filter((e) => (e.data?.contratoFrameIds || []).some((id: string) => misPlantillas.includes(String(id)))).map((e) => e._id);
  };

  const abrirCrear = () => {
    setEditando(null);
    // Un contrato nuevo arranca declarando alta temprana: es el caso que pide códigos, y arrancar
    // por el que no pide nada dejaría pasar sin fricción justo al que sí la necesita.
    setForm({ ...FORM_VACIO, estadoIds: conImpositivoGarantizado(estados, []) });
    setEstadoIdsOriginal([]);
    setShowModal(true);
  };

  /*
    Declarado después de `abrirCrear` a propósito: adentro del callback sería una referencia en TDZ.

    Las deps NO pueden quedar vacías: con `[]` el handle congela la versión de `abrirCrear` del primer
    render, cuando `estados` todavía está vacío — y el estado impositivo por defecto no se
    preseleccionaría nunca al crear desde el [+] del encabezado.
  */
  useImperativeHandle(ref, () => ({ abrirCrear }), [estados]);

  const abrirEditar = (contrato: ContratoItem) => {
    const seleccionActual = estadoIdsDe(contrato._id);
    setEditando(contrato);
    setForm({
      name: contrato.name,
      cantidadJornadas: String(contrato.data?.cantidadJornadas ?? ''),
      multiplicadorDiario: String(contrato.data?.multiplicadorDiario ?? ''),
      esTiempoIndeterminado: !!contrato.data?.esTiempoIndeterminado,
      requiereFirma: contrato.data?.requiereFirma !== false,
      isActive: contrato.isActive !== false,
      // Si el contrato no tenía ninguno —quedaron así los de antes de esta regla— se muestra el
      // default elegido, a la vista y editable, en vez de dejar el formulario a medio llenar.
      estadoIds: conImpositivoGarantizado(estados, seleccionActual),
      afipModalidadContrato: contrato.data?.afipModalidadContrato || '',
      afipTipoServicio: contrato.data?.afipTipoServicio || '',
      afipModalidadLiquidacion: contrato.data?.afipModalidadLiquidacion || '',
      generaAlta: contrato.data?.generaAlta !== false,
    });
    setEstadoIdsOriginal(seleccionActual);
    setShowModal(true);
  };

  const toggleEstado = (id: string) => {
    setForm((prev) => ({
      ...prev,
      estadoIds: prev.estadoIds.includes(id) ? prev.estadoIds.filter((x) => x !== id) : [...prev.estadoIds, id],
    }));
  };

  /** Los Estados impositivos son mutuamente excluyentes: tildar uno destilda cualquier otro. */
  /**
   * Elegir el estado impositivo. SIEMPRE hay uno: es un radio, no una tilde.
   *
   * Antes se podía destildar y quedarse sin ninguno, y eso no es un estado válido del mundo: todo
   * tipo de contrato declara uno de los dos —si no es un alta temprana, es una locación de
   * servicios—. Sin ninguno, el TXT no sabía si ese contrato se declara, y la pantalla lo mostraba
   * igual que a uno recién creado.
   *
   * Volver a hacer click en el que ya está elegido no lo apaga: cambiar de trámite es elegir EL OTRO.
   */
  const elegirEstadoImpositivo = (id: string) => {
    setForm((prev) => {
      const impositivoIds = new Set(estados.filter((e) => e.data?.esImpositivo).map((e) => e._id));
      const sinImpositivos = prev.estadoIds.filter((x) => !impositivoIds.has(x));
      return { ...prev, estadoIds: [...sinImpositivos, id] };
    });
  };

  /**
   * Aplica la selección de Estados del modal a TODAS las Plantillas del Contrato: tildar un Estado
   * lo vincula a todas, destildarlo lo desvincula de todas (así lo pidió el usuario). Los Estados
   * globales (sin ningún tipo marcado) no se tocan: no hay forma de "restringirlos" desde acá.
   */
  const sincronizarEstados = async (contratoId: string) => {
    const misPlantillas = plantillaIdsDe(contratoId);
    if (misPlantillas.length === 0) return;

    const antes = new Set(estadoIdsOriginal);
    const despues = new Set(form.estadoIds);
    const cambiaron = estados.filter((e) => (e.data?.contratoFrameIds || []).length > 0 && antes.has(e._id) !== despues.has(e._id));

    for (const estado of cambiaron) {
      const nuevosIds = new Set((estado.data?.contratoFrameIds || []).map(String));
      if (despues.has(estado._id)) {
        misPlantillas.forEach((id) => nuevosIds.add(id));
      } else {
        misPlantillas.forEach((id) => nuevosIds.delete(id));
      }
      try {
        /*
          SE REENVÍA EL ESTADO COMPLETO, cambiando SOLO `contratoFrameIds`.

          Antes se armaba a mano una lista corta de campos y faltaba `tipoImpositivo`. El PATCH valida
          que todo estado impositivo declare su trámite, así que devolvía 400 y NINGÚN estado
          impositivo se podía vincular desde acá — los no impositivos sí, porque no pasan por esa
          validación. El síntoma era exactamente «no se guardan los estados impositivos».

          Cherry-pickear campos obliga a acordarse de cada requisito que el backend agregue. Copiar lo
          que el estado YA tiene y tocar solo lo que se está cambiando no tiene esa deuda.
        */
        await infoAPI.updateEstado(estado._id, {
          name: estado.name,
          color: estado.data?.color,
          esImpositivo: estado.data?.esImpositivo,
          etiquetaSecundaria: estado.data?.etiquetaSecundaria,
          colorEtiquetaSecundaria: estado.data?.colorEtiquetaSecundaria,
          tipoImpositivo: estado.data?.tipoImpositivo,
          aceptaSinCuit: estado.data?.aceptaSinCuit,
          // `transicionAutomatica` NO se manda: omitirla es lo que le dice al backend que la preserve.
          // Mandarla reconstruida desde acá arriesgaría pisar las carpetas vigiladas del estado.
          contratoFrameIds: Array.from(nuevosIds),
        });
      } catch (e: any) {
        sweetAlert.error(`No se pudo vincular "${estado.name}"`, e?.response?.data?.error || 'Intentá editarlo desde la pestaña Estados de Contratos.');
      }
    }
  };


  const guardar = async () => {
    setIntentoGuardar(true);
    /*
      Los códigos bloquean SOLO cuando el estado los exige.

      Con un estado que no es de alta temprana, un código a medias no impide nada: no viaja a
      ningún lado. Bloquear ahí sería exigir datos para un trámite que no se va a hacer.
    */
    if (codigosFaltantes.length > 0) {
      // Llevar a la pestaña no alcanza: el bloque puede estar fuera de la vista dentro de su scroll.
      setTimeout(() => bloqueArcaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      return;
    }
    const name = form.name.trim();
    if (!name) {
      // El campo está en la misma vista: alcanza con el aviso y con el foco.
      nombreRef.current?.focus();
      sweetAlert.error('Falta el nombre', 'El contrato necesita un nombre.');
      return;
    }

    const payload = {
      nombre: name,
      cantidadJornadas: form.cantidadJornadas,
      multiplicadorDiario: form.multiplicadorDiario,
      esTiempoIndeterminado: form.esTiempoIndeterminado,
      requiereFirma: form.requiereFirma,
      isActive: form.isActive,
      afipModalidadContrato: form.afipModalidadContrato.trim(),
      afipTipoServicio: form.afipTipoServicio.trim(),
      afipModalidadLiquidacion: form.afipModalidadLiquidacion.trim(),
      /*
        `generaAlta` YA NO SE MANDA desde el formulario.

        Era el switch, y era la segunda fuente de verdad. El valor se deriva del estado impositivo
        elegido (`altaTemprana.ts`), que es lo que ya decide el resto del circuito. El campo sigue
        existiendo en el modelo para los tipos que nunca se vuelvan a editar; el TXT lo lee derivado.
      */
    };

    try {
      setSaving(true);
      if (editando) {
        await contratosAPI.update(editando._id, payload);
        await sincronizarEstados(editando._id);
        sweetAlert.success('Contrato actualizado', 'Los cambios se guardaron con éxito.');
      } else {
        await contratosAPI.create(payload);
        sweetAlert.success('Contrato creado', 'Ya podés asignarle una Plantilla desde Plantillas | Contratos.');
      }
      setShowModal(false);
      await cargar();
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo guardar el contrato.');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (contrato: ContratoItem) => {
    const enUso = plantillasPorContrato.get(contrato._id) || 0;
    if (enUso > 0) {
      sweetAlert.error('No se puede eliminar', `Hay ${enUso} plantilla${enUso === 1 ? '' : 's'} asignada${enUso === 1 ? '' : 's'} a este contrato. Reasignalas o eliminalas primero desde Plantillas | Contratos.`);
      return;
    }
    const result = await sweetAlert.confirm('¿Eliminar contrato?', `Se va a eliminar "${contrato.name}".`);
    if (!result.isConfirmed) return;
    try {
      await contratosAPI.remove(contrato._id);
      sweetAlert.success('Eliminado', 'El contrato fue eliminado.');
      await cargar();
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo eliminar el contrato.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
        <div className="flex-1 w-full">
          <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar contrato..." />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLarge && (
            <div className="flex items-center gap-2">
              <button onClick={() => setViewMode('cards')} title="Vista de tarjetas" className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'cards' ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('table')} title="Vista de tabla" className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'table' ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {!loading && contratos.length > 0 && contratosSinEstado.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {contratosSinEstado.length === 1 ? 'Hay 1 tipo de contrato sin ningún estado asignado.' : `Hay ${contratosSinEstado.length} tipos de contrato sin ningún estado asignado.`}
            </p>
            <p className="text-[12px] text-amber-700 dark:text-amber-400/90 truncate">{contratosSinEstado.map((c) => c.name).join(', ')}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando contratos..." />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState icon={faFileContract} title={searchTerm ? 'Sin resultados' : 'Todavía no hay contratos'} description={searchTerm ? 'Probá con otra búsqueda.' : 'Creá el primer contrato para poder asignarle una Plantilla.'} />
      ) : viewMode === 'table' ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Jornadas</th>
                  <th className="px-4 py-3 font-semibold">Mult. Diario</th>
                  <th className="px-4 py-3 font-semibold">Tiempo Indet.</th>
                  <th className="px-4 py-3 font-semibold">Firma</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Plantillas</th>
                  <th className="px-4 py-3 font-semibold">Estados</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtrados.map((contrato) => {
                  const cantPlantillas = plantillasPorContrato.get(contrato._id) || 0;
                  const misEstados = estadosPorContrato.get(contrato._id) || [];
                  return (
                    <tr key={contrato._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100">{contrato.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{contrato.data?.cantidadJornadas ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{contrato.data?.multiplicadorDiario ?? '—'}</td>
                      <td className="px-4 py-3">{contrato.data?.esTiempoIndeterminado ? <BadgeTiempoIndeterminado /> : <span className="text-xs text-gray-400">—</span>}</td>
                      <td className="px-4 py-3">
                        <BadgeFirma activo={contrato.data?.requiereFirma !== false} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${contrato.isActive === false ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                          {contrato.isActive === false ? 'Inactivo' : 'Activo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {cantPlantillas === 0 ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {plantillasDe(contrato._id).map((p) => (
                              <PlantillaChip key={p._id} plantilla={p} />
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {misEstados.length === 0 ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 whitespace-nowrap" title="Este tipo de contrato no tiene ningún estado asignado">
                            <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />
                            Sin estados
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {misEstados.map((e) => (
                              <React.Fragment key={e._id}>
                                <EstadoBadge name={e.name} className="text-[10px]" />
                                {e.data?.esImpositivo && <EstadoSecundarioBadge estado={e} className="text-[10px]" />}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <CardFooterAction icon={faEdit} title="Editar contrato" onClick={() => abrirEditar(contrato)} />
                          <CardFooterAction icon={faTrash} title="Eliminar contrato" onClick={() => eliminar(contrato)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtrados.map((contrato) => {
            const cantPlantillas = plantillasPorContrato.get(contrato._id) || 0;
            const codigosArca = codigosArcaDe(contrato);
            const misEstados = estadosPorContrato.get(contrato._id) || [];
            return (
              <div key={contrato._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className={`inline-flex items-center w-fit px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${contrato.isActive === false ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                    {contrato.isActive === false ? 'Inactivo' : 'Activo'}
                  </span>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{contrato.name}</span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                  <span>
                    <strong>{contrato.data?.cantidadJornadas ?? 0}</strong> jornadas
                  </span>
                  <span>
                    Multiplicador <strong>{contrato.data?.multiplicadorDiario ?? 0}</strong>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {contrato.data?.esTiempoIndeterminado && <BadgeTiempoIndeterminado />}
                  <BadgeFirma activo={contrato.data?.requiereFirma !== false} />
                </div>

                {cantPlantillas > 0 && (
                  <div className="flex flex-col gap-1 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Plantillas</label>
                    <div className="flex flex-wrap gap-1">
                      {plantillasDe(contrato._id).map((p) => (
                        <PlantillaChip key={p._id} plantilla={p} />
                      ))}
                    </div>
                  </div>
                )}

                {misEstados.length > 0 ? (
                  <div className="flex flex-col gap-1 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estados</label>
                    <div className="flex flex-wrap gap-1">
                      {misEstados.map((e) => (
                        <React.Fragment key={e._id}>
                          <EstadoBadge name={e.name} className="text-[10px]" />
                          {e.data?.esImpositivo && <EstadoSecundarioBadge estado={e} className="text-[10px]" />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 shrink-0" />
                      Sin estados asignados
                    </div>
                  </div>
                )}

                {/*
                  LOS CÓDIGOS ARCA, como badges y con el mismo peso visual que los estados.

                  Son lo que decide si el TXT de alta temprana se puede generar, y hasta acá no se
                  veían en ninguna parte de la tarjeta: había que abrir el modal de cada tipo para
                  saber si estaban cargados. Se muestran el CÓDIGO y el nombre porque el código es
                  lo que viaja al TXT y el nombre es lo único que alguien reconoce.

                  Si no hay ninguno cargado, no se dibuja la sección: un tipo que no genera alta
                  no los necesita, y una fila vacía se leería como algo que falta.
                */}
                {codigosArca.length > 0 && (
                  <div className="flex flex-col gap-1 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Códigos ARCA</label>
                    <div className="flex flex-wrap gap-1">
                      {codigosArca.map((c) => (
                        <span
                          key={c.campo}
                          title={`${c.etiqueta}: ${c.codigo}${c.nombre ? ` — ${c.nombre}` : ""}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide whitespace-nowrap bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800"
                        >
                          <span className="font-mono">{c.codigo}</span>
                          {/* El nombre se corta, el código no: el código es el dato, el nombre es la ayuda. */}
                          <span className="normal-case font-semibold truncate max-w-[9rem]">{c.nombre || c.etiqueta}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}


                <div className="flex items-center justify-between gap-2 pt-2 mt-auto border-t border-gray-100 dark:border-gray-700/60">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    {cantPlantillas} plantilla{cantPlantillas === 1 ? '' : 's'} asignada{cantPlantillas === 1 ? '' : 's'}
                  </span>
                  <div className="flex items-center gap-1">
                    <CardFooterAction icon={faEdit} title="Editar contrato" onClick={() => abrirEditar(contrato)} />
                    <CardFooterAction icon={faTrash} title="Eliminar contrato" onClick={() => eliminar(contrato)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editando ? 'Editar Contrato' : 'Nuevo Contrato'}
        subtitle={editando ? editando.name : 'Se va a poder asignar a una o varias Plantillas'}
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button onClick={() => setShowModal(false)} className="btn-secondary" disabled={saving}>
              Cancelar
            </button>
              <button
                onClick={guardar}
                className="btn-primary"
                /* Deshabilitado desde el principio, sin esperar a que intente guardar: informa sin acusar. */
                disabled={saving || codigosFaltantes.length > 0}
                title={codigosFaltantes.length > 0 ? `Faltan ${codigosFaltantes.length} código(s) de ARCA: el estado impositivo elegido requiere alta temprana.` : undefined}
              >
                {saving ? 'Guardando...' : editando ? 'Actualizar' : 'Crear'}
              </button>
          </div>
        }
      >
        {/*
          Alto fijo y scroll adentro, aunque ya no haya pestañas.

          El formulario cambia de largo con lo que se elige —el bloque de códigos ARCA aparece y
          desaparece según el estado impositivo—, y sin alto fijo el modal saltaría de tamaño y los
          botones del pie se moverían bajo el cursor.
        */}
        <div className="flex flex-col h-[min(560px,calc(100svh-16rem))]">

          <div className="flex-1 overflow-y-auto pt-5 pr-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1 mb-4 flex items-center gap-2">
            <FontAwesomeIcon icon={faFileContract} className="h-3 w-3" />
            General
          </p>
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Nombre *</label>
              <input ref={nombreRef} className="input-field w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Plazo fijo 5x7" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Cantidad de Jornadas</label>
                <input type="number" className="input-field w-full" value={form.cantidadJornadas} onChange={(e) => setForm((p) => ({ ...p, cantidadJornadas: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Multiplicador Diario</label>
                <input type="number" className="input-field w-full" value={form.multiplicadorDiario} onChange={(e) => setForm((p) => ({ ...p, multiplicadorDiario: e.target.value }))} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.esTiempoIndeterminado} onChange={(e) => setForm((p) => ({ ...p, esTiempoIndeterminado: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                <span className="text-gray-700 dark:text-gray-300">Es tiempo indeterminado</span>
              </label>
              <button type="button" onClick={() => setShowTiempoIndetInfo(true)} className="text-gray-400 hover:text-blue-500 transition-colors" title="¿Qué significa?" aria-label="Información sobre tiempo indeterminado">
                <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.requiereFirma} onChange={(e) => setForm((p) => ({ ...p, requiereFirma: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                <span className="text-gray-700 dark:text-gray-300">Se envía a firmar</span>
              </label>
              <button type="button" onClick={() => setShowFirmaInfo(true)} className="text-gray-400 hover:text-blue-500 transition-colors" title="¿Qué significa?" aria-label="Información sobre envío a firmar">
                <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Códigos ARCA para el TXT de Alta masiva: específicos del convenio/modalidad de este tipo de contrato. */}
          </div>


          {/*
            UN SOLO FORMULARIO, sin pestañas.

            Eran dos pasos para seis campos: obligaban a un click extra para ver la mitad del
            contenido, y a volver atrás para corregir. El separador y el título de sección alcanzan
            para que no se lea como una lista corrida.
          */}
          <div className="pt-5 mt-5 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1 mb-4 flex items-center gap-2">
              <FontAwesomeIcon icon={faUserShield} className="h-3 w-3" />
              Sistema
            </p>
          </div>
          <div className="space-y-5">
            {(() => {
              const misPlantillas = editando ? plantillasDe(editando._id) : [];
              return (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                    Plantilla{misPlantillas.length === 1 ? '' : 's'} asignada{misPlantillas.length === 1 ? '' : 's'}
                    {misPlantillas.length > 0 ? <span className="ml-1.5 normal-case tracking-normal text-gray-500 dark:text-gray-400">({misPlantillas.length})</span> : null}
                  </label>
                  {misPlantillas.length === 0 ? (
                    <div className="space-y-2 ml-1">
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Todavía no tiene ninguna Plantilla asignada: creá una y elegí este Contrato.</p>
                      <BotonIrAPlantillas />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {misPlantillas.map((p) => (
                        <Link
                          key={p._id}
                          to={`/contratos-frame?edit=${p._id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border border-violet-100 dark:border-violet-800/50 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
                          title="Abrir la plantilla en Plantillas | Contratos"
                        >
                          <FontAwesomeIcon icon={faFilePdf} className="h-3 w-3" />
                          {p.name}
                          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {(() => {
              const misPlantillaIds = editando ? plantillaIdsDe(editando._id) : [];
              const estadosImpositivos = estados.filter((e) => e.data?.esImpositivo);
              const estadosRegulares = estados.filter((e) => !e.data?.esImpositivo && (e.data?.contratoFrameIds || []).length > 0);
              const estadosGlobales = estados.filter((e) => (e.data?.contratoFrameIds || []).length === 0);
              const estadosNoGlobales = estadosImpositivos.length + estadosRegulares.length;
              return (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                    Estados
                    {misPlantillaIds.length > 0 ? <span className="ml-1.5 normal-case tracking-normal text-gray-500 dark:text-gray-400">({form.estadoIds.length} de {estadosNoGlobales})</span> : null}
                  </label>
                  {misPlantillaIds.length === 0 ? (
                    /* Sin botón propio: el de arriba ya lleva al mismo lugar. Acá solo se explica */
                    /* por qué esta sección está vacía y qué la va a llenar. */
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">Vas a poder elegir sus Estados una vez que le asignes una Plantilla.</p>
                  ) : (
                    <div className="space-y-3">
                      {estadosImpositivos.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 ml-1 flex items-center gap-1.5">
                            <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" />
                            Estados impositivos — uno de los dos, siempre
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">
                            Todo tipo de contrato declara uno: si no es un alta temprana ante ARCA, es una locación de servicios.
                          </p>
                          <div className="rounded-lg border border-purple-200 dark:border-purple-800/60 divide-y divide-purple-100 dark:divide-purple-800/40 overflow-hidden">
                            {estadosImpositivos.map((estado) => {
                              const checked = form.estadoIds.includes(estado._id);
                              return (
                                <label key={estado._id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors">
                                  <input type="radio" name="estado-impositivo" checked={checked} onChange={() => elegirEstadoImpositivo(estado._id)} className="rounded-full border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer" />
                                  <EstadoBadge name={estado.name} className="text-[10px]" />
                                  <EstadoSecundarioBadge estado={estado} className="text-[10px]" />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/*
                        LOS CÓDIGOS ARCA, revelados por el estado que se acaba de elegir.

                        Estaban en una pestaña ANTERIOR a esta, así que se pedían antes de que nadie
                        hubiera decidido si hacían falta. Acá se leen como lo que son: la consecuencia
                        de haber elegido un estado de alta temprana.
                      */}
                      {generaAlta ? (
                        <div ref={bloqueArcaRef} className="animate-fadeIn">
                          <p className="text-[11px] text-indigo-700 dark:text-indigo-300 ml-1 mb-1.5">
                            El estado «{estadoImpositivo?.name}» requiere alta temprana ante ARCA — completá los códigos para la generación del TXT.
                          </p>
                  <div className="space-y-3 p-3 rounded-lg border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-900/10">
                    <div className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-3.5 w-3.5 text-indigo-500" />
                      <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">Códigos ARCA (Alta masiva)</p>
                      {/* La explicación del bloque, detrás del ⓘ de SU título. */}
                      <span
                        title={'Son los códigos de la interfaz de «Alta masiva» de ARCA, específicos del convenio y la modalidad de este tipo de contrato. Se usan para generar el TXT; dejalos en blanco si no aplican. La actividad del domicilio NO va acá: depende del domicilio de explotación y de la empleadora, y se carga en la ficha de la empresa, en ARCA → Domicilios de Explotación.'}
                        className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 cursor-help">
                        <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                      </span>
                    </div>

                    <div className="space-y-3">
                      <SelectorCodigoArca
                        label="Modalidad de contrato"
                        sufijoLabel="(3 díg.)"
                        items={modalidadesOfrecidas}
                        cargando={cargandoArca}
                        value={form.afipModalidadContrato}
                        onChange={(c) => setForm((p) => ({ ...p, afipModalidadContrato: c }))}
                        formatCodigo={pad3}
                        placeholder="Sin elegir — ej. 008 tiempo completo indeterminado"
                        vacioHint="El catálogo de Modalidades de Contrato está vacío. Se siembra en Configuración → ARCA → Modalidades de Contrato."
                      />
                {errorCodigo('afipModalidadContrato')}

                      {/*
                       * El grupo va ARRIBA del tipo de servicio porque lo filtra, igual que Convenio →
                       * Categoría y Domicilio → Actividad. No se guarda: solo recorta la lista.
                       */}
                      {/* El MISMO selector que los otros tres. Era el único <select> nativo del bloque, y esa
                          diferencia de forma sugería que el grupo se guarda como los demás — no se guarda:
                          solo recorta la lista de abajo. */}
                      <SelectorCodigoArca
                        label="Grupo de tipo de servicio"
                        sufijoLabel="(no va al TXT)"
                        items={gruposTipoServicio}
                        cargando={cargandoArca}
                        value={grupoTipoServicio}
                        onChange={setGrupoTipoServicio}
                        formatCodigo={(v) => v}
                        placeholder="Todos los tipos de servicio"
                        ayuda={`Hay 49 nombres repetidos entre los ${tiposServicio.length} tipos de servicio (el mismo texto con dos códigos). Elegir el grupo deja a la vista solo los de ese grupo. No viaja en el TXT y no se guarda: solo filtra.`}
                        vacioHint="El catálogo de Grupos de Tipo de Servicio está vacío. Se siembra en Configuración → ARCA → Grupos de Tipo de Servicio."
                      />
                {errorCodigo('grupoTipoServicio')}
                      {/* El aviso SÍ queda a la vista: no es una explicación, es algo que hay que ir a
                          arreglar para que el filtro sirva. */}
                      {!hayGruposCargados && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 ml-1 flex items-start gap-1.5">
                          <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5 mt-1 shrink-0" />
                          Todavía ningún tipo de servicio tiene grupo cargado, así que el filtro no se aplica. Clasificalos en Configuración → ARCA → Tipos de Servicio.
                        </p>
                      )}

                      <SelectorCodigoArca
                        label="Tipo de servicio"
                        sufijoLabel={grupoTipoServicio && hayGruposCargados ? `(3 díg. · ${tiposServicioFiltrados.length} del grupo)` : '(3 díg.)'}
                        items={tiposServicioFiltrados}
                        cargando={cargandoArca}
                        value={form.afipTipoServicio}
                        onChange={(c) => setForm((p) => ({ ...p, afipTipoServicio: c }))}
                        formatCodigo={pad3}
                        placeholder="Sin elegir — ej. 000 servicios comunes continuos"
                        vacioHint="El catálogo de Tipos de Servicio está vacío. Se siembra en Configuración → ARCA → Tipos de Servicio."
                      />
                {errorCodigo('afipTipoServicio')}

                      <SelectorCodigoArca
                        label="Modalidad de liquidación"
                        sufijoLabel="(1 díg.)"
                        items={modalidadesLiq}
                        cargando={cargandoArca}
                        value={form.afipModalidadLiquidacion}
                        onChange={(c) => setForm((p) => ({ ...p, afipModalidadLiquidacion: c }))}
                        formatCodigo={pad1}
                        placeholder="Sin elegir — ej. 1 por mes"
                        vacioHint="El catálogo de Modalidades de Liquidación está vacío. Se siembra en Configuración → ARCA → Modalidades de Liquidación."
                      />
                {errorCodigo('afipModalidadLiquidacion')}
                    </div>
                  </div>
                        </div>
                      ) : (
                        /*
                          Los códigos NO se borran al cambiar de estado.

                          Borrarlos sería perder trabajo por haber probado otra opción, y volver atrás
                          obligaría a cargarlos de nuevo. Se conservan, se guardan, y simplemente no
                          viajan al TXT — que es lo que decide el estado, no la presencia del dato.
                        */
                        hayCodigosCargados && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1 flex items-start gap-1.5 animate-fadeIn">
                            <FontAwesomeIcon icon={faCircleInfo} className="h-2.5 w-2.5 mt-1 shrink-0" />
                            Los códigos ARCA cargados se conservan, pero no se usan con este estado.
                          </p>
                        )
                      )}

                      <div>
                        <div className="flex items-center justify-between gap-2 ml-1">
                          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Estados no impositivos</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setForm((p) => ({ ...p, estadoIds: [...p.estadoIds.filter((id) => !estadosRegulares.some((e) => e._id === id)), ...estadosRegulares.map((e) => e._id)] }))}
                              disabled={estadosRegulares.length === 0 || estadosRegulares.every((e) => form.estadoIds.includes(e._id))}
                              className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                            >
                              Seleccionar todos
                            </button>
                            <span className="text-gray-300 dark:text-gray-600">·</span>
                            <button
                              type="button"
                              onClick={() => setForm((p) => ({ ...p, estadoIds: p.estadoIds.filter((id) => !estadosRegulares.some((e) => e._id === id)) }))}
                              disabled={!estadosRegulares.some((e) => form.estadoIds.includes(e._id))}
                              className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                            >
                              Limpiar
                            </button>
                          </div>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1 mb-1.5 mt-0.5">
                          Se aplica a todas las Plantillas de este Contrato. Los Estados sin ningún tipo marcado se ofrecen siempre y no se pueden restringir acá.
                        </p>
                        <div className="max-h-52 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
                          {estadosRegulares.length === 0 && estadosGlobales.length === 0 ? (
                            <p className="px-3 py-3 text-sm text-gray-500">No hay más estados cargados.</p>
                          ) : (
                            <>
                              {estadosRegulares.map((estado) => {
                                const checked = form.estadoIds.includes(estado._id);
                                return (
                                  <label key={estado._id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                                    <input type="checkbox" checked={checked} onChange={() => toggleEstado(estado._id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                                    <EstadoBadge name={estado.name} className="text-[10px]" />
                                  </label>
                                );
                              })}
                              {estadosGlobales.map((estado) => (
                                <label key={estado._id} className="flex items-center gap-3 px-3 py-2 opacity-60 cursor-not-allowed" title="Se aplica a todos los tipos de contrato">
                                  <input type="checkbox" checked disabled className="rounded border-gray-300 text-blue-600 cursor-not-allowed" />
                                  <EstadoBadge name={estado.name} className="text-[10px]" />
                                  <span className="ml-auto text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">todos</span>
                                </label>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* El mismo bloque que Proyecto y Usuario, y al final: ver `components/ui/BloqueEstado`. */}
            <BloqueEstado activo={form.isActive} onChange={(activo) => setForm((p) => ({ ...p, isActive: activo }))} />
          </div>
          </div>
        </div>
      </Modal>

      <InfoModal
        isOpen={showTiempoIndetInfo}
        onClose={() => setShowTiempoIndetInfo(false)}
        title="Es tiempo indeterminado"
        size="sm"
        zIndex={120}
        actions={[{ label: 'Entendido', onClick: () => setShowTiempoIndetInfo(false), variant: 'primary' }]}
      >
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          <p>
            Indica que este tipo de contrato <strong>no tiene una fecha de fin fija</strong>: es un contrato por tiempo indeterminado, no uno a plazo.
          </p>
          <p>
            Al elegir este Contrato en <strong>Agregar/Configurar miembro</strong>, el campo <strong>Fecha de baja</strong> se deja vacío y el contrato queda <strong>vigente</strong> hasta que se le cargue una baja manualmente.
          </p>
        </div>
      </InfoModal>

      <InfoModal
        isOpen={showFirmaInfo}
        onClose={() => setShowFirmaInfo(false)}
        title="Se envía a firmar"
        size="sm"
        zIndex={120}
        actions={[{ label: 'Entendido', onClick: () => setShowFirmaInfo(false), variant: 'primary' }]}
      >
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          <p>
            Con esta opción <strong>activada</strong>, en Contratos del proyecto se va a poder descargar el contrato de este tipo para enviarlo a firmar.
          </p>
          <p>
            Si la <strong>desactivás</strong>, ese botón de descarga no aparece: en su lugar se muestra el aviso <strong>"No se envía a firmar"</strong>.
          </p>
        </div>
      </InfoModal>
    </div>
  );
});
ContractTypesTab.displayName = 'ContractTypesTab';

export default ContractTypesTab;
