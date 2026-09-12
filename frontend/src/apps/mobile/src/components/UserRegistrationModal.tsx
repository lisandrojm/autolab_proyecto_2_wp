import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "./Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faBriefcase, faClock, faMoneyBillWave, faExchangeAlt, faArrowRight, faSearch, faFilter, faFileInvoiceDollar, faPlus, faBuilding, faFileContract } from "@fortawesome/free-solid-svg-icons";
import { usersAPI } from "../../../../api/users";
import { DiasDeTrabajo, faltaDefinirDias } from "../../../../components/contratos/DiasDeTrabajo";
import { roleFrameAPI, RoleFrameItem } from "../../../../api/roleFrames";
import { categoriaSatAPI, CategoriaSatItem } from "../../../../api/categoriasSat";
import { sweetAlert } from "../utils/sweetAlert";
import { CustomDatePicker } from "./CustomDatePicker";
import { projectsAPI, Project } from "../../../../api/projects";
import { companiesAPI, Company } from "../../../../api/companies";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../../../../api/simpleCatalog";
import { useProfile } from "../hooks/useProfile";
import { LoadingSpinner } from "../../../../components/ui/LoadingSpinner";
import { infoAPI, InfoItem } from "../../../../api/info";
import { activityLogTypesAPI, RequestConfig } from "../../../../api/requestConfig";
import { estadoLabel } from "../../../../components/EstadoSelect";
import { fuzzyMatch } from "../../../../utils/searchHelpers";
import { estadosImpositivos, esTipoImpositivo, TipoImpositivo } from "../../../../utils/tramiteImpositivo";
import { TRAMITE_ALTA_TEMPRANA } from "../../../../components/contratos/altaTemprana";

interface UserRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingUser?: any | null;
}

export const UserRegistrationModal: React.FC<UserRegistrationModalProps> = ({ isOpen, onClose, onSuccess, editingUser }) => {
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
    inTime: "",
    outTime: "",
    /** La empleadora que contrata y el convenio bajo el que lo hace. Salen del proyecto elegido. */
    empresaContratoId: "",
    convenioId: "",
    dailyRate: "",
    isReplacement: false,
    /** Por qué vía se contrata: alta temprana ante ARCA o locación de servicios. */
    tipoImpositivo: "" as TipoImpositivo | "",
    /** A quién reemplaza: el id numérico que usa el contrato (puede faltar) y el `_id`, que no. */
    empleado_id_reemplezado: "",
    replacedUserId: "",
    /** Por qué falta la persona reemplazada. Es un tipo de novedad, no un texto libre. */
    motivoReemplazoId: "",
    /** Lo que no entra en ningún otro campo. Opcional. */
    comentarios: "",
  });

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
   * Los convenios que se pueden elegir para la empresa marcada.
   *
   * Si el proyecto acotó sus convenios, se ofrecen ESOS —cruzados con los que la empleadora tiene
   * registrados, porque ARCA solo acepta categorías de los CCT de ese CUIT—. Si no acotó nada, se
   * ofrecen todos los de la empleadora: vacío en el proyecto significa «todavía no se acotó», no
   * «ninguno», y leerlo al revés dejaría el alta sin convenios que elegir.
   */
  const conveniosDisponibles = useMemo(() => {
    const empresa = companies.find((c) => c._id === formData.empresaContratoId);
    if (!empresa) return [];
    const deLaEmpresa = new Set((empresa.convenioIds || []).map(String));
    const delProyecto = new Set<string>();
    for (const p of projects) {
      if (!formData.projectIds.includes(p._id)) continue;
      for (const id of p.convenioIds || []) delProyecto.add(String(id));
    }
    const permitidos = delProyecto.size > 0 ? [...delProyecto].filter((id) => deLaEmpresa.has(id)) : [...deLaEmpresa];
    return convenios.filter((c) => permitidos.includes(c._id));
  }, [companies, convenios, projects, formData.projectIds, formData.empresaContratoId]);

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
      if (formData.empresaContratoId !== unica) setFormData((p) => ({ ...p, empresaContratoId: unica, convenioId: "" }));
    }
  }, [empresasDelProyecto, formData.empresaContratoId]);

  useEffect(() => {
    const valido = conveniosDisponibles.some((c) => c._id === formData.convenioId);
    if (!valido) {
      const unico = conveniosDisponibles.length === 1 ? conveniosDisponibles[0]._id : "";
      if (formData.convenioId !== unico) setFormData((p) => ({ ...p, convenioId: unico }));
    }
  }, [conveniosDisponibles, formData.convenioId]);


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
          `slimProjects` en la lista de personas.

          Sin eso, `/users` pobla `metadata.projects` con TODOS los contratos de cada persona: con
          `limit: 1000` eso es el N×M completo del tenant, y es lo que hacía que esta consulta se
          comiera el tiempo (o directamente cortara por timeout) y, de paso, se llevara puestos a los
          proyectos por estar en el mismo `Promise.all`.

          Acá alcanza con lo liviano: el buscador de personas usa nombre, email y `externalInfo`, y el
          de reemplazos necesita `metadata.projects[].projectId` para saber quién está en el proyecto.
          Nada de eso son los contratos.
        */
        const personas = usersAPI
          .list({ limit: 1000, metadataActivo: "true", slimProjects: true })
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
          .listAll()
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
          .then((estados) => setImpositivos(estadosImpositivos(estados)))
          .catch((e) => console.error("Error cargando estados:", e));
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
    if (isOpen && editingUser) {
      const meta = editingUser.metadata || {};
      const [inTime, outTime] = (meta.schedule || " - ").split(" - ");
      setFormData({
        fullName: meta.fullName || `${editingUser.firstName} ${editingUser.lastName}`,
        projectIds: meta.projectIds || [],
        // Las tres formas en que quedó guardado el rol según quién creó la solicitud.
        roleFrameIds: (meta.rolesFrameIds?.length ? meta.rolesFrameIds : meta.roles_frame?.length ? meta.roles_frame : meta.roleFrameId ? [meta.roleFrameId] : []).map((rf: any) => String(typeof rf === "string" ? rf : rf?._id)).filter(Boolean),
        categoriaSatId: meta.categoriaSatId || "",
        startDate: meta.startDate || editingUser.hireDate?.split("T")[0] || "",
        dueDate: meta.dueDate || "",
        workdaysCount: meta.workdaysCount?.toString() || "",
        // Las solicitudes anteriores a este campo no traen días: se abren vacías y hay que
        // elegirlos, en vez de inventar una semana que nadie declaró.
        diasPorSemana: (meta as any).diasPorSemana?.toString() || "",
        diasSemana: Array.isArray((meta as any).diasSemana) ? ((meta as any).diasSemana as number[]) : [],
        diasRotativos: !!(meta as any).diasRotativos,
        inTime: inTime || "",
        empresaContratoId: meta.empresaContratoId || "",
        convenioId: meta.convenioId || "",
        outTime: outTime || "",
        dailyRate: meta.dailyRate?.toString() || "",
        isReplacement: meta.isReplacement || false,
        // Las solicitudes anteriores a este campo se abren sin trámite: hay que elegirlo, en vez de
        // dar por hecho uno de los dos.
        tipoImpositivo: esTipoImpositivo(meta.tipoImpositivo) ? meta.tipoImpositivo : "",
        empleado_id_reemplezado: meta.empleado_id_reemplezado != null ? String(meta.empleado_id_reemplezado) : "",
        replacedUserId: meta.replacedUserId ? String(meta.replacedUserId) : "",
        motivoReemplazoId: meta.motivoReemplazoId ? String(meta.motivoReemplazoId) : "",
        comentarios: meta.comentarios || "",
      });
    } else if (isOpen && !editingUser) {
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
        inTime: "",
        empresaContratoId: "",
        convenioId: "",
        outTime: "",
        dailyRate: "",
        isReplacement: false,
        tipoImpositivo: "",
        empleado_id_reemplezado: "",
        replacedUserId: "",
        motivoReemplazoId: "",
        comentarios: "",
      });
      setReplacedSearchTerm("");
      setUserSearchTerm("");
      setSelectedUser(null);
    }
  }, [isOpen, editingUser]);

  /*
    ARRANCA EN «PEDIDO DE ARCA».

    Es la vía de la enorme mayoría de las contrataciones, así que dejarlo vacío hacía que el
    coordinador tuviera que elegir siempre lo mismo. El default es visible y se cambia con un click:
    no es un dato que se guarde a espaldas de nadie.

    Solo rellena cuando está vacío, así que no pisa lo que traiga una solicitud que se está
    editando. Y sale de los estados del ABM: si el de alta temprana no está configurado, no se
    inventa una selección que no existe.
  */
  useEffect(() => {
    if (!isOpen || formData.tipoImpositivo) return;
    const porDefecto = impositivos.find((e) => e.data?.tipoImpositivo === TRAMITE_ALTA_TEMPRANA);
    if (porDefecto?.data?.tipoImpositivo) setFormData((p) => (p.tipoImpositivo ? p : { ...p, tipoImpositivo: TRAMITE_ALTA_TEMPRANA }));
  }, [isOpen, impositivos, formData.tipoImpositivo]);

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
    QUIÉNES PUEDEN SER REEMPLAZADOS: el equipo del proyecto elegido, menos la persona del alta.

    Se filtra por los proyectos que tiene cargados cada ficha (`metadata.projects`), que es el mismo
    criterio que usa el escritorio para armar el equipo. Reemplazar a alguien que no está en el
    proyecto no es un reemplazo, y ofrecer la lista completa de la plataforma convertiría el
    buscador en una lista de cientos de nombres donde el correcto es uno.
  */
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
   * Los roles que se ofrecen: los de la persona elegida (o todos, si el nombre se escribió a mano),
   * filtrados por el buscador de la ventana.
   */
  const rolesDisponibles = useMemo(() => {
    const base = roleFrames.filter((rf) => rolesDelUsuario.length === 0 || rolesDelUsuario.includes(rf._id));
    return rolSearchTerm.trim() ? base.filter((rf) => fuzzyMatch(rf.name, rolSearchTerm)) : base;
  }, [roleFrames, rolesDelUsuario, rolSearchTerm]);

  /*
    LAS CATEGORÍAS QUE SE OFRECEN: la UNIÓN de las que habilita cada rol elegido.

    Con un rol solo era su lista. Con varios no se puede intersecar —un Animador 2D que además es
    Asistente de Cámara puede entrar por una categoría de cualquiera de los dos oficios— así que se
    suman. Y se sigue respetando lo que la persona ya tiene asignado, que es el otro filtro.
  */
  const categoriasDisponibles = useMemo(() => {
    if (formData.roleFrameIds.length === 0) return [];
    const habilitadas = new Set<string>();
    for (const id of formData.roleFrameIds) {
      const rf = roleFrames.find((x) => x._id === id);
      for (const c of (rf?.data?.categoriasSat || []) as any[]) habilitadas.add(String(c?.id ?? c));
    }
    return categoriasSat.filter((cat) => {
      const porRol = habilitadas.has(String(cat.externalId)) || habilitadas.has(String(cat.data?.id));
      const porUsuario = !selectedUser?.metadata?.categoriaSatIds?.length || selectedUser.metadata.categoriaSatIds.includes(cat._id);
      return porRol && porUsuario;
    });
  }, [categoriasSat, roleFrames, formData.roleFrameIds, selectedUser]);

  /*
    Si la categoría cargada dejó de estar habilitada, se limpia.

    Antes se limpiaba SIEMPRE al tocar el rol, y con varios roles eso era peor: agregar un segundo
    oficio borraba una categoría que seguía siendo válida. Ahora solo se borra la que de verdad ya no
    corresponde — que es el caso que importa, porque el desplegable la dejaba de listar pero el valor
    seguía viajando en el submit.
  */
  useEffect(() => {
    if (!formData.categoriaSatId) return;
    if (categoriasDisponibles.some((c) => c._id === formData.categoriaSatId)) return;
    setFormData((prev) => ({ ...prev, categoriaSatId: "" }));
  }, [categoriasDisponibles, formData.categoriaSatId]);

  /** El motivo elegido, para mostrar su nombre sin repetir el `find` en cada lugar donde se usa. */
  const motivoElegido = motivos.find((m) => String(m._id) === String(formData.motivoReemplazoId)) || null;

  /** Cómo se llama la persona reemplazada, para mostrarla en el campo sin volver a buscarla. */
  const nombreReemplazado = (() => {
    if (!formData.replacedUserId) return "";
    const u = platformUsers.find((p) => String(p._id) === String(formData.replacedUserId));
    return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email : "";
  })();

  const handleSubmit = async () => {
    if (!formData.fullName || !formData.projectIds.length || formData.roleFrameIds.length === 0 || !formData.categoriaSatId) {
      sweetAlert.warning("Campos incompletos", "Por favor completa los campos obligatorios.");
      return;
    }
    /*
      LOS DÍAS QUE TRABAJA SON OBLIGATORIOS TAMBIÉN ACÁ.

      Una solicitud sin los días se convierte en un contrato sin los días: la carga la sigue alguien
      del otro lado, que no sabe cuáles eran y termina preguntando por mensaje. Es más barato pedirlo
      donde está la persona que lo sabe.

      Misma regla que en «Agregar miembro» y «Configurar miembro» — se importa, no se reescribe.
    */
    /*
      SIN TRÁMITE NO SE MANDA.

      Es el dato del que después dependen el TXT de ARCA y qué papeles hay que juntar. Dejarlo
      opcional lo convierte en algo que alguien completa más tarde adivinando, y adivinar mal acá
      se descubre recién cuando el alta sale mal ante el organismo.
    */
    if (!formData.tipoImpositivo && impositivos.length > 0) {
      sweetAlert.warning("Falta el tipo de alta", "Elegí si la contratación va por alta de ARCA o por servicios.");
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
    const faltaDias = faltaDefinirDias(Number(formData.diasPorSemana) || 0, formData.diasRotativos, formData.diasSemana);
    if (faltaDias) {
      sweetAlert.warning("Faltan los días que trabaja", `${faltaDias.charAt(0).toUpperCase()}${faltaDias.slice(1)}.`);
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
          categoriaSatId: formData.categoriaSatId,
          startDate: formData.startDate,
          dueDate: formData.dueDate,
          workdaysCount: Number(formData.workdaysCount),
          diasPorSemana: Number(formData.diasPorSemana) || undefined,
          diasSemana: formData.diasSemana,
          diasRotativos: formData.diasRotativos,
          schedule: `${formData.inTime} - ${formData.outTime}`,
          // Con qué CUIT se contrata y bajo qué CCT. Sin esto el alta llega sin empleadora y hay que
          // deducirla del proyecto más tarde, cuando ya nadie recuerda cuál de las tres era.
          empresaContratoId: formData.empresaContratoId || undefined,
          convenioId: formData.convenioId || undefined,
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
          isSolicitud: true,
        },
      };

      if (editingUser) {
        await usersAPI.update(editingUser._id, submitData as any);
        sweetAlert.success("Solicitud actualizada", "La solicitud de alta ha sido actualizada correctamente.");
      } else {
        await usersAPI.create(submitData as any);
        sweetAlert.success("Solicitud enviada", "La solicitud de alta ha sido enviada correctamente.");
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
        inTime: "",
        empresaContratoId: "",
        convenioId: "",
        outTime: "",
        dailyRate: "",
        isReplacement: false,
        tipoImpositivo: "",
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
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">{editingUser ? "Editar Solicitud" : "Solicitud de Contratación"}</h3>
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
            {submitting ? "Cargando..." : editingUser ? "Actualizar Solicitud" : "Enviar Solicitud"}
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
            Clientes | Proyectos* (Selecciona uno o más)
          </label>
          {/* Sin marco propio: cada proyecto YA es una tarjeta con su borde, y el contenedor
              alrededor los dejaba como una caja adentro de otra caja. El alto máximo queda para que
              una lista larga no empuje el resto del formulario fuera de la vista. */}
          <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
            {loadingData ? (
              <div className="flex items-center justify-center h-full py-4">
                <LoadingSpinner message="Cargando datos..." />
              </div>
            ) : projects.length === 0 ? (
              <div className="flex items-center justify-center h-full py-4 text-slate-500 italic text-sm">No hay proyectos disponibles</div>
            ) : (
              projects.map((p) => {
                const isSelected = formData.projectIds.includes(p._id);
                return (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setFormData((prev) => ({ ...prev, projectIds: prev.projectIds.filter((id) => id !== p._id) }));
                      } else {
                        setFormData((prev) => ({ ...prev, projectIds: [...prev.projectIds, p._id] }));
                      }
                    }}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${isSelected ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400" : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 opacity-60"}`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center border ${isSelected ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 dark:border-slate-600"}`}>{isSelected && <FontAwesomeIcon icon={faCheck} className="text-[10px]" />}</div>
                    <span className="text-sm font-medium">{typeof p.clientId === "object" && p.clientId.name ? `${p.clientId.name} | ${p.name}` : p.name}</span>
                  </button>
                );
              })
            )}
          </div>
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
          {/* El nombre escrito a mano —alguien que todavía no es usuario de la plataforma— se marca,
              porque el resto del formulario se comporta distinto: no hereda rol ni categoría. */}
          {formData.fullName && !selectedUser && <p className="text-[11px] text-amber-600 dark:text-amber-400">Nombre escrito a mano: todavía no es usuario de la plataforma.</p>}
        </div>

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
              {rolesElegidos.length > 0 && rolesDelUsuario.length !== 1 && (
                <button type="button" onClick={() => setRolModalOpen(true)} title="Agregar otro rol" className="h-4 w-4 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors shrink-0 ml-0.5">
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
                    {rolesDelUsuario.length !== 1 && (
                      <button type="button" onClick={() => alternarRol(rf._id)} title={`Quitar ${rf.name}`} className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-0.5">
                        <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
                      </button>
                    )}
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
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
              Categoría*
            </label>
            {/*
              CERRADA HASTA QUE HAYA ROL. La categoría CUELGA del rol empresa: la lista de abajo son
              las categorías que ese rol habilita.

              Sin rol elegido el filtro no aplica y el desplegable ofrecía el catálogo entero, así
              que se podía cargar una categoría que el rol no habilita — y eso se descubría recién
              del otro lado, al armar el contrato. Cerrarlo dice el orden en el que hay que
              completar, en vez de dejar elegir mal.
            */}
            <select
              name="categoriaSatId"
              value={formData.categoriaSatId}
              onChange={handleChange}
              disabled={formData.roleFrameIds.length === 0}
              title={formData.roleFrameIds.length === 0 ? "Elegí primero el rol empresa" : undefined}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">{formData.roleFrameIds.length === 0 ? "Elegí primero el rol empresa" : "Selecciona categoría"}</option>
              {/* La lista sale de `categoriasDisponibles`: la unión de lo que habilita cada rol elegido. */}
              {categoriasDisponibles.map((cat) => (
                <option key={cat._id} value={cat._id}>
                  {cat.data?.numeroCategoria ? `(${cat.data.numeroCategoria}) ` : ""}
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <CustomDatePicker label="Start Date" value={formData.startDate} onChange={(date) => setFormData((p) => ({ ...p, startDate: date }))} />
          </div>
          <div className="space-y-1">
            <CustomDatePicker label="Due Date" value={formData.dueDate} onChange={(date) => setFormData((p) => ({ ...p, dueDate: date }))} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Las jornadas TOTALES del contrato (22, 30…). Es lo que multiplica al sueldo por jornada,
              y NO es lo mismo que los días de la semana: son dos números distintos. */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cantidad de Jornadas</label>
            <input type="number" name="workdaysCount" value={formData.workdaysCount} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="Ej: 22" />
          </div>

          {/* Y los días de la SEMANA, con el mismo componente que el escritorio. */}
          <div className="md:col-span-3">
            <DiasDeTrabajo variante="mobile" jornadas={Number(formData.diasPorSemana) || 0} onJornadas={(n) => setFormData((p) => ({ ...p, diasPorSemana: n ? String(n) : "" }))} rotativos={formData.diasRotativos} onRotativos={(v) => setFormData((p) => ({ ...p, diasRotativos: v }))} dias={formData.diasSemana} onDias={(d) => setFormData((p) => ({ ...p, diasSemana: d }))} desde={formData.startDate} hasta={formData.dueDate} jornadasTotales={Number(formData.workdaysCount) || 0} onJornadasTotales={(n) => setFormData((p) => ({ ...p, workdaysCount: String(n) }))} />
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

          {/*
            CON QUÉ EMPLEADORA Y BAJO QUÉ CONVENIO. Debajo del horario, que es donde termina lo que
            se pacta con la persona y empieza lo que define el alta.

            Sale del proyecto: sus empresas del contrato, y de cada una sus convenios registrados. Con
            una sola opción se elige sola y el campo queda de lectura — un combo de un ítem no es una
            decisión. Con dos o más hay que elegir: equivocar la empleadora manda el alta con el CUIT
            que no es, y eso se descubre cuando ARCA devuelve el archivo.
          */}
          <div className="space-y-1 md:col-span-2">
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

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faFileContract} className="text-blue-500 text-[10px]" />
              Convenio
            </label>
            {!formData.empresaContratoId ? (
              <p className="text-xs text-slate-400 py-2">Elegí primero la empresa.</p>
            ) : conveniosDisponibles.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 py-2">Esa empleadora no tiene convenios registrados ante ARCA, así que no hay categorías que se le puedan dar de alta.</p>
            ) : conveniosDisponibles.length === 1 ? (
              <p className="h-12 flex items-center px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white">
                <span className="font-mono text-xs text-blue-600 dark:text-blue-400 mr-2">{conveniosDisponibles[0].externalId}</span>
                {conveniosDisponibles[0].name}
              </p>
            ) : (
              <select name="convenioId" value={formData.convenioId} onChange={handleChange} className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white appearance-none">
                <option value="">Elegí el convenio</option>
                {conveniosDisponibles.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.externalId} — {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

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
          </div>
        </div>

        {/*
          POR QUÉ VÍA SE CONTRATA: alta temprana ante ARCA, o locación de servicios.

          Lo sabe quien pide el alta —conoce a la persona y cómo va a trabajar— y hasta ahora no
          había dónde decirlo: la solicitud llegaba sin trámite y del otro lado había que adivinarlo
          o preguntar por mensaje. Es el mismo dato que después define el TXT de ARCA, así que se
          pide donde está quien lo sabe.

          SIN EL COLOR DEL BADGE, a propósito. Estos dos estados se dibujan rojo y naranja en el
          escritorio, y acá —al lado de los días, del horario y del importe— dos manchas de color
          fuerte se leen como una advertencia y no como una opción. Quien usa esta pantalla es un
          coordinador cargando un alta, no alguien revisando el estado de un contrato.

          Van con el MISMO botón que «Días que trabaja»: azul lo elegido, apagado lo demás. Es el
          patrón que esta pantalla ya usa dos veces más arriba, y elegir es la misma acción.

          El texto sí sale del ABM (`estadoLabel`), así que si alguien renombra el estado, acá se
          renombra solo.
        */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faFileInvoiceDollar} className="text-blue-500 text-[10px]" />
            Tipo de alta <span className="text-red-500">*</span>
          </label>
          {impositivos.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">No hay estados impositivos configurados. Avisale a administración: sin esto la solicitud no dice por qué vía se contrata.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {impositivos.map((e) => {
                const tipo = e.data?.tipoImpositivo;
                const elegido = !!tipo && formData.tipoImpositivo === tipo;
                return (
                  <button
                    key={e._id}
                    type="button"
                    aria-pressed={elegido}
                    onClick={() => setFormData((p) => ({ ...p, tipoImpositivo: tipo || "" }))}
                    className={`px-4 h-9 rounded-lg text-xs font-bold border transition-colors ${elegido ? "bg-blue-600 text-white border-blue-600" : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:border-blue-400"}`}
                  >
                    {estadoLabel(e.name)}
                  </button>
                );
              })}
            </div>
          )}
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
          subtitle={formData.fullName ? formData.fullName : "Buscá por nombre, apellido o email"}
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
                  onChange={(e) => {
                    /* Tipear también sirve para dar de alta a alguien que TODAVÍA NO ES USUARIO: el
                       nombre queda como texto libre y la ficha se crea nueva. Por eso escribir
                       limpia la persona elegida, en vez de dejar las dos cosas a la vez. */
                    const val = e.target.value;
                    setUserSearchTerm(val);
                    setFormData((prev) => ({ ...prev, fullName: val }));
                    setSelectedUser(null);
                  }}
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

            <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {personasFiltradas.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-400 italic">Sin coincidencias. Podés dejar el nombre escrito: se va a crear una ficha nueva.</div>
              ) : (
                personasFiltradas.slice(0, 50).map((u) => {
                  const nombre = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
                  const elegida = selectedUser && String(selectedUser._id) === String(u._id);
                  return (
                    <button key={u._id} type="button" onClick={() => elegirPersona(u)} className={`w-full text-left px-4 py-3 transition-colors flex flex-col ${elegida ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-blue-50 dark:hover:bg-blue-900/20"}`}>
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{nombre}</span>
                      <span className="text-xs text-slate-500">{u.email}</span>
                    </button>
                  );
                })
              )}
            </div>
            {personasFiltradas.length > 50 && <p className="text-[11px] text-slate-400">Se muestran las primeras 50 de {personasFiltradas.length}. Afiná la búsqueda o filtrá por rol.</p>}
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
                      <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{rf.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </Modal>

        {/* Motivo del reemplazo: es «Configurar Ausencia» de Novedades con otro título, porque acá lo
            que se declara es por qué falta el que se reemplaza. Misma lista, mismo control. */}
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
              {roleFrames.map((rf) => {
                const isSelected = selectedRoleFilters.includes(rf.name);
                return (
                  <div key={rf._id} className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800/50 last:border-0 group">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-500 transition-colors">{rf.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (isSelected) setSelectedRoleFilters((prev) => prev.filter((r) => r !== rf.name));
                        else setSelectedRoleFilters((prev) => [...prev, rf.name]);
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none ${isSelected ? "bg-blue-500 shadow-inner" : "bg-slate-200 dark:bg-slate-700"}`}
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
