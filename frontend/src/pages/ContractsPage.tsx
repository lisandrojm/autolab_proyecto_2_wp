import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usersAPI, ContractOverviewRow, Contract } from "../api/users";
import { projectsAPI } from "../api/projects";
import { clientsAPI, Client } from "../api/clients";
import { contratoFrameAPI, ContratoFrameItem } from "../api/contratosFrame";
import { areasAPI, Area } from "../api/areas";
import { shiftsAPI, Shift } from "../api/shifts";
import { infoAPI, InfoItem } from "../api/info";
import { EstadoBadge, EstadoSecundarioBadge, TramiteImpositivoBadge, estadoLabel } from "../components/EstadoSelect";
import { MemberContractsManagerModal } from "../components/team/MemberContractsManagerModal";
import { estadoImpositivoDelContrato } from "../components/team/ContractCard";
import { ContractDocsColumns, ContractDocsHeaders, downloadContractRow, downloadReleaseRow, uploadAltaRow } from "../components/contratos/ContractRowDocs";
import { fmtCuit, cuitDisplay } from "../components/contratos/ConstanciaBulk";
import { releasesAPI, Release } from "../api/release";
import { isContractVigente, formatDate } from "../components/team/EmployeeContractsModal";
import { cachedFetch } from "../utils/refCache";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faBriefcase, faHourglassHalf, faTable, faGrip, faChevronLeft, faChevronRight, faClock, faEdit, faTrash, faUser, faIdCard, faBuilding, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { sweetAlert } from "../utils/sweetAlert";

import { getHelp, hasHelp } from "../data/help/helpContent";
import { ContractBulkAfipTab, ContractBulkFirmaTab } from "../components/contratos/ContractBulkTabs";
import { ContractDropboxTab, fetchDropboxCounts } from "../components/contratos/ContractDropboxTabs";

/** Mismas opciones que usa el filtro "Rol/es" del tab Equipo de Gestionar Equipo. */
const MOBILE_ROLE_OPTIONS = [
  { value: "colaborador", label: "Mobile-Colaborador" },
  { value: "coordinador", label: "Mobile-Coordinador" },
];

const PAGE_SIZE = 25;

/** Explicación puntual de cada pestaña de "Gestión de Contratos": si vive en la base o en una
 *  carpeta de Dropbox, y si interviene Dropbox Sign. Se muestra con el ⓘ propio de cada pestaña
 *  (aparte del info general que explica el conjunto). */
const SUB_TAB_INFO: Record<"alta_afip" | "constancia_cuit" | "sin_cuit" | "firma" | "para_firmar" | "enviado_firma" | "firmados", { title: string; text: string }> = {
  alta_afip: {
    title: "Alta temprana de AFIP",
    text: "Vive en la base de datos de la aplicación, no en Dropbox. Son los contratos registrados que todavía necesitan un Alta Temprana en AFIP/ARCA. No interviene Dropbox Sign.",
  },
  constancia_cuit: {
    title: "Constancia de CUIT",
    text: "Vive en la base de datos, no en Dropbox. Son los contratos a los que hay que verificarles si el CUIT está activo en ARCA. No interviene Dropbox Sign.",
  },
  sin_cuit: {
    title: "Sin CUIT",
    text:
      "Personas extranjeras que TODAVÍA no tienen CUIT/CUIL argentino: su trámite de AFIP/ANSES queda pendiente hasta que cuenten con la documentación migratoria (DNI precario, residencia en trámite, etc.), así que no aparecen en Alta temprana ni en Constancia de CUIT y se agrupan acá. Se carga la documentación de respaldo, se marca la validación y se las envía a Generar Documentos de forma excepcional: se archiva un comprobante en \"AFIP/Sin cuit\", el contrato avanza y desde ahí se le generan el Contrato y el Release.",
  },
  firma: {
    title: "Generar Documentos",
    text: "Vive en la base de datos: lista contratos ya dados de alta en AFIP. Acá se generan los PDF de Contrato y Release, que se guardan en la carpeta Outbox de Dropbox. Todavía no interviene Dropbox Sign en esta pestaña.",
  },
  para_firmar: {
    title: "Para Firmar",
    text: "No sale de la base de datos: muestra el contenido de la carpeta Outbox de Dropbox. Son los PDF ya generados, listos para importar a Dropbox Sign y enviarlos a firmar desde ahí. Todavía no se envió nada.",
  },
  enviado_firma: {
    title: "Enviado a la firma",
    text: "No sale de la base de datos: muestra la carpeta Pendbox de Dropbox. La solicitud ya se envió desde Dropbox Sign y se espera la firma del destinatario (se detecta por el mail de aviso de Dropbox Sign).",
  },
  firmados: {
    title: "Firmados",
    text: "No sale de la base de datos: muestra la carpeta \"Requested signatures\" de Dropbox. Son los contratos que Dropbox Sign ya devolvió firmados, listos para descargar.",
  },
};

/** Clases de un botón de pestaña (mismo estilo que el resto de los tabs de la app). */
const tabBtnClass = (active: boolean): string =>
  `px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
    active
      ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
      : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
  }`;

export const ContractsPage: React.FC = () => {
  const navigate = useNavigate();
  // "Gestión de Contratos" es la pestaña de trabajo (y la primera), así que es la que abre por
  // defecto. Con ?tab=contracts se entra al listado, y desde Gestionar Equipo se sigue llegando con
  // ?tab=management&projectId=... para caer filtrado por ese proyecto.
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "contracts" ? "contracts" : "management";
  const initialProjectId = searchParams.get("projectId") || "";

  const [rows, setRows] = useState<ContractOverviewRow[]>([]);
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [clientOptions, setClientOptions] = useState<{ id: string; name: string }[]>([]);
  const [projectOptions, setProjectOptions] = useState<{ id: string; name: string }[]>([]);
  const [contratoFrames, setContratoFrames] = useState<ContratoFrameItem[]>([]);
  const [allEstados, setAllEstados] = useState<InfoItem[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [openInfo, setOpenInfo] = useState(false);

  // Modal de gestión de TODOS los contratos de una persona (cross-proyecto)
  const [managedUser, setManagedUser] = useState<{ id: string; name: string } | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  useEffect(() => {
    contratoFrameAPI.list().then(setContratoFrames).catch(() => setContratoFrames([]));
    infoAPI.listEstados().then(setAllEstados).catch(() => setAllEstados([]));
    releasesAPI.getAll().then(setReleases).catch(() => setReleases([]));
    cachedFetch("areas:all", () => areasAPI.listAll()).then(setAllAreas).catch(() => setAllAreas([]));
    cachedFetch("shifts:all", () => shiftsAPI.getAll()).then(setAllShifts).catch(() => setAllShifts([]));
  }, []);

  // Filtros — mismo set que el tab Equipo de Gestionar Equipo, más Cliente/Proyecto (acá aplican
  // porque esta página no está atada a un solo proyecto). No incluye Área/Turno: ese filtro se arma
  // sobre la configuración de UN proyecto y no tiene un criterio claro para mezclar áreas de
  // proyectos distintos.
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUserStatus, setFilterUserStatus] = useState("");
  const [filterVigencia, setFilterVigencia] = useState("");
  const [filterRolMobile, setFilterRolMobile] = useState("");
  const [filterTipoContrato, setFilterTipoContrato] = useState("");
  const [filterEstadoContrato, setFilterEstadoContrato] = useState("");
  const [filterReemplazo, setFilterReemplazo] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterProjectId, setFilterProjectId] = useState(initialProjectId);

  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<"table" | "cards">(() => {
    return (localStorage.getItem("contractsViewMode") as "table" | "cards") || "table";
  });

  const HELP_KEY = "contracts";
  const helpEntry = getHelp(HELP_KEY);

  const [isLg, setIsLg] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const handleResize = () => setIsLg(window.innerWidth >= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const effectiveViewMode = isLg ? viewMode : "cards";

  // Pestañas de la página: "Contratos" (la vista actual) y "Gestión de Contratos" (acciones masivas).
  const [mainTab, setMainTab] = useState<"contracts" | "management">(initialTab);
  // Sub-pestañas de "Gestión de Contratos".
  const [mgmtTab, setMgmtTab] = useState<"alta_afip" | "constancia_cuit" | "sin_cuit" | "firma" | "para_firmar" | "enviado_firma" | "firmados">("alta_afip");
  // Cantidades de las pestañas que leen de Dropbox. `null` = todavía no se leyeron.
  const [paraFirmarCount, setParaFirmarCount] = useState<number | null>(null);
  const [pendienteFirmaCount, setPendienteFirmaCount] = useState<number | null>(null);
  const [firmadosCount, setFirmadosCount] = useState<number | null>(null);
  const dropboxCounts = { para_firmar: paraFirmarCount, enviado_firma: pendienteFirmaCount, firmados: firmadosCount };
  // Al entrar a "Gestión de Contratos" se leen las 3 carpetas de Dropbox una sola vez, para que el
  // número aparezca en las 3 pestañas aunque el usuario no las haya abierto todavía (igual que las
  // pestañas de AFIP/CUIT/Firma). Al abrir cada pestaña, ContractDropboxTab vuelve a leer su carpeta
  // y actualiza el número con datos frescos.
  const dropboxCountsFetchedRef = useRef(false);
  useEffect(() => {
    if (mainTab !== "management" || dropboxCountsFetchedRef.current) return;
    dropboxCountsFetchedRef.current = true;
    fetchDropboxCounts()
      .then((c) => {
        setParaFirmarCount(c.para_firmar);
        setPendienteFirmaCount(c.enviado_firma);
        setFirmadosCount(c.firmados);
      })
      .catch(() => {});
  }, [mainTab]);
  // Cantidad de contratos de cada trámite, informada por ContractBulkAfipTab para mostrarla en las pestañas.
  const [mgmtCounts, setMgmtCounts] = useState<{ alta: number; cuit: number; firma: number; sinCuit: number }>({ alta: 0, cuit: 0, firma: 0, sinCuit: 0 });
  // Explicación de qué es cada pestaña de "Gestión de Contratos" (modal informativo general).
  const [mgmtTabsInfoOpen, setMgmtTabsInfoOpen] = useState(false);
  // Explicación puntual de UNA pestaña de "Gestión de Contratos" (si vive en Dropbox, si interviene
  // Dropbox Sign, etc.), aparte del info general de arriba.
  const [subTabInfoOpen, setSubTabInfoOpen] = useState<typeof mgmtTab | null>(null);

  const estadoContratoOptions = useMemo(() => {
    const seen = new Set<string>();
    allEstados.forEach((e) => e.name && seen.add(estadoLabel(e.name)));
    rows.forEach((r) => r.nombre_estado_empleado && seen.add(estadoLabel(r.nombre_estado_empleado)));
    return [...seen].map((name) => ({ value: name, label: name }));
  }, [allEstados, rows]);

  const requestIdRef = useRef(0);

  const fetchContracts = async (page = currentPage) => {
    try {
      setIsFetching(true);
      const currentId = ++requestIdRef.current;

      const resp = await usersAPI.listContractsOverview({
        page,
        limit: PAGE_SIZE,
        search: searchTerm || undefined,
        clientId: filterClientId || undefined,
        projectId: filterProjectId || undefined,
        metadataActivo: filterUserStatus ? String(filterUserStatus === "active") : undefined,
        roleName: filterRolMobile ? `mobile-${filterRolMobile}` : undefined,
        vigencia: filterVigencia || undefined,
        tipoContrato: filterTipoContrato || undefined,
        estadoContrato: filterEstadoContrato || undefined,
        reemplazo: filterReemplazo || undefined,
      });
      if (currentId !== requestIdRef.current) return;

      setRows(resp.rows);
      setTotalRows(resp.total);
      setTotalPages(resp.totalPages);
      setHasLoaded(true);
    } catch (error) {
      console.error("Error fetching contracts:", error);
      sweetAlert.error("Error", "No se pudieron cargar los contratos");
      setHasLoaded(true);
    } finally {
      setIsFetching(false);
    }
  };

  // Resuelve a quién reemplaza cada contrato dentro de la página actual (mismo criterio que ya
  // usaba esta pantalla: si la persona reemplazada no está en la misma página, se muestra el id).
  const replacedNames = useMemo(() => {
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      if (r.userExternalId != null) map[String(r.userExternalId)] = r.userName;
    });
    return map;
  }, [rows]);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setInitialLoading(true);
        const [clients, projects] = await Promise.all([cachedFetch("clients:all", () => clientsAPI.listAll({ limit: 500 })), cachedFetch("projects:all", () => projectsAPI.listAll({ limit: 500 }))]);
        setClientOptions((clients as Client[]).map((c: any) => ({ id: c._id as string, name: (c.name as string) || "" })).sort((a, b) => a.name.localeCompare(b.name)));
        setProjectOptions(
          (projects as any[])
            .map((p: any) => ({ id: p._id as string, name: (p.name as string) || "" }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        await fetchContracts(1);
      } finally {
        setInitialLoading(false);
      }
    };
    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cualquier cambio de filtro/búsqueda → server-side, resetea a página 1 (debounced).
  const filtersInitedRef = useRef(false);
  useEffect(() => {
    if (!filtersInitedRef.current) {
      filtersInitedRef.current = true;
      return;
    }
    const h = setTimeout(() => {
      setCurrentPage(1);
      fetchContracts(1);
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filterUserStatus, filterVigencia, filterRolMobile, filterTipoContrato, filterEstadoContrato, filterReemplazo, filterClientId, filterProjectId]);

  // Cambio de página → traer esa página del server.
  const pageInitedRef = useRef(false);
  useEffect(() => {
    if (!pageInitedRef.current) {
      pageInitedRef.current = true;
      return;
    }
    fetchContracts(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const toggleViewMode = (mode: "table" | "cards") => {
    setViewMode(mode);
    localStorage.setItem("contractsViewMode", mode);
  };

  // Editar: ir al equipo del proyecto y abrir el editor precargado con ese contrato.
  const handleEditContract = (record: ContractOverviewRow) => {
    navigate(`/projects/${record.projectId}/team`, { state: { openWizardFor: { userId: record.userId, contractIndex: record.contractIndex } } });
  };

  const activeReleases = useMemo(() => releases.filter((r) => r.isActive), [releases]);

  const handleDownloadContractRow = (record: ContractOverviewRow, empresaId?: string) => downloadContractRow(record, contratoFrames, empresaId);
  const handleDownloadReleaseRow = (record: ContractOverviewRow, release: Release, empresaId?: string) => downloadReleaseRow(record, release, empresaId);
  const handleUploadAltaRow = async (record: ContractOverviewRow, file: File) => {
    await uploadAltaRow(record, file);
    fetchContracts();
  };

  // Eliminar SOLO ese contrato (por índice) del proyecto.
  const handleDeleteContract = async (record: ContractOverviewRow) => {
    const res = await sweetAlert.confirm("¿Eliminar contrato?", `Se eliminará este contrato de "${record.projectName}". Esta acción no se puede deshacer.`, "Sí, eliminar");
    if (!res.isConfirmed) return;
    try {
      await projectsAPI.deleteMemberContract(record.projectId, record.userId, record.contractIndex);
      sweetAlert.success("Contrato eliminado", "El contrato fue eliminado.");
      fetchContracts();
    } catch {
      sweetAlert.error("Error", "No se pudo eliminar el contrato.");
    }
  };

  const renderAreaTurno = (record: ContractOverviewRow) => {
    const areaData = (record.areaShiftAssignments || [])
      .map((asa: any) => {
        const aId = typeof asa.areaId === "object" ? asa.areaId?._id : asa.areaId;
        const aName = typeof asa.areaId === "object" ? asa.areaId?.name : allAreas.find((a) => String(a._id) === String(aId))?.name;
        const shifts = (asa.shiftIds || [])
          .map((sid: any) => {
            const sId = typeof sid === "object" ? sid?._id : sid;
            return allShifts.find((sh) => String(sh._id) === String(sId));
          })
          .filter(Boolean);
        return aName ? { id: String(aId), name: aName, shifts } : null;
      })
      .filter(Boolean) as { id: string; name: string; shifts: Shift[] }[];

    if (areaData.length === 0) return <span className="text-xs text-gray-400">—</span>;

    return (
      <div className="flex flex-wrap items-start gap-1.5">
        {areaData.map((ad, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg border border-blue-100 dark:border-blue-800 w-fit">
              <span className="text-blue-700 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{ad.name}</span>
            </div>
            {ad.shifts.length > 0 && (
              <div className="flex flex-col gap-1 mt-0.5 pl-0.5">
                {ad.shifts.map((sh, idx) => (
                  <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-50/50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/40 whitespace-nowrap w-fit" title={`${sh.startTime} - ${sh.endTime}`}>
                    {sh.name} ({sh.startTime} - {sh.endTime})
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <PageLayout
      title="Contratos"
      subtitle="Visualiza y gestiona todos los registros de contratación de los usuarios."
      faIcon={{ icon: faFileContract }}
      // Solo cuando se entró desde otra pantalla (ej. Gestionar Equipo del proyecto): volver ahí.
      // Se usa la ruta del proyecto y no history(-1) para que también funcione al recargar la URL.
      onBack={initialProjectId ? () => navigate(`/projects/${initialProjectId}/team`) : undefined}
      itemCount={totalRows}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || "Ayuda",
        size: helpEntry?.size as any,
        content: helpEntry?.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      searchAndFilters={
        <div className="space-y-4">
          {/* Pestañas principales de la página */}
          <div className="flex items-center border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            <button className={tabBtnClass(mainTab === "management")} onClick={() => setMainTab("management")}>
              Gestión de Contratos
            </button>
            {/* Info general: qué es cada una de las pestañas de "Gestión de Contratos" (AFIP, Firma digital y Dropbox Sign). */}
            <button type="button" onClick={() => setMgmtTabsInfoOpen(true)} title="Qué es cada pestaña de Gestión de Contratos" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 -ml-2 mr-2">
              <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
            </button>
            <button className={tabBtnClass(mainTab === "contracts")} onClick={() => setMainTab("contracts")}>
              Contratos
            </button>
          </div>

          {mainTab === "contracts" ? (
            <div className="flex flex-col sm:flex-row gap-4 items-start justify-between">
              <div className="flex-1 w-full">
            <SearchAndFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por usuario, proyecto o contrato..."
              radioFilters={[
                {
                  label: "Estado de usuarios",
                  value: filterUserStatus,
                  onChange: setFilterUserStatus,
                  options: [
                    { label: "Usuarios Activos", value: "active" },
                    { label: "Usuarios Inactivos", value: "inactive" },
                    { label: "Todos los usuarios", value: "" },
                  ],
                },
                {
                  label: "Contratos",
                  value: filterVigencia,
                  onChange: setFilterVigencia,
                  options: [
                    { label: "Vigentes", value: "vigente" },
                    { label: "No Vigentes", value: "novigente" },
                    { label: "Todos los contratos", value: "" },
                  ],
                },
              ]}
              selectFilters={[
                {
                  label: "Cliente",
                  value: filterClientId,
                  onChange: setFilterClientId,
                  placeholder: "Todos los clientes",
                  options: clientOptions.map((c) => ({ value: c.id, label: c.name })),
                },
                {
                  label: "Proyecto",
                  value: filterProjectId,
                  onChange: setFilterProjectId,
                  placeholder: "Todos los proyectos",
                  options: projectOptions.map((p) => ({ value: p.id, label: p.name })),
                },
                {
                  label: "Rol/es",
                  value: filterRolMobile,
                  onChange: setFilterRolMobile,
                  placeholder: "Todos los roles",
                  options: MOBILE_ROLE_OPTIONS,
                },
                {
                  label: "Tipo de contrato",
                  value: filterTipoContrato,
                  onChange: setFilterTipoContrato,
                  placeholder: "Todos los tipos",
                  options: contratoFrames.map((cf) => ({ value: cf.name, label: cf.name })),
                },
                {
                  label: "Estado de contrato",
                  value: filterEstadoContrato,
                  onChange: setFilterEstadoContrato,
                  placeholder: "Todos los estados",
                  options: estadoContratoOptions,
                  renderOption: (opt) => <EstadoBadge name={opt.label} />,
                },
                {
                  label: "Reemplazo",
                  value: filterReemplazo,
                  onChange: setFilterReemplazo,
                  placeholder: "Con y sin reemplazo",
                  options: [
                    { value: "con", label: "Con reemplazo" },
                    { value: "sin", label: "Sin reemplazo" },
                  ],
                },
              ]}
            />
          </div>

          <div className="items-center gap-2 shrink-0 hidden lg:flex">
            <button onClick={() => toggleViewMode("cards")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas">
              <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
            </button>
            <button onClick={() => toggleViewMode("table")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla">
              <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
            </button>
          </div>
            </div>
          ) : (
            <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-1 shrink-0">
                <button className={tabBtnClass(mgmtTab === "alta_afip")} onClick={() => setMgmtTab("alta_afip")}>
                  Alta temprana de AFIP ({mgmtCounts.alta})
                </button>
                <button type="button" onClick={() => setSubTabInfoOpen("alta_afip")} title={SUB_TAB_INFO.alta_afip.title} className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-300 shrink-0 -ml-3 mb-2">
                  <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className={tabBtnClass(mgmtTab === "constancia_cuit")} onClick={() => setMgmtTab("constancia_cuit")}>
                  Constancia de CUIT ({mgmtCounts.cuit})
                </button>
                <button type="button" onClick={() => setSubTabInfoOpen("constancia_cuit")} title={SUB_TAB_INFO.constancia_cuit.title} className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-300 shrink-0 -ml-3 mb-2">
                  <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className={tabBtnClass(mgmtTab === "sin_cuit")} onClick={() => setMgmtTab("sin_cuit")}>
                  Sin CUIT ({mgmtCounts.sinCuit})
                </button>
                <button type="button" onClick={() => setSubTabInfoOpen("sin_cuit")} title={SUB_TAB_INFO.sin_cuit.title} className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-300 shrink-0 -ml-3 mb-2">
                  <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className={tabBtnClass(mgmtTab === "firma")} onClick={() => setMgmtTab("firma")}>
                  Generar Documentos ({mgmtCounts.firma})
                </button>
                <button type="button" onClick={() => setSubTabInfoOpen("firma")} title={SUB_TAB_INFO.firma.title} className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-300 shrink-0 -ml-3 mb-2">
                  <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                </button>
              </div>
              {/* Estas tres no salen de la base: son las carpetas de Dropbox Sign, en el orden del
                  circuito de firma (generado → enviado → firmado). */}
              <div className="flex items-center gap-1 shrink-0">
                <button className={tabBtnClass(mgmtTab === "para_firmar")} onClick={() => setMgmtTab("para_firmar")}>
                  Para Firmar{dropboxCounts.para_firmar !== null ? ` (${dropboxCounts.para_firmar})` : ""}
                </button>
                <button type="button" onClick={() => setSubTabInfoOpen("para_firmar")} title={SUB_TAB_INFO.para_firmar.title} className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-300 shrink-0 -ml-3 mb-2">
                  <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className={tabBtnClass(mgmtTab === "enviado_firma")} onClick={() => setMgmtTab("enviado_firma")}>
                  Enviado a la firma{dropboxCounts.enviado_firma !== null ? ` (${dropboxCounts.enviado_firma})` : ""}
                </button>
                <button type="button" onClick={() => setSubTabInfoOpen("enviado_firma")} title={SUB_TAB_INFO.enviado_firma.title} className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-300 shrink-0 -ml-3 mb-2">
                  <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className={tabBtnClass(mgmtTab === "firmados")} onClick={() => setMgmtTab("firmados")}>
                  Firmados{dropboxCounts.firmados !== null ? ` (${dropboxCounts.firmados})` : ""}
                </button>
                <button type="button" onClick={() => setSubTabInfoOpen("firmados")} title={SUB_TAB_INFO.firmados.title} className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-300 shrink-0 -ml-3 mb-2">
                  <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      }
    >
      {mainTab === "management" ? (
        mgmtTab === "para_firmar" || mgmtTab === "enviado_firma" || mgmtTab === "firmados" ? (
          <ContractDropboxTab tipo={mgmtTab} onCount={mgmtTab === "para_firmar" ? setParaFirmarCount : mgmtTab === "enviado_firma" ? setPendienteFirmaCount : setFirmadosCount} />
        ) : mgmtTab === "firma" ? (
          <ContractBulkFirmaTab allEstados={allEstados} contratoFrames={contratoFrames} releases={releases} />
        ) : (
          <ContractBulkAfipTab allEstados={allEstados} contratoFrames={contratoFrames} releases={releases} initialProjectId={initialProjectId} tipo={mgmtTab === "alta_afip" ? "alta_temprana_afip" : mgmtTab === "sin_cuit" ? "sin_cuit" : "constancia_cuit"} onCounts={setMgmtCounts} />
        )
      ) : (
        <>
      {initialLoading || isFetching || !hasLoaded ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner message={initialLoading ? "Cargando contratos..." : "Cargando contratos..."} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No se encontraron contratos" description={searchTerm ? "Intenta con otros términos de búsqueda." : "No hay registros de contratos en el sistema."} icon={faFileContract} />
      ) : effectiveViewMode === "table" ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar max-h-[700px]">
            <table className="w-full text-left border-collapse min-w-[2750px]">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-sm">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">CUIT</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Contratos</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Proyecto</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Rol/es</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Rol/es Frame</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Área / Turno</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Sede</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Estado Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Estado Impositivo</th>
                  <ContractDocsHeaders />
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Reemplazo</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Alta / Baja</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Monto / Jorn.</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Horario</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((record) => (
                  <tr key={record._id} onClick={() => setManagedUser({ id: record.userId, name: record.userName })} title="Gestionar contratos de la persona" className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center shrink-0">
                          <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{record.userName}</p>
                          <p className="text-xs text-gray-500 truncate">{record.userEmail}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap font-mono">{cuitDisplay(record.cuit, record.sinCuit)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-bold px-2.5 py-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" title="Contratos de esta persona en el proyecto">
                        {record.contractsInProject}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{record.clientName || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{record.projectName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(() => {
                          const filteredRoles = (record.userRoles || []).filter((r) => !r.name.toLowerCase().includes("responsable"));
                          return (
                            <>
                              {filteredRoles.slice(0, 3).map((r) => {
                                const isCoordinador = r.name.toLowerCase().includes("coordinador");
                                const badgeClasses = isCoordinador ? "border-amber-500/30 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400" : "border-blue-500/30 text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400";
                                return (
                                  <span key={r._id} className={`text-[10px] px-2 py-0.5 rounded font-medium border whitespace-nowrap ${badgeClasses}`}>
                                    {r.name}
                                  </span>
                                );
                              })}
                              {filteredRoles.length > 3 && <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">+{filteredRoles.length - 3}</span>}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{record.nombreRolFrame || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${record.userActivo ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{record.userActivo ? "ACTIVO" : "INACTIVO"}</span>
                    </td>
                    <td className="px-4 py-3">{renderAreaTurno(record)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{record.nombre_sede || "-"}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                        <FontAwesomeIcon icon={faFileContract} className="h-3 w-3 text-blue-500 dark:text-blue-400 shrink-0" />
                        {record.nombre_contrato || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{record.nombre_estado_empleado ? <EstadoBadge name={record.nombre_estado_empleado} className="text-[10px] whitespace-nowrap" /> : <span className="text-xs text-gray-400">—</span>}</td>
                    {/* Estado impositivo (Alta AFIP / Alta Servicios): según el Tipo de Contrato, no el estado actual. */}
                    <td className="px-4 py-3">
                      {(() => {
                        const estadoImpositivo = estadoImpositivoDelContrato(record as unknown as Contract, contratoFrames, allEstados);
                        if (!estadoImpositivo) return <span className="text-xs text-gray-400">—</span>;
                        return (
                          <div className="flex flex-col gap-1 w-fit">
                            {estadoImpositivo.data?.etiquetaSecundaria?.trim() ? (
                              <EstadoSecundarioBadge estado={estadoImpositivo} className="text-[10px] whitespace-nowrap" />
                            ) : (
                              <EstadoBadge name={estadoImpositivo.name} className="text-[10px] whitespace-nowrap" />
                            )}
                            <TramiteImpositivoBadge estado={estadoImpositivo} persona={{ cuit: record.cuit, sinCuit: record.sinCuit }} />
                          </div>
                        );
                      })()}
                    </td>
                    <ContractDocsColumns
                      record={record}
                      contratoFrames={contratoFrames}
                      allEstados={allEstados}
                      activeReleases={activeReleases}
                      onDownloadContract={handleDownloadContractRow}
                      onDownloadRelease={handleDownloadReleaseRow}
                      onUploadAlta={handleUploadAltaRow}
                      canUploadAlta={false}
                    />
                    <td className="px-4 py-3">
                      {record.reemplazo ? (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded border border-amber-200/50 dark:border-amber-800/50 w-fit">
                          <FontAwesomeIcon icon={faIdCard} className="text-[9px]" />
                          <span>{replacedNames[String(record.empleado_id_reemplezado)] || `ID: ${record.empleado_id_reemplezado}`}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-500">
                      {(() => {
                        const vigente = isContractVigente(record.fecha_alta_contrato, record.fecha_baja_contrato);
                        return (
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit ${vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{vigente ? "VIGENTE" : "NO VIGENTE"}</span>
                            <div className="flex flex-col gap-0.5 text-xs">
                              <span>
                                <span className="text-gray-400">Alta:</span> {formatDate(record.fecha_alta_contrato)}
                              </span>
                              <span>
                                <span className="text-gray-400">Baja:</span> {record.fecha_baja_contrato ? formatDate(record.fecha_baja_contrato) : "—"}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-primary-600 dark:text-primary-400">${record.sueldo_mano?.toLocaleString()}</div>
                      {record.cantidad_jornadas_laborales ? <div className="text-xs text-gray-400">{record.cantidad_jornadas_laborales} jor.</div> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">{record.hora_inicio ? `${record.hora_inicio} - ${record.hora_fin}` : "-"}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleEditContract(record)} title="Editar contrato" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                          <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDeleteContract(record)} title="Eliminar contrato" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                          <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {rows.map((record) => (
            <Card key={record._id} onClick={() => setManagedUser({ id: record.userId, name: record.userName })} className="p-0 overflow-hidden group hover:border-primary-500 transition-all border-gray-200 dark:border-gray-700 cursor-pointer">
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700/50">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center shrink-0">
                      <FontAwesomeIcon icon={faFileContract} className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">{record.userName}</h3>
                        <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" title="Contratos de esta persona en el proyecto">
                          {record.contractsInProject} contr.
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500">{record.userEmail}</p>
                      {fmtCuit(record.cuit) && <p className="text-[10px] text-gray-400 font-mono">CUIT {fmtCuit(record.cuit)}</p>}
                    </div>
                  </div>
                  {record.nombre_estado_empleado ? <EstadoBadge name={record.nombre_estado_empleado} className="shrink-0 text-[8px] tracking-tighter" /> : null}
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Cliente</label>
                    <div className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faBuilding} className="text-gray-400 text-[10px]" />
                      <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{record.clientName || "—"}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Proyecto</label>
                    <div className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faBriefcase} className="text-gray-400 text-[10px]" />
                      <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{record.projectName}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Contrato</label>
                    <div className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faFileContract} className="text-blue-600 dark:text-blue-400 text-[10px]" />
                      <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{record.nombre_contrato}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Sede / Rol</label>
                    <div className="text-[10px] text-gray-600 dark:text-gray-400">
                      <p className="font-bold text-gray-800 dark:text-gray-200">{record.nombre_sede}</p>
                      <p>{record.nombreRolFrame}</p>
                    </div>
                  </div>
                </div>

                {/* Último contrato: mismos datos y misma validación de vigencia que la columna
                    "Alta / Baja" de la tabla, para que las dos vistas digan lo mismo. */}
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
                  <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Último contrato</label>
                  {(() => {
                    const vigente = isContractVigente(record.fecha_alta_contrato, record.fecha_baja_contrato);
                    return (
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{vigente ? "VIGENTE" : "NO VIGENTE"}</span>
                        <span className="text-[10px] text-gray-600 dark:text-gray-400">
                          <span className="text-gray-400">Alta:</span> {formatDate(record.fecha_alta_contrato)}
                        </span>
                        <span className="text-[10px] text-gray-600 dark:text-gray-400">
                          <span className="text-gray-400">Baja:</span> {record.fecha_baja_contrato ? formatDate(record.fecha_baja_contrato) : "—"}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700/50">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-600 dark:text-gray-400 font-medium">
                      <FontAwesomeIcon icon={faHourglassHalf} className="text-[10px]" />
                      <span>{record.cantidad_jornadas_laborales || 0} jornadas</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] text-gray-400">
                      <FontAwesomeIcon icon={faClock} className="text-[9px]" />
                      <span>{record.hora_inicio ? `${record.hora_inicio} - ${record.hora_fin}` : "-"}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] text-gray-400 uppercase font-bold tracking-widest leading-none">Monto</p>
                    <p className="text-lg font-black text-gray-900 dark:text-white leading-tight">${record.sueldo_mano?.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1 pt-2 border-t border-gray-100 dark:border-gray-700/50" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleEditContract(record)} title="Editar contrato" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                    <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDeleteContract(record)} title="Eliminar contrato" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                    <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{totalRows}</span> contratos · pág. {currentPage}/{totalPages}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <div className="flex items-center px-4 text-sm font-medium dark:text-gray-100">
              Página {currentPage} de {totalPages}
            </div>
            <button onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </div>
        </div>
      )}
        </>
      )}

      <MemberContractsManagerModal isOpen={!!managedUser} onClose={() => setManagedUser(null)} userId={managedUser?.id || null} userName={managedUser?.name} contratoFrames={contratoFrames} releases={releases} />

      {mgmtTabsInfoOpen && (
        <Modal isOpen={mgmtTabsInfoOpen} onClose={() => setMgmtTabsInfoOpen(false)} title="Qué es cada pestaña" size="md" zIndex={80}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Estas pestañas son las etapas de un mismo circuito: primero el contrato se da de alta en <strong>AFIP/ARCA</strong> (o va por <strong>Sin CUIT</strong> si la persona no tiene CUIL argentino), después se genera su documento en <strong>Generar Documentos</strong> y, por último, se
              firma digitalmente en <strong>Dropbox Sign</strong> (las últimas tres pestañas). Las tres primeras leen la base de datos de la aplicación; las tres últimas leen directamente las carpetas de Dropbox
              donde trabaja Dropbox Sign.
            </p>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">Alta temprana de AFIP · Constancia de CUIT</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Son los contratos que ya se registraron en la aplicación pero todavía no se hizo nada en ARCA. No interviene Dropbox ni Dropbox Sign en esta etapa.
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1.5 list-disc list-inside mt-2">
                <li>
                  <strong>Alta temprana de AFIP</strong>: contratos que necesitan un Alta.
                </li>
                <li>
                  <strong>Constancia de CUIT</strong>: contratos a los que hay que verificarles si el CUIT está activo o no en ARCA.
                </li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">Sin CUIT</p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                Personas que todavía no tienen CUIT/CUIL argentino: su trámite de AFIP queda pendiente hasta que cuenten con la documentación migratoria, así que no figuran en las dos pestañas anteriores. Se carga la documentación de respaldo, se valida y se las envía a <strong>Generar Documentos</strong> de forma excepcional.
              </p>
              <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">Generar Documentos</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Contratos cuyo documento ya llegó a <span className="font-mono text-xs">AFIP/Alta temprana de Afip</span> o <span className="font-mono text-xs">AFIP/Constancia de cuit</span>. Acá se generan
                los PDF de Contrato y Release, que quedan en la carpeta <span className="font-mono text-xs">Outbox</span> de Dropbox: es el paso previo a importarlos en Dropbox Sign, pero todavía no se
                envía nada a firmar desde esta pestaña.
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">Para Firmar · Enviado a la firma · Firmados</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">Estas tres no salen de la aplicación: son lo que hay en las carpetas de Dropbox de Dropbox Sign, en el orden del circuito de firma.</p>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1.5 list-disc list-inside mt-2">
                <li>
                  <strong>Para Firmar</strong>: carpeta <span className="font-mono text-xs">Outbox</span>. Contratos ya generados, listos para importar en Dropbox Sign y enviarlos a firmar desde ahí. Todavía no se envió nada.
                </li>
                <li>
                  <strong>Enviado a la firma</strong>: carpeta <span className="font-mono text-xs">Pendbox</span>. La solicitud <strong>ya se envió</strong> desde Dropbox Sign y se espera la firma del
                  destinatario. Se detecta por el correo de aviso que manda Dropbox Sign —es la única forma de saberlo—, y con eso el archivo se mueve desde Outbox, así no se puede enviar dos veces por
                  error.
                </li>
                <li>
                  <strong>Firmados</strong>: carpeta <span className="font-mono text-xs">Requested signatures</span>. Contratos que ya volvieron firmados y se pueden descargar.
                </li>
              </ul>
            </div>
          </div>
        </Modal>
      )}

      {subTabInfoOpen && (
        <Modal isOpen={!!subTabInfoOpen} onClose={() => setSubTabInfoOpen(null)} title={SUB_TAB_INFO[subTabInfoOpen].title} size="sm" zIndex={80}>
          <p className="text-sm text-gray-600 dark:text-gray-300">{SUB_TAB_INFO[subTabInfoOpen].text}</p>
        </Modal>
      )}
    </PageLayout>
  );
};
