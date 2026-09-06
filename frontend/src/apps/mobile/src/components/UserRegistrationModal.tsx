import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "./Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faBriefcase, faClock, faMoneyBillWave, faExchangeAlt, faArrowRight, faSearch, faFilter, faFileInvoiceDollar } from "@fortawesome/free-solid-svg-icons";
import { usersAPI } from "../../../../api/users";
import { DiasDeTrabajo, faltaDefinirDias } from "../../../../components/contratos/DiasDeTrabajo";
import { roleFrameAPI, RoleFrameItem } from "../../../../api/roleFrames";
import { categoriaSatAPI, CategoriaSatItem } from "../../../../api/categoriasSat";
import { sweetAlert } from "../utils/sweetAlert";
import { CustomDatePicker } from "./CustomDatePicker";
import { projectsAPI, Project } from "../../../../api/projects";
import { useProfile } from "../hooks/useProfile";
import { LoadingSpinner } from "../../../../components/ui/LoadingSpinner";
import { infoAPI, InfoItem } from "../../../../api/info";
import { estadoLabel } from "../../../../components/EstadoSelect";
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
  const [projects, setProjects] = useState<Project[]>([]);
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
  /** Texto del buscador dentro de la ventana de "a quién reemplaza". */
  const [replacedSearchTerm, setReplacedSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    fullName: "",
    projectIds: [] as string[],
    roleFrameId: "",
    categoriaSatId: "",
    startDate: "",
    dueDate: "",
    workdaysCount: "",
    diasPorSemana: "",
    diasSemana: [] as number[],
    diasRotativos: false,
    inTime: "",
    outTime: "",
    dailyRate: "",
    isReplacement: false,
    /** Por qué vía se contrata: alta temprana ante ARCA o locación de servicios. */
    tipoImpositivo: "" as TipoImpositivo | "",
    /** A quién reemplaza: el id numérico que usa el contrato (puede faltar) y el `_id`, que no. */
    empleado_id_reemplezado: "",
    replacedUserId: "",
  });

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
      const loadData = async () => {
        setLoadingData(true);
        try {
          const [frames, cats, projs, usersRes, estados] = await Promise.all([roleFrameAPI.list(), categoriaSatAPI.list(), projectsAPI.listAll(), usersAPI.list({ limit: 1000, metadataActivo: "true" }), infoAPI.listByType("estado-empleado").catch(() => [] as InfoItem[])]);
          setImpositivos(estadosImpositivos(estados));
          setRoleFrames(frames);
          setCategoriasSat(cats);
          setPlatformUsers(usersRes.users || []);

          // Filter projects by profile.projectIds (coordinator projects)
          let activeProjects = projs.filter((p) => p.status === "active");
          if (profile?.projectIds && profile.projectIds.length > 0) {
            activeProjects = activeProjects.filter((p) => profile.projectIds?.includes(p._id));
          }

          setProjects(activeProjects);
        } catch (error) {
          console.error("Error loading form data:", error);
        } finally {
          setLoadingData(false);
        }
      };
      loadData();
    }
  }, [isOpen, profile]);

  useEffect(() => {
    if (isOpen && editingUser) {
      const meta = editingUser.metadata || {};
      const [inTime, outTime] = (meta.schedule || " - ").split(" - ");
      setFormData({
        fullName: meta.fullName || `${editingUser.firstName} ${editingUser.lastName}`,
        projectIds: meta.projectIds || [],
        roleFrameId: meta.rolesFrameIds?.[0] || meta.roleFrameId || "",
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
        outTime: outTime || "",
        dailyRate: meta.dailyRate?.toString() || "",
        isReplacement: meta.isReplacement || false,
        // Las solicitudes anteriores a este campo se abren sin trámite: hay que elegirlo, en vez de
        // dar por hecho uno de los dos.
        tipoImpositivo: esTipoImpositivo(meta.tipoImpositivo) ? meta.tipoImpositivo : "",
        empleado_id_reemplezado: meta.empleado_id_reemplezado != null ? String(meta.empleado_id_reemplezado) : "",
        replacedUserId: meta.replacedUserId ? String(meta.replacedUserId) : "",
      });
    } else if (isOpen && !editingUser) {
      setFormData({
        fullName: "",
        projectIds: [],
        roleFrameId: "",
        categoriaSatId: "",
        startDate: "",
        dueDate: "",
        workdaysCount: "",
        diasPorSemana: "",
        diasSemana: [],
        diasRotativos: false,
        inTime: "",
        outTime: "",
        dailyRate: "",
        isReplacement: false,
        tipoImpositivo: "",
        empleado_id_reemplezado: "",
        replacedUserId: "",
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
    /*
      Cambiar el rol LIMPIA la categoría.

      Las categorías que se ofrecen son las que habilita el rol elegido. Si se cambia el rol, la que
      estaba puesta puede no pertenecer al nuevo: el desplegable la dejaba de listar pero el valor
      seguía cargado, así que la pantalla mostraba «Selecciona categoría» y por debajo se enviaba la
      vieja.
    */
    if (name === "roleFrameId") {
      setFormData((prev) => ({ ...prev, roleFrameId: String(val), categoriaSatId: "" }));
      return;
    }
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
      roleFrameId: roleFrameIds[0] || prev.roleFrameId,
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

  /** Cómo se llama la persona reemplazada, para mostrarla en el campo sin volver a buscarla. */
  const nombreReemplazado = (() => {
    if (!formData.replacedUserId) return "";
    const u = platformUsers.find((p) => String(p._id) === String(formData.replacedUserId));
    return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email : "";
  })();

  const handleSubmit = async () => {
    if (!formData.fullName || !formData.projectIds.length || !formData.roleFrameId || !formData.categoriaSatId) {
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
          roles_frame: [formData.roleFrameId],
          categoriaSatId: formData.categoriaSatId,
          startDate: formData.startDate,
          dueDate: formData.dueDate,
          workdaysCount: Number(formData.workdaysCount),
          diasPorSemana: Number(formData.diasPorSemana) || undefined,
          diasSemana: formData.diasSemana,
          diasRotativos: formData.diasRotativos,
          schedule: `${formData.inTime} - ${formData.outTime}`,
          dailyRate: Number(formData.dailyRate),
          isReplacement: formData.isReplacement,
          // A quién reemplaza. Los dos identificadores: el numérico que usa el contrato (puede
          // faltar en fichas no sincronizadas) y el `_id`, que siempre está.
          empleado_id_reemplezado: formData.isReplacement ? formData.empleado_id_reemplezado || undefined : undefined,
          replacedUserId: formData.isReplacement ? formData.replacedUserId || undefined : undefined,
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
        roleFrameId: "",
        categoriaSatId: "",
        startDate: "",
        dueDate: "",
        workdaysCount: "",
        diasPorSemana: "",
        diasSemana: [],
        diasRotativos: false,
        inTime: "",
        outTime: "",
        dailyRate: "",
        isReplacement: false,
        tipoImpositivo: "",
        empleado_id_reemplezado: "",
        replacedUserId: "",
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
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
              Rol/es Empresa*
            </label>
            {/* El rol sale del que ya tiene la persona: si tiene uno solo se completa y se bloquea
                (no hay nada que elegir), y solo se habilita cuando tiene dos o más. Si el nombre se
                escribió a mano —persona que todavía no es usuario— se ofrecen todos. */}
            <select name="roleFrameId" value={formData.roleFrameId} onChange={handleChange} disabled={rolesDelUsuario.length === 1} title={rolesDelUsuario.length === 1 ? "La persona tiene un solo rol frame asignado" : undefined} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white disabled:opacity-70 disabled:cursor-not-allowed">
              <option value="">Selecciona rol</option>
              {roleFrames
                .filter((rf) => rolesDelUsuario.length === 0 || rolesDelUsuario.includes(rf._id))
                .map((rf) => (
                  <option key={rf._id} value={rf._id}>
                    {rf.name}
                  </option>
                ))}
            </select>
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
              disabled={!formData.roleFrameId}
              title={!formData.roleFrameId ? "Elegí primero el rol empresa" : undefined}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">{formData.roleFrameId ? "Selecciona categoría" : "Elegí primero el rol empresa"}</option>
              {(() => {
                const selectedRF = roleFrames.find((rf) => rf._id === formData.roleFrameId);
                const allowedExternalIds = (selectedRF?.data?.categoriasSat || []).map((c: any) => String(c.id || c));

                return categoriasSat
                  .filter((cat) => {
                    // 1. Must be allowed by the selected Role Frame (if one is selected)
                    const isAllowedByRole = !formData.roleFrameId || allowedExternalIds.includes(cat.externalId) || allowedExternalIds.includes(String(cat.data?.id));

                    // 2. Must be assigned to the user (if a platform user is selected)
                    const isAssignedToUser = !selectedUser?.metadata?.categoriaSatIds?.length || selectedUser.metadata.categoriaSatIds.includes(cat._id);

                    return isAllowedByRole && isAssignedToUser;
                  })
                  .map((cat) => (
                    <option key={cat._id} value={cat._id}>
                      {cat.data?.numeroCategoria ? `(${cat.data.numeroCategoria}) ` : ""}
                      {cat.name}
                    </option>
                  ));
              })()}
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
                  setFormData((prev) => ({ ...prev, isReplacement: v, empleado_id_reemplezado: v ? prev.empleado_id_reemplezado : "", replacedUserId: v ? prev.replacedUserId : "" }));
                  if (!v) setReplacedSearchTerm("");
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none dark:bg-slate-700 rounded-full transition-colors duration-200 ease-in-out peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
              <span className="ml-3 text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{formData.isReplacement ? "SÍ" : "NO"}</span>
            </label>
          </div>

          {/*
            A QUIÉN REEMPLAZA. Mismo buscador que el de arriba, pero sobre el equipo del proyecto.

            Decir que alguien entra por reemplazo sin decir a quién no sirve para nada del otro lado:
            el reemplazo hereda el área y el turno de la persona que reemplaza, y sin ese dato hay
            que ir a preguntarlo.

            Solo la gente del proyecto elegido —reemplazar a alguien que no está en el proyecto no es
            un reemplazo— y sin la persona que se está dando de alta, que no puede reemplazarse a sí
            misma.
          */}
          {formData.isReplacement && (
            <div className="space-y-1 relative">
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
          )}
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
