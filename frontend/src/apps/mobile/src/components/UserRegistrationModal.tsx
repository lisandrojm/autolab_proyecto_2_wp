import React, { useState, useEffect, useMemo, useRef } from "react";
import { Modal } from "./Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faBriefcase, faClock, faMoneyBillWave, faExchangeAlt, faArrowRight, faSearch, faFilter, faPlus, faBuilding, faFileContract, faLink, faSpinner, faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
import { usersAPI } from "../../../../api/users";
import { DiasDeTrabajo } from "../../../../components/contratos/DiasDeTrabajo";
import { JornadasSolicitud } from "./JornadasSolicitud";
import { erroresDeJornadas, hayAjuste, jornadasDelCalendario } from "../../../../utils/jornadas";
import { roleFrameAPI, RoleFrameItem } from "../../../../api/roleFrames";
import { categoriaSatAPI, CategoriaSatItem } from "../../../../api/categoriasSat";
// La cadena empleadora → convenio → categoría es la MISMA que usa el escritorio. Ver ese módulo.
import { categoriasOfrecidas, codigosDeConveniosDeLaEmpleadora, conveniosOfrecidos, importePorJornadaDeCategoria } from "../../../../utils/seleccionConvenioCategoria";
import { sweetAlert } from "../utils/sweetAlert";
import { CustomDatePicker } from "./CustomDatePicker";
import { projectsAPI, Project } from "../../../../api/projects";
import { companiesAPI, Company } from "../../../../api/companies";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../../../../api/simpleCatalog";
import { useProfile } from "../hooks/useProfile";
import { LoadingSpinner } from "../../../../components/ui/LoadingSpinner";
import { infoAPI, InfoItem } from "../../../../api/info";
import { activityLogTypesAPI, RequestConfig } from "../../../../api/requestConfig";
import { fuzzyMatch } from "../../../../utils/searchHelpers";
import { estadosImpositivos, esTipoImpositivo, TipoImpositivo, tipoImpositivoDeContrato } from "../../../../utils/tramiteImpositivo";
import { esContratoVigente, fechaISO, getContratoActivo } from "../../../../utils/contratoVigencia";
import { contratosAPI, ContratoItem } from "../../../../api/contratos";
import { contratoFrameAPI, ContratoFrameItem } from "../../../../api/contratosFrame";
import { EstadoBadge } from "../../../../components/EstadoSelect";
import { useAuthStore } from "../../../../stores/authStore";
import { usePermisoInactivo } from "../../../../stores/permisosInactivosStore";
import { MOBILE_REGISTRO } from "../../../../utils/permisosMobile";
import { copiarMiLinkDeRegistro } from "../utils/portapapeles";

/** Un área y turno que se puede asignar en la solicitud, ya con los nombres para mostrarlo. */
interface OpcionAreaTurno {
  areaId: string;
  areaNombre: string;
  shiftId: string;
  turnoNombre: string;
  horario: string;
  /** Para ordenar los turnos como transcurre el día. Sin horario, al final. */
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
    orden: t?.startTime || "99:99",
  };
};

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
  const [convenios, setConvenios] = useState<SimpleCatalogItem[]>([]);
  const [platformUsers, setPlatformUsers] = useState<any[]>([]);
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
    void Promise.all([companiesAPI.list().catch(() => [] as Company[]), conveniosApi.list().catch(() => [] as SimpleCatalogItem[])]).then(([cs, cv]) => {
      setCompanies(cs);
      setConvenios(cv);
    });
  }, []);

  const [formData, setFormData] = useState({
    fullName: "",
    projectIds: [] as string[],
    roleFrameIds: [] as string[],
    categoriaSatId: "",
    startDate: "",
    dueDate: "",
    workdaysCount: "",
    diasPorSemana: "",
    diasSemana: [] as number[],
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
    LA DIFERENCIA CONTRA LA ESCALA, cuando se pisa el importe propuesto.

    El número de la categoría es el del convenio; el que se paga puede ser otro, y está bien que lo
    sea. Lo que no puede pasar es que la diferencia quede invisible: pagar de menos que la escala es
    un problema, y pagar de más es una decisión que alguien tomó y conviene que se vea escrita.

    `null` mientras no haya categoría o el importe coincida: no hay nada que mostrar.
  */
  const diferenciaContraEscala = useMemo(() => {
    const escala = importePorJornadaDeCategoria(categoriaElegida || undefined);
    const cargado = Number(formData.dailyRate);
    if (!escala || !Number.isFinite(cargado) || !formData.dailyRate) return null;
    const delta = Number((cargado - escala).toFixed(2));
    return delta === 0 ? null : { escala, delta };
  }, [categoriaElegida, formData.dailyRate]);
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

const TIME_OPTIONS = (() => {
    const options = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const hh = h.toString().padStart(2, "0");
        const mm = m.toString().padStart(2, "0");
        const val = `${hh}:${mm}`;
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 || 12;
        options.push({ value: val, label: `${h12}:${mm} ${ampm}` });
      }
    }
    return options;
  })();

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
          MODO SELECTOR en la lista de personas.

          Esta pantalla usa de cada persona: el nombre, el mail, el documento, y con qué rol empresa
          figura en sus proyectos —para el filtro por rol y para saber quién está en el proyecto
          cuando hay que elegir a quién reemplaza—. El listado completo, en cambio, traía la ficha
          entera de cada una: domicilio, datos bancarios, cliente, tenant y los proyectos poblados.

          Medido contra la base para 83 personas: 1280 ms y 131 KB antes, 224 ms y 16 KB con `picker`.
          Y la diferencia crece con la cantidad de gente del tenant, que es el caso real.
        */
        const personas = usersAPI
          .list({ limit: 1000, metadataActivo: "true", picker: true })
          .then((r) => setPlatformUsers(r.users || []))
          .catch((e) => console.error("Error cargando personas:", e));

        /*
          Se guardan los proyectos ACTIVOS sin filtrar por el perfil: el filtro se aplica al pintar.

          Estaba dentro del `.then`, y el efecto dependía de `profile`. Como el perfil llega por su
          cuenta unos milisegundos después que el modal abre, el efecto se ejecutaba DOS veces: las
          seis consultas salían duplicadas y el spinner se reiniciaba en el medio. Lo que se ve como
          "tarda un montón en traer los proyectos" era, en buena parte, traerlos dos veces.
        */
        const proyectos = projectsAPI
          // `slim`: nombre, cliente, estado y las empresas/convenios del proyecto, que es todo lo que
          // esta pantalla lee. El listado normal trae además áreas, turnos y coordinadores poblados,
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

        // Personas entra en la espera del spinner porque el buscador es el segundo campo; si tarda
        // más que los proyectos, igual no bloquea a los demás.
        Promise.all([proyectos, personas]).finally(() => setLoadingData(false));
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
        dueDate: "",
        workdaysCount: "",
        diasPorSemana: "",
        diasSemana: [],
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
  useEffect(() => {
    const id = (editingUser?.metadata as any)?.solicitudUserId;
    if (!isOpen || !id || selectedUser) return;
    const persona = platformUsers.find((u) => String(u._id) === String(id));
    if (persona) setSelectedUser(persona);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingUser, platformUsers]);

  // RENOVACIÓN: la persona es la del contrato que vence. Se elige cuando llega la lista de usuarios.
  useEffect(() => {
    const id = renovacion?.plantilla?.metadata?.solicitudUserId;
    if (!isOpen || !id || editingUser) return;
    const persona = platformUsers.find((u) => String(u._id) === String(id));
    if (persona) setSelectedUser(persona);
  }, [isOpen, renovacion, editingUser, platformUsers]);

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
  const personasFiltradas = useMemo(() => {
    const busca = userSearchTerm.trim().toLowerCase();
    return platformUsers.filter((u) => {
      const full = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
      const coincideTexto = !busca || full.includes(busca) || (u.email || "").toLowerCase().includes(busca);
      const coincideRol = selectedRoleFilters.length === 0 || (u.externalInfo?.rolFrames || []).some((rf: string) => selectedRoleFilters.includes(rf)) || (u.metadata?.projects || []).some((p: any) => selectedRoleFilters.includes(p.nombre_rol_frame));
      return coincideTexto && coincideRol;
    });
  }, [platformUsers, userSearchTerm, selectedRoleFilters]);

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
      const contratos = (u.metadata?.projects || []).flatMap((up: any) => (up && Array.isArray(up.contracts) ? up.contracts : []));
      const c = getContratoActivo(contratos);
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
  const personasPorRol = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const u of platformUsers) {
      const suyos = new Set<string>([...((u.externalInfo?.rolFrames || []) as string[]), ...((u.metadata?.projects || []) as any[]).map((p) => p?.nombre_rol_frame).filter(Boolean)]);
      for (const nombre of suyos) cuenta.set(nombre, (cuenta.get(nombre) || 0) + 1);
    }
    return cuenta;
  }, [platformUsers]);

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
    Y SI QUIEN PIDE NO COORDINA NADA ACÁ —un supervisor, un admin—, TODAS LAS DEL PROYECTO.

    El área y turno es obligatorio: es lo que precarga el wizard de aprobación. El listado de proyectos
    del móvil es liviano y no trae las áreas, así que se pide el proyecto con `team: "ids"` (sin el
    equipo poblado, que pesa MB). `null` mientras llega.
  */
  const [areasDelProyecto, setAreasDelProyecto] = useState<OpcionAreaTurno[] | null>(null);
  useEffect(() => {
    const id = proyectoElegido?._id;
    setAreasDelProyecto(null);
    if (!id || coordinacionesEnProyecto.length > 0) return;
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
  }, [proyectoElegido?._id, coordinacionesEnProyecto.length]);

  const coordinaEnElProyecto = coordinacionesEnProyecto.length > 0;
  /** Lo que se puede elegir. `null` = todavía cargando las áreas del proyecto. */
  const opcionesAreaTurno: OpcionAreaTurno[] | null = coordinaEnElProyecto ? coordinacionesEnProyecto : areasDelProyecto;

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

  const candidatosAReemplazar = useMemo(() => {
    if (formData.projectIds.length === 0) return [];
    const busca = replacedSearchTerm.trim().toLowerCase();
    return platformUsers.filter((u) => {
      if (selectedUser && String(u._id) === String(selectedUser._id)) return false;
      const enElProyecto = (u.metadata?.projects || []).some((p: any) => {
        const id = typeof p.projectId === "string" ? p.projectId : p.projectId?._id;
        return formData.projectIds.includes(String(id));
      });
      if (!enElProyecto) return false;
      if (!busca) return true;
      const nombre = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
      return nombre.includes(busca) || (u.email || "").toLowerCase().includes(busca);
    });
  }, [platformUsers, formData.projectIds, replacedSearchTerm, selectedUser]);

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
  const { categorias: categoriasOfrecidasLista, rolNoTieneCategoriasDelConvenio } = useMemo(
    () =>
      categoriasOfrecidas({
        rolesFrame: roleFrames.filter((rf) => formData.roleFrameIds.includes(rf._id)),
        convenioElegido: convenioCct,
        codigosEmpleadora,
        categorias: categoriasSat,
        verTodasDelConvenio,
        categoriaElegidaId: categoriasSat.find((c) => c._id === formData.categoriaSatId)?.data?.id,
      }),
    [roleFrames, formData.roleFrameIds, convenioCct, codigosEmpleadora, categoriasSat, verTodasDelConvenio, formData.categoriaSatId],
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
  const categoriaAnterior = useRef(formData.categoriaSatId);
  useEffect(() => {
    if (categoriaAnterior.current === formData.categoriaSatId) return;
    categoriaAnterior.current = formData.categoriaSatId;
    if (!formData.categoriaSatId) return;
    const propuesto = importePorJornadaDeCategoria(categoriasSat.find((c) => c._id === formData.categoriaSatId));
    if (propuesto > 0) setFormData((p) => ({ ...p, dailyRate: String(propuesto) }));
  }, [formData.categoriaSatId, categoriasSat]);

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

  /** Cómo se llama la persona reemplazada, para mostrarla en el campo sin volver a buscarla. */
  const nombreReemplazado = (() => {
    if (!formData.replacedUserId) return "";
    const u = platformUsers.find((p) => String(p._id) === String(formData.replacedUserId));
    return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email : "";
  })();

  /*
    ═══ LAS JORNADAS: CALCULADAS, O A MANO CON MOTIVO ═══  (la regla completa, en `utils/jornadas.ts`)

    Con días fijos salen del calendario —cuántas veces caen los días marcados entre las dos fechas— y
    se recalculan solas ante cualquier cambio de fechas, días o del switch. Con rotativos no hay patrón
    del cual deducirlas: se cargan a mano y ahí no existe «calculado» ni ajuste.
  */
  const jornadasCalculadas = useMemo(
    () => (formData.diasRotativos ? null : jornadasDelCalendario(formData.startDate, formData.dueDate, formData.diasSemana)),
    [formData.diasRotativos, formData.startDate, formData.dueDate, formData.diasSemana],
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
    desde: formData.startDate,
    hasta: formData.dueDate,
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

    setSubmitting(true);
    try {
      const timestamp = Date.now();
      const placeholderEmail = `solicitud_${timestamp}@pending.com`;
      const placeholderPassword = `pass_${timestamp}`;

      const submitData = {
        email: placeholderEmail,
        password: placeholderPassword,
        firstName: formData.fullName.split(" ")[0] || "Pendiente",
        lastName: formData.fullName.split(" ").slice(1).join(" ") || "Pendiente",
        isActive: false,
        hireDate: formData.startDate || new Date().toISOString(),
        metadata: {
          fullName: formData.fullName,
          projectIds: formData.projectIds,
          // Si el alta se pidió para alguien que YA es usuario, se guarda el vínculo: así la
          // solicitud se muestra dentro de su ficha en vez de crear una tarjeta duplicada. Si el
          // nombre se escribió a mano (persona que todavía no existe), queda vacío.
          solicitudUserId: selectedUser?._id || undefined,
          roles_frame: formData.roleFrameIds,
          categoriaSatId: esServicios ? undefined : formData.categoriaSatId,
          startDate: formData.startDate,
          dueDate: formData.dueDate,
          // Lo que se liquida. De dónde salió viaja al lado, para auditarlo sin recalcular.
          workdaysCount: Number(formData.workdaysCount),
          // El calculado se guarda SIEMPRE, haya ajuste o no: las reglas del calendario pueden cambiar.
          workdaysCalculated: jornadasCalculadas,
          workdaysOverridden: hayAjuste(datosJornadas),
          workdaysOverrideReason: hayAjuste(datosJornadas) ? formData.workdaysOverrideReason : null,
          workdaysOverrideNote: hayAjuste(datosJornadas) ? formData.workdaysOverrideNote.trim() || null : null,
          diasPorSemana: Number(formData.diasPorSemana) || undefined,
          diasSemana: formData.diasSemana,
          diasRotativos: formData.diasRotativos,
          schedule: `${formData.inTime} - ${formData.outTime}`,
          // Con qué CUIT se contrata y bajo qué CCT. Sin esto el alta llega sin empleadora y hay que
          // deducirla del proyecto más tarde, cuando ya nadie recuerda cuál de las tres era.
          empresaContratoId: formData.empresaContratoId || undefined,
          convenioId: esServicios ? undefined : formData.convenioId || undefined,
          dailyRate: Number(formData.dailyRate),
          isReplacement: formData.isReplacement,
          // A quién reemplaza. Los dos identificadores: el numérico que usa el contrato (puede
          // faltar en fichas no sincronizadas) y el `_id`, que siempre está.
          empleado_id_reemplezado: formData.isReplacement ? formData.empleado_id_reemplezado || undefined : undefined,
          replacedUserId: formData.isReplacement ? formData.replacedUserId || undefined : undefined,
          // El motivo viaja como id del tipo de novedad, no como texto: el nombre lo pone quien lo
          // muestre, leyéndolo del mismo catálogo que Novedades.
          motivoReemplazoId: formData.isReplacement ? formData.motivoReemplazoId || undefined : undefined,
          // Se manda solo si tiene algo: un string vacío guardado se lee después como "hay un
          // comentario" en cualquier chequeo por presencia.
          comentarios: formData.comentarios.trim() || undefined,
          // El trámite declarado viaja con la solicitud: es lo que después precarga el wizard.
          tipoImpositivo: formData.tipoImpositivo || undefined,
          /*
            El tipo de contrato elegido y el área/turno que coordina quien pide. Los dos existían ya
            como precarga del wizard de aprobación (`metadata.contratoId`, `areaShiftAssignments`):
            lo que faltaba era que la solicitud los trajera, en vez de volver a cargarlos al aprobar.
          */
          contratoId: formData.contratoId || undefined,
          nombre_contrato: contratoElegido?.name || undefined,
          // Siempre: la solicitud no se envía sin área y turno, y es lo que precarga el wizard de aprobación.
          areaShiftAssignments: formData.areaShiftAssignments,
          /*
            RENOVACIÓN: la etiqueta y QUÉ contrato renueva. Al crearla, el server anota la decisión y el
            contrato sale de «Por vencer». Al editar una renovación se conservan: si no, guardarla de
            nuevo le borraría la etiqueta.
          */
          esRenovacion: renovacion ? true : (editingUser?.metadata as any)?.esRenovacion || undefined,
          renovacionDe: renovacion ? { userProjectId: renovacion.userProjectId, fechaBajaContrato: renovacion.fechaBajaContrato } : (editingUser?.metadata as any)?.renovacionDe || undefined,
          isSolicitud: true,
        },
      };

      if (editingUser) {
        await usersAPI.update(editingUser._id, submitData as any);
        sweetAlert.success("Solicitud actualizada", "La solicitud de alta ha sido actualizada correctamente.");
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
        dueDate: "",
        workdaysCount: "",
        diasPorSemana: "",
        diasSemana: [],
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
            {submitting ? "Cargando..." : editingUser ? "Actualizar Solicitud" : renovacion ? "Enviar Renovación" : "Enviar Solicitud"}
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
        </div>

        {/*
          LA CADENA, EN UNA FILA Y EN ORDEN: convenio → categoría → importe. Con un tipo de contrato de
          Servicios queda sólo el importe, libre (ver `esServicios`).

          Estaban repartidos por el formulario —el convenio abajo de todo, la categoría arriba— y esa
          distancia escondía que uno depende del otro. Puestos en fila y en el orden en que se
          completan, la dependencia se ve sin que nadie la explique.
        */}
        <div className={`grid grid-cols-1 gap-4 ${esServicios ? "" : "md:grid-cols-3"}`}>
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
                  {categoriaElegida.data?.codigoArca && <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{categoriaElegida.data.codigoArca}</span>}
                  <span className="truncate text-sm text-slate-900 dark:text-white">{categoriaElegida.name}</span>
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

          <div className="space-y-1">
            {/* Mismo rótulo con ícono que «Horario»: sin él, las dos etiquetas tenían alturas
                distintas y los campos de la fila arrancaban desparejos. La altura de los controles
                también se fija (`h-12`) en vez de depender del `py-3`, que en un <select> y en un
                <input> no da lo mismo. */}
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faMoneyBillWave} className="text-blue-500 text-[10px]" />
              Importe por Jornada
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <FontAwesomeIcon icon={faMoneyBillWave} />
              </span>
              <input type="number" name="dailyRate" value={formData.dailyRate} onChange={handleChange} className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="0" />
            </div>
            {esServicios && <p className="text-[11px] text-slate-400">Es un servicio: no hay convenio ni categoría, así que el importe se carga a mano.</p>}
            {/* De dónde salió el número, y cuánto se apartó de él si alguien lo cambió. */}
            {categoriaElegida && !diferenciaContraEscala && <p className="text-[11px] text-slate-400">De la escala de {categoriaElegida.name}{convenioElegido ? ` · ${convenioElegido.externalId}` : ""}. Se puede cambiar.</p>}
            {diferenciaContraEscala && (
              <p className={`text-[11px] font-medium ${diferenciaContraEscala.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                {diferenciaContraEscala.delta > 0 ? "+" : "−"}
                {Math.abs(diferenciaContraEscala.delta).toLocaleString("es-AR", { minimumFractionDigits: 2 })} contra la escala ({diferenciaContraEscala.escala.toLocaleString("es-AR", { minimumFractionDigits: 2 })})
              </p>
            )}
          </div>
        </div>

        <div id="bloque-fechas" className="space-y-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <CustomDatePicker label="Start Date" value={formData.startDate} onChange={(date) => setFormData((p) => ({ ...p, startDate: date }))} />
            </div>
            <div className="space-y-1">
              <CustomDatePicker label="Due Date" value={formData.dueDate} onChange={(date) => setFormData((p) => ({ ...p, dueDate: date }))} />
            </div>
          </div>
          {/* Se dice apenas pasa, no al enviar: con el fin antes del inicio no hay jornadas que calcular. */}
          {erroresJornadas.fechas && <p className="text-[11px] font-medium text-red-600 dark:text-red-400">{erroresJornadas.fechas}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/*
            PRIMERO LOS DÍAS DE LA SEMANA, DESPUÉS LAS JORNADAS: de las fechas y los días salen las
            jornadas, así que van en el orden en que se deducen. Mismo componente que el escritorio.
          */}
          <div id="bloque-dias" className="md:col-span-3">
            <DiasDeTrabajo
              variante="mobile"
              jornadas={Number(formData.diasPorSemana) || 0}
              onJornadas={(n) => setFormData((p) => ({ ...p, diasPorSemana: n ? String(n) : "" }))}
              rotativos={formData.diasRotativos}
              onRotativos={cambiarRotativos}
              dias={formData.diasSemana}
              onDias={(d) => setFormData((p) => ({ ...p, diasSemana: d }))}
              errorDiasPorSemana={intentoEnviar ? erroresJornadas.diasPorSemana : undefined}
              errorDias={intentoEnviar ? erroresJornadas.dias : undefined}
            />
          </div>

          {/* Las jornadas TOTALES (22, 30…): lo que multiplica al sueldo por jornada. */}
          <div className="md:col-span-3">
            <JornadasSolicitud
              desde={formData.startDate}
              hasta={formData.dueDate}
              rotativos={formData.diasRotativos}
              calculadas={jornadasCalculadas}
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
              aviso={avisoJornadas}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faClock} className="text-blue-500 text-[10px]" />
              Horario (Entrada - Salida)*
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <select name="inTime" value={formData.inTime} onChange={handleChange} className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white appearance-none">
                  <option value="">Entrada</option>
                  {TIME_OPTIONS.map((opt) => (
                    <option key={`in-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <FontAwesomeIcon icon={faArrowRight} className="text-slate-400 text-xs" />
              <div className="relative flex-1">
                <select name="outTime" value={formData.outTime} onChange={handleChange} className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white appearance-none">
                  <option value="">Salida</option>
                  {TIME_OPTIONS.map((opt) => (
                    <option key={`out-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

        </div>
        {/*
          EL ÁREA Y TURNO DE LA PERSONA: OBLIGATORIO, y es lo que precarga el wizard de aprobación.

          El coordinador pide el alta para SU área: se le ofrecen sus coordinaciones en el proyecto (el
          server manda sólo las propias, ver `?slim=true`). Quien no coordina nada ahí —un supervisor, un
          admin— elige entre todas las del proyecto. Antes, en ese caso la solicitud viajaba sin área y
          había que elegirla al aprobar, sabiendo menos que quien la pidió.

          Con una sola opción no se pregunta: se informa, ya puesta.
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
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                Este proyecto no tiene áreas y turnos configurados. Avisale a administración: la solicitud no se puede enviar sin el área y el turno de la persona.
              </p>
            ) : opcionesAreaTurno.length === 1 ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                <FontAwesomeIcon icon={faCheck} className="text-blue-600 text-xs" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    {opcionesAreaTurno[0].areaNombre} · {opcionesAreaTurno[0].turnoNombre}
                  </span>
                  {opcionesAreaTurno[0].horario && <span className="block text-[11px] text-slate-400">{opcionesAreaTurno[0].horario}</span>}
                </span>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-slate-400">{coordinaEnElProyecto ? "Las áreas y turnos que supervisás en este proyecto." : "Elegí en qué área y turno va a trabajar."}</p>
                <div className="space-y-2">
                  {areasAgrupadas.map((area) => (
                    <div key={area.areaId} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">{area.nombre}</p>
                      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
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
                                {t.horario && <span className="block text-[10px] text-slate-400">{t.horario}</span>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {intentoEnviar && !areaTurnoElegido && (opcionesAreaTurno?.length ?? 0) > 0 && <p className="text-[11px] font-medium text-red-600 dark:text-red-400">Elegí el área y el turno donde va a trabajar.</p>}
          </div>
        )}

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

            {/* La lista no filtra por contrato: se dice, y cuántos tienen uno vigente. */}
            {personasFiltradas.length > 0 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {personasFiltradas.length} {personasFiltradas.length === 1 ? "persona" : "personas"} · <span className="font-semibold text-green-600 dark:text-green-400">{conContratoVigente} con contrato vigente</span>. Aparecen todas, tengan contrato o no.
              </p>
            )}

            <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {personasFiltradas.length === 0 ? (
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
                personasFiltradas.slice(0, 50).map((u) => {
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
            {personasFiltradas.length > 50 && <p className="text-[11px] text-slate-400">Se muestran las primeras 50 de {personasFiltradas.length}. Afiná la búsqueda o filtrá por rol.</p>}
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
                  return (
                    <button
                      key={cat._id}
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, categoriaSatId: cat._id }));
                        setAvisoCascada("");
                        setCategoriaModalOpen(false);
                        setCategoriaBusqueda("");
                      }}
                      aria-pressed={elegida}
                      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${elegida ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400" : "border-slate-100 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}
                    >
                      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${elegida ? "border-blue-600" : "border-slate-300 dark:border-slate-600"}`}>{elegida && <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />}</div>
                      {cat.data?.codigoArca && <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{cat.data.codigoArca}</span>}
                      <span className="flex-1 truncate text-sm font-medium">{cat.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
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
