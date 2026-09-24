import React, { useState, useEffect, useMemo, useRef } from "react";
import { Modal } from "./Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faBriefcase, faClock, faMoneyBillWave, faExchangeAlt, faArrowRight, faSearch, faFilter, faPlus, faBuilding, faFileContract, faLink, faSpinner, faCircleQuestion, faChevronDown, faChevronRight, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { AvisoSuperposicion, usersAPI } from "../../../../api/users";
import { DiasDeTrabajo } from "../../../../components/contratos/DiasDeTrabajo";
import { JornadasSolicitud } from "../../../../components/contratacion/JornadasSolicitud";
import { avisoIndeterminado, erroresDeJornadas, hayAjuste, jornadasDelCalendario, mesesEquivalentes, periodoDeCalculo } from "../../../../utils/jornadas";
import { armarPayloadDeSolicitud } from "@compartido/solicitudDeContratacion";
import { AvisosSuperposicion } from "../../../../components/solicitudes/AvisosSuperposicion";
import { roleFrameAPI, RoleFrameItem } from "../../../../api/roleFrames";
import { categoriaSatAPI, CategoriaSatItem } from "../../../../api/categoriasSat";
// La cadena empleadora → convenio → categoría es la MISMA que usa el escritorio. Ver ese módulo.
import { categoriasOfrecidas, codigosDeConveniosDeLaEmpleadora, conveniosOfrecidos, importePorJornadaDeCategoria } from "../../../../utils/seleccionConvenioCategoria";
import { ChipSinValorar, ChipValoracion, ChipValoracionDelProyecto, useValoraciones } from "../../../../components/proyectos/ChipValoracion";
import { sweetAlert } from "../utils/sweetAlert";
import { CustomDatePicker } from "./CustomDatePicker";
// El mismo calendario de Vacaciones: se pintan los días de a uno.
import { CustomMultiDatePicker } from "./CustomMultiDatePicker";
import { projectsAPI, Project } from "../../../../api/projects";
import { companiesAPI, Company } from "../../../../api/companies";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../../../../api/simpleCatalog";
import { useProfile } from "../hooks/useProfile";
import { LoadingSpinner } from "../../../../components/ui/LoadingSpinner";
import { infoAPI, InfoItem } from "../../../../api/info";
import { activityLogTypesAPI, RequestConfig } from "../../../../api/requestConfig";
import { fuzzyMatch } from "../../../../utils/searchHelpers";
import { estadosImpositivos, esTipoImpositivo, TipoImpositivo, tipoImpositivoDeContrato } from "../../../../utils/tramiteImpositivo";
import { claveOrdenTurno, textoDeDias } from "../../../../utils/jerarquiaTurnos";
import { SelectorHora } from "../../../../components/contratacion/SelectorHora";
import { ImportesDelContrato } from "../../../../components/contratacion/ImportesDelContrato";
import { horarioDentroDelTurno, horasDelHorario, sumarMinutos } from "../../../../utils/horario";
import { esContratoVigente, fechaISO } from "../../../../utils/contratoVigencia";
import { contratosAPI, ContratoItem } from "../../../../api/contratos";
import { contratoFrameAPI, ContratoFrameItem } from "../../../../api/contratosFrame";
import { EstadoBadge } from "../../../../components/EstadoSelect";
import { useAuthStore } from "../../../../stores/authStore";
import { usePermisoInactivo } from "../../../../stores/permisosInactivosStore";
import { MOBILE_REGISTRO, PROJECT_SUPERVISOR } from "../../../../utils/permisosMobile";
import { copiarMiLinkDeRegistro } from "../utils/portapapeles";

/** Importes de la escala, como se leen en un recibo. Sin número cargado, un guion: 0 no es «no sabemos». */
const pesos = (n?: number): string => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }) : "—");

/**
 * HOY, EN LA ZONA HORARIA DE QUIEN LO ESTÁ USANDO.
 *
 * No sale de `toISOString()`: eso da la fecha UTC, y en Argentina —UTC-3— después de las 21:00
 * devuelve la de MAÑANA. Un calendario que bloquea el pasado con esa fecha deja de aceptar el día de
 * hoy a partir de la noche, que es justo cuando se cargan las solicitudes del día siguiente.
 */
const fechaDeHoy = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fechaDeEscala = (v?: string | Date): string => {
  if (!v) return "—";
  const d = new Date(v as any);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("es-AR");
};

/** Una fila etiqueta/importe del detalle de la escala. */
const FilaEscala: React.FC<{ label: string; valor: string; destacado?: boolean }> = ({ label, valor, destacado }) => (
  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-0 dark:border-slate-800">
    <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    <span className={`text-right text-sm ${destacado ? "font-black text-emerald-600 dark:text-emerald-400" : "font-semibold text-slate-900 dark:text-slate-100"}`}>{valor}</span>
  </div>
);

/** Un área y turno que se puede asignar en la solicitud, ya con los nombres para mostrarlo. */
interface OpcionAreaTurno {
  areaId: string;
  areaNombre: string;
  shiftId: string;
  turnoNombre: string;
  horario: string;
  /** Hora de inicio y de fin del turno ("HH:MM"), para cruzarlas con el horario elegido. */
  inicio: string;
  fin: string;
  /** Los días en que corre el turno, en texto («Lun a Vie»). Vacío si el turno no los trae. */
  dias: string;
  /** Para ordenar los turnos como en el admin (ver `claveOrdenTurno`). */
  orden: string;
}

/** Arma la opción a partir de área y turno, poblados (con nombre) o como id pelado. */
const opcionAreaTurno = (area: any, turno: any): OpcionAreaTurno => {
  const idDe = (x: any) => (x && typeof x === "object" ? String(x._id) : String(x || ""));
  const t = turno && typeof turno === "object" ? turno : null;
  return {
    areaId: idDe(area),
    areaNombre: (area && typeof area === "object" && area.name) || "Área",
    shiftId: idDe(turno),
    turnoNombre: t?.name || "Turno",
    horario: t?.startTime && t?.endTime ? `${t.startTime} a ${t.endTime}` : "",
    inicio: t?.startTime || "",
    fin: t?.endTime || "",
    dias: Array.isArray(t?.days) && t.days.length > 0 ? textoDeDias(t.days) : "",
    orden: claveOrdenTurno(t),
  };
};

/*
  UNA SOLICITUD NUEVA ARRANCA CON LA SEMANA LABORAL TÍPICA: 5 días, de lunes a viernes (1 = lunes …
  5 = viernes; 0 es domingo). Es el caso más común, y así sólo se toca cuando es otra cosa: se agregan
  o se sacan días, o se cambia cuántos por semana. Al EDITAR una solicitud no se usa: se leen los días
  que se guardaron (y una vieja sin días se abre vacía, en vez de inventarle una semana).
*/
const SEMANA_POR_DEFECTO = { diasPorSemana: "5", diasSemana: [1, 2, 3, 4, 5] };

/** Las clases del campo de hora en la app; en el panel son otras. */
const CLASE_HORA = "w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white";

interface UserRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingUser?: any | null;
  /**
   * RENOVACIÓN de un contrato por vencer (pestaña «Por vencer» de Contratación). Abre el formulario de
   * ALTA —no de edición— ya completo con los datos del contrato, y la solicitud sale con la etiqueta
   * «Renovación» y el contrato que renueva, que es lo que lo saca de la lista (ver `routes/users.ts`).
   */
  renovacion?: { plantilla: any; userProjectId: string; fechaBajaContrato: string } | null;
}

export const UserRegistrationModal: React.FC<UserRegistrationModalProps> = ({ isOpen, onClose, onSuccess, editingUser, renovacion }) => {
  const { profile } = useProfile();
  const [submitting, setSubmitting] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [roleFrames, setRoleFrames] = useState<RoleFrameItem[]>([]);
  const [categoriasSat, setCategoriasSat] = useState<CategoriaSatItem[]>([]);
  const [proyectosActivos, setProjects] = useState<Project[]>([]);

  /**
   * Los proyectos que se ofrecen: los que la persona coordina, si el perfil dice cuáles.
   *
   * El filtro se aplica ACÁ y no al pedirlos. El perfil llega por su cuenta unos milisegundos después
   * de que el modal abre, y cuando el filtro vivía dentro del `.then` había que poner `profile` en las
   * dependencias del efecto de carga: eso hacía que las seis consultas salieran dos veces y que el
   * spinner se reiniciara a mitad de camino.
   */
  const projects = useMemo(() => {
    const propios = profile?.projectIds || [];
    return propios.length > 0 ? proyectosActivos.filter((p) => propios.includes(p._id)) : proyectosActivos;
  }, [proyectosActivos, profile]);

  /** «Cliente | Proyecto», que es como se lo reconoce: el nombre solo se repite entre clientes. */
  const etiquetaProyecto = (p: Project) => (typeof p.clientId === "object" && p.clientId?.name ? `${p.clientId.name} | ${p.name}` : p.name);
  /** Catálogo de empresas y de convenios, para resolver nombres y la cadena proyecto → empresa → CCT. */
  const [companies, setCompanies] = useState<Company[]>([]);
  /** Ya contestó el catálogo de empleadoras (haya traído algo o no). Ver el campo «Empresa que contrata». */
  const [empresasCargadas, setEmpresasCargadas] = useState(false);
  const [convenios, setConvenios] = useState<SimpleCatalogItem[]>([]);
  /*
    LAS PERSONAS LAS BUSCA EL SERVER, NO EL TELÉFONO.

    Acá vivía la lista COMPLETA de personas activas del tenant —1577— y el buscador filtraba sobre
    ella. Para eso había que bajarla: dos pedidos de 1000, ~1,5 MB, casi 11 segundos cada uno, porque
    cada persona venía con las fechas de todos sus contratos (4592 en una sola página) para poder
    decir "Vigente" al lado del nombre. El modal entero esperaba eso antes de dibujar nada.

    Ahora se pide una página de `POR_PAGINA` filas por búsqueda, ya filtrada por texto y por rol, y el
    contrato que rige de cada una viene elegido por Mongo. Medido: 731 ms y 21,7 KB.

    Y deja de empeorar sola: antes cada persona nueva del tenant hacía más lenta esta pantalla.
  */
  const POR_PAGINA = 50;
  const [personas, setPersonas] = useState<any[]>([]);
  const [totalPersonas, setTotalPersonas] = useState(0);
  const [buscandoPersonas, setBuscandoPersonas] = useState(false);
  /** Cuánta gente tiene cada rol empresa, para el filtro por rol (lo cuenta el server). */
  const [personasPorRol, setPersonasPorRol] = useState<Map<string, number>>(new Map());
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  /** Roles empresa de la persona elegida (vacío si el nombre se escribió a mano). Ver ese select. */
  const rolesDelUsuario: string[] = selectedUser?.metadata?.roleFrameIds || [];
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [selectedRoleFilters, setSelectedRoleFilters] = useState<string[]>([]);
  /* Los dos estados impositivos configurados. Salen del ABM y no de una lista escrita acá: si
     alguien les cambia el nombre o el color, esta pantalla lo muestra igual. */
  const [impositivos, setImpositivos] = useState<InfoItem[]>([]);
  /*
    Los TIPOS DE CONTRATO y sus plantillas.

    El trámite (ARCA o Servicios) no se elige más a mano: lo declara el tipo de contrato, a través de
    sus plantillas. `tipoImpositivoDeContrato` hace ese recorrido —tipo → plantillas → estado
    impositivo— y necesita la lista COMPLETA de estados, no sólo los impositivos, así que se guarda
    aparte de `impositivos`.
  */
  const [contratos, setContratos] = useState<ContratoItem[]>([]);
  const [contratoFrames, setContratoFrames] = useState<ContratoFrameItem[]>([]);
  const [todosLosEstados, setTodosLosEstados] = useState<InfoItem[]>([]);
  const [contratoModalOpen, setContratoModalOpen] = useState(false);
  const [convenioModalOpen, setConvenioModalOpen] = useState(false);
  const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
  const [categoriaBusqueda, setCategoriaBusqueda] = useState("");
  /** El escape del filtro por rol, por convenio: ver todas las categorías de ESTE convenio. */
  const [verTodasDelConvenio, setVerTodasDelConvenio] = useState(false);
  /*
    LA CATEGORÍA QUE SE ESTÁ MIRANDO, antes de elegirla.

    Lo que se paga no sale de la categoría sino de su GRUPO —doce escalas cubren más de cien
    categorías—, y de la lista no se podía saber ni a qué grupo pertenece cada una ni cuánto es. Tocar
    la fila abre esa escala; el círculo de la izquierda sigue eligiendo de una, sin pasar por acá.
  */
  const [categoriaDetalle, setCategoriaDetalle] = useState<CategoriaSatItem | null>(null);

  /** Elegir la categoría, desde la lista o desde su detalle: un solo lugar que cierra lo que quedó abierto. */
  const elegirCategoria = (id: string) => {
    setFormData((prev) => ({ ...prev, categoriaSatId: id }));
    setAvisoCascada("");
    setCategoriaDetalle(null);
    setCategoriaModalOpen(false);
    setCategoriaBusqueda("");
  };
  /** Lo último que la cascada limpió sola. Se muestra para que no parezca un error de la pantalla. */
  const [avisoCascada, setAvisoCascada] = useState("");
  const [showRoleFilterMenu, setShowRoleFilterMenu] = useState(false);
  /** Las dos ventanas de selección de personas. Reemplazan a los desplegables flotantes. */
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [reemplazoModalOpen, setReemplazoModalOpen] = useState(false);
  /*
    Los motivos son LOS MISMOS que los de Novedades (`request-config`), no una lista propia.

    Un reemplazo existe porque alguien falta, y por qué falta ya está tipificado ahí: Franco,
    Vacaciones, Enfermedad, Cambios de Turno… Escribir otra lista acá haría que el mismo hecho se
    llame distinto según por qué pantalla se cargó, y después no se pueden cruzar.
  */
  const [motivos, setMotivos] = useState<RequestConfig[]>([]);
  const [motivoModalOpen, setMotivoModalOpen] = useState(false);
  /** Ventana de rol empresa, con su propio buscador. Mismo patrón que la de Usuarios. */
  const [rolModalOpen, setRolModalOpen] = useState(false);
  const [proyectoModalOpen, setProyectoModalOpen] = useState(false);
  const [rolSearchTerm, setRolSearchTerm] = useState("");
  /** Texto del buscador dentro de la ventana de "a quién reemplaza". */
  const [replacedSearchTerm, setReplacedSearchTerm] = useState("");

  useEffect(() => {
    // Aparte de la carga grande y con su propio catch: si esto falla, el alta tiene que poder
    // enviarse igual — sin empresa elegida, no rota.
    /*
      `slim`: de cada empleadora sólo hace falta con qué se contrata —nombre, CUIT y convenios
      registrados—. La ficha completa son 15 KB por empresa, y 13 de ellos son el padrón de obras
      sociales que esta pantalla no mira: 45 KB y 384 ms para pintar un nombre.
    */
    void Promise.all([companiesAPI.list({ slim: true }).catch(() => [] as Company[]), conveniosApi.list().catch(() => [] as SimpleCatalogItem[])]).then(([cs, cv]) => {
      setCompanies(cs);
      setConvenios(cv);
      setEmpresasCargadas(true);
    });
  }, []);

  const [formData, setFormData] = useState({
    fullName: "",
    projectIds: [] as string[],
    roleFrameIds: [] as string[],
    categoriaSatId: "",
    startDate: "",
    dueDate: "",
    /**
     * Los días exactos, cuando el tipo de contrato se pide por días sueltos («YYYY-MM-DD»).
     *
     * Vacío con un contrato por período: ahí las fechas son el desde y el hasta, y los días de la
     * semana dicen cuáles se trabajan adentro.
     */
    fechasTrabajadas: [] as string[],
    workdaysCount: "",
    diasPorSemana: SEMANA_POR_DEFECTO.diasPorSemana,
    diasSemana: [...SEMANA_POR_DEFECTO.diasSemana],
    diasRotativos: false,
    /** Jornadas cargadas a mano distintas del calendario, y por qué. Ver `utils/jornadas.ts`. */
    workdaysOverridden: false,
    workdaysOverrideReason: "",
    workdaysOverrideNote: "",
    inTime: "",
    outTime: "",
    /** La empleadora que contrata y el convenio bajo el que lo hace. Salen del proyecto elegido. */
    empresaContratoId: "",
    convenioId: "",
    dailyRate: "",
    isReplacement: false,
    /** Por qué vía se contrata: alta temprana ante ARCA o locación de servicios. */
    tipoImpositivo: "" as TipoImpositivo | "",
    /** El tipo de contrato elegido (`Contrato._id`). De él sale el trámite. */
    contratoId: "",
    /** El área y turno que coordina quien pide, ya puestos en la solicitud. */
    areaShiftAssignments: [] as { areaId: string; shiftIds: string[] }[],
    /** A quién reemplaza: el id numérico que usa el contrato (puede faltar) y el `_id`, que no. */
    empleado_id_reemplezado: "",
    replacedUserId: "",
    /** Por qué falta la persona reemplazada. Es un tipo de novedad, no un texto libre. */
    motivoReemplazoId: "",
    /** Lo que no entra en ningún otro campo. Opcional. */
    comentarios: "",
  });

  /*
    Los errores de los días y las jornadas se dicen DEBAJO DE CADA CAMPO, y recién después del primer
    intento de enviar: marcar en rojo lo que alguien todavía no llegó a completar es ruido.
  */
  const [intentoEnviar, setIntentoEnviar] = useState(false);
  /** Algo que cambió sin que la persona lo pidiera (se descartó un ajuste de jornadas). */
  const [avisoJornadas, setAvisoJornadas] = useState("");
  useEffect(() => {
    if (!isOpen) return;
    setIntentoEnviar(false);
    setAvisoJornadas("");
  }, [isOpen]);

  /**
   * LA CADENA: proyecto → empresa del contrato → convenio.
   *
   * Las empresas ofrecidas son las de los proyectos elegidos, no todas: contratar por un CUIT que
   * este proyecto no usa es un alta que después nadie sabe explicar.
   */
  const empresasDelProyecto = useMemo(() => {
    const ids = new Set<string>();
    for (const p of projects) {
      if (!formData.projectIds.includes(p._id)) continue;
      for (const id of p.contratoEmpresas || []) ids.add(String(id));
    }
    return companies.filter((c) => ids.has(c._id));
  }, [projects, companies, formData.projectIds]);

  /**
  /**
   * Los CCT que se pueden usar: los de la empleadora, acotados por el proyecto si éste acotó.
   *
   * ARCA sólo acepta categorías de un convenio que la EMPLEADORA registró, así que ese es el filtro
   * duro. El proyecto puede recortar más —si declaró sus convenios— y si no declaró ninguno significa
   * «todavía no se acotó», no «ninguno»: leerlo al revés dejaría el alta sin convenios que elegir.
   *
   * Se devuelven CÓDIGOS de CCT («0634/11») y no ids, porque es con eso con lo que las categorías
   * declaran a qué convenio pertenecen (`data.convenio`).
   */
  const codigosEmpleadora = useMemo(() => {
    const deLaEmpresa = codigosDeConveniosDeLaEmpleadora(
      companies.find((c) => c._id === formData.empresaContratoId),
      convenios,
    );
    if (!deLaEmpresa) return null;

    const delProyecto = new Set<string>();
    for (const p of projects) {
      if (!formData.projectIds.includes(p._id)) continue;
      for (const id of p.convenioIds || []) {
        const cct = String(convenios.find((c) => c._id === String(id))?.externalId || "").trim();
        if (cct) delProyecto.add(cct);
      }
    }
    if (delProyecto.size === 0) return deLaEmpresa;
    const cruce = deLaEmpresa.filter((cct) => delProyecto.has(cct));
    return cruce.length > 0 ? cruce : deLaEmpresa;
  }, [companies, convenios, projects, formData.projectIds, formData.empresaContratoId]);

  /** El CCT elegido. `formData.convenioId` guarda el `_id`, que es lo que viaja en la solicitud. */
  const convenioCct = useMemo(() => String(convenios.find((c) => c._id === formData.convenioId)?.externalId || "").trim(), [convenios, formData.convenioId]);

  /** Los convenios ofrecidos, con cuántas categorías tiene cada uno. Misma lógica que el escritorio. */
  const conveniosDisponibles = useMemo(
    () => conveniosOfrecidos({ codigosEmpleadora, convenioElegido: convenioCct, categorias: categoriasSat, convenios }),
    [codigosEmpleadora, convenioCct, categoriasSat, convenios],
  );

  /** De un CCT al documento del convenio, para poder guardar su `_id`. */
  const convenioPorCct = useMemo(() => new Map(convenios.map((c) => [String(c.externalId || "").trim(), c])), [convenios]);

  /** El convenio elegido, ya resuelto: se muestra su código y su nombre. */
  const convenioElegido = useMemo(() => conveniosDisponibles.find((c) => c.externalId === convenioCct) || null, [conveniosDisponibles, convenioCct]);

  /*
    HASTA QUE NO HAY PERSONA, EL RESTO NO SE TOCA.

    Todo lo que sigue habla DE ELLA: con qué oficio entra, qué categoría le corresponde, cuánto se le
    paga. Completarlo antes es cargar datos que no se sabe de quién son, y encima el formulario hereda
    del elegido su oficio y su categoría —así que lo cargado a mano se pisaría solo—.

    Se hace con un <fieldset disabled>, que el navegador propaga a TODOS los controles de adentro: no
    hay que acordarse de deshabilitar cada uno, ni se escapa el que se agregue mañana.
  */
  /*
    LA SOLICITUD ES PARA ALGUIEN REGISTRADO.

    Antes se podía escribir el nombre a mano y la solicitud creaba una ficha nueva, vacía: sin CUIT, sin
    domicilio ni cuenta, que alguien tenía que completar después preguntando. Ahora la persona se
    registra sola con el link —carga ella sus datos— y recién ahí se la elige acá.

    `nombreLegado`: una solicitud que se cargó con el nombre a mano ANTES de esta regla. Se deja editar
    tal cual para no trabarla; si la persona ya se registró, conviene elegirla.
  */
  const personaRegistrada = !!selectedUser || !!(editingUser?.metadata as any)?.solicitudUserId;
  /** Se está corrigiendo una solicitud RECHAZADA: guardarla la vuelve a mandar. */
  const eraRechazada = (editingUser?.metadata as any)?.solicitudStatus === "rechazada";
  const nombreLegado = !!editingUser && !personaRegistrada && !!formData.fullName;
  const sinPersona = !personaRegistrada && !nombreLegado;

  // Quien tiene «Registro» puede mandarle su link a la persona que no encuentra, sin salir de acá.
  const { user: yo } = useAuthStore();
  const permisoInactivo = usePermisoInactivo();
  const puedeCompartirLink = (yo?.permissions || []).includes(MOBILE_REGISTRO) && !permisoInactivo(MOBILE_REGISTRO);
  const [copiandoLink, setCopiandoLink] = useState(false);
  /** «¿No aparece?»: la explicación y el link, en su propia ventana en vez de apretados al pie de la lista. */
  const [noApareceOpen, setNoApareceOpen] = useState(false);
  const copiarLinkDeRegistro = async () => {
    setCopiandoLink(true);
    try {
      await copiarMiLinkDeRegistro("Mandáselo a la persona. Cuando se registre, va a aparecer en esta lista y vas a poder elegirla.");
    } finally {
      setCopiandoLink(false);
    }
  };

  /*
    SERVICIOS: el tipo de contrato declara «Constancia de CUIT» (locación de servicios), no un alta
    temprana ante ARCA.

    Un servicio no se encuadra en un convenio ni en una categoría: esos dos datos son los del alta ante
    ARCA. Así que con un tipo de Servicios se esconden, no viajan en la solicitud, y el importe por
    jornada queda libre —no hay escala de donde proponerlo—. La cuenta del total (importe × jornadas)
    no cambia: nunca dependió de la categoría.
  */
  const esServicios = formData.tipoImpositivo === "constancia_cuit";

  /** La categoría elegida, resuelta al catálogo: de ahí salen su código de ARCA y su escala. */
  const categoriaElegida = useMemo(() => categoriasSat.find((c) => c._id === formData.categoriaSatId) || null, [categoriasSat, formData.categoriaSatId]);

  /*
    CUANDO HAY UNA SOLA OPCIÓN, SE ELIGE SOLA.

    Es el caso normal —un proyecto, una empleadora, un CCT— y obligar a abrir un combo de un ítem
    para confirmar lo único posible es trabajo sin decisión. Con dos o más, no se presume nada: elegir
    mal la empleadora manda el alta con el CUIT equivocado.

    También limpia lo que dejó de ser válido: si se cambia de proyecto, la empresa que ya no
    pertenece no puede quedar seleccionada de arrastre.
  */
  useEffect(() => {
    const valida = empresasDelProyecto.some((c) => c._id === formData.empresaContratoId);
    if (!valida) {
      const unica = empresasDelProyecto.length === 1 ? empresasDelProyecto[0]._id : "";
      /*
        Cambiar de empleadora se lleva convenio, categoría e importe.

        Los convenios registrados son de CADA CUIT: la categoría que había salía de los de la empresa
        anterior y no tiene por qué ser válida acá. Y el importe salía de la escala de esa categoría,
        así que arrastrarlo sería declarar el sueldo de un convenio que ya no interviene.
      */
      if (formData.empresaContratoId !== unica) setFormData((p) => ({ ...p, empresaContratoId: unica, convenioId: "", categoriaSatId: "", dailyRate: esServicios ? p.dailyRate : "" }));
    }
  }, [empresasDelProyecto, formData.empresaContratoId, esServicios]);

  const conveniosApi = createSimpleCatalogApi("/convenios");


  useEffect(() => {
    if (isOpen) {
      /*
        CADA DATO SE PINTA CUANDO LLEGA, NO CUANDO LLEGAN TODOS.

        Esto era un `Promise.all` de seis consultas con un solo `await`: bastaba que UNA tardara para
        que el formulario entero siguiera en "Cargando datos...", aunque los proyectos ya estuvieran
        en la mano. Y si una fallaba, el `catch` se comía las otras cinco y el modal quedaba vacío sin
        decir por qué. Ahora cada una setea lo suyo al resolverse y falla sola.

        El spinner lo sueltan los proyectos: son lo primero del formulario y sin ellos no se puede
        empezar a cargar nada. El resto (personas, categorías, motivos) termina de llegar solo, y
        hasta entonces esos campos aparecen vacíos en vez de tapar la pantalla.
      */
      const loadData = () => {
        setLoadingData(true);

        /*
          Las personas NO se cargan acá: las trae el buscador contra el server, a medida que se escribe
          (ver `personas`). Lo único que se pide de entrada es cuánta gente tiene cada rol, que es lo
          que necesita el filtro por rol para no ser una lista de nombres sin números.
        */
        usersAPI
          .rolesFrameCounts()
          .then((filas) => setPersonasPorRol(new Map(filas.map((f) => [f.name, f.count]))))
          .catch((e) => console.error("Error contando roles empresa:", e));

        /*
          Se guardan los proyectos ACTIVOS sin filtrar por el perfil: el filtro se aplica al pintar.

          Estaba dentro del `.then`, y el efecto dependía de `profile`. Como el perfil llega por su
          cuenta unos milisegundos después que el modal abre, el efecto se ejecutaba DOS veces: las
          seis consultas salían duplicadas y el spinner se reiniciaba en el medio. Lo que se ve como
          "tarda un montón en traer los proyectos" era, en buena parte, traerlos dos veces.
        */
        const proyectos = projectsAPI
          // `slim`: nombre, cliente, estado, las empresas/convenios y la valoración del proyecto, que es
          // todo lo que esta pantalla lee. El listado normal trae además áreas, turnos y coordinadores poblados,
          // y resuelve sede, centro de costo y responsable: 1451 ms y 84 KB contra 142 ms y 5 KB.
          .listAll({ slim: true })
          .then((projs) => setProjects(projs.filter((p) => p.status === "active")))
          .catch((e) => console.error("Error cargando proyectos:", e));

        roleFrameAPI
          .list()
          .then(setRoleFrames)
          .catch((e) => console.error("Error cargando roles empresa:", e));
        categoriaSatAPI
          .list()
          .then(setCategoriasSat)
          .catch((e) => console.error("Error cargando categorías:", e));
        infoAPI
          .listByType("estado-empleado")
          .then((estados) => {
            setTodosLosEstados(estados);
            setImpositivos(estadosImpositivos(estados));
          })
          .catch((e) => console.error("Error cargando estados:", e));
        // Los tipos de contrato y sus plantillas: de ahí sale el trámite, que ya no se elige a mano.
        contratosAPI
          .list()
          .then((cs) => setContratos(cs.filter((c) => c.isActive !== false)))
          .catch((e) => console.error("Error cargando tipos de contrato:", e));
        contratoFrameAPI
          .list()
          .then(setContratoFrames)
          .catch((e) => console.error("Error cargando plantillas de contrato:", e));
        activityLogTypesAPI
          .getAll()
          // Mismo filtro que Novedades: solo los activos y sin "horas extra", que no es una ausencia.
          .then((tipos) => setMotivos(tipos.filter((t) => t.isActive && !t.name.toLowerCase().includes("horas extra"))))
          .catch((e) => console.error("Error cargando motivos:", e));

        // El spinner lo sueltan los proyectos y nada más: son el primer campo del formulario y sin
        // ellos no se puede empezar. El buscador de personas ya no bloquea porque ya no baja nada.
        proyectos.finally(() => setLoadingData(false));
      };
      loadData();
    }
    // Depende SOLO de `isOpen`: ver el comentario de los proyectos. Con `profile` en la lista, todo
    // se pedía de nuevo apenas llegaba el perfil.
  }, [isOpen]);

  useEffect(() => {
    // Una renovación se carga igual que una solicitud existente —desde su `metadata`—, pero se CREA.
    const fuente = editingUser || renovacion?.plantilla;
    if (isOpen && fuente) {
      const meta = fuente.metadata || {};
      const [inTime, outTime] = (meta.schedule || " - ").split(" - ");
      /*
        Una solicitud guardada ANTES de esta regla puede traer jornadas que no coinciden con su propio
        calendario. No se pisan en silencio —cambiaría lo que se liquida—: se abre en ajuste, con la
        diferencia a la vista, y hay que justificarla o volver al calculado.
      */
      const m: any = meta;
      const rotativos = !!m.diasRotativos;
      const guardadas = meta.workdaysCount;
      const calculadasAlAbrir = rotativos ? null : jornadasDelCalendario(meta.startDate || fuente.hireDate?.split("T")[0] || "", meta.dueDate || "", Array.isArray(m.diasSemana) ? m.diasSemana : []);
      const abreEnAjuste = !rotativos && (!!m.workdaysOverridden || (guardadas != null && calculadasAlAbrir !== null && guardadas !== calculadasAlAbrir));
      setFormData({
        fullName: meta.fullName || `${fuente.firstName} ${fuente.lastName}`,
        projectIds: meta.projectIds || [],
        // Las tres formas en que quedó guardado el rol según quién creó la solicitud.
        roleFrameIds: (meta.rolesFrameIds?.length ? meta.rolesFrameIds : meta.roles_frame?.length ? meta.roles_frame : meta.roleFrameId ? [meta.roleFrameId] : []).map((rf: any) => String(typeof rf === "string" ? rf : rf?._id)).filter(Boolean),
        categoriaSatId: meta.categoriaSatId || "",
        startDate: meta.startDate || fuente.hireDate?.split("T")[0] || "",
        // Los días marcados, si la solicitud se pidió con un contrato por días sueltos.
        fechasTrabajadas: Array.isArray((m as any).fechasTrabajadas) ? ((m as any).fechasTrabajadas as string[]) : [],
        dueDate: meta.dueDate || "",
        workdaysCount: meta.workdaysCount?.toString() || "",
        // Las solicitudes anteriores a este campo no traen días: se abren vacías y hay que
        // elegirlos, en vez de inventar una semana que nadie declaró.
        diasPorSemana: (meta as any).diasPorSemana?.toString() || "",
        diasSemana: Array.isArray((meta as any).diasSemana) ? ((meta as any).diasSemana as number[]) : [],
        diasRotativos: !!(meta as any).diasRotativos,
        workdaysOverridden: abreEnAjuste,
        workdaysOverrideReason: abreEnAjuste ? m.workdaysOverrideReason || "" : "",
        workdaysOverrideNote: abreEnAjuste ? m.workdaysOverrideNote || "" : "",
        inTime: inTime || "",
        empresaContratoId: meta.empresaContratoId || "",
        convenioId: meta.convenioId || "",
        outTime: outTime || "",
        dailyRate: meta.dailyRate?.toString() || "",
        isReplacement: meta.isReplacement || false,
        // Las solicitudes anteriores a este campo se abren sin trámite: hay que elegirlo, en vez de
        // dar por hecho uno de los dos.
        tipoImpositivo: esTipoImpositivo(meta.tipoImpositivo) ? meta.tipoImpositivo : "",
        contratoId: (meta as any).contratoId || "",
        areaShiftAssignments: Array.isArray((meta as any).areaShiftAssignments) ? (meta as any).areaShiftAssignments : [],
        empleado_id_reemplezado: meta.empleado_id_reemplezado != null ? String(meta.empleado_id_reemplezado) : "",
        replacedUserId: meta.replacedUserId ? String(meta.replacedUserId) : "",
        motivoReemplazoId: meta.motivoReemplazoId ? String(meta.motivoReemplazoId) : "",
        comentarios: meta.comentarios || "",
      });
    } else if (isOpen && !fuente) {
      setFormData({
        fullName: "",
        projectIds: [],
        roleFrameIds: [],
        categoriaSatId: "",
        startDate: "",
        fechasTrabajadas: [],
        dueDate: "",
        workdaysCount: "",
        diasPorSemana: SEMANA_POR_DEFECTO.diasPorSemana,
        diasSemana: [...SEMANA_POR_DEFECTO.diasSemana],
        diasRotativos: false,
        workdaysOverridden: false,
        workdaysOverrideReason: "",
        workdaysOverrideNote: "",
        inTime: "",
        empresaContratoId: "",
        convenioId: "",
        outTime: "",
        dailyRate: "",
        isReplacement: false,
        tipoImpositivo: "",
        contratoId: "",
        areaShiftAssignments: [],
        empleado_id_reemplezado: "",
        replacedUserId: "",
        motivoReemplazoId: "",
        comentarios: "",
      });
      setReplacedSearchTerm("");
      setUserSearchTerm("");
      setSelectedUser(null);
    }
    // La renovación arranca sin persona elegida: la pone el efecto de abajo, desde la lista de usuarios.
    if (isOpen && renovacion && !editingUser) setSelectedUser(null);
  }, [isOpen, editingUser, renovacion]);

  /*
    AL EDITAR, LA PERSONA ELEGIDA VUELVE A ESTAR ELEGIDA.

    La solicitud guarda a quién es (`solicitudUserId`), pero al abrirla sólo se recuperaba el nombre:
    la persona quedaba como si no estuviera elegida. Va DESPUÉS del efecto de arriba, que la limpia al abrir.
  */
  /*
    Se PIDE por su id. Antes se buscaba en la lista completa que el modal tenía en memoria; ahora esa
    lista no existe y la persona puede no estar entre las que muestra el buscador.
  */
  const traerPersonaPorId = async (id: string) => {
    const { users } = await usersAPI.list({ picker: true, ids: String(id), limit: 1 });
    return users?.[0] || null;
  };

  useEffect(() => {
    const id = (editingUser?.metadata as any)?.solicitudUserId;
    if (!isOpen || !id || selectedUser) return;
    let vigente = true;
    void traerPersonaPorId(String(id))
      .then((persona) => { if (vigente && persona) setSelectedUser(persona); })
      .catch((e) => console.error("Error trayendo la persona de la solicitud:", e));
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingUser]);

  // RENOVACIÓN: la persona es la del contrato que vence.
  useEffect(() => {
    const id = renovacion?.plantilla?.metadata?.solicitudUserId;
    if (!isOpen || !id || editingUser) return;
    let vigente = true;
    void traerPersonaPorId(String(id))
      .then((persona) => { if (vigente && persona) setSelectedUser(persona); })
      .catch((e) => console.error("Error trayendo la persona de la renovación:", e));
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, renovacion, editingUser]);

  /*
    ARRANCA EN «PEDIDO DE ARCA».

    Es la vía de la enorme mayoría de las contrataciones, así que dejarlo vacío hacía que el
    coordinador tuviera que elegir siempre lo mismo. El default es visible y se cambia con un click:
    no es un dato que se guarde a espaldas de nadie.

    Solo rellena cuando está vacío, así que no pisa lo que traiga una solicitud que se está
    editando. Y sale de los estados del ABM: si el de alta temprana no está configurado, no se
    inventa una selección que no existe.
  */

  /*
    LAS PERSONAS QUE OFRECE LA VENTANA: por texto y por rol.

    Estaba escrito adentro del JSX del desplegable; al mudarse a la ventana se saca acá para que la
    condición se lea una vez y no se recalcule en cada tecla dentro del render.
  */
  /*
    300 ms DE ESPERA ANTES DE PREGUNTAR.

    Sin la espera, escribir «Martínez» son ocho consultas y las siete primeras se tiran. Con la
    espera es una. El `pedidoPersonasRef` descarta las respuestas viejas: sin eso, una consulta lenta
    que vuelve tarde pisa el resultado de la que se escribió después.
  */
  const pedidoPersonasRef = useRef(0);
  const rolesParaElServer = selectedRoleFilters.join(",");
  useEffect(() => {
    if (!isOpen) return;
    const id = ++pedidoPersonasRef.current;
    setBuscandoPersonas(true);
    const t = setTimeout(() => {
      usersAPI
        .list({
          page: 1,
          limit: POR_PAGINA,
          metadataActivo: "true",
          picker: true,
          // `email` es el parámetro de búsqueda del listado: mira el mail, el nombre y el apellido.
          email: userSearchTerm.trim() || undefined,
          rolFrame: rolesParaElServer || undefined,
        })
        .then((r) => {
          if (id !== pedidoPersonasRef.current) return;
          setPersonas(r.users || []);
          setTotalPersonas(r.pagination?.total ?? (r.users || []).length);
        })
        .catch((e) => {
          if (id !== pedidoPersonasRef.current) return;
          console.error("Error buscando personas:", e);
          setPersonas([]);
          setTotalPersonas(0);
        })
        .finally(() => {
          if (id === pedidoPersonasRef.current) setBuscandoPersonas(false);
        });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userSearchTerm, rolesParaElServer]);

  /** Lo que la lista dibuja: ya viene filtrado y recortado por el server. */
  const personasFiltradas = personas;

  /*
    EL CONTRATO QUE RIGE DE CADA PERSONA, para decirlo en su fila.

    La lista trae a TODAS las personas registradas, tengan o no contrato vigente. Sin decirlo, alguien
    que trabaja hace años y alguien que hizo una jornada el año pasado se veían iguales, y parecía que
    el listado filtraba algo. Misma regla que el resto de la plataforma (`getContratoActivo`), sobre
    los contratos de todos sus proyectos.
  */
  const contratoDePersona = useMemo(() => {
    const ddmmaaaa = (iso: string) => {
      const [y, m, d] = iso.split("-");
      return y && m && d ? `${d}/${m}/${y}` : "—";
    };
    const mapa = new Map<string, { vigente: boolean; alta: string; baja: string } | null>();
    for (const u of personasFiltradas) {
      /*
        `contratoQueRige` lo eligió el server con la misma regla que `getContratoActivo` (ver
        `contratosQueRigenDeLasPersonas`). Antes se elegía acá, y para poder hacerlo había que bajarse
        las fechas de TODOS los contratos de TODAS las personas.
      */
      const c = (u as any).contratoQueRige;
      mapa.set(String(u._id), c ? { vigente: esContratoVigente(c), alta: ddmmaaaa(fechaISO(c.fecha_alta_contrato)), baja: ddmmaaaa(fechaISO(c.fecha_baja_contrato)) } : null);
    }
    return mapa;
  }, [personasFiltradas]);
  const conContratoVigente = useMemo(() => [...contratoDePersona.values()].filter((c) => c?.vigente).length, [contratoDePersona]);

  /*
    CUÁNTA GENTE TIENE CADA ROL, para el filtro de la ventana de personas.

    Sin el número, el filtro es una lista de trescientas especialidades donde la mayoría no filtra
    nada: se elige una, la lista de personas queda vacía y no hay forma de saber si el filtro está mal
    o si de verdad no hay nadie. El conteo contesta eso antes de tocar nada.

    Se cuenta con el MISMO criterio que después filtra (`personasFiltradas`): el rol figura en su
    ficha o en alguno de sus proyectos. Si contara distinto, el número prometería un resultado que el
    filtro no da.
  */
  // El conteo por rol lo hace el server (`usersAPI.rolesFrameCounts`): ver `personasPorRol` arriba.

  /*
    QUIÉNES PUEDEN SER REEMPLAZADOS: el equipo del proyecto elegido, menos la persona del alta.

    Se filtra por los proyectos que tiene cargados cada ficha (`metadata.projects`), que es el mismo
    criterio que usa el escritorio para armar el equipo. Reemplazar a alguien que no está en el
    proyecto no es un reemplazo, y ofrecer la lista completa de la plataforma convertiría el
    buscador en una lista de cientos de nombres donde el correcto es uno.
  */
  /** El proyecto elegido, resuelto. La solicitud es de UNO: `projectIds` guarda ese uno. */
  const proyectoElegido = useMemo(() => projects.find((p) => formData.projectIds.includes(p._id)) || null, [projects, formData.projectIds]);

  const contratoElegido = useMemo(() => contratos.find((c) => c._id === formData.contratoId) || null, [contratos, formData.contratoId]);

  /*
    LOS LÍMITES DEL TIPO DE CONTRATO: horas por jornada y días por semana (se cargan en Contratos).

    Un «5x7» no se puede pedir con 6 días ni con un horario de 9 horas. Los días se acotan en el
    momento —el campo no pasa del tope y, si ya había más, se recortan—; las horas se avisan debajo
    del horario y frenan el envío, porque cuál de las dos puntas corregir lo decide quien carga.
    Sin límite cargado en el contrato, no se acota nada.
  */
  /*
    EL MULTIPLICADOR DEL TIPO DE CONTRATO. Un «Jornada» con 1,5 paga una vez y media la escala.

    Cero, vacío o sin cargar es «sin multiplicador» y vale 1: multiplicar por cero dejaría el importe
    en nada, que es lo contrario de lo que un campo vacío quiere decir.
  */
  const multiplicadorDiario = Number(contratoElegido?.data?.multiplicadorDiario) > 0 ? Number(contratoElegido!.data!.multiplicadorDiario) : 1;

  /**
   * ESTE TIPO DE CONTRATO SE PIDE POR DÍAS SUELTOS, no por período (ver `modoFechas` en el ABM).
   *
   * Cambia el calendario del formulario: en vez de «desde» y «hasta» se pintan los días uno por uno,
   * como en Vacaciones, y cada día marcado es una jornada. Se puede marcar uno solo.
   */
  const porDiasSueltos = contratoElegido?.data?.modoFechas === "dias";

  /**
   * LOS DÍAS MARCADOS EN EL CALENDARIO, y todo lo que se deduce de ellos.
   *
   * De la lista salen las cuatro cosas que el contrato necesita y que nadie tendría por qué volver a
   * cargar a mano: el período que abarcan (el primero y el último), cuántas jornadas son (una por
   * día), qué días de la semana toca y cuántos son. La lista exacta se guarda aparte
   * (`fechasTrabajadas`): «los martes de septiembre» y «el 2, el 9 y el 23» tienen los mismos días
   * de la semana y el mismo período, y no son lo mismo.
   */
  const elegirDiasSueltos = (fechas: string[]) => {
    const dias = [...new Set(fechas.filter(Boolean))].sort();
    if (dias.length === 0) {
      setFormData((p) => ({ ...p, fechasTrabajadas: [], startDate: "", dueDate: "", workdaysCount: "", diasSemana: [], diasPorSemana: "" }));
      return;
    }
    const diasSemana = [...new Set(dias.map((d) => new Date(`${d}T00:00:00`).getDay()))].sort((a, b) => a - b);
    setFormData((p) => ({
      ...p,
      fechasTrabajadas: dias,
      startDate: dias[0],
      dueDate: dias[dias.length - 1],
      diasSemana,
      diasPorSemana: String(diasSemana.length),
      diasRotativos: false,
      workdaysCount: String(dias.length),
      // Es el número real de jornadas, no un ajuste a mano: cada día marcado es una.
      workdaysOverridden: false,
      workdaysOverrideReason: "",
      workdaysOverrideNote: "",
    }));
  };

  /*
    LA DIFERENCIA CONTRA LA ESCALA, cuando se pisa el importe propuesto.

    El número de la categoría es el del convenio; el que se paga puede ser otro, y está bien que lo
    sea. Lo que no puede pasar es que la diferencia quede invisible: pagar de menos que la escala es
    un problema, y pagar de más es una decisión que alguien tomó y conviene que se vea escrita.

    `null` mientras no haya categoría o el importe coincida: no hay nada que mostrar.
  */
  const diferenciaContraEscala = useMemo(() => {
    // Con el multiplicador incluido: si no, un contrato de 1,5 mostraría siempre «+50% contra la escala».
    const escala = importePorJornadaDeCategoria(categoriaElegida || undefined, multiplicadorDiario);
    const cargado = Number(formData.dailyRate);
    if (!escala || !Number.isFinite(cargado) || !formData.dailyRate) return null;
    const delta = Number((cargado - escala).toFixed(2));
    return delta === 0 ? null : { escala, delta };
  }, [categoriaElegida, formData.dailyRate, multiplicadorDiario]);

  const limiteHoras = contratoElegido?.data?.horasPorJornada ?? null;
  const limiteDias = contratoElegido?.data?.diasPorSemana ?? null;
  const duracionHorario = horasDelHorario(formData.inTime, formData.outTime);
  const horarioExcedido = limiteHoras != null && duracionHorario != null && duracionHorario > limiteHoras;
  useEffect(() => {
    if (limiteDias == null) return;
    setFormData((p) => {
      if ((Number(p.diasPorSemana) || 0) <= limiteDias) return p;
      // Con días fijos se quedan los primeros de la semana (lunes primero); con rotativos, el conjunto entre los que rota no cambia.
      const lunesPrimero = [1, 2, 3, 4, 5, 6, 0];
      const dias = p.diasRotativos ? p.diasSemana : lunesPrimero.filter((d) => p.diasSemana.includes(d)).slice(0, limiteDias).sort((a, b) => a - b);
      return { ...p, diasPorSemana: String(limiteDias), diasSemana: dias };
    });
  }, [limiteDias]);

  /** El trámite que declara cada tipo de contrato, por sus plantillas. Es lo que pinta el badge. */
  const tramitePorContrato = useMemo(() => {
    const m = new Map<string, TipoImpositivo>();
    for (const c of contratos) {
      const t = tipoImpositivoDeContrato(c._id, contratoFrames, todosLosEstados);
      if (t) m.set(c._id, t);
    }
    return m;
  }, [contratos, contratoFrames, todosLosEstados]);

  /** El estado impositivo del tipo elegido: de ahí salen el nombre y el color del badge. */
  const estadoDelTramite = useMemo(() => {
    const tipo = formData.contratoId ? tramitePorContrato.get(formData.contratoId) : undefined;
    return tipo ? impositivos.find((e) => e.data?.tipoImpositivo === tipo) || null : null;
  }, [formData.contratoId, tramitePorContrato, impositivos]);

  /*
    LAS COORDINACIONES DE QUIEN PIDE EN EL PROYECTO ELEGIDO.

    El server manda en `coordinatorAssignments` sólo las propias (ver `?slim=true` en
    `routes/projects.ts`), así que esto es «mis áreas y turnos acá». Es lo que se deja puesto en la
    solicitud: el coordinador pide el alta para su área, no para el proyecto entero.
  */
  const coordinacionesEnProyecto = useMemo<OpcionAreaTurno[]>(() => {
    return ((proyectoElegido as any)?.coordinatorAssignments || [])
      .filter((a: any) => a?.areaId && a?.shiftId)
      .map((a: any) => opcionAreaTurno(a.areaId, a.shiftId));
  }, [proyectoElegido]);

  /*
    QUIÉN ELIGE ENTRE TODAS LAS ÁREAS Y TURNOS DEL PROYECTO, aunque además supervise algunas.

    El coordinador del proyecto (el responsable, `metadata.responsableId` = su id de FRAME) contrata
    para cualquier área, y lo mismo quien tiene la capacidad de serlo (`PROJECT_SUPERVISOR`). Antes
    alcanzaba con tener UNA área/turno a cargo en el proyecto para que la lista se redujera a esas:
    quien es las dos cosas —responsable y a cargo de un turno— no podía pedir un alta para otra área.
    Sólo quien supervisa áreas y turnos, sin nada más, sigue viendo únicamente las suyas.
  */
  const idFrameMio = (profile as any)?.metadata?.id ?? (yo as any)?.metadata?.id;
  const esResponsableDelProyecto = idFrameMio != null && (proyectoElegido as any)?.metadata?.responsableId != null && String((proyectoElegido as any).metadata.responsableId) === String(idFrameMio);
  const veTodoElProyecto = esResponsableDelProyecto || (yo?.permissions || []).includes(PROJECT_SUPERVISOR);
  const coordinaEnElProyecto = !veTodoElProyecto && coordinacionesEnProyecto.length > 0;

  /*
    Y SI QUIEN PIDE NO SUPERVISA NADA ACÁ, O ES COORDINADOR DEL PROYECTO (ver `veTodoElProyecto`), TODAS LAS DEL PROYECTO.

    El área y turno es obligatorio: es lo que precarga el wizard de aprobación. El listado de proyectos
    del móvil es liviano y no trae las áreas, así que se pide el proyecto con `team: "ids"` (sin el
    equipo poblado, que pesa MB). `null` mientras llega.
  */
  const [areasDelProyecto, setAreasDelProyecto] = useState<OpcionAreaTurno[] | null>(null);
  useEffect(() => {
    const id = proyectoElegido?._id;
    setAreasDelProyecto(null);
    if (!id || coordinaEnElProyecto) return;
    let cancelado = false;
    projectsAPI
      .getProject(id, { team: "ids" })
      .then((p) => {
        if (cancelado) return;
        setAreasDelProyecto(((p.areasConfig || []) as any[]).flatMap((ac) => (ac.shiftIds || []).map((s: any) => opcionAreaTurno(ac.areaId, s))));
      })
      .catch(() => !cancelado && setAreasDelProyecto([]));
    return () => {
      cancelado = true;
    };
  }, [proyectoElegido?._id, coordinaEnElProyecto]);

  /** Lo que se puede elegir. `null` = todavía cargando las áreas del proyecto. */
  const opcionesDelProyecto: OpcionAreaTurno[] | null = coordinaEnElProyecto ? coordinacionesEnProyecto : areasDelProyecto;
  /*
    EL TURNO VA PRIMERO Y EL HORARIO SALE DE ÉL.

    Antes era al revés: se cargaba el horario y de los turnos quedaban sólo los que lo cubrían. Había
    que saber de memoria a qué hora entra cada turno para que apareciera el que se quería, y hasta
    entonces la lista estaba deshabilitada. Ahora se elige el área y el turno —que es el dato que quien
    pide el alta tiene— y el horario queda puesto con el del turno, modificable abajo.

    Así que acá no se filtra nada: se ofrecen todos los turnos que le corresponden a la persona.
  */
  const opcionesAreaTurno: OpcionAreaTurno[] | null = opcionesDelProyecto;

  /** Por área, con sus turnos en el orden del día: con muchas combinaciones, una lista plana no se lee. */
  const areasAgrupadas = useMemo(() => {
    const porArea = new Map<string, { areaId: string; nombre: string; turnos: OpcionAreaTurno[] }>();
    for (const o of opcionesAreaTurno || []) {
      const area = porArea.get(o.areaId) || { areaId: o.areaId, nombre: o.areaNombre, turnos: [] };
      if (!area.turnos.some((t) => t.shiftId === o.shiftId)) area.turnos.push(o);
      porArea.set(o.areaId, area);
    }
    return [...porArea.values()].map((a) => ({ ...a, turnos: a.turnos.sort((x, y) => x.orden.localeCompare(y.orden)) })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [opcionesAreaTurno]);

  /** La combinación elegida, si es una de las ofrecidas. Sin esto la solicitud no se envía. */
  const areaTurnoElegido = (opcionesAreaTurno || []).find((o) => formData.areaShiftAssignments.some((a) => a.areaId === o.areaId && a.shiftIds.includes(o.shiftId))) || null;

  /*
    LAS ÁREAS SE COLAPSAN.

    Un proyecto grande son muchas áreas con tres turnos cada una: abiertas todas, la lista empujaba el
    resto del formulario fuera de la pantalla. Arrancan cerradas, salvo la del turno ya elegido —para
    verlo sin buscarlo— o la única, si hay una sola. Cerrada, el encabezado dice el turno elegido ahí.
    `null` = nadie tocó nada todavía: manda ese default. Cambiar de proyecto vuelve a empezar.
  */
  const [areasTocadas, setAreasTocadas] = useState<Set<string> | null>(null);
  useEffect(() => setAreasTocadas(null), [isOpen, proyectoElegido?._id]);
  const areasAbiertas: Set<string> = areasTocadas ?? new Set(areasAgrupadas.length === 1 ? [areasAgrupadas[0].areaId] : areaTurnoElegido ? [areaTurnoElegido.areaId] : []);
  const alternarArea = (areaId: string) => {
    const next = new Set(areasAbiertas);
    if (next.has(areaId)) next.delete(areaId);
    else next.add(areaId);
    setAreasTocadas(next);
  };

  /*
    El trámite se DEDUCE del tipo de contrato elegido y se guarda con la solicitud.

    Antes se elegía a mano, con «Pedido de ARCA» preseleccionado. Ahora el tipo de contrato lo
    determina, así que este efecto sólo copia el resultado al formulario: el wizard de aprobación
    sigue leyendo `tipoImpositivo` para precargarse, y así no se entera del cambio.
  */
  useEffect(() => {
    const tipo = formData.contratoId ? tramitePorContrato.get(formData.contratoId) || "" : "";
    if (tipo !== formData.tipoImpositivo) setFormData((p) => ({ ...p, tipoImpositivo: tipo }));
  }, [formData.contratoId, formData.tipoImpositivo, tramitePorContrato]);

  /*
    Con UNA sola opción —el coordinador de un área y un turno, el caso normal— queda puesta sola: es
    exactamente el dato que el alta necesita. Con varias se elige abajo. Si lo que estaba elegido ya
    no es una opción (cambió el proyecto), se limpia. Mientras cargan las áreas no se toca nada: una
    solicitud que se está editando no tiene que perder su área por un instante sin datos.
  */
  useEffect(() => {
    if (!opcionesAreaTurno) return;
    if (opcionesAreaTurno.length === 1) {
      const { areaId, shiftId } = opcionesAreaTurno[0];
      setFormData((p) => (p.areaShiftAssignments.length === 1 && p.areaShiftAssignments[0].areaId === areaId && p.areaShiftAssignments[0].shiftIds.includes(shiftId) ? p : { ...p, areaShiftAssignments: [{ areaId, shiftIds: [shiftId] }] }));
      return;
    }
    setFormData((p) => {
      const sigueValida = p.areaShiftAssignments.some((a) => opcionesAreaTurno.some((o) => o.areaId === a.areaId && a.shiftIds.includes(o.shiftId)));
      return sigueValida || p.areaShiftAssignments.length === 0 ? p : { ...p, areaShiftAssignments: [] };
    });
  }, [opcionesAreaTurno]);

  /*
    EL HORARIO DEL TURNO ELEGIDO, COPIADO AL FORMULARIO.

    Se aplica cuando CAMBIA el turno y no en cada render: si se reescribiera siempre, no se podría
    modificar la entrada ni la salida, que es justo para lo que está el campo («Modificar horario»).

    El primer turno que se ve con un horario ya cargado NO se pisa: es una solicitud que se está
    editando, o una renovación precargada del contrato anterior, y ahí el horario guardado manda —puede
    diferir del del turno a propósito—. Recién un cambio posterior de turno trae su horario.
  */
  const turnoAplicado = useRef<string>("");
  useEffect(() => {
    const clave = areaTurnoElegido ? `${areaTurnoElegido.areaId}::${areaTurnoElegido.shiftId}` : "";
    if (clave === turnoAplicado.current) return;
    const yaTeniaHorario = turnoAplicado.current === "" && !!formData.inTime && !!formData.outTime;
    turnoAplicado.current = clave;
    if (!clave || yaTeniaHorario) return;
    const { inicio, fin } = areaTurnoElegido!;
    if (!inicio || !fin) return;
    setFormData((p) => (p.inTime === inicio && p.outTime === fin ? p : { ...p, inTime: inicio, outTime: fin }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaTurnoElegido]);

  /*
    ¿El horario elegido se sale del turno? (ver `horarioDentroDelTurno`). Sólo para avisar: no frena.
  */
  const fueraDelTurno = !!areaTurnoElegido?.horario && !!formData.inTime && !!formData.outTime && !horarioDentroDelTurno(areaTurnoElegido.inicio, areaTurnoElegido.fin, formData.inTime, formData.outTime);

  /*
    LOS DÍAS Y EL HORARIO NO EXISTEN HASTA QUE HAYA ÁREA Y TURNO.

    Antes estaban sueltos en el formulario y sólo se deshabilitaba el horario: se podía declarar «5
    días, lunes a viernes, de 00:00 a 07:00» sin decir de qué turno se estaba hablando, y al elegirlo
    el horario se pisaba con el del turno —trabajo tirado—. Ahora los dos campos viven adentro del
    turno elegido, que es a lo que pertenecen: son cómo trabaja ESTA persona en ESE turno.

    Si el proyecto no tiene áreas y turnos cargados no se pide ninguno (ver el envío): ahí se muestran
    igual y sueltos (`proyectoSinAreas`), porque esconderlos dejaría la solicitud sin días ni horario
    y sin forma de cargarlos.
  */
  const proyectoSinAreas = opcionesAreaTurno !== null && opcionesAreaTurno.length === 0;

  /*
    CÓMO TRABAJA EN ESE TURNO: los días, el horario y las jornadas, adentro del turno que se eligió.

    Es una sola cosa —cuántos días por semana y cuáles trabaja en ese turno, a qué hora entra y sale,
    y cuántas jornadas suma el período— y estaba repartida en tres lugares del formulario, dos de
    ellos antes de que se supiera de qué turno se hablaba. Va adentro del área desplegada, debajo de
    los turnos, para que se lea como lo que es: la continuación de haber elegido ese turno.

    Es una función y no un bloque suelto porque se dibuja en tres lugares: adentro del área elegida,
    debajo del área y turno únicos cuando el proyecto ofrece uno solo, y sola cuando el proyecto no
    tiene áreas configuradas —ahí no hay turno al que pertenecer, y esconderla dejaría la solicitud
    sin días, sin horario y sin jornadas—.

    Cuántos días por semana se admiten como MÁXIMO lo sigue mandando el tipo de contrato
    (`limiteDias`): el turno dice cuáles, el contrato cuántos.
  */
  const panelComoTrabaja = (titulo: string) => (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{titulo}</p>
      {/*
        CON DÍAS SUELTOS NO HAY DÍAS POR SEMANA QUE ELEGIR.

        Todo sale de los días marcados en el calendario: una jornada por día y los días de la semana
        que tocan. Dejar los campos abiertos permitiría cargar «5 días por semana» sobre tres días
        marcados —un dato que se contradice con el calendario de arriba—.
      */}
      {porDiasSueltos ? (
        <div id="bloque-dias" className="rounded-lg border border-slate-200 bg-white/60 p-2.5 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
          {formData.fechasTrabajadas.length > 0 ? (
            <>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {formData.fechasTrabajadas.length} {formData.fechasTrabajadas.length === 1 ? "jornada" : "jornadas"}
              </span>
              : {formData.fechasTrabajadas.map((d) => new Date(`${d}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })).join(" · ")}
            </>
          ) : (
            "Marcá los días arriba: de ahí salen las jornadas y los días que trabaja."
          )}
        </div>
      ) : (
        <div id="bloque-dias">
          <DiasDeTrabajo
            variante="mobile"
            jornadas={Number(formData.diasPorSemana) || 0}
            onJornadas={(n) => setFormData((p) => ({ ...p, diasPorSemana: n ? String(limiteDias != null ? Math.min(n, limiteDias) : n) : "" }))}
            rotativos={formData.diasRotativos}
            onRotativos={cambiarRotativos}
            dias={formData.diasSemana}
            onDias={(d) => setFormData((p) => ({ ...p, diasSemana: d }))}
            limiteContrato={limiteDias}
            errorDiasPorSemana={intentoEnviar ? erroresJornadas.diasPorSemana : undefined}
            errorDias={intentoEnviar ? erroresJornadas.dias : undefined}
          />
        </div>
      )}
      {/*
        EL HORARIO, QUE YA VIENE PUESTO CON EL DEL TURNO.
        Se llama «Modificar» porque es lo que se hace acá: el turno elegido lo completa, y esto
        es para el caso en que esta persona entra o sale a otra hora que el turno.
      */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <FontAwesomeIcon icon={faClock} className="text-blue-500 text-[10px]" />
          Modificar Horario (Entrada - Salida)*
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SelectorHora valor={formData.inTime} onCambio={(h) => setFormData((p) => ({ ...p, inTime: h, outTime: !p.outTime && h && limiteHoras != null ? sumarMinutos(h, limiteHoras * 60) : p.outTime }))} etiqueta="Entrada" placeholder="Entrada" className={CLASE_HORA} />
          </div>
          <FontAwesomeIcon icon={faArrowRight} className="text-slate-400 text-xs" />
          <div className="flex-1">
            {/* `desde`: en la salida, cada hora muestra cuántas horas da la jornada. */}
            <SelectorHora valor={formData.outTime} onCambio={(h) => setFormData((p) => ({ ...p, outTime: h }))} etiqueta="Salida" placeholder="Salida" className={CLASE_HORA} desde={formData.inTime} />
          </div>
        </div>
        {horarioExcedido ? (
          <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
            El tipo de contrato admite hasta {limiteHoras} h por jornada y el horario suma {duracionHorario?.toLocaleString("es-AR", { maximumFractionDigits: 2 })} h. Ajustá la entrada o la salida.
          </p>
        ) : (
          <p className="text-[11px] text-slate-400">
            {areaTurnoElegido?.horario ? `Viene del turno ${areaTurnoElegido.turnoNombre} (${areaTurnoElegido.horario}). Cambialo si esta persona entra o sale a otra hora.` : "Cargá la entrada y la salida: este proyecto no tiene turnos de los que sacarlas."}
            {limiteHoras != null && ` Hasta ${limiteHoras} h por jornada, según el tipo de contrato.`}
          </p>
        )}
        {/*
          EL HORARIO SE SALE DEL TURNO: SE AVISA, NO SE BLOQUEA.
          Que alguien entre antes o se quede después del turno es legítimo y hay que poder pedirlo;
          lo que no puede pasar es que se mande sin que nadie lo haya visto. Por eso es un aviso al
          lado del campo y no un error: la solicitud se envía igual.
        */}
        {fueraDelTurno && (
          <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
            Ojo: {formData.inTime} a {formData.outTime} se sale del turno {areaTurnoElegido!.turnoNombre} ({areaTurnoElegido!.horario}). Se puede pedir igual.
          </p>
        )}
      </div>
      {/*
        Las jornadas TOTALES (22, 30…): lo que multiplica al sueldo por jornada.

        Con días sueltos son los días marcados y no se pregunta: el bloque entero —con su cálculo, su
        ajuste a mano y su motivo— existe para repartir un período entre meses, y acá no hay período.
      */}
      {!porDiasSueltos && (
      <div className="md:col-span-3">
        <JornadasSolicitud
          desde={periodo.desde}
          hasta={periodo.hasta}
          rotativos={formData.diasRotativos}
          calculadas={jornadasCalculadas}
          dias={formData.diasSemana}
          valor={formData.workdaysCount}
          onValor={(v) => setFormData((p) => ({ ...p, workdaysCount: v }))}
          ajustado={formData.workdaysOverridden}
          motivo={formData.workdaysOverrideReason}
          nota={formData.workdaysOverrideNote}
          onEditarManual={editarJornadasAMano}
          onCancelarAjuste={volverAlCalculado}
          onMotivo={(m) => setFormData((p) => ({ ...p, workdaysOverrideReason: m }))}
          onNota={(n) => setFormData((p) => ({ ...p, workdaysOverrideNote: n }))}
          errores={erroresJornadas}
          mostrarErrores={intentoEnviar}
          aviso={avisoJornadas || avisoIndeterminado(formData.startDate, indeterminado)}
        />
      </div>
      )}
    </div>
  );


  /*
    QUIÉNES PUEDEN SER REEMPLAZADOS: el equipo del proyecto elegido, buscado en el server.

    Es la misma consulta que el buscador de personas, acotada al proyecto (`projectId`). Antes se
    filtraba la lista completa en el teléfono; sin esa lista, el equipo lo arma el server, que además
    sabe quién está en el proyecto sin tener que mirar los `metadata.projects` de todo el mundo.

    La persona del alta se saca acá: nadie se reemplaza a sí mismo.
  */
  const [candidatosAReemplazar, setCandidatosAReemplazar] = useState<any[]>([]);
  const pedidoReemplazoRef = useRef(0);
  const proyectoDelAlta = formData.projectIds[0] || "";
  useEffect(() => {
    if (!isOpen || !proyectoDelAlta) {
      setCandidatosAReemplazar([]);
      return;
    }
    const id = ++pedidoReemplazoRef.current;
    const t = setTimeout(() => {
      usersAPI
        .list({ page: 1, limit: POR_PAGINA, metadataActivo: "true", picker: true, projectId: proyectoDelAlta, email: replacedSearchTerm.trim() || undefined })
        .then((r) => {
          if (id !== pedidoReemplazoRef.current) return;
          setCandidatosAReemplazar((r.users || []).filter((u: any) => !selectedUser || String(u._id) !== String(selectedUser._id)));
        })
        .catch((e) => {
          if (id !== pedidoReemplazoRef.current) return;
          console.error("Error buscando a quién reemplaza:", e);
          setCandidatosAReemplazar([]);
        });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, proyectoDelAlta, replacedSearchTerm, selectedUser?._id]);

  // Auto-select project if only one exists or when projects list changes
  useEffect(() => {
    if (projects.length > 0 && formData.projectIds.length === 0) {
      setFormData((prev) => ({ ...prev, projectIds: [projects[0]._id] }));
    }
  }, [projects, formData.projectIds.length]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: val }));
  };

  /**
   * Elegir a la persona del alta. Es el mismo cuerpo que tenía el desplegable, movido a una función
   * para que la ventana lo use sin duplicarlo.
   *
   * Trae consigo el rol y la categoría que la persona ya tiene cargados: es la razón por la que
   * conviene elegir de la lista en vez de tipear el nombre a mano.
   */
  const elegirPersona = (user: any) => {
    const userFullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
    const meta = user.metadata || {};
    const projects = Array.isArray(meta.projects) ? meta.projects : [];

    const externalRolFrames = user.externalInfo?.rolFrames || [];

    // Collect all assigned role frame IDs and category IDs from project history
    // Los roles frame de una persona pueden estar guardados con tres nombres
    // distintos según cómo se creó el usuario. Si no se leen los tres, la
    // solicitud arranca sin rol aunque la persona lo tenga cargado
    // (`roles_frame` es el campo real del modelo, y era el que faltaba).
    const assignedRoleFrameIds = new Set<string>();
    [...(meta.roles_frame || []), ...(meta.rolesFrameIds || []), ...(meta.roleFrameId ? [meta.roleFrameId] : [])].forEach((rf: any) => {
      const rfId = typeof rf === "string" ? rf : rf?._id;
      if (rfId) assignedRoleFrameIds.add(String(rfId));
    });

    const assignedCategoriaSatIds = new Set<string>();
    if (meta.categoriaSatId) assignedCategoriaSatIds.add(meta.categoriaSatId);

    // Try to match external roles by name
    externalRolFrames.forEach((rfName: string) => {
      const match = roleFrames.find((rf) => rf.name === rfName);
      if (match) assignedRoleFrameIds.add(match._id);
    });

    projects.forEach((proj: any) => {
      const rfMatch = roleFrames.find((rf) => rf._id === proj.roleFrameId || rf.externalId === String(proj.rol_frame_id) || rf.name === proj.nombre_rol_frame);
      if (rfMatch) assignedRoleFrameIds.add(rfMatch._id);

      const catMatch = categoriasSat.find((cat) => cat._id === proj.categoriaSatId || cat.externalId === String(proj.categoria_sat_id) || cat.name === proj.nombre_categoria_sat);
      if (catMatch) assignedCategoriaSatIds.add(catMatch._id);
    });

    // Convert sets to arrays for the selectedUser state
    const roleFrameIds = Array.from(assignedRoleFrameIds);
    const categoriaSatIds = Array.from(assignedCategoriaSatIds);

    setFormData((prev) => ({
      ...prev,
      fullName: userFullName,
      // Pre-select the first one if available
      // UNO SOLO, no todos los que tenga la persona: la solicitud declara con qué rol la van a
      // contratar, y alguien con cinco oficios cargados no entra por los cinco a la vez. Los demás
      // se agregan a mano con el «+» si de verdad corresponden.
      roleFrameIds: roleFrameIds.length > 0 ? [roleFrameIds[0]] : prev.roleFrameIds,
      categoriaSatId: categoriaSatIds[0] || prev.categoriaSatId,
    }));
    setUserSearchTerm(userFullName);
    setSelectedUser({
      ...user,
      metadata: {
        ...meta,
        roleFrameIds,
        categoriaSatIds,
      },
    });
    setPersonaModalOpen(false);
  };

  /** Los roles elegidos, resueltos a su ficha para poder mostrar el nombre. */
  const rolesElegidos = formData.roleFrameIds.map((id) => roleFrames.find((rf) => rf._id === id)).filter(Boolean) as RoleFrameItem[];

  /** Agrega o saca un rol. Un rol ya elegido se destilda, como en Usuarios. */
  const alternarRol = (id: string) => setFormData((prev) => ({ ...prev, roleFrameIds: prev.roleFrameIds.includes(id) ? prev.roleFrameIds.filter((x) => x !== id) : [...prev.roleFrameIds, id] }));

  /**
   * SE OFRECE EL CATÁLOGO ENTERO, con los de la persona arriba.
   *
   * Antes la lista se recortaba a los oficios que la persona tenía cargados, y eso dejaba sin salida
   * al caso más común: el coordinador la contrata para algo que no figura en su ficha —porque nunca lo
   * hizo acá, o porque quedó incompleta— y no había forma de decirlo. Ahora están todos, y los suyos
   * se muestran primero y marcados, que es la señal que hacía falta: no es lo mismo elegir uno de los
   * suyos que sumarle uno nuevo.
   */
  const rolesDisponibles = useMemo(() => {
    const base = rolSearchTerm.trim() ? roleFrames.filter((rf) => fuzzyMatch(rf.name, rolSearchTerm)) : roleFrames;
    if (rolesDelUsuario.length === 0) return base;
    const suyos = base.filter((rf) => rolesDelUsuario.includes(rf._id));
    return [...suyos, ...base.filter((rf) => !rolesDelUsuario.includes(rf._id))];
  }, [roleFrames, rolesDelUsuario, rolSearchTerm]);

  /** Los elegidos que la persona NO tenía en su ficha: se le suman al guardar. */
  const rolesNuevosParaLaFicha = useMemo(() => (selectedUser ? formData.roleFrameIds.filter((id) => !rolesDelUsuario.includes(id)) : []), [selectedUser, formData.roleFrameIds, rolesDelUsuario]);

  /*
    LAS CATEGORÍAS QUE SE OFRECEN: el cruce rol empresa ∩ convenio ∩ convenios de la empleadora.

    Antes se filtraba SÓLO por el rol empresa, sin mirar el convenio: se podía elegir el convenio
    0634/11 y una categoría del 0131/75. La pantalla lo aceptaba y ARCA rechazaba el alta, que es la
    peor forma de un error —se descubre lejos de donde se cometió—.

    La regla es la misma que usa el escritorio, literalmente la misma función: ver
    `utils/seleccionConvenioCategoria.ts`. Con varios oficios elegidos se SUMAN sus categorías: un
    Animador 2D que además es Asistente de Cámara puede entrar por cualquiera de los dos.
  */
  const { categorias: categoriasOfrecidasLista, rolNoTieneCategoriasDelConvenio, ocultasPorValoracion, rolNoTieneCategoriasDeLaValoracion } = useMemo(
    () =>
      categoriasOfrecidas({
        rolesFrame: roleFrames.filter((rf) => formData.roleFrameIds.includes(rf._id)),
        convenioElegido: convenioCct,
        codigosEmpleadora,
        categorias: categoriasSat,
        verTodasDelConvenio,
        categoriaElegidaId: categoriasSat.find((c) => c._id === formData.categoriaSatId)?.data?.id,
        /*
          La valoración del proyecto elegido.

          Una solicitud puede pedir varios proyectos, y en ese caso `proyectoElegido` es el primero:
          no hay una valoración única que aplicar. Se deja pasar sin filtrar —el alta real la hace
          después el wizard, que sí trabaja contra UN proyecto y revalida contra el server— en vez de
          recortar con el criterio del primero de la lista, que sería adivinar.
        */
        valoracionProyecto:
          formData.projectIds.length === 1 && proyectoElegido?.valoracionId
            ? typeof proyectoElegido.valoracionId === "object"
              ? String((proyectoElegido.valoracionId as any)._id)
              : String(proyectoElegido.valoracionId)
            : "",
      }),
    [roleFrames, formData.roleFrameIds, convenioCct, codigosEmpleadora, categoriasSat, verTodasDelConvenio, formData.categoriaSatId, formData.projectIds, proyectoElegido],
  );

  /*
    Las mismas categorías, resueltas al documento del catálogo.

    La lista de arriba trabaja con `data.id` —es el identificador que comparten el catálogo y la copia
    denormalizada de las funciones FRAME—, pero la solicitud guarda el `_id`, que es lo que el wizard
    de aprobación busca después. Traducir acá una vez evita hacerlo en cada lugar que la use.
  */
  const categoriasDisponibles = useMemo(() => {
    const porDataId = new Map(categoriasSat.map((c) => [String(c.data?.id), c]));
    return categoriasOfrecidasLista.map((c) => porDataId.get(String(c.id))).filter(Boolean) as CategoriaSatItem[];
  }, [categoriasOfrecidasLista, categoriasSat]);


  /*
    EL NIVEL DE CADA CATEGORÍA (Oro, Plata…), para verlo mientras se elige.

    La lista de arriba (`categoriasOfrecidasLista`) ya trae el `valoracionId` de la asociación
    función ↔ categoría; acá se le pone el nombre y el color. Sin esto hay que elegir una para recién
    después enterarse de si corresponde al nivel del proyecto.
  */
  const valoraciones = useValoraciones();
  const nivelDeCategoria = useMemo(() => {
    const porDataId = new Map(categoriasOfrecidasLista.map((c) => [String(c.id), String(c.valoracionId || "")]));
    return (cat: CategoriaSatItem) => {
      const id = porDataId.get(String(cat.data?.id));
      const v = id ? valoraciones.find((x) => String(x._id) === id) : undefined;
      return v ? { nombre: String(v.name), color: String(v.color || "") } : null;
    };
  }, [categoriasOfrecidasLista, valoraciones]);

  /** Lo que muestra la ventana de categorías: las ofrecidas, filtradas por el buscador. */
  const categoriasParaElegir = useMemo(() => (categoriaBusqueda.trim() ? categoriasDisponibles.filter((c) => fuzzyMatch(c.name, categoriaBusqueda) || String(c.data?.codigoArca || "").includes(categoriaBusqueda.trim())) : categoriasDisponibles), [categoriasDisponibles, categoriaBusqueda]);

  /*
    LA CASCADA: cambiar el convenio limpia la categoría, pero SÓLO si no le pertenece.

    Limpiar siempre castigaba al que volvía a mirar el mismo convenio, y no limpiar nunca dejaba la
    contradicción que ARCA rechaza. Va con aviso: un campo que se vacía solo, sin decir por qué, se
    lee como un error de la pantalla.
  */
  useEffect(() => {
    const valido = conveniosDisponibles.some((c) => c.externalId === convenioCct);
    if (!valido) {
      const unico = conveniosDisponibles.length === 1 ? convenioPorCct.get(conveniosDisponibles[0].externalId)?._id || "" : "";
      if (formData.convenioId !== unico) setFormData((p) => ({ ...p, convenioId: unico }));
      return;
    }
    if (!formData.categoriaSatId) return;
    const cctDeLaCategoria = String(categoriasSat.find((c) => c._id === formData.categoriaSatId)?.data?.convenio || "").trim();
    if (convenioCct && cctDeLaCategoria !== convenioCct) {
      setFormData((p) => ({ ...p, categoriaSatId: "", dailyRate: "" }));
      setAvisoCascada("Se limpió la categoría: no pertenece al convenio elegido.");
    }
  }, [conveniosDisponibles, convenioCct, convenioPorCct, formData.convenioId, formData.categoriaSatId, categoriasSat]);

  /*
    EL CONVENIO SE PRECARGA DESDE EL ROL EMPRESA DE LA PERSONA.

    El oficio ya está cargado en la plataforma y sus categorías declaran a qué CCT pertenecen: si
    todas apuntan al mismo —y ese está entre los de la empleadora— no hay nada que preguntar. Elegirlo
    a mano sería pedir un dato que el sistema ya tiene.

    Sólo cuando NO hay convenio elegido: no pisa lo que alguien eligió, ni lo que traiga una solicitud
    que se está editando. Y sólo si el rol apunta a UNO: con dos, la decisión es real y se pregunta.
  */
  useEffect(() => {
    if (formData.convenioId || formData.roleFrameIds.length === 0) return;

    const cctDelRol = new Set<string>();
    for (const rf of roleFrames.filter((r) => formData.roleFrameIds.includes(r._id))) {
      for (const c of (rf.data?.categoriasSat || []) as any[]) {
        const cct = String(categoriasSat.find((x) => String(x.data?.id) === String(c?.id))?.data?.convenio || "").trim();
        if (cct && (!codigosEmpleadora || codigosEmpleadora.includes(cct))) cctDelRol.add(cct);
      }
    }
    if (cctDelRol.size !== 1) return;

    const unico = [...cctDelRol][0];
    const id = convenioPorCct.get(unico)?._id;
    if (id) setFormData((p) => ({ ...p, convenioId: id }));
  }, [formData.convenioId, formData.roleFrameIds, roleFrames, categoriasSat, codigosEmpleadora, convenioPorCct]);

  /* Cambiar de convenio vuelve a esconder las que el rol no habilita: el escape es por convenio. */
  useEffect(() => {
    setVerTodasDelConvenio(false);
  }, [convenioCct]);

  /*
    Si la categoría elegida dejó de estar ofrecida —porque cambió el rol o el convenio— se limpia.

    Antes se limpiaba SIEMPRE al tocar el rol, y con varios roles eso era peor: agregar un segundo
    oficio borraba una categoría que seguía siendo válida. Ahora sólo se borra la que de verdad ya no
    corresponde, que es la que seguía viajando en el submit aunque el desplegable no la listara.
  */
  useEffect(() => {
    if (!formData.categoriaSatId) return;
    if (categoriasDisponibles.some((c) => c._id === formData.categoriaSatId)) return;
    setFormData((prev) => ({ ...prev, categoriaSatId: "", dailyRate: "" }));
    setAvisoCascada("Se limpió la categoría: ya no la habilita el rol empresa elegido.");
  }, [categoriasDisponibles, formData.categoriaSatId]);

  /*
    EL IMPORTE POR JORNADA LO PROPONE LA CATEGORÍA.

    Es `neto / 30` de la escala del convenio, el mismo número que el escritorio calcula como
    `sueldo_diario_neto`. Se PROPONE: lo pactado puede ser otro y el campo queda editable. Pero que
    haya que sacarlo a mano de una escala que la plataforma ya tiene cargada es trabajo inventado.

    Sólo pisa el campo cuando cambia la categoría, no en cada render: si no, sería imposible escribir
    un importe distinto.
  */
  const propuestaAnterior = useRef(`${formData.categoriaSatId}::${formData.contratoId}`);
  useEffect(() => {
    /*
      Se vuelve a proponer cuando cambia la categoría O el tipo de contrato: el multiplicador sale del
      contrato, así que elegir primero la categoría y después el contrato tiene que actualizar el
      número. Sin el contrato en la clave, quedaba la escala sin multiplicar.
    */
    const clave = `${formData.categoriaSatId}::${formData.contratoId}`;
    if (propuestaAnterior.current === clave) return;
    propuestaAnterior.current = clave;
    if (!formData.categoriaSatId) return;
    const propuesto = importePorJornadaDeCategoria(
      categoriasSat.find((c) => c._id === formData.categoriaSatId),
      multiplicadorDiario,
    );
    if (propuesto > 0) setFormData((p) => ({ ...p, dailyRate: String(propuesto) }));
  }, [formData.categoriaSatId, formData.contratoId, categoriasSat, multiplicadorDiario]);

  /*
    AL ELEGIR UN TIPO DE SERVICIOS SE SUELTA LA CATEGORÍA, y el importe se queda.

    La categoría escondida seguiría viajando si no se limpia. El importe, en cambio, es lo que se va a
    pagar y ahora se carga a mano: borrarlo sería hacerle perder a alguien lo que acaba de escribir.
    El convenio no se toca acá —lo reponen solos los efectos de arriba— y simplemente no se manda.
  */
  useEffect(() => {
    if (!esServicios || !formData.categoriaSatId) return;
    setFormData((p) => ({ ...p, categoriaSatId: "" }));
    setAvisoCascada("");
  }, [esServicios, formData.categoriaSatId]);

  /** El motivo elegido, para mostrar su nombre sin repetir el `find` en cada lugar donde se usa. */
  const motivoElegido = motivos.find((m) => String(m._id) === String(formData.motivoReemplazoId)) || null;

  /*
    CÓMO SE LLAMA LA PERSONA REEMPLAZADA.

    Sale de la lista de candidatos cuando se la acaba de elegir. Al ABRIR una solicitud ya guardada
    puede no estar ahí —el id viene de `metadata`, y los candidatos son los del proyecto y la
    búsqueda actual—, así que en ese caso se la pide por su id.
  */
  const [nombreReemplazadoPedido, setNombreReemplazadoPedido] = useState<{ id: string; nombre: string } | null>(null);
  const nombreDe = (u: any) => (u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "" : "");
  const enCandidatos = formData.replacedUserId ? candidatosAReemplazar.find((c) => String(c._id) === String(formData.replacedUserId)) : null;
  const nombreReemplazado = enCandidatos ? nombreDe(enCandidatos) : nombreReemplazadoPedido?.id === String(formData.replacedUserId) ? nombreReemplazadoPedido.nombre : "";
  useEffect(() => {
    const id = formData.replacedUserId;
    if (!isOpen || !id || enCandidatos || nombreReemplazadoPedido?.id === String(id)) return;
    let vigente = true;
    void traerPersonaPorId(String(id))
      .then((u) => { if (vigente && u) setNombreReemplazadoPedido({ id: String(id), nombre: nombreDe(u) }); })
      .catch((e) => console.error("Error trayendo a la persona reemplazada:", e));
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, formData.replacedUserId, enCandidatos]);

  /*
    ═══ LAS JORNADAS: CALCULADAS, O A MANO CON MOTIVO ═══  (la regla completa, en `utils/jornadas.ts`)

    Con días fijos salen del calendario —cuántas veces caen los días marcados entre las dos fechas— y
    se recalculan solas ante cualquier cambio de fechas, días o del switch. Con rotativos no hay patrón
    del cual deducirlas: se cargan a mano y ahí no existe «calculado» ni ajuste.
  */
  // Tiempo indeterminado: sin fecha de baja se cuenta sobre el mes del alta (ver `periodoDeCalculo`).
  const indeterminado = !!contratoElegido?.data?.esTiempoIndeterminado;
  const periodo = useMemo(() => periodoDeCalculo(formData.startDate, formData.dueDate, indeterminado), [formData.startDate, formData.dueDate, indeterminado]);

  /*
    ¿SE SUPERPONE CON LO QUE LA PERSONA YA TIENE? Contratos en cualquier proyecto (también este) y otras
    solicitudes pendientes suyas. Se pregunta al server mientras se carga —con una pausa, para no pedir
    en cada tecla— y se muestra arriba de Comentarios; al enviar, si alguno es de HORARIO, se pide
    confirmación. Regla en `server/src/utils/superposicionContratos.ts`. Son avisos: no frenan el alta.
  */
  const [avisosSuperposicion, setAvisosSuperposicion] = useState<AvisoSuperposicion[]>([]);
  const claveSuperposicion = JSON.stringify([
    selectedUser?._id,
    formData.startDate,
    indeterminado && !porDiasSueltos ? "" : formData.dueDate,
    formData.fechasTrabajadas,
    formData.diasSemana,
    formData.diasRotativos,
    formData.inTime,
    formData.outTime,
    formData.areaShiftAssignments,
  ]);
  useEffect(() => {
    const personaId = selectedUser?._id;
    const hayFechas = porDiasSueltos ? formData.fechasTrabajadas.length > 0 : !!formData.startDate;
    if (!isOpen || !personaId || !hayFechas) {
      setAvisosSuperposicion([]);
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      usersAPI
        .superposiciones(
          personaId,
          {
            desde: porDiasSueltos ? [...formData.fechasTrabajadas].sort()[0] : formData.startDate,
            hasta: porDiasSueltos ? [...formData.fechasTrabajadas].sort().slice(-1)[0] : indeterminado ? "" : formData.dueDate,
            fechas: porDiasSueltos ? formData.fechasTrabajadas : undefined,
            dias: formData.diasSemana,
            rotativos: formData.diasRotativos,
            inTime: formData.inTime,
            outTime: formData.outTime,
            shiftIds: formData.areaShiftAssignments.flatMap((a) => a.shiftIds),
          },
          editingUser?._id,
        )
        .then((r) => vigente && setAvisosSuperposicion(r))
        // Sin respuesta no hay aviso: el alta sigue su curso y el server vuelve a revisar al guardar.
        .catch(() => vigente && setAvisosSuperposicion([]));
    }, 500);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, claveSuperposicion, porDiasSueltos, editingUser?._id]);

  /*
    Cambiar a tiempo indeterminado BORRA la fecha de baja que hubiera quedado cargada.

    Esconder el campo sin limpiarlo dejaría la fecha vieja viajando en la solicitud: no se ve, no se
    puede corregir, y llega al alta como si alguien la hubiera puesto a propósito.
  */
  useEffect(() => {
    // `porDiasSueltos` queda afuera: ahí las fechas las fija el calendario, y limpiarlas sería pelearle.
    if (indeterminado && !porDiasSueltos && formData.dueDate) setFormData((p) => ({ ...p, dueDate: "" }));
  }, [indeterminado, porDiasSueltos, formData.dueDate]);
  const jornadasCalculadas = useMemo(
    () => (formData.diasRotativos ? null : jornadasDelCalendario(periodo.desde, periodo.hasta, formData.diasSemana)),
    [formData.diasRotativos, periodo, formData.diasSemana],
  );

  /*
    Corre SÓLO cuando cambia el calculado (fechas, días o switch), no mientras se escribe: así un valor
    manual no se pisa tecla a tecla. Sin ajuste, el campo es el calculado. Con ajuste, se respeta lo
    cargado; pero si el cambio de fechas o días hace que vuelvan a coincidir, ya no hay nada que
    justificar y se sale solo del ajuste, limpiando motivo y aclaración.
  */
  useEffect(() => {
    if (formData.diasRotativos) return;
    setFormData((p) => {
      if (p.workdaysOverridden) {
        const coinciden = jornadasCalculadas !== null && p.workdaysCount !== "" && Number(p.workdaysCount) === jornadasCalculadas;
        return coinciden ? { ...p, workdaysOverridden: false, workdaysOverrideReason: "", workdaysOverrideNote: "" } : p;
      }
      const valor = jornadasCalculadas === null ? "" : String(jornadasCalculadas);
      return p.workdaysCount === valor ? p : { ...p, workdaysCount: valor };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jornadasCalculadas, formData.diasRotativos]);

  const editarJornadasAMano = () => {
    setFormData((p) => ({ ...p, workdaysOverridden: true }));
    setAvisoJornadas("");
  };

  /** Cancelar el ajuste vuelve al calculado: lo manual, el motivo y la aclaración se descartan. */
  const volverAlCalculado = () =>
    setFormData((p) => ({ ...p, workdaysOverridden: false, workdaysOverrideReason: "", workdaysOverrideNote: "", workdaysCount: jornadasCalculadas === null ? "" : String(jornadasCalculadas) }));

  /*
    Encender «Días rotativos» con un ajuste en curso lo descarta: con rotativos no hay calculado contra
    el cual justificar nada. Se avisa, porque se pierde algo que la persona escribió. Los días marcados
    NO se borran: se ignoran mientras el switch esté encendido y vuelven a contar si se apaga.
  */
  const cambiarRotativos = (v: boolean) => {
    const descartaAjuste = v && formData.workdaysOverridden;
    setFormData((p) => ({ ...p, diasRotativos: v, ...(descartaAjuste ? { workdaysOverridden: false, workdaysOverrideReason: "", workdaysOverrideNote: "" } : {}) }));
    setAvisoJornadas(descartaAjuste ? "Se descartó el ajuste manual de jornadas y su motivo: con días rotativos las jornadas se cargan a mano." : "");
  };

  const datosJornadas = {
    desde: periodo.desde,
    hasta: periodo.hasta,
    diasPorSemana: formData.diasPorSemana,
    dias: formData.diasSemana,
    rotativos: formData.diasRotativos,
    jornadas: formData.workdaysCount,
    calculadas: jornadasCalculadas,
    ajustado: formData.workdaysOverridden,
    motivo: formData.workdaysOverrideReason,
    nota: formData.workdaysOverrideNote,
  };
  const erroresJornadas = erroresDeJornadas(datosJornadas);

  /*
    CON QUÉ SE CALCULAN LOS IMPORTES. Las cuentas y el ancla viven en `ImportesDelContrato`, que es el
    mismo componente que usa el alta del panel: así las dos pantallas dan el mismo número.
  */
  const diasSemanaNum = formData.diasRotativos ? Number(formData.diasPorSemana) || 0 : formData.diasSemana.length;
  // Las jornadas que se pagan: las ajustadas a mano si se ajustaron (o con días rotativos); si no, las del calendario.
  const jornadasDelContrato = (formData.workdaysOverridden || formData.diasRotativos ? Number(formData.workdaysCount) : jornadasCalculadas) || 0;
  // Cuánto dura el contrato en meses: siempre desde las fechas reales, aunque las jornadas se hayan ajustado.
  const mesesEq = useMemo(() => mesesEquivalentes(periodo.desde, periodo.hasta, formData.diasSemana), [periodo, formData.diasSemana]);
  /*
    SIN CATEGORÍA, LOS IMPORTES ESTÁN BLOQUEADOS.

    El importe sale de la escala de la categoría: cargarlo antes es escribir un número que la
    categoría va a pisar apenas se elija (y que, si no, viaja sin encuadre). Todos, incluido el total,
    porque editar cualquiera cambia la jornada. Un servicio no tiene categoría: ahí van libres.
  */
  const importesBloqueados = !esServicios && !formData.categoriaSatId;


  const handleSubmit = async () => {
    if (sinPersona) {
      sweetAlert.warning("Falta la persona", puedeCompartirLink ? "Elegí a una persona registrada. Si todavía no se registró, mandale tu link de registro desde el buscador." : "Elegí a una persona registrada. Si todavía no se registró, pedí el link de registro para mandarle.");
      return;
    }
    if (!formData.fullName ||!formData.projectIds.length || formData.roleFrameIds.length === 0 || (!esServicios && !formData.categoriaSatId)) {
      sweetAlert.warning("Campos incompletos", "Por favor completa los campos obligatorios.");
      return;
    }
    /*
      SIN ÁREA Y TURNO NO SE MANDA: es lo que precarga la aprobación. El mensaje va en el campo y la
      pantalla baja hasta él. El server también lo exige al crear.
    */
    if (!areaTurnoElegido) {
      setIntentoEnviar(true);
      document.getElementById("bloque-area-turno")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    /*
      LOS DÍAS QUE TRABAJA SON OBLIGATORIOS TAMBIÉN ACÁ.

      Una solicitud sin los días se convierte en un contrato sin los días: la carga la sigue alguien
      del otro lado, que no sabe cuáles eran y termina preguntando por mensaje. Es más barato pedirlo
      donde está la persona que lo sabe.
    /*
      SIN TIPO DE CONTRATO NO SE MANDA.

      Es lo que define qué se firma y, con eso, por qué vía se declara el vínculo ante el organismo:
      el TXT de ARCA y los papeles que hay que juntar salen de ahí. Dejarlo opcional lo convierte en
      algo que alguien completa más tarde adivinando, y adivinar mal acá se descubre recién cuando el
      alta sale mal ante ARCA.
    */
    if (!formData.contratoId && contratos.length > 0) {
      sweetAlert.warning("Falta el tipo de contrato", "Elegí qué tipo de contrato se le va a hacer a esta persona.");
      return;
    }
    if (horarioExcedido) {
      sweetAlert.warning("El horario supera el del contrato", `«${contratoElegido?.name}» admite hasta ${limiteHoras} h por jornada y el horario elegido suma ${duracionHorario?.toLocaleString("es-AR", { maximumFractionDigits: 2 })} h.`);
      return;
    }
    // Un servicio no tiene categoría que proponga el importe: si no se carga, la solicitud no dice cuánto se paga.
    if (esServicios && !(Number(formData.dailyRate) > 0)) {
      sweetAlert.warning("Falta el importe por jornada", "Es un servicio: no sale de ninguna categoría, así que hay que cargarlo a mano.");
      return;
    }

    /*
      LA CATEGORÍA TIENE QUE SER DEL CONVENIO ELEGIDO.

      La pantalla ya lo impide —la lista sale del cruce— pero esto viaja al alta de ARCA, que rechaza
      la combinación incoherente sin decir cuál de los dos estaba mal. Vale el cinturón además de los
      tirantes: un estado viejo del formulario, o un `metadata` de una solicitud que se está editando,
      pueden traer una categoría de otro convenio.
    */
    if (!esServicios && conveniosDisponibles.length > 0 && !formData.convenioId) {
      sweetAlert.warning("Falta el convenio", "Elegí el convenio: es lo que define qué categorías se le pueden dar de alta.");
      return;
    }
    const cctDeLaCategoria = String(categoriaElegida?.data?.convenio || "").trim();
    if (!esServicios && convenioCct && cctDeLaCategoria && cctDeLaCategoria !== convenioCct) {
      sweetAlert.warning("La categoría no es de ese convenio", `La categoría elegida es del convenio ${cctDeLaCategoria} y el alta va por el ${convenioCct}. ARCA rechaza esa combinación.`);
      return;
    }
    /*
      REEMPLAZO SIN REEMPLAZADO NO SE MANDA.

      Es el dato del que después cuelga la herencia de área y turno; sin él la marca de «reemplazo»
      no informa nada y alguien tiene que ir a preguntar a quién.
    */
    if (formData.isReplacement && !formData.replacedUserId) {
      sweetAlert.warning("Falta a quién reemplaza", "Marcaste que es un reemplazo: elegí a quién reemplaza, o apagá el switch.");
      return;
    }
    /*
      Y POR QUÉ FALTA. Un reemplazo sin motivo no se puede liquidar igual: no es lo mismo cubrir
      vacaciones que una enfermedad o un cambio de turno, y el que carga el alta es el único que lo
      sabe en ese momento.
    */
    if (formData.isReplacement && !formData.motivoReemplazoId && motivos.length > 0) {
      sweetAlert.warning("Falta el motivo", "Indicá por qué falta la persona que se reemplaza.");
      return;
    }
    /*
      FECHAS, DÍAS Y JORNADAS: el mensaje va en el campo, no en un alert, y se lleva la pantalla hasta
      el primero que falla. Un alert se cierra y la persona tiene que volver a buscar qué estaba mal.
    */
    if (Object.keys(erroresJornadas).length > 0) {
      setIntentoEnviar(true);
      const bloque = erroresJornadas.fechas ? "bloque-fechas" : erroresJornadas.diasPorSemana || erroresJornadas.dias ? "bloque-dias" : "bloque-jornadas";
      document.getElementById(bloque)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    /*
      SUPERPOSICIÓN DE HORARIO: la persona ya tiene algo en esos días y ese horario. No se frena —los
      contratos de FRAME no siempre traen días u horario, y el aviso puede ser por falta de datos— pero
      se manda sólo con una confirmación explícita, con el detalle a la vista.
    */
    const deHorario = avisosSuperposicion.filter((a) => a.tipo === "horario");
    if (deHorario.length > 0) {
      const r: any = await sweetAlert.confirmLista("Se superpone con lo que ya tiene", deHorario.map((a) => a.mensaje), "¿Pedir el alta igual? Quien la apruebe va a ver este aviso.", "Pedir igual", "Revisar");
      if (!(r === true || r?.isConfirmed)) return;
    }

    setSubmitting(true);
    try {
      /*
        EL PAYLOAD LO ARMA LA FUNCIÓN COMPARTIDA con el alta masiva de plantillas de equipo
        (`server/src/compartido/solicitudDeContratacion.ts`): así una solicitud individual y una del lote
        son idénticas por construcción. Acá sólo se le pasan los datos del formulario.
      */
      const submitData = armarPayloadDeSolicitud({
        fullName: formData.fullName,
        projectIds: formData.projectIds,
        solicitudUserId: selectedUser?._id || undefined,
        roleFrameIds: formData.roleFrameIds,
        esServicios,
        categoriaSatId: formData.categoriaSatId,
        startDate: formData.startDate,
        dueDate: formData.dueDate,
        indeterminado,
        porDiasSueltos,
        workdaysCount: formData.workdaysCount,
        workdaysCalculated: jornadasCalculadas,
        ajusteJornadas: hayAjuste(datosJornadas),
        motivoAjuste: formData.workdaysOverrideReason,
        notaAjuste: formData.workdaysOverrideNote,
        diasPorSemana: formData.diasPorSemana,
        diasSemana: formData.diasSemana,
        diasRotativos: formData.diasRotativos,
        fechasTrabajadas: formData.fechasTrabajadas,
        inTime: formData.inTime,
        outTime: formData.outTime,
        empresaContratoId: formData.empresaContratoId,
        convenioId: formData.convenioId,
        dailyRate: formData.dailyRate,
        isReplacement: formData.isReplacement,
        empleado_id_reemplezado: formData.empleado_id_reemplezado,
        replacedUserId: formData.replacedUserId,
        motivoReemplazoId: formData.motivoReemplazoId,
        comentarios: formData.comentarios,
        tipoImpositivo: formData.tipoImpositivo,
        contratoId: formData.contratoId,
        nombreContrato: contratoElegido?.name,
        areaShiftAssignments: formData.areaShiftAssignments,
        /*
          RENOVACIÓN: la etiqueta y QUÉ contrato renueva. Al editar una renovación se conservan: si no,
          guardarla de nuevo le borraría la etiqueta.
        */
        esRenovacion: renovacion ? true : (editingUser?.metadata as any)?.esRenovacion || undefined,
        renovacionDe: renovacion ? { userProjectId: renovacion.userProjectId, fechaBajaContrato: renovacion.fechaBajaContrato } : (editingUser?.metadata as any)?.renovacionDe || undefined,
      });

      if (editingUser) {
        await usersAPI.update(editingUser._id, submitData as any);
        // Corregir una RECHAZADA la devuelve a pendiente sola (ver `solicitudReenviada` en el server):
        // el aviso lo dice, porque guardar acá ya es volver a mandarla y no hay ningún paso más.
        if (eraRechazada) sweetAlert.success("Solicitud reenviada", "Se corrigió y volvió a quedar pendiente de aprobación.");
        else sweetAlert.success("Solicitud actualizada", "La solicitud de alta ha sido actualizada correctamente.");
      } else {
        await usersAPI.create(submitData as any);
        if (renovacion) sweetAlert.success("Renovación enviada", "La solicitud de renovación quedó pendiente de aprobación.");
        else sweetAlert.success("Solicitud enviada", "La solicitud de alta ha sido enviada correctamente.");
      }

      /*
        Los oficios nuevos quedan en la FICHA de la persona, no sólo en esta solicitud.

        Que alguien además sea Utilero es un dato de la persona: si quedara sólo acá, la próxima vez
        habría que volver a agregarlo. Va después de guardar y con su propio catch: si esto falla, la
        solicitud ya se mandó y eso es lo que no se puede perder.
      */
      if (selectedUser && rolesNuevosParaLaFicha.length > 0) {
        try {
          await usersAPI.agregarRolesFrame(selectedUser._id, rolesNuevosParaLaFicha);
        } catch (e) {
          console.error("No se pudieron agregar los roles empresa a la ficha:", e);
        }
      }
      onSuccess();
      onClose();
      setFormData({
        fullName: "",
        projectIds: [],
        roleFrameIds: [],
        categoriaSatId: "",
        startDate: "",
        fechasTrabajadas: [],
        dueDate: "",
        workdaysCount: "",
        diasPorSemana: SEMANA_POR_DEFECTO.diasPorSemana,
        diasSemana: [...SEMANA_POR_DEFECTO.diasSemana],
        diasRotativos: false,
        workdaysOverridden: false,
        workdaysOverrideReason: "",
        workdaysOverrideNote: "",
        inTime: "",
        empresaContratoId: "",
        convenioId: "",
        outTime: "",
        dailyRate: "",
        isReplacement: false,
        tipoImpositivo: "",
        contratoId: "",
        areaShiftAssignments: [],
        empleado_id_reemplezado: "",
        replacedUserId: "",
        motivoReemplazoId: "",
        comentarios: "",
      });
      setReplacedSearchTerm("");
    } catch (error: any) {
      const msg = error.response?.data?.error || "Error al enviar la solicitud";
      sweetAlert.error("Error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Solicitud de Contratación de Usuario"
      size="lg"
      customHeader={
        <div className="flex flex-col flex-shrink-0 sticky top-0 z-50 shadow-sm border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="p-4 flex justify-between items-center ">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">{editingUser ? "Editar Solicitud" : renovacion ? "Renovación de Contratación" : "Solicitud de Contratación"}</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
            </button>
          </div>
        </div>
      }
      footer={
        <div className="flex w-full gap-3 p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0 sticky bottom-0 z-50">
          <button onClick={onClose} className="flex-1 rounded h-12 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={submitting} className="flex-1 rounded h-12 bg-blue-500 text-white font-medium shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? "Cargando..." : eraRechazada ? "Corregir y Reenviar" : editingUser ? "Actualizar Solicitud" : renovacion ? "Enviar Renovación" : "Enviar Solicitud"}
            <FontAwesomeIcon icon={faCheck} />
          </button>
        </div>
      }
    >
      {/*
        SIN SCROLL PROPIO. El cuerpo del Modal ya es el que scrollea (y ya trae su padding).

        Acá había un `max-h-[70vh] overflow-y-auto` que sumaba una segunda barra adentro de la del
        modal: dos barras pegadas al costado derecho, y la rueda moviendo una u otra según dónde
        estuviera el puntero. El `p-4` también sobraba, encima del `p-6` del Modal.
      */}
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
            Cliente | Proyecto* (elegí uno)
          </label>
          {/* Sin marco propio: cada proyecto YA es una tarjeta con su borde, y el contenedor
              alrededor los dejaba como una caja adentro de otra caja. El alto máximo queda para que
              una lista larga no empuje el resto del formulario fuera de la vista. */}
          {/*
            CON UN SOLO PROYECTO NO HAY NADA QUE ELEGIR: se muestra y listo.

            Con varios, la lista entera acá arriba ocupaba media pantalla del teléfono y empujaba el
            resto del formulario fuera de la vista. Se abre en su propia ventana, igual que Persona,
            Rol/es Empresa y Motivo, y acá queda sólo el elegido con un «Cambiar» al lado.
          */}
          {loadingData ? (
            <div className="flex items-center justify-center py-4">
              <LoadingSpinner message="Cargando datos..." />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-slate-500 italic text-sm">No hay proyectos disponibles</div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-left dark:border-blue-700 dark:bg-blue-900/20">
                <FontAwesomeIcon icon={faBriefcase} className="text-[10px] text-blue-500" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-400">{proyectoElegido ? etiquetaProyecto(proyectoElegido) : "Elegí un proyecto"}</span>
                {/* LA VALORACIÓN DEL PROYECTO, ACÁ ARRIBA.
                    Es la que decide qué categorías corresponden —el selector de abajo filtra por ella y avisa
                    cuando la elegida difiere—, así que tenerla a la vista desde el principio evita elegir una
                    categoría y recién ahí enterarse de contra qué se la está comparando. */}
                {proyectoElegido && <ChipValoracionDelProyecto project={proyectoElegido} valoraciones={valoraciones} mostrarSinValorar className="ml-auto shrink-0" />}
              </div>
              {projects.length > 1 && (
                <button type="button" onClick={() => setProyectoModalOpen(true)} className="shrink-0 rounded-lg border border-slate-300 px-3 py-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                  Cambiar
                </button>
              )}
            </div>
          )}
        </div>

        {/*
          ELEGIR A LA PERSONA EN UNA VENTANA, no en un desplegable flotante.

          Antes esto era un input con una lista absoluta que se abría encima de los campos de abajo:
          tapaba el rol, la categoría y las fechas justo cuando había que compararlos, y el filtro de
          rol vivía en un botón al costado que abría OTRA ventana arriba de la primera.

          Ahora es un solo lugar, con el mismo formato que «Rol/es Empresa»: buscador arriba, la lista
          entera con lugar para leerla, y lo elegido como badge con su X. Nada se superpone al
          formulario porque el formulario no está debajo.
        */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faSearch} className="text-blue-500 text-[10px]" />
            Persona <span className="text-red-500">*</span>
          </label>
          {/*
            ELEGIDA = BADGE CON X. Sin nada elegido, el campo ancho que invita a buscar.

            Es el mismo patrón que «Rol/es Empresa», con una diferencia: acá se elige UNA sola, así
            que el badge reemplaza al campo en vez de acumularse arriba. Un campo de búsqueda debajo
            de algo ya elegido vuelve a invitar a buscar lo que ya está, y se lleva el alto de una
            fila entera para eso.

            La X vacía la elección; tocar el badge vuelve a abrir la ventana para cambiarla.
          */}
          {formData.fullName ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                <button type="button" onClick={() => setPersonaModalOpen(true)} title="Cambiar la persona" className="truncate max-w-[16rem] text-left">
                  {formData.fullName}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setUserSearchTerm("");
                    setFormData((prev) => ({ ...prev, fullName: "" }));
                  }}
                  title="Quitar"
                  className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-1"
                >
                  <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
                </button>
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPersonaModalOpen(true)}
              className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-left flex items-center gap-2 hover:border-blue-400"
            >
              <FontAwesomeIcon icon={faSearch} className="text-sm text-slate-400 shrink-0" />
              <span className="text-slate-400 truncate">Buscar por nombre o apellidos…</span>
            </button>
          )}
          {/* Ver `nombreLegado`: sólo solicitudes viejas, cargadas con el nombre a mano. */}
          {nombreLegado && <p className="text-[11px] text-amber-600 dark:text-amber-400">Esta solicitud se cargó con el nombre escrito a mano. Si la persona ya se registró, elegila de la lista.</p>}
          {sinPersona && <p className="text-[11px] text-slate-400">Elegí a una persona registrada para completar el resto: lo que sigue habla de ella.</p>}
        </div>

        {/* Ver `sinPersona`: el navegador propaga el `disabled` a todos los controles de adentro. */}
        <fieldset disabled={sinPersona} className="space-y-6 disabled:opacity-50">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            {/*
              VENTANA, NO DESPLEGABLE. Es el mismo patrón que «Rol/es Empresa» en Usuarios.

              El catálogo tiene cientos de especialidades: en un <select> nativo son cientos de
              renglones sin buscador, que se recorren con la rueda hasta encontrar el correcto — y en
              mobile ese desplegable ocupa media pantalla. En la ventana hay lugar para buscar y ver
              la lista completa, y lo elegido queda como badges con su X.

              SON VARIOS. Alguien puede entrar a una producción con más de un oficio, y la solicitud
              tiene que poder decirlo. Con algo ya elegido, el campo ancho se reemplaza por un «+» al
              lado del rótulo: repetir la invitación a elegir debajo de lo ya elegido se lleva el alto
              de una fila entera para eso.

              Los roles salen de los que ya tiene la persona; si el nombre se escribió a mano —alguien
              que todavía no es usuario— se ofrecen todos.
            */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
                Rol/es Empresa*
              </label>
              {/* Siempre, aunque la persona tenga un solo oficio: cambiarlo o sumarle otro es
                  justamente lo que hace falta poder hacer al contratarla. */}
              {rolesElegidos.length > 0 && (
                <button type="button" onClick={() => setRolModalOpen(true)} title="Cambiar o agregar un rol" className="h-4 w-4 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors shrink-0 ml-0.5">
                  <FontAwesomeIcon icon={faPlus} className="h-2 w-2" />
                </button>
              )}
            </div>
            {rolesElegidos.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Del mismo tamaño que en Usuarios (text-[11px]): más grandes se comían el aire con
                    el «+» del rótulo y con la fila de abajo. */}
                {rolesElegidos.map((rf) => (
                  <span key={rf._id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                    <span className="truncate max-w-[12rem]">{rf.name}</span>
                    <button type="button" onClick={() => alternarRol(rf._id)} title={`Quitar ${rf.name}`} className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-0.5">
                      <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRolModalOpen(true)}
                className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-left flex items-center gap-2 hover:border-blue-400"
              >
                <FontAwesomeIcon icon={faSearch} className="text-sm text-slate-400 shrink-0" />
                <span className="text-slate-400 truncate">Elegí uno o más roles…</span>
              </button>
            )}
          </div>

          {/*
            CON QUÉ EMPLEADORA. Al lado del oficio, porque las dos cosas definen el contrato.

            Sale del proyecto: sus empresas del contrato. Con una sola se elige sola y el campo queda
            de lectura —un combo de un ítem no es una decisión—. Con dos o más hay que elegir:
            equivocar la empleadora manda el alta con el CUIT que no es, y eso se descubre cuando ARCA
            devuelve el archivo.
          */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faBuilding} className="text-blue-500 text-[10px]" />
              Empresa que contrata
            </label>
            {formData.projectIds.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Elegí primero el proyecto: la empleadora sale de las que ese proyecto tiene asignadas.</p>
            ) : !empresasCargadas || projects.length === 0 ? (
              /*
                TODAVÍA NO SE SABE, así que no se dice nada.

                Acá aparecía «Ese proyecto no tiene empresa del contrato asignada» mientras el catálogo
                de empleadoras seguía viajando: el proyecto sí la tenía, y el formulario afirmaba lo
                contrario. Un dato que falta y un dato que no llegó no son lo mismo.
              */
              <p className="text-xs text-slate-400 py-2">Buscando la empleadora del proyecto…</p>
            ) : empresasDelProyecto.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 py-2">Ese proyecto no tiene empresa del contrato asignada. Sin eso, el alta no sabe con qué CUIT se contrata.</p>
            ) : empresasDelProyecto.length === 1 ? (
              <p className="h-12 flex items-center px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white">{empresasDelProyecto[0].razonSocial}</p>
            ) : (
              <select name="empresaContratoId" value={formData.empresaContratoId} onChange={handleChange} className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white appearance-none">
                <option value="">Elegí la empresa</option>
                {empresasDelProyecto.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.razonSocial}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/*
          EL TIPO DE CONTRATO, y el trámite DEDUCIDO de él. Va ANTES de convenio, categoría e importe
          porque decide si hacen falta: con un tipo de Servicios (constancia de CUIT) no hay convenio
          ni categoría, y el importe se carga a mano. Elegirlo después obligaba a completar dos campos
          que el tipo de contrato podía terminar escondiendo.

          Antes acá se elegía «Tipo de alta» —ARCA o Servicios— y el tipo de contrato se cargaba
          después, al aprobar. Era pedir el dato de arriba y dejar el de abajo para otro momento: el
          trámite no es una opción independiente, lo declara el tipo de contrato a través de sus
          plantillas. Elegir «Pedido de ARCA» y después un tipo que resulta ser de Servicios daba una
          solicitud que se contradecía a sí misma.

          Ahora se elige lo concreto —«Jornada», «Plazo fijo 5x7»— y el trámite se muestra al lado,
          de sólo lectura, con el mismo badge del ABM que usa el escritorio. Quien pide el alta sabe
          qué contrato va a firmar esa persona; el trámite es una consecuencia.
        */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faFileContract} className="text-blue-500 text-[10px]" />
            Tipo de contrato <span className="text-red-500">*</span>
          </label>
          {contratos.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">No hay tipos de contrato configurados. Avisale a administración: sin esto la solicitud no dice qué se va a firmar.</p>
          ) : (
            <button type="button" onClick={() => setContratoModalOpen(true)} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left dark:border-slate-700 dark:bg-slate-900">
              {contratoElegido ? (
                <>
                  <span className="flex-1 text-sm font-medium text-slate-900 dark:text-white">{contratoElegido.name}</span>
                  {estadoDelTramite ? <EstadoBadge name={estadoDelTramite.name} /> : <span className="text-[10px] italic text-slate-400">sin trámite configurado</span>}
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faSearch} className="text-[10px] text-slate-400" />
                  <span className="flex-1 text-sm text-slate-400">Elegí el tipo de contrato…</span>
                </>
              )}
            </button>
          )}
          {contratoElegido && (limiteHoras != null || limiteDias != null) && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              {limiteHoras != null && (
                <span>
                  <strong className="text-slate-900 dark:text-white">{limiteHoras}</strong> h por jornada
                </span>
              )}
              {limiteDias != null && (
                <span>
                  <strong className="text-slate-900 dark:text-white">{limiteDias}</strong> días por semana
                </span>
              )}
              <span className="text-[11px] text-slate-400">Limitan el horario y los días de abajo.</span>
            </p>
          )}
        </div>

        {/*
          DESDE / HASTA, SIEMPRE A LA VISTA. Todo lo de abajo —días, jornadas, importes— depende de estas
          fechas: queda pegado debajo del título al bajar, para no perder de vista de qué período se habla.
          Los márgenes negativos compensan el padding del cuerpo del Modal, así el fondo tapa de lado a lado.
          Y `-top-6` (no `top-0`) por lo mismo arriba: el navegador pega un sticky al borde del CONTENIDO del
          contenedor que scrollea, o sea 24 px más abajo por el `p-6`, y en ese hueco se veía pasar el
          formulario entre el título y las fechas.
        */}
        <div id="bloque-fechas" className="sticky -top-6 z-20 -mx-6 space-y-1 border-b border-slate-200 bg-white px-6 py-3 shadow-sm dark:border-slate-700 dark:bg-gray-800">
          {/*
            EL CALENDARIO LO DECIDE EL TIPO DE CONTRATO (ver `modoFechas` en su ABM).

            Con «días sueltos» se pintan los días uno por uno —el mismo calendario de Vacaciones— y
            cada uno es una jornada; se puede marcar uno solo. Un período ahí mentiría: diría que
            trabaja los treinta días del tramo cuando son tres salteados.
          */}
          {porDiasSueltos ? (
            <div className="space-y-1">
              {/*
                NO SE PUEDEN MARCAR DÍAS QUE YA PASARON.

                Esto es un pedido de contratación: las jornadas que declara son las que la persona VA a
                trabajar. Un día de la semana pasada no es algo que se pueda pedir —ya pasó— y elegirlo
                terminaba en un alta que ARCA rechaza por declararse tarde.

                Los días que ya estuvieran marcados se pueden sacar igual, aunque hayan quedado en el
                pasado: el límite es sobre lo que se agrega (ver `CustomMultiDatePicker`).
              */}
              <CustomMultiDatePicker label="Días que trabaja" value={formData.fechasTrabajadas} onChange={(d: string | string[]) => elegirDiasSueltos(Array.isArray(d) ? d : d ? [d] : [])} minDate={fechaDeHoy()} />
              <p className="text-[11px] text-slate-400">
                {formData.fechasTrabajadas.length > 0 ? (
                  <>
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      {formData.fechasTrabajadas.length} {formData.fechasTrabajadas.length === 1 ? "jornada" : "jornadas"}
                    </span>
                    , entre el {new Date(`${formData.startDate}T00:00:00`).toLocaleDateString("es-AR")} y el {new Date(`${formData.dueDate}T00:00:00`).toLocaleDateString("es-AR")}.
                  </>
                ) : (
                  <>«{contratoElegido?.name}» se contrata por día: marcá los días en el calendario. Cada uno es una jornada.</>
                )}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <CustomDatePicker label="Desde" value={formData.startDate} onChange={(date) => setFormData((p) => ({ ...p, startDate: date }))} />
              </div>
              {/*
                TIEMPO INDETERMINADO: NO HAY «HASTA».

                No es que el dato sea opcional: es que no existe. Un contrato de tiempo indeterminado
                no tiene fecha de baja —por eso se llama así—, y el campo vacío invitaba a inventar
                una, que después viajaba al alta como si alguien la hubiera decidido.

                Las jornadas no dependen de esto: con tiempo indeterminado se cuentan sobre el mes del
                alta (ver `periodoDeCalculo`), que es lo que explica el aviso de más abajo. El alta del
                panel hace lo mismo desde siempre.
              */}
              {indeterminado ? (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hasta</p>
                  <p className="flex h-12 items-center rounded-xl bg-slate-100 px-4 text-sm font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">Sin fecha de baja</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <CustomDatePicker label="Hasta" value={formData.dueDate} onChange={(date) => setFormData((p) => ({ ...p, dueDate: date }))} />
                </div>
              )}
            </div>
          )}
          {/* Se dice apenas pasa, no al enviar: con el fin antes del inicio no hay jornadas que calcular. */}
          {erroresJornadas.fechas && <p className="text-[11px] font-medium text-red-600 dark:text-red-400">{erroresJornadas.fechas}</p>}
        </div>

        {/*
          EL ÁREA Y TURNO DE LA PERSONA: OBLIGATORIO, y es lo que precarga el wizard de aprobación.

          El coordinador pide el alta para SU área: se le ofrecen sus coordinaciones en el proyecto (el
          server manda sólo las propias, ver `?slim=true`). Quien no coordina nada ahí —un supervisor, un
          admin— elige entre todas las del proyecto. Antes, en ese caso la solicitud viajaba sin área y
          había que elegirla al aprobar, sabiendo menos que quien la pidió.

          Con una sola opción no se pregunta: se informa, ya puesta.

          VA ANTES DEL HORARIO porque lo define: elegir el turno completa la entrada y la salida con las
          de ese turno (ver el efecto `turnoAplicado`). Estaba al final del formulario y era al revés
          —primero el horario, y de los turnos quedaban los que lo cubrían—, así que había que adivinar
          a qué hora entra cada turno para que apareciera el que se quería pedir.
        */}
        {proyectoElegido && (
          <div id="bloque-area-turno" className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
              Área y turno <span className="text-red-500">*</span>
            </label>
            {opcionesAreaTurno === null ? (
              <p className="text-xs text-slate-400">Cargando las áreas y turnos del proyecto…</p>
            ) : opcionesAreaTurno.length === 0 ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">Este proyecto no tiene áreas y turnos configurados. Avisale a administración: la solicitud no se puede enviar sin el área y el turno de la persona.</p>
            ) : opcionesAreaTurno.length === 1 ? (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                  <FontAwesomeIcon icon={faCheck} className="text-blue-600 text-xs" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                      {opcionesAreaTurno[0].areaNombre} · {opcionesAreaTurno[0].turnoNombre}
                    </span>
                    {(opcionesAreaTurno[0].horario || opcionesAreaTurno[0].dias) && <span className="block text-[11px] text-slate-400">{[opcionesAreaTurno[0].horario, opcionesAreaTurno[0].dias].filter(Boolean).join(" · ")}</span>}
                  </span>
                </div>
                {/* Con una sola opción no se elige: ya está puesta, y abajo va cómo trabaja en ella. */}
                {panelComoTrabaja("Cómo trabaja en este turno")}
              </>
            ) : (
              <>
                <p className="text-[11px] text-slate-400">
                  {coordinaEnElProyecto ? "Las áreas y turnos que supervisás en este proyecto." : "Elegí en qué área y turno va a trabajar."} El horario de entrada y salida se completa con el del turno; abajo lo podés modificar.
                </p>
                <div className="space-y-2">
                  {areasAgrupadas.map((area) => (
                    <div key={area.areaId} className="rounded-lg border border-slate-200 dark:border-slate-700">
                      <button type="button" onClick={() => alternarArea(area.areaId)} aria-expanded={areasAbiertas.has(area.areaId)} className="flex w-full items-center gap-2 p-2.5 text-left">
                        <FontAwesomeIcon icon={areasAbiertas.has(area.areaId) ? faChevronDown : faChevronRight} className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">{area.nombre}</span>
                        {areaTurnoElegido?.areaId === area.areaId ? (
                          <span className="shrink-0 truncate rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{areaTurnoElegido.turnoNombre}</span>
                        ) : (
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {area.turnos.length} {area.turnos.length === 1 ? "turno" : "turnos"}
                          </span>
                        )}
                      </button>
                      {areasAbiertas.has(area.areaId) && (
                        <>
                          <div className="grid grid-cols-1 gap-1.5 px-2.5 pb-2.5 sm:grid-cols-3">
                            {area.turnos.map((t) => {
                              const elegido = areaTurnoElegido?.areaId === t.areaId && areaTurnoElegido?.shiftId === t.shiftId;
                              return (
                                <button
                                  key={`${t.areaId}-${t.shiftId}`}
                                  type="button"
                                  onClick={() => setFormData((prev) => ({ ...prev, areaShiftAssignments: [{ areaId: t.areaId, shiftIds: [t.shiftId] }] }))}
                                  aria-pressed={elegido}
                                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all ${elegido ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/20 dark:text-blue-300" : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
                                >
                                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${elegido ? "border-blue-600" : "border-slate-300 dark:border-slate-600"}`}>{elegido && <span className="h-2 w-2 rounded-full bg-blue-600" />}</span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">{t.turnoNombre}</span>
                                    {/* Horario y días en que corre: con eso se elige el turno, no sólo con el nombre. */}
                                    {(t.horario || t.dias) && <span className="block text-[10px] text-slate-400">{[t.horario, t.dias].filter(Boolean).join(" · ")}</span>}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {/* Elegido el turno, acá mismo se dice cómo trabaja en él. */}
                          {areaTurnoElegido?.areaId === area.areaId && <div className="px-2.5 pb-2.5">{panelComoTrabaja("Cómo trabaja en este turno")}</div>}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            {intentoEnviar && !areaTurnoElegido && (opcionesAreaTurno?.length ?? 0) > 0 && <p className="text-[11px] font-medium text-red-600 dark:text-red-400">Elegí el área y el turno donde va a trabajar.</p>}

            {/* Sin áreas configuradas no hay turno al que pertenecer: va sola, para poder cargarla igual. */}
            {proyectoSinAreas && panelComoTrabaja("Cómo trabaja")}
          </div>
        )}

        {/*
          LA CADENA, EN ORDEN: convenio → categoría, y abajo el importe por jornada y por semana. Con un
          tipo de contrato de Servicios quedan sólo los importes, libres (ver `esServicios`).

          Va DESPUÉS de fechas, días y jornadas: el formulario sigue el orden de las dependencias —desde
          y hasta, días por semana, qué días, cantidad de jornadas— y el importe por semana necesita los
          días por semana ya cargados. Así se completa de arriba hacia abajo sin volver.

          Estaban repartidos por el formulario —el convenio abajo de todo, la categoría arriba— y esa
          distancia escondía que uno depende del otro. Puestos en fila y en el orden en que se
          completan, la dependencia se ve sin que nadie la explique.
        */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {!esServicios && (
          <>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faFileContract} className="text-blue-500 text-[10px]" />
              Convenio
            </label>
            {!formData.empresaContratoId ? (
              <p className="text-xs text-slate-400 py-2">Elegí primero la empresa.</p>
            ) : conveniosDisponibles.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 py-2">Esa empleadora no tiene convenios registrados ante ARCA, así que no hay categorías que se le puedan dar de alta.</p>
            ) : (
              /* Con uno solo no hay nada que elegir: se muestra. Con varios, se abre la ventana. */
              <button
                type="button"
                onClick={() => conveniosDisponibles.length > 1 && setConvenioModalOpen(true)}
                disabled={conveniosDisponibles.length === 1}
                className="flex h-12 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-left font-medium transition-all disabled:cursor-default dark:border-slate-700 dark:bg-slate-900"
              >
                {convenioElegido ? (
                  <>
                    <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{convenioElegido.externalId}</span>
                    <span className="truncate text-sm text-slate-900 dark:text-white">{convenioElegido.name}</span>
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faSearch} className="shrink-0 text-sm text-slate-400" />
                    <span className="text-slate-400">Elegí el convenio…</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
              Categoría*
            </label>
            {/*
              CUELGA DEL CONVENIO, NO SÓLO DEL ROL.

              Antes se filtraba sólo por el rol empresa y se podía elegir una categoría de otro
              convenio: ARCA rechaza esa alta. Ahora el orden es empresa → convenio → categoría, que
              es el que el organismo exige, y la ventana queda cerrada hasta tener los dos de arriba:
              decir el orden en el que hay que completar es mejor que dejar elegir mal.
            */}
            <button
              type="button"
              onClick={() => convenioCct && setCategoriaModalOpen(true)}
              disabled={!convenioCct}
              title={!convenioCct ? "Elegí primero el convenio" : undefined}
              className="flex h-12 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-left font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
            >
              {categoriaElegida ? (
                <>
                  {/* Sin el código de ARCA, igual que en la lista de abajo: acá tapaba el nombre. */}
                  <span className="truncate text-sm text-slate-900 dark:text-white">{categoriaElegida.name}</span>
                  {(() => {
                    // Siempre se dice el nivel, también cuando la categoría no lo tiene: es lo que se compara
                    // contra el del proyecto, y un hueco no se puede comparar con nada.
                    const n = nivelDeCategoria(categoriaElegida);
                    return n ? <ChipValoracion nombre={n.nombre} color={n.color} className="shrink-0" /> : <ChipSinValorar className="shrink-0" title="Esta categoría no tiene valoración cargada en la función." />;
                  })()}
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faSearch} className="shrink-0 text-sm text-slate-400" />
                  <span className="text-slate-400">{!convenioCct ? "Elegí primero el convenio" : "Elegí la categoría…"}</span>
                </>
              )}
            </button>
            {avisoCascada && <p className="text-[11px] text-amber-600 dark:text-amber-400">{avisoCascada}</p>}
          </div>
          </>
          )}

          <ImportesDelContrato
            className="contents"
            valorJornada={formData.dailyRate}
            onValorJornada={(v) => setFormData((p) => ({ ...p, dailyRate: v }))}
            mesesEq={mesesEq}
            indeterminado={indeterminado}
            jornadas={jornadasDelContrato}
            diasSemana={diasSemanaNum}
            bloqueado={importesBloqueados}
            textoBloqueado="Se habilita al elegir la categoría."
            ayudaJornada={
              <>
                {importesBloqueados && <p className="text-[11px] text-slate-400">Se habilita al elegir la categoría: el importe sale de su escala.</p>}
                {esServicios && <p className="text-[11px] text-slate-400">Es un servicio: no hay convenio ni categoría, así que el importe se carga a mano.</p>}
                {!importesBloqueados && <p className="text-[11px] text-slate-400">Total ÷ jornadas del contrato. Varía según los días hábiles de cada mes.</p>}
                {categoriaElegida && !diferenciaContraEscala && (
                  <p className="text-[11px] text-slate-400">
                    De la escala de {categoriaElegida.name}
                    {convenioElegido ? ` · ${convenioElegido.externalId}` : ""}. Se puede cambiar.
                  </p>
                )}
                {/*
                  EL MULTIPLICADOR, DICHO CON LOS DOS NÚMEROS.

                  Un importe que sale 1,5 veces más alto que la escala del convenio parece un error de
                  carga si no se explica de dónde salió: acá se lee la cuenta entera —la escala, el
                  multiplicador y de qué contrato viene—.
                */}
                {categoriaElegida && multiplicadorDiario !== 1 && (
                  <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                    Escala {importePorJornadaDeCategoria(categoriaElegida).toLocaleString("es-AR", { minimumFractionDigits: 2 })} × {multiplicadorDiario} del contrato {contratoElegido?.name}.
                  </p>
                )}
                {diferenciaContraEscala && (
                  <p className={`text-[11px] font-medium ${diferenciaContraEscala.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {diferenciaContraEscala.delta > 0 ? "+" : "−"}
                    {Math.abs(diferenciaContraEscala.delta).toLocaleString("es-AR", { minimumFractionDigits: 2 })} contra la escala ({diferenciaContraEscala.escala.toLocaleString("es-AR", { minimumFractionDigits: 2 })})
                  </p>
                )}
              </>
            }
            claseEtiqueta="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"
            claseCampo="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium disabled:cursor-not-allowed disabled:opacity-60"
            claseCampoTotal="w-full h-12 rounded-xl border border-emerald-300 bg-emerald-50 pl-10 pr-4 font-bold text-emerald-800 outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
            claseAyuda="text-[11px] text-slate-400"
            icono={<FontAwesomeIcon icon={faMoneyBillWave} className="text-blue-500 text-[10px]" />}
            adornoCampo={
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <FontAwesomeIcon icon={faMoneyBillWave} />
              </span>
            }
          />
        </div>


        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                <FontAwesomeIcon icon={faExchangeAlt} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Reemplazo?</p>
                <p className="text-xs text-slate-500">¿Esta persona reemplaza a alguien?</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              {/*
                Apagar el switch LIMPIA a quién reemplaza.

                Si no, quedaba guardado el reemplazado de una decisión que se dio marcha atrás: una
                solicitud que dice "no es reemplazo" con un nombre de reemplazado adentro.
              */}
              <input
                type="checkbox"
                name="isReplacement"
                checked={formData.isReplacement}
                onChange={(e) => {
                  const v = e.target.checked;
                  setFormData((prev) => ({ ...prev, isReplacement: v, empleado_id_reemplezado: v ? prev.empleado_id_reemplezado : "", replacedUserId: v ? prev.replacedUserId : "", motivoReemplazoId: v ? prev.motivoReemplazoId : "" }));
                  if (!v) setReplacedSearchTerm("");
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none dark:bg-slate-700 rounded-full transition-colors duration-200 ease-in-out peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
              <span className="ml-3 text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{formData.isReplacement ? "SÍ" : "NO"}</span>
            </label>
          </div>

          {/*
            LOS DOS DATOS DEL REEMPLAZO: por qué falta, y quién.

            EL MOTIVO VA PRIMERO. Es el orden en que se piensa —«falta por vacaciones… ah, sí, falta
            Fulano»— y además es el que puede cambiar la respuesta al segundo: quién cubre no se elige
            igual para un franco de un día que para una licencia larga.

            A QUIÉN REEMPLAZA usa el mismo buscador que el de arriba, pero sobre el equipo del
            proyecto: reemplazar a alguien que no está en el proyecto no es un reemplazo, y sin la
            persona del alta, que no puede reemplazarse a sí misma. Sin ese dato tampoco se puede
            heredar el área y el turno de quien falta, que es lo que hace después el escritorio.
          */}
          {formData.isReplacement && (
            <div className="space-y-1 relative">
              {/*
                Y POR QUÉ FALTA. Mismo motivo que se carga en Novedades, con el mismo catálogo.

                Un reemplazo sin motivo no alcanza para liquidarlo: no es lo mismo cubrir vacaciones
                que una enfermedad o un cambio de turno. Y quien pide el alta es el único que lo sabe
                en ese momento; después hay que ir a preguntarlo.

                Se abre en ventana igual que «Configurar Ausencia» de Novedades —de donde salen estos
                motivos— para que se reconozca como lo mismo; solo cambia el título, porque acá no se
                está cargando una ausencia sino el motivo de un reemplazo.
              */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <FontAwesomeIcon icon={faClock} className="text-blue-500 text-[10px]" />
                  Motivo <span className="text-red-500">*</span>
                </label>
                {motivoElegido ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                      <button type="button" onClick={() => setMotivoModalOpen(true)} title="Cambiar el motivo" className="truncate max-w-[16rem] text-left">
                        {motivoElegido.name}
                      </button>
                      <button type="button" onClick={() => setFormData((prev) => ({ ...prev, motivoReemplazoId: "" }))} title="Quitar" className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-1">
                        <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMotivoModalOpen(true)}
                    className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-left flex items-center gap-2 hover:border-blue-400"
                  >
                    <FontAwesomeIcon icon={faClock} className="text-sm text-slate-400 shrink-0" />
                    <span className="text-slate-400 truncate">Configurar Motivo…</span>
                  </button>
                )}
              </div>
              <div className="space-y-1 pt-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <FontAwesomeIcon icon={faSearch} className="text-blue-500 text-[10px]" />
                  ¿A quién reemplaza? <span className="text-red-500">*</span>
                </label>
                {/* Mismo tratamiento que «Persona»: también se elige a alguien, así que se ve igual. */}
                {nombreReemplazado ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                      <button type="button" onClick={() => setReemplazoModalOpen(true)} title="Cambiar a quién reemplaza" className="truncate max-w-[16rem] text-left">
                        {nombreReemplazado}
                      </button>
                      <button type="button" onClick={() => setFormData((prev) => ({ ...prev, empleado_id_reemplezado: "", replacedUserId: "" }))} title="Quitar" className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-1">
                        <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReemplazoModalOpen(true)}
                    className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-left flex items-center gap-2 hover:border-blue-400"
                  >
                    <FontAwesomeIcon icon={faSearch} className="text-sm text-slate-400 shrink-0" />
                    <span className="text-slate-400 truncate">Buscar en el equipo del proyecto…</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/*
          UN COMENTARIO, POR SI HACE FALTA. Opcional, y el único campo de texto libre del formulario.

          Todo lo demás está tipificado —el trámite, el motivo, los días— porque se procesa del otro
          lado. Pero siempre hay algo que no entra en ningún campo («entra recién el 15», «lo pidió
          producción por WhatsApp»), y sin lugar para escribirlo eso viajaba por mensaje aparte y se
          perdía. Mismo control que los «Comentarios Generales» de Confirmar Reporte, en Novedades.

          Vacío está bien: es opcional de verdad, no un obligatorio disfrazado.
        */}
        <AvisosSuperposicion avisos={avisosSuperposicion} />

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
            Comentarios
          </label>
          <textarea
            rows={3}
            name="comentarios"
            value={formData.comentarios}
            onChange={handleChange}
            className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white text-sm resize-none"
            placeholder="Algo que haga falta aclarar sobre esta contratación (opcional)…"
          />
        </div>
        </fieldset>

        {/*
          VENTANA PARA ELEGIR A LA PERSONA DEL ALTA.

          Mismo formato que «Rol/es Empresa»: lo elegido arriba como badge con X, el buscador debajo y
          la lista con lugar de sobra. El filtro por rol vive ACÁ ADENTRO —era un botón al costado del
          campo que abría una segunda ventana encima de la primera—, porque filtra esta lista y no
          otra cosa.
        */}
        <Modal
          isOpen={personaModalOpen}
          onClose={() => setPersonaModalOpen(false)}
          title="Persona"
          subtitle={formData.fullName ? formData.fullName : "Personas registradas: buscá por nombre, apellido o email"}
          size="lg"
          zIndex={80}
          footer={
            <div className="flex w-full justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setUserSearchTerm("");
                  setSelectedRoleFilters([]);
                  setSelectedUser(null);
                  setFormData((prev) => ({ ...prev, fullName: "" }));
                }}
                className="text-red-500 hover:text-red-600 font-bold text-sm py-2 px-4 transition-colors"
              >
                Limpiar
              </button>
              <button type="button" onClick={() => setPersonaModalOpen(false)} className="bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                Listo
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {formData.fullName && (
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                  {formData.fullName}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(null);
                      setUserSearchTerm("");
                      setFormData((prev) => ({ ...prev, fullName: "" }));
                    }}
                    title="Quitar"
                    className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-0.5"
                  >
                    <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
                  </button>
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <div className="relative flex-1 group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                  <FontAwesomeIcon icon={faSearch} className="text-sm" />
                </div>
                <input
                  type="text"
                  autoFocus
                  value={userSearchTerm}
                  /* Tipear SÓLO filtra. Antes el texto quedaba como nombre de una ficha nueva; ahora la
                     solicitud es para alguien registrado (ver `personaRegistrada`), y quien no aparece
                     recibe el link de registro. */
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  autoComplete="off"
                  className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white"
                  placeholder="Nombre, apellido o email"
                />
              </div>
              <button type="button" onClick={() => setShowRoleFilterMenu(true)} className={`px-4 h-12 rounded-xl border flex items-center gap-2 transition-all font-bold text-sm shrink-0 ${selectedRoleFilters.length > 0 ? "bg-blue-500 border-blue-500 text-white" : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"}`}>
                <FontAwesomeIcon icon={faFilter} className="text-xs" />
                Rol {selectedRoleFilters.length > 0 && `(${selectedRoleFilters.length})`}
              </button>
            </div>

            {/*
              QUÉ SE ESTÁ FILTRANDO, ESCRITO.

              El botón decía «Rol (1)»: avisaba que había un filtro pero no cuál, así que para saber
              por qué faltaba alguien en la lista había que abrir la otra ventana a mirar. Con los
              roles a la vista se lee de un vistazo, y cada uno se saca por separado desde su X —sin
              tener que entrar a destildarlo—.
            */}
            {selectedRoleFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedRoleFilters.map((rol) => (
                  <span key={rol} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                    {rol}
                    <button type="button" onClick={() => setSelectedRoleFilters((prev) => prev.filter((r) => r !== rol))} title={`Quitar el filtro ${rol}`} className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-0.5">
                      <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                {/* Con más de uno, sacarlos de a uno son varios clicks para volver al estado normal. */}
                {selectedRoleFilters.length > 1 && (
                  <button type="button" onClick={() => setSelectedRoleFilters([])} className="text-[11px] font-semibold text-slate-500 hover:text-red-500 transition-colors px-1">
                    Quitar todos
                  </button>
                )}
              </div>
            )}

            {/*
              La lista no filtra por contrato: se dice, y cuántos tienen uno vigente.

              EL TOTAL LO CUENTA EL SERVER y los vigentes son los de las filas que se están mostrando.
              Antes los dos números salían de la lista completa en memoria, que es lo que esta pantalla
              dejó de bajarse; por eso, cuando hay más de los que entran, se dice cuántos se muestran:
              si no, el número verde parecería hablar del total.
            */}
            {personasFiltradas.length > 0 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {totalPersonas} {totalPersonas === 1 ? "persona" : "personas"}
                {totalPersonas > personasFiltradas.length ? ` · se muestran ${personasFiltradas.length}` : ""} · <span className="font-semibold text-green-600 dark:text-green-400">{conContratoVigente} con contrato vigente</span>. Aparecen todas, tengan contrato o no.
              </p>
            )}

            <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {buscandoPersonas && personasFiltradas.length === 0 ? (
                /* Buscando: NO se dice «no encontramos» todavía. La respuesta la da el server y tarda
                   lo que tarda; anunciar que no existe antes de que conteste es decir algo que no se sabe. */
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                  Buscando…
                </div>
              ) : personasFiltradas.length === 0 ? (
                /* NO APARECE: lo más probable es que no se haya registrado. Se dice eso, y se le da la
                   salida ahí mismo, en vez de dejarlo buscando variantes del nombre. */
                <div className="space-y-3 px-4 py-6 text-center">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{userSearchTerm.trim() ? `No encontramos a «${userSearchTerm.trim()}»` : "No hay personas para mostrar"}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Solo aparecen las personas registradas en la plataforma.{" "}
                    {puedeCompartirLink ? "Si todavía no se registró, mandale tu link: cuando se registre, vas a poder elegirla acá." : "Si todavía no se registró, pedile a tu coordinador o a administración el link de registro para mandarle."}
                    {selectedRoleFilters.length > 0 && " También podés probar quitando el filtro de rol."}
                  </p>
                  {puedeCompartirLink && (
                    <button type="button" onClick={copiarLinkDeRegistro} disabled={copiandoLink} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                      <FontAwesomeIcon icon={copiandoLink ? faSpinner : faLink} className={copiandoLink ? "animate-spin" : ""} />
                      Copiar link de registro
                    </button>
                  )}
                </div>
              ) : (
                personasFiltradas.map((u) => {
                  const nombre = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
                  const elegida = selectedUser && String(selectedUser._id) === String(u._id);
                  const contrato = contratoDePersona.get(String(u._id));
                  return (
                    <button key={u._id} type="button" onClick={() => elegirPersona(u)} className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-3 ${elegida ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-blue-50 dark:hover:bg-blue-900/20"}`}>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-bold text-sm text-slate-900 dark:text-white">{nombre}</span>
                        <span className="truncate text-xs text-slate-500">{u.email}</span>
                      </span>
                      {/* Mismo badge y mismas fechas que la columna de contratos del panel. */}
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        {contrato ? (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${contrato.vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{contrato.vigente ? "Vigente" : "No vigente"}</span>
                        ) : (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">Sin contrato</span>
                        )}
                        {contrato && (
                          <span className="whitespace-nowrap text-[10px] text-slate-400">
                            Alta {contrato.alta} · Baja {contrato.baja}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {totalPersonas > personasFiltradas.length && (
              <p className="text-[11px] text-slate-400">
                Se muestran las primeras {personasFiltradas.length} de {totalPersonas}. Afiná la búsqueda o filtrá por rol.
              </p>
            )}
            {/*
              Siempre a la vista, no sólo con la lista vacía: quien no encuentra a alguien entre 50 nombres
              parecidos también tiene que saber por qué.

              Es UN botón que abre su propia ventana, y no el texto con el link al lado. Apretados en un
              renglón de 11px, la explicación y el "Copiar link" se leían como una sola cosa y el link no se
              encontraba. Ahora se ve de lejos y, al abrirlo, primero se explica y después se ofrece el link.
            */}
            {personasFiltradas.length > 0 && (
              <button
                type="button"
                onClick={() => setNoApareceOpen(true)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left transition-colors hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
              >
                <span className="flex items-center gap-2.5">
                  <FontAwesomeIcon icon={faCircleQuestion} className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">¿No aparece? Solo se ven personas registradas</span>
                </span>
                <FontAwesomeIcon icon={faArrowRight} className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              </button>
            )}
          </div>
        </Modal>

        {/* ¿NO APARECE?: por qué, y la salida. Va por encima de la ventana de Persona (zIndex 80). */}
        <Modal isOpen={noApareceOpen} onClose={() => setNoApareceOpen(false)} title="¿No aparece la persona?" size="sm" zIndex={90}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              En esta lista <strong>solo están las personas que ya se registraron</strong> en la plataforma. Si alguien no aparece, lo más probable es que todavía no lo haya hecho.
            </p>
            {selectedRoleFilters.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">Tenés un filtro de rol puesto: probá quitándolo antes, puede estar escondiéndola.</p>
            )}
            {puedeCompartirLink ? (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-300">Mandale tu link de registro. Cuando se registre, va a aparecer en esta lista y vas a poder elegirla.</p>
                <button
                  type="button"
                  onClick={async () => {
                    await copiarLinkDeRegistro();
                    // El aviso con el link queda abierto por encima: esta ventana ya cumplió.
                    setNoApareceOpen(false);
                  }}
                  disabled={copiandoLink}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-60"
                >
                  <FontAwesomeIcon icon={copiandoLink ? faSpinner : faLink} className={copiandoLink ? "animate-spin" : ""} />
                  Copiar link de registro
                </button>
              </>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">Pedile el link de registro a tu coordinador o a administración para mandárselo. Cuando se registre, va a aparecer en esta lista.</p>
            )}
          </div>
        </Modal>

        {/* La misma ventana, para a quién reemplaza. La lista es el equipo del proyecto. */}
        <Modal
          isOpen={reemplazoModalOpen}
          onClose={() => setReemplazoModalOpen(false)}
          title="¿A quién reemplaza?"
          subtitle={nombreReemplazado || "Solo el equipo del proyecto elegido"}
          size="lg"
          zIndex={80}
          footer={
            <div className="flex w-full justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setReplacedSearchTerm("");
                  setFormData((prev) => ({ ...prev, empleado_id_reemplezado: "", replacedUserId: "" }));
                }}
                className="text-red-500 hover:text-red-600 font-bold text-sm py-2 px-4 transition-colors"
              >
                Limpiar
              </button>
              <button type="button" onClick={() => setReemplazoModalOpen(false)} className="bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                Listo
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {nombreReemplazado && (
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                  {nombreReemplazado}
                  <button type="button" onClick={() => setFormData((prev) => ({ ...prev, empleado_id_reemplezado: "", replacedUserId: "" }))} title="Quitar" className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-0.5">
                    <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
                  </button>
                </span>
              </div>
            )}

            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                <FontAwesomeIcon icon={faSearch} className="text-sm" />
              </div>
              <input
                type="text"
                autoFocus
                value={replacedSearchTerm}
                onChange={(e) => setReplacedSearchTerm(e.target.value)}
                autoComplete="off"
                className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white"
                placeholder="Nombre, apellido o email"
              />
            </div>

            <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {candidatosAReemplazar.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-400 italic">{formData.projectIds.length === 0 ? "Elegí primero el proyecto." : "Nadie del proyecto coincide con esa búsqueda."}</div>
              ) : (
                candidatosAReemplazar.slice(0, 50).map((u) => {
                  const nombre = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
                  const elegida = String(formData.replacedUserId) === String(u._id);
                  return (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => {
                        /*
                          Se guardan LOS DOS identificadores: `empleado_id_reemplezado` es el id
                          numérico que ya usa el contrato, pero solo lo tienen las fichas
                          sincronizadas de FRAME, así que va también el `_id`, que existe siempre.
                        */
                        setFormData((prev) => ({ ...prev, empleado_id_reemplezado: (u.metadata as any)?.id != null ? String((u.metadata as any).id) : "", replacedUserId: String(u._id) }));
                        setReemplazoModalOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 transition-colors flex flex-col ${elegida ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-blue-50 dark:hover:bg-blue-900/20"}`}
                    >
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{nombre}</span>
                      <span className="text-xs text-slate-500">{u.email}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </Modal>

        {/* Rol empresa: misma ventana que en Usuarios —buscador arriba, grilla con lugar para leer—
            porque el catálogo tiene cientos de especialidades. */}
        <Modal
          isOpen={rolModalOpen}
          onClose={() => setRolModalOpen(false)}
          title="Rol/es Empresa"
          subtitle={`${formData.roleFrameIds.length} seleccionado(s) · el oficio con el que la persona trabaja en una producción`}
          size="lg"
          zIndex={80}
          footer={
            <div className="flex w-full justify-between items-center gap-3">
              <button type="button" onClick={() => setFormData((prev) => ({ ...prev, roleFrameIds: [] }))} className="text-red-500 hover:text-red-600 font-bold text-sm py-2 px-4 transition-colors">
                Limpiar
              </button>
              <button type="button" onClick={() => setRolModalOpen(false)} className="bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                Listo
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {/* Se dice qué va a pasar antes de que pase: el oficio nuevo queda en la ficha de la
                persona, no sólo en esta solicitud. */}
            {rolesNuevosParaLaFicha.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">Los marcados como «nuevo» se le van a agregar a la ficha de la persona, así la próxima vez ya figuran entre los suyos.</p>}
            {rolesElegidos.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {rolesElegidos.map((rf) => (
                  <span key={rf._id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                    {rf.name}
                    <button type="button" onClick={() => alternarRol(rf._id)} title={`Quitar ${rf.name}`} className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-0.5">
                      <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                <FontAwesomeIcon icon={faSearch} className="text-sm" />
              </div>
              <input
                type="text"
                autoFocus
                value={rolSearchTerm}
                onChange={(e) => setRolSearchTerm(e.target.value)}
                autoComplete="off"
                className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white"
                placeholder="Buscar especialidad..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[45vh] overflow-y-auto pr-1">
              {rolesDisponibles.length === 0 ? (
                <p className="col-span-full py-8 text-center text-xs text-slate-400 italic">{rolSearchTerm ? `No se encontraron especialidades que coincidan con "${rolSearchTerm}"` : "No hay roles para ofrecer."}</p>
              ) : (
                rolesDisponibles.map((rf) => {
                  const elegido = formData.roleFrameIds.includes(rf._id);
                  // Los que la persona ya tiene en su ficha se distinguen de los que se le sumarían:
                  // elegir uno de los suyos es una cosa, agregarle un oficio nuevo es otra.
                  const esSuyo = rolesDelUsuario.includes(rf._id);
                  return (
                    // La ventana NO se cierra al elegir: son varios, y cerrarla obligaría a reabrirla
                    // por cada rol. Se cierra con «Listo».
                    <button
                      key={rf._id}
                      type="button"
                      onClick={() => alternarRol(rf._id)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all ${elegido ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-2 ring-blue-500/20" : "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"}`}
                    >
                      <span className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${elegido ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 dark:border-slate-600"}`}>{elegido && <FontAwesomeIcon icon={faCheck} className="text-[9px]" />}</span>
                      <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{rf.name}</span>
                      {selectedUser && !esSuyo && <span className="shrink-0 rounded-full border border-amber-300 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-600 dark:border-amber-700 dark:text-amber-400">nuevo</span>}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </Modal>

        {/* Motivo del reemplazo: es «Configurar Ausencia» de Novedades con otro título, porque acá lo
            que se declara es por qué falta el que se reemplaza. Misma lista, mismo control. */}
        {/* Elegir el convenio: sólo los que la empleadora tiene registrados ante ARCA. */}
        <Modal
          isOpen={convenioModalOpen}
          onClose={() => setConvenioModalOpen(false)}
          title="Convenio"
          subtitle="Define qué categorías se pueden elegir"
          size="md"
          zIndex={80}
          footer={
            <div className="flex w-full justify-end items-center gap-3">
              <button type="button" onClick={() => setConvenioModalOpen(false)} className="bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                Listo
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-2 py-2">
            {conveniosDisponibles.map((c) => {
              const elegido = c.externalId === convenioCct;
              return (
                <button
                  key={c.externalId}
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, convenioId: convenioPorCct.get(c.externalId)?._id || "" }));
                    setAvisoCascada("");
                    setConvenioModalOpen(false);
                  }}
                  aria-pressed={elegido}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${elegido ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400" : "border-slate-100 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}
                >
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${elegido ? "border-blue-600" : "border-slate-300 dark:border-slate-600"}`}>{elegido && <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />}</div>
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{c.externalId}</span>
                  <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                  {/* Cuántas categorías tiene: es lo que anticipa si elegirlo va a servir de algo. */}
                  <span className="shrink-0 text-[10px] text-slate-400">{c.cantidadCategorias} cat.</span>
                </button>
              );
            })}
          </div>
        </Modal>

        {/*
          Elegir la categoría, con buscador.

          Ofrece el cruce rol empresa ∩ convenio. Cuando la función FRAME de la persona no tiene
          categorías de este convenio, el cruce da vacío: eso se detecta y se avisa, en vez de dejar
          una lista vacía sin explicación. «Ver todas las de este convenio» es la salida, y es por
          convenio: al cambiar de convenio vuelve a su filtro.
        */}
        <Modal
          isOpen={categoriaModalOpen}
          onClose={() => setCategoriaModalOpen(false)}
          title="Categoría"
          subtitle={convenioElegido ? `Del convenio ${convenioElegido.externalId}` : undefined}
          size="md"
          zIndex={80}
          footer={
            <div className="flex w-full justify-end items-center gap-3">
              <button type="button" onClick={() => setCategoriaModalOpen(false)} className="bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                Listo
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {rolNoTieneCategoriasDelConvenio && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">El rol empresa de esta persona no tiene categorías de este convenio, así que se muestran todas las del convenio.</p>}

            {/* La valoración va DESPUÉS del convenio, que es el orden en que se aplican: primero lo
                que ARCA no acepta, después lo que no corresponde a este proyecto. */}
            {rolNoTieneCategoriasDeLaValoracion && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                El rol empresa no tiene categorías de la valoración de este proyecto, así que se muestran todas.
              </p>
            )}
            {ocultasPorValoracion > 0 && (
              <p className="px-1 text-[11px] text-slate-500 dark:text-slate-400">Se ocultaron {ocultasPorValoracion} de otra valoración: no corresponden al nivel de este proyecto.</p>
            )}

            {!verTodasDelConvenio && !rolNoTieneCategoriasDelConvenio && (
              <button type="button" onClick={() => setVerTodasDelConvenio(true)} className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400">
                ¿No está la que buscás? Ver todas las de este convenio
              </button>
            )}

            <input type="text" autoFocus value={categoriaBusqueda} onChange={(e) => setCategoriaBusqueda(e.target.value)} placeholder="Buscar categoría…" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium outline-none dark:border-slate-700 dark:bg-slate-900" />

            <div className="grid max-h-[45vh] grid-cols-1 gap-2 overflow-y-auto pr-1">
              {categoriasParaElegir.length === 0 ? (
                <p className="py-8 text-center text-xs italic text-slate-400">{categoriaBusqueda ? `No hay categorías que coincidan con "${categoriaBusqueda}"` : "No hay categorías para este convenio."}</p>
              ) : (
                categoriasParaElegir.map((cat) => {
                  const elegida = cat._id === formData.categoriaSatId;
                  const grupo = cat.data?.numeroCategoria;
                  return (
                    <div key={cat._id} className={`flex items-center gap-2 rounded-lg border p-3 transition-all ${elegida ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400" : "border-slate-100 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}>
                      {/* Tocar la fila ELIGE, que es a lo que se viene. Ver la escala es el otro botón. */}
                      <button type="button" onClick={() => elegirCategoria(cat._id)} aria-pressed={elegida} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${elegida ? "border-blue-600" : "border-slate-300 dark:border-slate-600"}`}>{elegida && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}</span>
                        {/*
                          SIN EL CÓDIGO DE ARCA. Acá iba «035292» delante de cada nombre.

                          Es el código con el que la categoría viaja al TXT del organismo: lo necesita el
                          alta, no quien la elige. Un coordinador no los conoce, así que leía seis dígitos
                          que no le decían nada antes de llegar al nombre —lo único que sí distingue una
                          categoría de otra— y en un teléfono se comía el ancho del renglón.

                          El buscador SIGUE encontrándolas por código (ver `categoriasParaElegir`): quien
                          lo tenga a mano lo puede pegar, sólo que ya no ocupa lugar en la lista.
                        */}
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{cat.name}</span>
                        {/* El nivel, pegado al nombre: es lo que decide si corresponde al proyecto. */}
                        {(() => {
                          const n = nivelDeCategoria(cat);
                          return n ? <ChipValoracion nombre={n.nombre} color={n.color} className="shrink-0" /> : <ChipSinValorar className="shrink-0" title="Sin valoración cargada en esta función: se ofrece en cualquier proyecto." />;
                        })()}
                      </button>
                      {/* El grupo. Tocarlo abre la escala; NO elige la categoría, para eso es la fila. */}
                      <button
                        type="button"
                        onClick={() => setCategoriaDetalle(cat)}
                        aria-label={`Ver la escala de ${cat.name}`}
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-500 transition-colors active:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:active:bg-slate-800"
                      >
                        {/*
                          «G4», no «Grupo 4 · Ver detalle».

                          La flecha ya dice que abre algo, así que escribirlo al lado era repetir con
                          palabras lo que el ícono hace —y ese texto era más largo que el dato—. En dos
                          columnas angostas, el chip entero le comía el ancho al nombre de la categoría.

                          «Sin grupo» se escribe entero: es una excepción y abreviarla no se entendería.
                        */}
                        <span className="text-[10px] font-bold uppercase tracking-wide">{grupo ? `G${grupo}` : "Sin grupo"}</span>
                        <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Modal>

        {/*
          LA ESCALA DE LA CATEGORÍA: a qué grupo pertenece y cuánto se paga.

          Los importes son del GRUPO y no de la categoría (salvo en los convenios que no tienen grupos,
          donde la escala es propia): se dice cuál de los dos casos es, porque explica por qué dos
          categorías distintas muestran los mismos números.
        */}
        <Modal
          isOpen={!!categoriaDetalle}
          onClose={() => setCategoriaDetalle(null)}
          title={categoriaDetalle?.name || "Categoría"}
          subtitle={categoriaDetalle?.data?.codigoArca ? `Código ARCA ${categoriaDetalle.data.codigoArca}` : undefined}
          size="md"
          zIndex={90}
          footer={
            <div className="flex w-full items-center justify-between gap-3">
              <button type="button" onClick={() => setCategoriaDetalle(null)} className="px-4 py-2.5 text-sm font-bold text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-300">
                Volver
              </button>
              <button type="button" onClick={() => categoriaDetalle && elegirCategoria(categoriaDetalle._id)} className="rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                {categoriaDetalle && categoriaDetalle._id === formData.categoriaSatId ? "Seguir con esta" : "Elegir esta categoría"}
              </button>
            </div>
          }
        >
          {categoriaDetalle &&
            (() => {
              const d: any = categoriaDetalle.data || {};
              const vencida = d.vigenciaHasta ? new Date(d.vigenciaHasta).getTime() < Date.now() : false;
              return (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Grupo</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{d.numeroCategoria ? `Grupo ${d.numeroCategoria}${d.grupoNombre ? ` — ${d.grupoNombre}` : ""}` : "Sin grupo"}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {d.escalaOrigen === "grupo"
                        ? "Los importes son los del grupo: los comparten todas sus categorías."
                        : d.escalaOrigen === "categoria"
                          ? "Este convenio no publica grupos, así que la escala es de esta categoría."
                          : "No tiene escala cargada. El alta ante ARCA necesita la retribución, así que hay que cargarla desde Configuración → ARCA → Categorías."}
                    </p>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    <FilaEscala label="Sueldo básico" valor={pesos(d.sueldoBasico)} />
                    <FilaEscala label="Adicional" valor={pesos(d.sueldoAdicional)} />
                    <FilaEscala label="Sueldo bruto" valor={pesos(d.sueldoBruto)} destacado />
                    <FilaEscala label="Presentismo" valor={pesos(d.presentismo)} />
                    <FilaEscala label="Neto" valor={pesos(d.neto)} />
                    <FilaEscala label="Actualización" valor={fechaDeEscala(d.fechaActualizacion)} />
                    {d.vigenciaHasta && <FilaEscala label="Vigencia hasta" valor={fechaDeEscala(d.vigenciaHasta)} />}
                  </div>

                  {vencida && (
                    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                      <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3 w-3 shrink-0" />
                      La escala venció el {fechaDeEscala(d.vigenciaHasta)}: la solicitud se manda igual, con el último importe pactado.
                    </p>
                  )}
                </div>
              );
            })()}
        </Modal>

        {/*
          Elegir el tipo de contrato.

          Va en ventana propia como Persona, Proyecto y Motivo: son catorce tipos con su badge de
          trámite al lado, y esa lista adentro del formulario tapa el resto en un teléfono.
        */}
        <Modal
          isOpen={contratoModalOpen}
          onClose={() => setContratoModalOpen(false)}
          title="Tipo de contrato"
          subtitle="El trámite ante ARCA sale de lo que elijas"
          size="md"
          zIndex={80}
          footer={
            <div className="flex w-full justify-end items-center gap-3">
              <button type="button" onClick={() => setContratoModalOpen(false)} className="bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                Listo
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-2 py-2">
            {contratos.map((c) => {
              const elegido = formData.contratoId === c._id;
              const tipo = tramitePorContrato.get(c._id);
              const estado = tipo ? impositivos.find((e) => e.data?.tipoImpositivo === tipo) : null;
              return (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, contratoId: c._id }));
                    setContratoModalOpen(false);
                  }}
                  aria-pressed={elegido}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${elegido ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400" : "border-slate-100 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}
                >
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${elegido ? "border-blue-600" : "border-slate-300 dark:border-slate-600"}`}>{elegido && <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />}</div>
                  <span className="flex-1 text-sm font-medium">{c.name}</span>
                  {/* El badge sale del ABM, así que respeta el nombre y el color que tenga configurado
                      cada estado —incluido el renombre de AFIP a ARCA, que se aplica al dibujar—. */}
                  {estado ? <EstadoBadge name={estado.name} /> : <span className="text-[10px] italic text-slate-400">sin trámite</span>}
                </button>
              );
            })}
          </div>
        </Modal>

        {/*
          Elegir el proyecto, cuando hay más de uno.

          Una solicitud es de UN proyecto: cada uno tiene su contrato, sus fechas, su categoría y su
          empleadora, y todo eso se carga una sola vez en este formulario. Por eso es una lista de
          opciones excluyentes y elegir una cierra la ventana.
        */}
        <Modal
          isOpen={proyectoModalOpen}
          onClose={() => setProyectoModalOpen(false)}
          title="Elegí el proyecto"
          subtitle={`${projects.length} disponibles`}
          size="md"
          zIndex={80}
          footer={
            <div className="flex w-full justify-end items-center gap-3">
              <button type="button" onClick={() => setProyectoModalOpen(false)} className="bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                Listo
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-2 py-2">
            {projects.map((p) => {
              const isSelected = formData.projectIds.includes(p._id);
              return (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, projectIds: [p._id] }));
                    setProyectoModalOpen(false);
                  }}
                  aria-pressed={isSelected}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${isSelected ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400" : "border-slate-100 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}
                >
                  {/* Redondo: es una opción entre varias, no una casilla que se suma. */}
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-blue-600" : "border-slate-300 dark:border-slate-600"}`}>{isSelected && <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />}</div>
                  <span className="text-sm font-medium">{etiquetaProyecto(p)}</span>
                  {/* El nivel de cada proyecto al elegir, no después: es lo que va a definir qué categorías se
                      ofrecen para esta contratación. */}
                  <ChipValoracionDelProyecto project={p} valoraciones={valoraciones} mostrarSinValorar className="ml-auto shrink-0" />
                </button>
              );
            })}
          </div>
        </Modal>

        <Modal
          isOpen={motivoModalOpen}
          onClose={() => setMotivoModalOpen(false)}
          title="Configurar Motivo"
          size="md"
          zIndex={80}
          footer={
            <div className="flex w-full justify-end items-center gap-3">
              <button type="button" onClick={() => setMotivoModalOpen(false)} className="bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                Listo
              </button>
            </div>
          }
        >
          <div className="space-y-4 pt-2 pb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Motivo</label>
              <select
                className="w-full p-3 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                value={formData.motivoReemplazoId}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, motivoReemplazoId: e.target.value }));
                  if (e.target.value) setMotivoModalOpen(false);
                }}
              >
                <option value="">Seleccionar motivo...</option>
                {motivos.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            {motivos.length === 0 && <p className="text-xs text-amber-600 dark:text-amber-400">No hay motivos configurados. Se cargan en Configuración → Novedades.</p>}
            <p className="text-[11px] text-slate-400">Es el motivo por el que falta la persona que se reemplaza. Son los mismos motivos que se usan en Novedades.</p>
          </div>
        </Modal>

        {/* Filtro por rol de la lista de personas. Se abre desde la ventana de arriba, así que va por
            encima de ella. */}
        <Modal
          isOpen={showRoleFilterMenu}
          onClose={() => setShowRoleFilterMenu(false)}
          title="Filtrar por Rol"
          size="md"
          zIndex={90}
          footer={
            <div className="flex w-full justify-between items-center gap-3">
              <button type="button" onClick={() => setSelectedRoleFilters([])} className="text-red-500 hover:text-red-600 font-bold text-sm py-2 px-4 transition-colors">
                Limpiar Filtros
              </button>
              <button type="button" onClick={() => setShowRoleFilterMenu(false)} className="bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                Listo
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">Seleccioná uno o más roles para acotar la lista de personas.</p>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
              {/*
                Los roles CON gente arriba y activos; los que no tienen a nadie quedan abajo y
                apagados. Se dejan a la vista —y no se esconden— porque «no está en la lista» se lee
                como que el rol no existe, y lo que pasa es otra cosa: existe y no lo tiene nadie.
              */}
              {[...roleFrames]
                .sort((a, b) => (personasPorRol.get(b.name) || 0) - (personasPorRol.get(a.name) || 0) || a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
                .map((rf) => {
                  const isSelected = selectedRoleFilters.includes(rf.name);
                  const cantidad = personasPorRol.get(rf.name) || 0;
                  const sinGente = cantidad === 0;
                  return (
                    <div key={rf._id} className={`flex items-center justify-between gap-3 py-3 border-b border-slate-100 dark:border-slate-800/50 last:border-0 group ${sinGente ? "opacity-40" : ""}`}>
                      <span className={`text-sm font-semibold text-slate-700 dark:text-slate-200 ${sinGente ? "" : "group-hover:text-blue-500"} transition-colors`}>
                        {rf.name} <span className="font-normal text-slate-400">({cantidad})</span>
                      </span>
                      <button
                        type="button"
                        disabled={sinGente}
                        title={sinGente ? "Nadie tiene este rol: filtrar por él dejaría la lista vacía" : undefined}
                        onClick={() => {
                          if (isSelected) setSelectedRoleFilters((prev) => prev.filter((r) => r !== rf.name));
                          else setSelectedRoleFilters((prev) => [...prev, rf.name]);
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all duration-300 focus:outline-none disabled:cursor-not-allowed ${isSelected ? "bg-blue-500 shadow-inner" : "bg-slate-200 dark:bg-slate-700"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ${isSelected ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </Modal>
      </div>
    </Modal>
  );
};
