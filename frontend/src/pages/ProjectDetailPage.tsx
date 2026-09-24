import React, { useEffect, useMemo, useState } from "react";
import { idOpcional, nombreCentroCosto } from '../utils/centroCosto';
import { SelectorCentroCosto } from '../components/proyectos/SelectorCentroCosto';
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { projectsAPI, Project, Client } from "../api/projects";
import { companiesAPI, Company } from "../api/companies";
import { ChipValoracion, useValoraciones, useValoracionDelProyecto } from "../components/proyectos/ChipValoracion";
import { CampoValoracion, cambiosDeValoracion, valorInicialValoracion } from "../components/proyectos/CampoValoracion";
import { shiftsAPI, Shift } from "../api/shifts";

import { useAuthStore } from "../stores/authStore";
import { sweetAlert } from "../utils/sweetAlert";

import { PageLayout } from "../components/ui/PageLayout";
import { Card } from "../components/ui/Card";
import { ValoracionProyecto } from "../components/proyectos/ValoracionProyecto";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { InfoModal } from "../components/ui/InfoModal";
import { ConveniosDelProyecto } from '../components/proyectos/ConveniosDelProyecto';
import { CompanyMultiSelect } from "../components/CompanyMultiSelect";
import { SeleccionMultiple } from "../components/ui/SeleccionMultiple";
import { sedesDelForm, nombresDeSedes } from "../utils/sedesProyecto";
import { EmptyState } from "../components/ui/EmptyState";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faUsers, faBriefcase, faFileLines, faUmbrellaBeach, faPlus, faLayerGroup, faTrash, faTable, faUserTie, faCalendarAlt, faBuilding, faInfoCircle, faBell } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { areasAPI, Area } from "../api/areas";

const HELP_KEY = "clientProjects" as const;

/* -------------------------------- Types / Helpers -------------------------------- */

// helper para resolver el clientId aunque venga populado
const getClientIdFromProject = (p: any): string | undefined => {
  if (typeof p?.clientId === "string") return p.clientId;
  if (typeof p?.clientId === "object" && p?.clientId?._id) return p.clientId._id;
  if (typeof p?.client === "string") return p.client;
  if (typeof p?.client === "object" && p?.client?._id) return p.client._id;
  return undefined;
};

type ModalMode = "editProject" | "assignUser" | "manageTeam" | "viewProjectInfo" | null;

/* -------------------------------- Component -------------------------------- */

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuthStore();

  // data
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableShifts, setAvailableShifts] = useState<Shift[]>([]);
  const [availableAreas, setAvailableAreas] = useState<Area[]>([]);
  const [availableSedes, setAvailableSedes] = useState<any[]>([]);
  const [availableCoordinators, setAvailableCoordinators] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  
  // modales de áreas
  const [isAddingArea, setIsAddingArea] = useState(false);
  const [configuringAreaId, setConfiguringAreaId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState("");

  const [openInfo, setOpenInfo] = useState(false);
  const [showResponsableInfo, setShowResponsableInfo] = useState(false);
  const [showEmpresaInfo, setShowEmpresaInfo] = useState(false);
  const [showAreasInfo, setShowAreasInfo] = useState(false);

  const helpEntry = getHelp(HELP_KEY);

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    status: "active" as Project["status"],
    startDate: "",
    endDate: "",
    contratoEmpresas: [] as string[],
    convenioIds: [] as string[],
    releaseEmpresas: [] as string[],
    objectives: [""],
    targetAudience: "",
    /* Como texto y no como number: el input filtra al escribir y el vacío tiene que poder viajar
       como `null` («le saqué el presupuesto»), que `Number("")` convertiría en 0. */
    presupuesto: "",
    /* El margen, en porcentaje. Es lo que DECIDE la valoración; el presupuesto es contexto. */
    margen: "",
    turnos: [] as string[],
    areasConfig: [] as { areaId: string; shiftIds: string[] }[],
    vacationConfig: {
      useGlobalConfig: true,
      permiteFraccionadas: true,
      minDiasFraccion: 7,
      diasCorridos: false,
    },
    metadata: {
      centroCostoId: undefined as number | undefined,
      centroCostoEmpresaTangoId: undefined as number | undefined,
      sedeId: undefined as number | undefined,
      sedeIds: [] as number[],
      responsableId: undefined as number | undefined,
      clienteId: undefined as number | undefined,
    },
  });

  /* ------------------------------ Fetchers ------------------------------- */

  const fetchClientById = async (id: string) => {
    try {
      const data = await projectsAPI.getClient(id);
      setClient(data);
    } catch (error) {
      console.error("Error fetching client:", error);
      setClient(null);
    }
  };

  const fetchProject = async () => {
    try {
      const data = await projectsAPI.getProject(projectId!, { team: "ids" });
      setProject(data);
      setProjectForm({
        name: data.name,
        description: data.description || "",
        status: data.status || "active",
        startDate: data.startDate ? data.startDate.split("T")[0] : "",
        endDate: data.endDate ? data.endDate.split("T")[0] : "",
        contratoEmpresas: data.contratoEmpresas || [],
        convenioIds: data.convenioIds || [],
        releaseEmpresas: data.releaseEmpresas || [],
        objectives: data.objectives?.length ? data.objectives : [""],
        targetAudience: data.targetAudience || "",
        presupuesto: data.presupuesto == null ? "" : String(data.presupuesto),
        margen: data.margen == null ? "" : String(data.margen),
        turnos: (data.turnos || []).map((t: any) => (typeof t === "string" ? t : (t as any)._id)),
        areasConfig: (data.areasConfig || []).map((ac: any) => ({
          areaId: typeof ac.areaId === "string" ? ac.areaId : ac.areaId._id,
          shiftIds: ac.shiftIds.map((s: any) => (typeof s === "string" ? s : s._id)),
        })),
        vacationConfig: {
          useGlobalConfig: data.vacationConfig?.useGlobalConfig ?? true,
          permiteFraccionadas: data.vacationConfig?.permiteFraccionadas ?? true,
          minDiasFraccion: data.vacationConfig?.minDiasFraccion ?? 7,
          diasCorridos: data.vacationConfig?.diasCorridos ?? false,
        },
        metadata: {
          centroCostoId: data.metadata?.centroCostoId,
          centroCostoEmpresaTangoId: (data.metadata as any)?.centroCostoEmpresaTangoId,
          sedeId: data.metadata?.sedeId,
          sedeIds: sedesDelForm(data.metadata),
          responsableId: data.metadata?.responsableId,
          clienteId: data.metadata?.clienteId,
        },
      });

      // si viene populado, evitamos otra request
      if (data && typeof (data as any).client === "object") {
        setClient((data as any).client);
      } else if (data && typeof (data as any).clientId === "object") {
        setClient((data as any).clientId);
      }

      // resolvemos el id string para llamadas adicionales
      const clientIdStr = getClientIdFromProject(data);
      if (clientIdStr) {
        if (!client) await fetchClientById(clientIdStr);
      }
    } catch (error) {
      console.error("Error fetching project:", error);
    }
  };

  /* ------------------------------- Effects ------------------------------- */

  const fetchAuxData = async () => {
    try {
      const { token, tenantId } = useAuthStore.getState();
      const headers = { Authorization: `Bearer ${token}`, "X-Tenant-Id": tenantId };

      const [sedesRes, responsablesRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/info?type=sede`, { headers }),
        fetch(`${import.meta.env.VITE_API_URL}/users/eligible-responsables`, { headers }),
      ]);

      if (sedesRes.ok) setAvailableSedes(await sedesRes.json());
      /*
        EL CATÁLOGO DE CENTROS DE COSTO YA NO SE BAJA: eran 2.208 registros y más de un megabyte para
        mostrar un código. El nombre lo resuelve el server (`metadataResolutions.centroCosto`) y el
        selector busca contra el server (ver `SelectorCentroCosto`).
      */
      if (responsablesRes.ok) {
        setAvailableCoordinators(await responsablesRes.json());
      }

      // Also fetch shifts and areas
      const [shifts, areas] = await Promise.all([
        shiftsAPI.getAll(),
        areasAPI.listAll()
      ]);
      setAvailableShifts(shifts);
      setAvailableAreas(areas);

      companiesAPI.list().then(setCompanies).catch(console.error);
    } catch (err) {
      console.error("Error fetching aux data:", err);
    }
  };


  useEffect(() => {
    if (!projectId || !token) return;
    (async () => {
      try {
        await Promise.all([
          fetchProject(),
          fetchAuxData()
        ]);

      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, token]);

  /* ------------------------------- Actions -------------------------------- */

  // La valoración va aparte de `projectForm`: es un modo (automática / fijada) y lo que se manda al
  // guardar depende de cómo estaba (ver `cambiosDeValoracion`).
  const [valoracionElegida, setValoracionElegida] = useState("");

  const openEditProject = () => {
    if (!project) return;
    setValoracionElegida(valorInicialValoracion(project));
    setModalMode("editProject");
    setIsAddingArea(false);
    setConfiguringAreaId(null);
    setSelectedAreaId("");
    setShowModal(true);


  };

  useEffect(() => {
    if (!loading && project && location.state?.openEdit) {
      openEditProject();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [loading, project, location.state, navigate, location.pathname]);

  /*
    Las valoraciones del tenant, sólo para PINTAR el chip: nombre y color.

    La resolución la hizo el server —el proyecto ya viene con su `valoracionId`— y acá no se vuelve
    a calcular nada. Es a propósito: una segunda implementación de la regla en el front terminaría
    diciendo algo distinto de lo que el server guardó. Ver `server/src/utils/valoracionAutomatica.ts`.
  */
  const valoraciones = useValoraciones();
  const valoracionDelProyecto = useValoracionDelProyecto(project, valoraciones);

  /** Devuelve el proyecto al cálculo por margen. El server recalcula en el acto. */
  const volverAlCalculoAutomatico = async () => {
    if (!project) return;
    try {
      await projectsAPI.updateProject(project._id, { valoracionManual: false } as any);
      await fetchProject();
      sweetAlert.success("Listo", "La valoración vuelve a calcularse según el margen.");
    } catch (error) {
      console.error("Error volviendo al cálculo automático:", error);
      sweetAlert.error("Error", "No se pudo volver al cálculo automático.");
    }
  };

  const openManageTeam = () => {
    if (project) {
      navigate(`/projects/${project._id}/team`);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setModalMode(null);
  };

  /* ------------------------------- Submitters ----------------------------- */

  const submitEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    if (!projectForm.metadata?.responsableId) {
      sweetAlert.error("Datos incompletos", "El coordinador del proyecto es obligatorio");
      return;
    }
    if (sedesDelForm(projectForm.metadata).length === 0) {
      sweetAlert.error("Datos incompletos", "Elegí al menos una sede");
      return;
    }

    try {
      const payload = {
        ...projectForm,
        objectives: projectForm.objectives.filter((o) => o.trim()),
        areasConfig: projectForm.areasConfig,
        // Vacío = `null` (sin presupuesto), que NO es 0. El server recalcula la valoración con esto.
        presupuesto: projectForm.presupuesto.trim() === "" ? null : Number(projectForm.presupuesto),
        // Ídem: vacío = `null` («sin margen»), que no es 0 — 0 es trabajar sin ganancia.
        margen: projectForm.margen.trim() === "" ? null : Number(projectForm.margen),
        ...cambiosDeValoracion(valoracionElegida, project),
      };

      await projectsAPI.updateProject(project._id, payload);
      sweetAlert.success("Proyecto actualizado", "Los cambios se han guardado correctamente");
      closeModal();
      await fetchProject();
    } catch (error) {
      console.error("Error updating project:", error);
      sweetAlert.error("Error", "No se pudo actualizar el proyecto");
    }
  };

  // Mapa id -> razón social de empresas. Debe declararse ANTES de cualquier early return
  // para no romper el orden de hooks.
  const companyNameById = useMemo(() => {
    const m = new Map<string, string>();
    companies.forEach((c) => m.set(String(c._id), c.razonSocial));
    return m;
  }, [companies]);

  /* --------------------------------- UI ---------------------------------- */

  if (!projectId) {
    return (
      <EmptyState
        icon={faBriefcase}
        title="Proyecto no válido"
        description="Parece que el enlace no es correcto."
        action={{
          label: "Volver a Proyectos",
          onClick: () => navigate("/clients"),
        }}
      />
    );
  }

  if (loading) return <LoadingSpinner message="Cargando proyecto..." />;

  if (!project) {
    return (
      <EmptyState
        icon={faBriefcase}
        title="Proyecto no encontrado"
        description="No pudimos encontrar el proyecto solicitado."
        action={{
          label: "Volver a Proyectos",
          onClick: () => navigate("/clients"),
        }}
      />
    );
  }

  const getModalTitle = () => {
    switch (modalMode) {
      case "editProject":
        return "Editar Proyecto";
      case "viewProjectInfo":
        return (
          <div className="flex items-center">
            <span>Detalles del Proyecto | {project.name}</span>
            {project.status === "active" && <span className="ml-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-200 dark:border-green-800">Activo</span>}
          </div>
        );
      default:
        return "Información";
    }
  };

  const getModalSubtitle = () => {
    switch (modalMode) {
      case "editProject":
        return "Actualiza los datos del proyecto";
      case "viewProjectInfo":
        return "Información completa y opciones";
      default:
        return "";
    }
  };

  const handleModalPrimary = () => {
    if (modalMode === "editProject") {
      const form = document.querySelector<HTMLFormElement>("#pd-modal-form");
      form?.requestSubmit();
    } else {
      closeModal();
    }
  };

  const assignedUsers = (project as any).assignedUsers || [];
  const assignedCount = assignedUsers.length;
  const assignedSubtitle = assignedCount === 1 ? "1 persona asignada" : `${assignedCount} personas asignadas`;

  // Empresas guardadas del proyecto (contrato / release). getProject devuelve solo los
  // ObjectIds; los resolvemos a razón social contra la lista de empresas ya cargada.
  const resolveEmpresaNames = (ids?: string[]) =>
    (ids || []).map((id) => companyNameById.get(String(id))).filter((n): n is string => Boolean(n));

  const contratoEmpresaNames = resolveEmpresaNames(project.contratoEmpresas);
  const releaseEmpresaNames = resolveEmpresaNames(project.releaseEmpresas);

  const getModalActions = () => {
    if (modalMode === "editProject") {
      return [
        { label: "Actualizar", onClick: handleModalPrimary, variant: "primary" as const },
        { label: "Cancelar", onClick: closeModal, variant: "ghost" as const },
      ];
    }
    if (modalMode === "viewProjectInfo") {
      return [
        { label: "Editar", onClick: () => setModalMode("editProject"), variant: "primary" as const },
        { label: "Gestionar Equipo", onClick: openManageTeam, variant: "secondary" as const },
        { label: "Cerrar", onClick: closeModal, variant: "ghost" as const },
      ];
    }
    return [{ label: "Listo", onClick: closeModal, variant: "primary" as const }];
  };

  const sedeName = nombresDeSedes(project).join(", ") || null;

  return (
    // Sólo el nombre en el título: se llega desde Proyectos y el ícono ya dice qué es.
    <PageLayout
      title={project.name}
      // Al lado del nombre: es lo que decide qué categorías se ofrecen al contratar en este proyecto.
      titleBadge={valoracionDelProyecto ? <ChipValoracion nombre={valoracionDelProyecto.nombre} color={valoracionDelProyecto.color} manual={project.valoracionManual} className="text-sm px-2.5" /> : undefined}
      badge={sedeName ? { text: sedeName, variant: "default" } : undefined}
      faIcon={{ icon: faBriefcase }}
      clientMiniAvatar={{
        src: undefined,
        alt: client?.name ? `${client.name} logo` : undefined,
        fallback: client?.name?.charAt(0)?.toUpperCase?.() || "?",
        label: client?.name,
      }}
      subtitle={project.description || "Detalle del proyecto"}
      onBack={() => navigate(-1)}
      showInfoIcon
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      headerActions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setModalMode("viewProjectInfo");
              setShowModal(true);
            }}
            className="btn-primary flex items-center justify-center text-sm p-2 gap-2"
            title="Ver información del proyecto"
          >
            <FontAwesomeIcon icon={faFileLines} className="h-3 w-3 lg:h-4 lg:w-4" />
          </button>
          <button onClick={openEditProject} className="btn-primary flex items-center justify-center text-sm p-2 gap-2" title="Editar proyecto">
            <FontAwesomeIcon icon={faEdit} className="h-3 w-3 lg:h-4 lg:w-4" />
          </button>
        </div>
      }
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: getModalTitle(),
        subtitle: getModalSubtitle(),
        size: "lg",
        actions: getModalActions(),
        content: (
          <div className="space-y-6">
            {modalMode === "editProject" && (
              <form id="pd-modal-form" onSubmit={submitEditProject} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                  <input type="text" required value={projectForm.name} onChange={(e) => setProjectForm((p) => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Nombre del proyecto" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                  <textarea value={projectForm.description} onChange={(e) => setProjectForm((p) => ({ ...p, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Descripción del proyecto..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Presupuesto</label>
                  {/* Se filtra al ESCRIBIR, como el resto de los numéricos del repo: `type="number"`
                      deja pegar «12a» y muestra el campo vacío sin decir por qué. */}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={projectForm.presupuesto}
                    onChange={(e) => setProjectForm((p) => ({ ...p, presupuesto: e.target.value.replace(/\D/g, "") }))}
                    className="input-field"
                    placeholder="Sin presupuesto cargado"
                  />
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Contexto del proyecto. La valoración NO sale de acá, sino del margen.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Margen (%)</label>
                  {/* Admite coma y la normaliza a punto: «12,5» es como se escribe un decimal acá. */}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={projectForm.margen}
                    onChange={(e) => {
                      const crudo = e.target.value.replace(",", ".").replace(/(?!^-)[^0-9.]/g, "");
                      const partes = crudo.split(".");
                      setProjectForm((p) => ({ ...p, margen: partes.length > 2 ? `${partes[0]}.${partes.slice(1).join("")}` : crudo }));
                    }}
                    className="input-field"
                    placeholder="Sin margen cargado"
                  />
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    De acá sale la valoración del proyecto, y con ella qué categorías se ofrecen al armar un contrato. Se recalcula al guardar. Por ahora se carga a mano; más adelante lo va a
                    traer el presupuestador.
                  </p>
                </div>
                <CampoValoracion valoraciones={valoraciones} valor={valoracionElegida} onChange={setValoracionElegida} proyecto={project} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800/50">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Centro de costo *</label>
                    {/* Código + descripción, y con buscador: son 806 y el número solo no dice qué es. */}
                    <SelectorCentroCosto required valor={projectForm.metadata?.centroCostoId} empresaTangoId={projectForm.metadata?.centroCostoEmpresaTangoId} onCambio={(id, empresa) => setProjectForm(p => ({ ...p, metadata: { ...p.metadata, centroCostoId: id, centroCostoEmpresaTangoId: empresa } }))} />
                  </div>

                  <div>
                    {/* Varias sedes, como los roles empresa: la primera es la principal (precarga el alta de contratos). */}
                <SeleccionMultiple
                  label={<span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Sede *</span>}
                  titulo="Sedes"
                  descripcion="la primera es la principal"
                  principal="Principal"
                  placeholder="Elegí una o más sedes…"
                  placeholderBusqueda="Buscar sede..."
                  vacio="No hay sedes cargadas."
                  opciones={availableSedes.filter((s) => s.data?.id != null).map((s) => ({ id: String(s.data.id), nombre: s.name || s.data?.nombre || `Sede ${s.data.id}` }))}
                  valor={sedesDelForm(projectForm.metadata).map(String)}
                  onChange={(ids) => setProjectForm((p) => ({ ...p, metadata: { ...p.metadata, sedeIds: ids.map(Number), sedeId: ids.length ? Number(ids[0]) : undefined } }))}
                />
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    Coordinador del Proyecto
                    <button 
                      type="button"
                      onClick={() => setShowResponsableInfo(true)}
                      className="text-blue-500 hover:text-blue-600 transition-colors"
                    >
                      <FontAwesomeIcon icon={faInfoCircle} />
                    </button>
                  </label>
                  <select
                    className="input-field py-2.5"
                    required
                    value={projectForm.metadata?.responsableId || ""}
                    onChange={(e) => setProjectForm(p => ({ ...p, metadata: { ...p.metadata, responsableId: idOpcional(e.target.value) } }))}
                  >
                    <option value="">Seleccionar del sistema...</option>
                    {availableCoordinators.map(c => (
                      <option key={c._id} value={c.metadata?.id}>{c.firstName} {c.lastName}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800/50">
                  <div>
                    <CompanyMultiSelect
                  label={
                    <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      Empresa del Contrato
                      <button type="button" onClick={() => setShowEmpresaInfo(true)} className="text-blue-500 hover:text-blue-600 transition-colors">
                        <FontAwesomeIcon icon={faInfoCircle} />
                      </button>
                    </span>
                  }
                  titulo="Empresa del Contrato"
                  companies={companies}
                      value={projectForm.contratoEmpresas}
                      onChange={(ids) => setProjectForm((p) => ({ ...p, contratoEmpresas: ids }))}
                />
                  </div>

                  <div>
                    <CompanyMultiSelect
                  label={
                    <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      Empresa del Release
                      <button type="button" onClick={() => setShowEmpresaInfo(true)} className="text-blue-500 hover:text-blue-600 transition-colors">
                        <FontAwesomeIcon icon={faInfoCircle} />
                      </button>
                    </span>
                  }
                  titulo="Empresa del Release"
                  companies={companies}
                      value={projectForm.releaseEmpresas}
                      onChange={(ids) => setProjectForm((p) => ({ ...p, releaseEmpresas: ids }))}
                />
                  </div>

                  {/* Los convenios del proyecto cuelgan de la Empresa del Contrato: ver el componente. */}
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">Convenios del proyecto</label>
                    <ConveniosDelProyecto companies={companies as any} empresasContrato={projectForm.contratoEmpresas} value={projectForm.convenioIds} onChange={(ids) => setProjectForm((p) => ({ ...p, convenioIds: ids }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Inicio</label>
                    <input type="date" className="input-field" value={projectForm.startDate} onChange={(e) => setProjectForm((p) => ({ ...p, startDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Fin</label>
                    <input type="date" className="input-field" value={projectForm.endDate} onChange={(e) => setProjectForm((p) => ({ ...p, endDate: e.target.value }))} />
                  </div>
                </div>

                {/* Áreas y Turnos */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Configuración por Área</label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddingArea(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 border border-blue-100 dark:border-blue-800 transition-all shadow-sm"
                    >
                      <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                      Agregar Área
                    </button>
                  </div>

                  <div className="space-y-2">
                    {projectForm.areasConfig.length === 0 ? (
                      <div className="text-center py-10 bg-gray-50/30 dark:bg-gray-900/10 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl">
                        <FontAwesomeIcon icon={faLayerGroup} className="h-8 w-8 text-gray-200 dark:text-gray-700 mb-3" />
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sin Áreas Integradas</p>
                      </div>
                    ) : (
                      projectForm.areasConfig.map((ac) => {
                        const area = availableAreas.find(a => a._id === ac.areaId);
                        if (!area) return null;

                        return (
                          <div key={ac.areaId} className="flex items-center justify-between p-3 rounded-xl bg-gray-50/50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-all group">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-400 group-hover:text-blue-500 transition-colors">
                                <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                                  {area.name}
                                  {area.isSystem && (
                                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/50 uppercase tracking-wider">
                                      Sistema
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${ac.shiftIds.length > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"}`}>
                                    {ac.shiftIds.length} {ac.shiftIds.length === 1 ? 'Turno' : 'Turnos'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setConfiguringAreaId(ac.areaId)}
                                className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
                                title="Configurar Turnos"
                              >
                                <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                              </button>
                              {!area.isSystem && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProjectForm(prev => ({
                                      ...prev,
                                      areasConfig: prev.areasConfig.filter(item => item.areaId !== ac.areaId)
                                    }));
                                  }}
                                  className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all"
                                  title="Quitar"
                                >
                                  <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                                </button>
                              )}
                            </div>

                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Reglas de Vacaciones */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    <FontAwesomeIcon icon={faUmbrellaBeach} className="text-orange-500" />
                    Reglas de Vacaciones
                  </label>

                  <div className="space-y-4 bg-orange-50/30 dark:bg-orange-950/10 p-4 rounded-xl border border-orange-100 dark:border-orange-900/30">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Usar Configuración Global</span>
                        <span className="text-xs text-gray-500">Si se desactiva, se aplicarán las reglas específicas de este proyecto.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setProjectForm((p) => ({
                            ...p,
                            vacationConfig: { ...p.vacationConfig, useGlobalConfig: !p.vacationConfig.useGlobalConfig },
                          }))
                        }
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${projectForm.vacationConfig.useGlobalConfig ? "bg-orange-500" : "bg-gray-200 dark:bg-gray-700"}`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${projectForm.vacationConfig.useGlobalConfig ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                    </div>

                    {!projectForm.vacationConfig.useGlobalConfig && (
                      <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-orange-100 dark:border-orange-900/50">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Permitir Fraccionamiento</span>
                            <span className="text-xs text-gray-500">Permite solicitar periodos menores al total anual.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setProjectForm((p) => ({
                                ...p,
                                vacationConfig: { ...p.vacationConfig, permiteFraccionadas: !p.vacationConfig.permiteFraccionadas },
                              }))
                            }
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${projectForm.vacationConfig.permiteFraccionadas ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"}`}
                          >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${projectForm.vacationConfig.permiteFraccionadas ? "translate-x-5" : "translate-x-0"}`} />
                          </button>
                        </div>

                        {projectForm.vacationConfig.permiteFraccionadas && (
                          <div className="flex flex-col gap-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-orange-100 dark:border-orange-900/50">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Días Mínimos por Periodo</label>
                            <input
                              type="number"
                              min="1"
                              className="input-field"
                              value={projectForm.vacationConfig.minDiasFraccion}
                              onChange={(e) =>
                                setProjectForm((p) => ({
                                  ...p,
                                  vacationConfig: { ...p.vacationConfig, minDiasFraccion: parseInt(e.target.value) || 1 },
                                }))
                              }
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-orange-100 dark:border-orange-900/50">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Cálculo por Días Corridos</span>
                            <span className="text-xs text-gray-500">Si se activa, incluye sábados y domingos en la cuenta.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setProjectForm((p) => ({
                                ...p,
                                vacationConfig: { ...p.vacationConfig, diasCorridos: !p.vacationConfig.diasCorridos },
                              }))
                            }
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${projectForm.vacationConfig.diasCorridos ? "bg-purple-500" : "bg-gray-200 dark:bg-gray-700"}`}
                          >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${projectForm.vacationConfig.diasCorridos ? "translate-x-5" : "translate-x-0"}`} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* Estado - al final */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
                    <button
                      type="button"
                      onClick={() =>
                        setProjectForm((p) => ({
                          ...p,
                          status: p.status === "active" ? "on_hold" : "active",
                        }))
                      }
                      className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${projectForm.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400"}`}
                    >
                      <FontAwesomeIcon icon={projectForm.status === "active" ? faBriefcase : faBriefcase} className="mr-2 h-4 w-4" />
                      {projectForm.status === "active" ? "Activo" : "En Espera"}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {modalMode === "viewProjectInfo" && (
              <div className="space-y-4">
                {/* Descripción */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-4">
                  <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Descripción</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{project.description || "Sin descripción proporcionada."}</p>
                </div>

                {/*
                  PRESUPUESTO Y VALORACIÓN, JUNTOS.

                  Separados no se entienden: el nivel no es una etiqueta suelta sino la consecuencia
                  del monto, y de él sale qué categorías se van a ofrecer al contratar. La leyenda
                  dice CÓMO se llegó a ese nivel, que es la pregunta que aparece cuando no es el
                  esperado.
                */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-4">
                  <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Margen y valoración</h4>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                      {project.presupuesto == null ? <span className="text-gray-400 dark:text-gray-600">Sin presupuesto</span> : `$${Number(project.presupuesto).toLocaleString("es-AR")}`}
                    </span>
                    {/* El margen es lo que manda: va primero en la lectura visual, con el signo. */}
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                      {project.margen == null ? <span className="font-normal text-gray-400 dark:text-gray-600">sin margen</span> : `${project.margen}% de margen`}
                    </span>
                    {valoracionDelProyecto ? (
                      <ChipValoracion nombre={valoracionDelProyecto.nombre} color={valoracionDelProyecto.color} manual={project.valoracionManual} />
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-600">Sin valorar</span>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                    {project.valoracionManual ? "Fijada manualmente: el recálculo por margen no la toca." : "Calculada según el margen."}
                  </p>
                  {project.valoracionManual && (
                    <button type="button" onClick={volverAlCalculoAutomatico} className="mt-2 text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 underline underline-offset-2">
                      Volver al cálculo automático
                    </button>
                  )}
                </div>

                {/* Horario de Trabajo - OCULTO
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FontAwesomeIcon icon={faClock} className="text-blue-500 h-4 w-4" />
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Horario de Trabajo</h4>
                  </div>
                  {project.workSchedule ? (
                    <div className="space-y-2 text-sm">
                      {(project.workSchedule.mode === "weekdays" || !project.workSchedule.mode) && (
                        <>
                          <div className="flex justify-between items-center py-1 border-b border-gray-200 dark:border-gray-700">
                            <span className="text-gray-600 dark:text-gray-400">Lunes a Viernes</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {project.workSchedule.weekdays?.startTime || "09:00"} - {project.workSchedule.weekdays?.endTime || "18:00"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1">
                            <span className="text-gray-600 dark:text-gray-400">Sábado y Domingo</span>
                            <span className="text-gray-500">No laboral</span>
                          </div>
                        </>
                      )}
                      {project.workSchedule.mode === "all_week" && (
                        <>
                          <div className="flex justify-between items-center py-1 border-b border-gray-200 dark:border-gray-700">
                            <span className="text-gray-600 dark:text-gray-400">Lunes a Viernes</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {project.workSchedule.weekdays?.startTime || "09:00"} - {project.workSchedule.weekdays?.endTime || "18:00"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-gray-200 dark:border-gray-700">
                            <span className="text-gray-600 dark:text-gray-400">Sábado</span>
                            {project.workSchedule.days?.saturday?.isWorkDay ? (
                              <span className="font-medium text-gray-900 dark:text-white">
                                {project.workSchedule.days.saturday.startTime} - {project.workSchedule.days.saturday.endTime}
                              </span>
                            ) : (
                              <span className="text-gray-500">No laboral</span>
                            )}
                          </div>
                          <div className="flex justify-between items-center py-1">
                            <span className="text-gray-600 dark:text-gray-400">Domingo</span>
                            {project.workSchedule.days?.sunday?.isWorkDay ? (
                              <span className="font-medium text-gray-900 dark:text-white">
                                {project.workSchedule.days.sunday.startTime} - {project.workSchedule.days.sunday.endTime}
                              </span>
                            ) : (
                              <span className="text-gray-500">No laboral</span>
                            )}
                          </div>
                        </>
                      )}
                      {project.workSchedule.mode === "per_day" && (
                        <>
                          {(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const).map((day, idx, arr) => {
                            const dayLabels: Record<string, string> = { monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles", thursday: "Jueves", friday: "Viernes", saturday: "Sábado", sunday: "Domingo" };
                            const dayData = project.workSchedule?.days?.[day];
                            return (
                              <div key={day} className={`flex justify-between items-center py-1 ${idx < arr.length - 1 ? "border-b border-gray-200 dark:border-gray-700" : ""}`}>
                                <span className="text-gray-600 dark:text-gray-400">{dayLabels[day]}</span>
                                {dayData?.isWorkDay ? (
                                  <span className="font-medium text-gray-900 dark:text-white">
                                    {dayData.startTime} - {dayData.endTime}
                                  </span>
                                ) : (
                                  <span className="text-gray-500">No laboral</span>
                                )}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Horario no configurado</p>
                  )}
                </div>
                */}

                {/* Información Principal Integrada (antes Sistema Externo) */}
                {(project.metadata || project.metadataResolutions) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    {/* Cliente */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Cliente</span>
                      {(() => {
                        const val = project.metadataResolutions?.cliente?.name || project.metadata?.nombre;
                        return val ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-bold bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-800/50 w-fit">{val}</span>
                        ) : (
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">—</span>
                        );
                      })()}
                    </div>

                    {/* Responsable */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Coordinador del Proyecto</span>
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{project.metadataResolutions?.responsable ? `${project.metadataResolutions.responsable.firstName} ${project.metadataResolutions.responsable.lastName || ""}` : project.metadata?.responsableId ? `ID: ${project.metadata.responsableId}` : "—"}</span>
                    </div>

                    {/* Sede */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Sede / Ubicación</span>
                      {(() => {
                        const val = nombresDeSedes(project).join(", ") || (project.metadata?.sedeId ? `ID: ${project.metadata.sedeId}` : "");
                        return val ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-800/50 w-fit">{val}</span>
                        ) : (
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">—</span>
                        );
                      })()}
                    </div>

                    {/* Centro de Costo */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Centro de Costo</span>
                      {(() => {
                        // Un solo lugar decide qué se muestra: el código de Tango (ver `nombreCentroCosto`).
                        const val = nombreCentroCosto(project);
                        return val ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-bold bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-800/50 w-fit">{val}</span>
                        ) : (
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">—</span>
                        );
                      })()}
                    </div>

                    {/* Otros datos */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Fecha Alta</span>
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{project.metadata?.fechaAlta ? new Date(project.metadata.fechaAlta).toLocaleDateString() : "—"}</span>
                    </div>

                    {/* Empresas (Contrato / Release) apiladas en la columna izquierda */}
                    <div className="flex flex-col gap-4 md:col-start-1">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Empresa del Contrato</span>
                        {contratoEmpresaNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {contratoEmpresaNames.map((n, i) => (
                              <span key={i} className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 w-fit">
                                {n}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">—</span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Empresa del Release</span>
                        {releaseEmpresaNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {releaseEmpresaNames.map((n, i) => (
                              <span key={i} className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-bold bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-800/50 w-fit">
                                {n}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">—</span>
                        )}
                      </div>
                    </div>

                    {/* Áreas y Turnos */}
                    <div className="flex flex-col gap-1 col-span-1 md:col-span-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                      <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faLayerGroup} className="text-gray-300" />
                        Configuración por Área
                      </span>
                      <div className="space-y-3 mt-3">
                        {(project.areasConfig || []).length > 0 ? (
                          (project.areasConfig || []).map((ac: any, i: number) => (
                            <div key={i} className="p-3 rounded-xl bg-gray-50/50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800">
                              <div className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight mb-2 flex items-center gap-2">
                                {typeof ac.areaId === "object" ? ac.areaId.name : "..."}
                                {((typeof ac.areaId === "object" && ac.areaId.isSystem) || 
                                  (() => {
                                    const a = availableAreas.find(a => a._id === ac.areaId);
                                    return a && a.isSystem;
                                  })()) && (
                                  <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/50 uppercase tracking-wider">
                                    Sistema
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-3">
                                  {ac.shiftIds.map((shift: any, j: number) => {
                                    const DAY_LABELS = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'];
                                    const shiftDays = typeof shift === 'object' && Array.isArray(shift.days) ? shift.days : [];
                                    return (
                                      <div key={j} className="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 flex flex-col min-w-[120px]">
                                        <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">{typeof shift === 'object' ? shift.name : '...'}</span>
                                        <span className="text-[10px] text-blue-600 dark:text-blue-500 font-medium uppercase mt-0.5">{typeof shift === 'object' ? `${shift.startTime} — ${shift.endTime} hs` : ''}</span>
                                        {shiftDays.length > 0 && (
                                          <div className="flex gap-1 mt-1.5">
                                            {DAY_LABELS.map((label, dayIdx) => (
                                              <span key={dayIdx} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${shiftDays.includes(dayIdx) ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200' : 'text-gray-300 dark:text-gray-600'}`}>{label}</span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          ))
                        ) : (
                          <span className="text-sm text-gray-500 italic">No hay áreas configuradas.</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Estadísticas / Fechas (Ahora al final) */}
                <div className="bg-gray-100 dark:bg-gray-800/80 rounded-lg p-5 border border-gray-200 dark:border-gray-700 mt-2">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="border-r border-gray-200 dark:border-gray-600">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{assignedUsers.length}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Personas</div>
                    </div>
                    <div className="border-r border-gray-200 dark:border-gray-600">
                      <div className="text-sm font-bold text-gray-900 dark:text-white pt-2 leading-none">{project.startDate ? new Date(project.startDate.split("T")[0] + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 px-1">Fecha de Inicio</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900 dark:text-white pt-2 leading-none">{project.endDate ? new Date(project.endDate.split("T")[0] + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 px-1">Fecha Fin</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ),
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        {/* Card 1: Información del Proyecto */}
        <Card
          onClick={() => {
            setModalMode("viewProjectInfo");
            setShowModal(true);
          }}
          className="cursor-pointer hover:scale-[1.02] hover:shadow-lg transition-all duration-300"
          header={{
            title: `Información del Proyecto`,
            subtitle: project.description || "Sin descripción",
            avatar: {
              fallback: project.name?.charAt(0)?.toUpperCase() || "P",
              alt: project.name,
            },
            badges: [
              {
                text: project.status === "active" ? "Activo" : project.status === "on_hold" ? "En Espera" : project.status === "completed" ? "Completado" : "Archivado",
                variant: project.status === "active" ? "green" : project.status === "on_hold" ? "warning" : project.status === "completed" ? "info" : "default",
              },
              ...(client?.name
                ? [
                    {
                      text: client.name,
                      variant: "cyan" as const,
                    },
                  ]
                : []),
            ],
            badgesPosition: "top",
          }}
          footer={{
            leftContent: <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Creado: {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : "—"}</span>,
            /*
              El lápiz también acá, en el pie de la card que se está mirando.

              Editar el proyecto ya se podía, pero desde un botón del encabezado de la PÁGINA —arriba
              de todo, al lado del título—, que es otro lugar y otro contexto. Quien está leyendo
              «Responsable», «Período» o «Empresa del contrato» y ve algo para corregir tiene la
              acción a mano, sin volver a subir. Es el mismo gesto que ya usa la card de Equipo del
              Proyecto, y abre exactamente el mismo formulario: no hay dos caminos de edición, hay dos
              puertas al mismo.
            */
            actions: [
              {
                icon: faEdit,
                onClick: openEditProject,
                title: "Editar el proyecto",
              },
            ],
          }}
        >
          <div className="space-y-5 pt-2">
            {/* Responsable y Fechas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faUserTie} className="text-blue-500/50" />
                  Responsable
                </label>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  {project.metadataResolutions?.responsable 
                    ? `${project.metadataResolutions.responsable.firstName} ${project.metadataResolutions.responsable.lastName || ""}` 
                    : "No asignado"}
                </span>
              </div>
              
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faCalendarAlt} className="text-emerald-500/50" />
                  Periodo
                </label>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                    {project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"} al {project.endDate ? new Date(project.endDate).toLocaleDateString() : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Sede y Centro de Costo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-gray-800/50">
              {project.metadataResolutions?.sede && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faBuilding} className="text-amber-500/50" />
                    Sede / Ubicación
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {nombresDeSedes(project).map((nombre) => (
                      <span key={nombre} className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-800/50 w-fit">
                        {nombre}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {project.metadataResolutions?.centroCosto && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faTable} className="text-purple-500/50" />
                    Centro de Costo
                  </label>
                  <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-800/50 w-fit">
                    {nombreCentroCosto(project)}
                  </span>
                </div>
              )}
            </div>

            {/* Áreas (Simplificadas) */}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 dark:border-gray-800/50">
              <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                <FontAwesomeIcon icon={faLayerGroup} className="text-blue-500/50" />
                Áreas Configuradas
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAreasInfo(true);
                  }}
                  className="text-blue-500 hover:text-blue-600 transition-colors"
                  title="Qué pasa si el proyecto no tiene áreas configuradas"
                  aria-label="Información: áreas configuradas"
                >
                  <FontAwesomeIcon icon={faInfoCircle} className="h-3 w-3" />
                </button>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(project.areasConfig || []).length > 0 ? (
                  (project.areasConfig || []).map((ac: any, idx: number) => (
                    <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                      {typeof ac.areaId === "object" ? ac.areaId.name : "..."}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-gray-400 italic">Sin áreas configuradas</span>
                )}
              </div>
            </div>

            {/* Empresas del Contrato / Release */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-gray-800/50">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faBuilding} className="text-indigo-500/50" />
                  Empresa del Contrato
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowEmpresaInfo(true);
                    }}
                    className="text-blue-500 hover:text-blue-600 transition-colors"
                    title="Qué pasa si el proyecto no tiene empresas configuradas"
                    aria-label="Información: empresa del contrato"
                  >
                    <FontAwesomeIcon icon={faInfoCircle} className="h-3 w-3" />
                  </button>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {contratoEmpresaNames.length > 0 ? (
                    contratoEmpresaNames.map((n, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 w-fit">
                        {n}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-gray-400 italic">Sin empresa</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faBuilding} className="text-teal-500/50" />
                  Empresa del Release
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowEmpresaInfo(true);
                    }}
                    className="text-blue-500 hover:text-blue-600 transition-colors"
                    title="Qué pasa si el proyecto no tiene empresas configuradas"
                    aria-label="Información: empresa del release"
                  >
                    <FontAwesomeIcon icon={faInfoCircle} className="h-3 w-3" />
                  </button>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {releaseEmpresaNames.length > 0 ? (
                    releaseEmpresaNames.map((n, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-800/50 w-fit">
                        {n}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-gray-400 italic">Sin empresa</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
        {/* Card 2: Personas Asignadas */}
        <Card
          onClick={openManageTeam}
          header={{
            title: "Equipo del Proyecto",
            subtitle: "Gestiona los usuarios del proyecto",
            icon: faUsers,
          }}
          footer={{
            leftContent: <span className="text-sm text-gray-500 dark:text-gray-400">{assignedSubtitle}</span>,
            actions: [
              {
                icon: faEdit,
                onClick: openManageTeam,
                title: "Gestionar Equipo",
              },
            ],
          }}
        />

        {/* Card: Valoración. Al lado del equipo porque es lo que decide qué categorías se le ofrecen
            a cada persona que se sume, y por lo tanto cuánto cobra. */}
        <ValoracionProyecto project={project} onGuardado={fetchProject} />

        {/* Card 3: Novedades del Proyecto (mismo atajo que el botón Novedades de la card principal) */}
        <Card
          onClick={() => navigate(`/requests?reportsProject=${project._id}`)}
          className="cursor-pointer hover:scale-[1.02] hover:shadow-lg transition-all duration-300"
          header={{
            title: "Novedades del Proyecto",
            subtitle: "Ver el reporte de novedades del proyecto",
            icon: faBell,
          }}
        />

        {/* Card 4: Reportes del Proyecto (sin destino por ahora, igual que el botón Reportes de la card principal) */}
        <Card
          header={{
            title: "Reportes del Proyecto",
            subtitle: "Próximamente",
            icon: faFileLines,
          }}
        />
      </div>
      {/* MODAL OVERLAYS (SUB-MODALS) */}
      {isAddingArea && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">Agregar Nueva Área</h3>
                <p className="text-[10px] text-gray-500 uppercase font-medium">Selecciona el área para integrarla</p>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Áreas Disponibles</label>
                <select
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all cursor-pointer"
                  value={selectedAreaId}
                  autoFocus
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    setProjectForm(prev => ({
                      ...prev,
                      areasConfig: [...prev.areasConfig, { areaId: val, shiftIds: [] }]
                    }));
                    setSelectedAreaId("");
                    setIsAddingArea(false);
                    setConfiguringAreaId(val);
                  }}
                >
                  <option value="">Seleccionar del sistema...</option>
                  {availableAreas
                    .filter(a => !projectForm.areasConfig.some(ac => ac.areaId === a._id))
                    .map(a => (
                      <option key={a._id} value={a._id}>{a.name}</option>
                    ))
                  }
                </select>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingArea(false);
                    setSelectedAreaId("");
                  }}
                  className="px-6 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors uppercase tracking-widest border border-gray-100 dark:border-gray-800 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {configuringAreaId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <FontAwesomeIcon icon={faTable} className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">
                    {availableAreas.find(a => a._id === configuringAreaId)?.name}
                  </h3>
                  <p className="text-[10px] text-gray-500 uppercase font-medium">Habilitar turnos para esta área</p>
                </div>
              </div>
              <button 
                onClick={() => setConfiguringAreaId(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-all flex items-center justify-center"
              >
                <FontAwesomeIcon icon={faPlus} className="h-4 w-4 rotate-45" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto space-y-3">
              {availableShifts.map((shift) => {
                const areaConfigIndex = projectForm.areasConfig.findIndex(ac => ac.areaId === configuringAreaId);
                const isShiftSelected = areaConfigIndex !== -1 && projectForm.areasConfig[areaConfigIndex].shiftIds.includes(shift._id);
                
                return (
                  <div 
                    key={shift._id} 
                    onClick={() => {
                      if (areaConfigIndex === -1) return;
                      const newAreasConfig = [...projectForm.areasConfig];
                      const currentArea = newAreasConfig[areaConfigIndex];
                      if (isShiftSelected) {
                        currentArea.shiftIds = currentArea.shiftIds.filter(id => id !== shift._id);
                      } else {
                        currentArea.shiftIds = [...currentArea.shiftIds, shift._id];
                      }
                      setProjectForm(prev => ({ ...prev, areasConfig: newAreasConfig }));
                    }}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${isShiftSelected ? "bg-emerald-50/50 border-emerald-500/30 dark:bg-emerald-900/10" : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600"}`}
                  >
                    <div>
                      <div className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight">{shift.name}</div>
                      <div className="text-[10px] text-gray-500 font-bold uppercase mt-1 tracking-wider">{shift.startTime} — {shift.endTime} hs</div>
                      {shift.days && shift.days.length > 0 && (
                        <div className="flex gap-0.5 mt-1.5">
                          {['Do','Lu','Ma','Mi','Ju','Vi','Sa'].map((label, dayIdx) => (
                            <span key={dayIdx} className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${
                              shift.days.includes(dayIdx) 
                                ? isShiftSelected
                                  ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200'
                                  : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                : 'text-gray-300 dark:text-gray-600'
                            }`}>{label}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isShiftSelected ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700"}`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xl ring-0 transition duration-200 ease-in-out ${isShiftSelected ? "translate-x-5" : "translate-x-0"}`} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button
                type="button"
                onClick={() => setConfiguringAreaId(null)}
                className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Informativo Responsable */}
      <InfoModal
        isOpen={showResponsableInfo}
        onClose={() => setShowResponsableInfo(false)}
        title="Coordinador del Proyecto"
        subtitle="Información sobre la selección de coordinadores"
        size="sm"
        zIndex={100}
        actions={[
          { label: "Entendido", onClick: () => setShowResponsableInfo(false), variant: "primary" }
        ]}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Para que un usuario aparezca en esta lista, debe cumplir con los siguientes requisitos de sistema:
          </p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Estado Activo:</strong> El usuario debe estar marcado como activo en el módulo de Usuarios.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Coordinador del Proyecto:</strong> hay que tildarlo en su ficha, pestaña Sistema, bloque Proyectos. No depende de sus roles.
              </span>
            </li>
          </ul>
        </div>
      </InfoModal>

      <InfoModal
        isOpen={showEmpresaInfo}
        onClose={() => setShowEmpresaInfo(false)}
        title="Empresa del Contrato y del Release"
        subtitle="Cómo se vinculan con los contratos y releases"
        size="sm"
        zIndex={100}
        actions={[{ label: "Entendido", onClick: () => setShowEmpresaInfo(false), variant: "primary" }]}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Cada Contrato (Configuración → Contratos) y cada Release (Configuración → Releases) está <strong>tagueado con una empresa</strong>.
          </p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Al elegir acá la <strong>Empresa del Contrato</strong> y la <strong>Empresa del Release</strong>, el proyecto queda vinculado a esas empresas.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                En el equipo del proyecto, al cargar los contratos y releases de una persona <strong>solo se mostrarán los que pertenezcan a la empresa seteada</strong>. Los que no tienen empresa no aparecen.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Si el proyecto <strong>no tiene ninguna empresa configurada</strong>, al crear un contrato se ofrecen <strong>todas las empresas existentes</strong> y se elige con cuál generar el documento.
              </span>
            </li>
          </ul>
        </div>
      </InfoModal>

      {/* Info: qué implica no tener áreas configuradas en el proyecto */}
      <InfoModal
        isOpen={showAreasInfo}
        onClose={() => setShowAreasInfo(false)}
        title="Áreas Configuradas"
        subtitle="Qué pasa si el proyecto no tiene ninguna"
        size="sm"
        zIndex={100}
        actions={[
          { label: "Editar proyecto", onClick: () => { setShowAreasInfo(false); openEditProject(); }, variant: "primary" },
          { label: "Entendido", onClick: () => setShowAreasInfo(false), variant: "secondary" },
        ]}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Las áreas del proyecto definen dónde y en qué turno trabaja cada miembro del equipo. Sin ninguna configurada:
          </p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Los usuarios <strong>no pueden cargar su área</strong> y los supervisores <strong>no pueden informar novedades</strong> sobre ellos.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Al configurar un miembro del equipo, la <strong>asignación por área y turno es obligatoria</strong>: sin áreas no se puede guardar ningún cambio del miembro (contrato, sueldo o extras).
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Se resuelve en <strong>Editar Proyecto → Configuración por Área</strong>, agregando al menos un área con sus turnos.
              </span>
            </li>
          </ul>
        </div>
      </InfoModal>
    </PageLayout>
  );
};
