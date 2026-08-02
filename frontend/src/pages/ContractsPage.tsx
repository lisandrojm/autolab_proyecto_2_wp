import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usersAPI, ContractOverviewRow, Contract } from "../api/users";
import { projectsAPI } from "../api/projects";
import { clientsAPI, Client } from "../api/clients";
import { contratoFrameAPI, ContratoFrameItem } from "../api/contratosFrame";
import { areasAPI, Area } from "../api/areas";
import { shiftsAPI, Shift } from "../api/shifts";
import { infoAPI, InfoItem } from "../api/info";
import { EstadoBadge, EstadoSecundarioBadge, TramiteImpositivoBadge, estadoLabel } from "../components/EstadoSelect";
import { MemberContractsManagerModal } from "../components/team/MemberContractsManagerModal";
import { estadoImpositivoDelContrato, findTemplate, templateHasContent, buildDownloadFileName, DownloadMenu } from "../components/team/ContractCard";
import { releasesAPI, Release } from "../api/release";
import { isContractVigente, formatDate } from "../components/team/EmployeeContractsModal";
import { getImageUrl } from "../utils/imageHelpers";
import { cachedFetch } from "../utils/refCache";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faBriefcase, faHourglassHalf, faTable, faGrip, faChevronLeft, faChevronRight, faClock, faEdit, faTrash, faUser, faIdCard, faBuilding, faFilePdf, faUpload, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { sweetAlert } from "../utils/sweetAlert";

import { getHelp, hasHelp } from "../data/help/helpContent";
import { ContractBulkAfipTab, ContractBulkFirmaTab } from "../components/contratos/ContractBulkTabs";

/** Mismas opciones que usa el filtro "Rol/es" del tab Equipo de Gestionar Equipo. */
const MOBILE_ROLE_OPTIONS = [
  { value: "colaborador", label: "Mobile-Colaborador" },
  { value: "coordinador", label: "Mobile-Coordinador" },
];

const PAGE_SIZE = 25;

/** Clases de un botón de pestaña (mismo estilo que el resto de los tabs de la app). */
const tabBtnClass = (active: boolean): string =>
  `px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
    active
      ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
      : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
  }`;

/**
 * Las tres celdas de documentos del contrato ACTIVO de la fila (mismo comportamiento que la tarjeta del
 * modal): "Alta AFIP/Servicios" (ver/subir), "Contrato | Empresa" y "Release | Empresa" (descargar,
 * con menú de empresa cuando el proyecto tiene más de una). Devuelve tres <td> para insertar en la fila.
 */
const ContractDocsColumns: React.FC<{
  record: ContractOverviewRow;
  contratoFrames: ContratoFrameItem[];
  allEstados: InfoItem[];
  activeReleases: Release[];
  onDownloadContract: (record: ContractOverviewRow, empresaId?: string) => void;
  onDownloadRelease: (record: ContractOverviewRow, release: Release, empresaId?: string) => void;
  onUploadAlta: (record: ContractOverviewRow, file: File) => Promise<void>;
}> = ({ record, contratoFrames, allEstados, activeReleases, onDownloadContract, onDownloadRelease, onUploadAlta }) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const asContract = record as unknown as Contract;
  const template = findTemplate(asContract, contratoFrames);
  const canDownloadContract = templateHasContent(template);
  const tipoContrato = record.nombre_contrato || template?.data?.nombre || template?.name || "Contrato";
  const estadoImpositivo = estadoImpositivoDelContrato(asContract, contratoFrames, allEstados);
  const tituloAlta = estadoImpositivo?.data?.etiquetaSecundaria?.trim() || (estadoImpositivo?.data?.tipoImpositivo === "alta_temprana_afip" ? "Alta AFIP" : "Documento de Servicios");

  // Empresa efectiva: si el contrato tiene una fija guardada, esa sola; si no, las del proyecto.
  const savedContratoEmpresaId = record.empresaContratoId || "";
  const contratoEmpresas = record.contratoEmpresas || [];
  const savedContratoEmpresaLabel = record.nombre_empresa_contrato || contratoEmpresas.find((e) => e.id === savedContratoEmpresaId)?.label || savedContratoEmpresaId;
  const effectiveContratoEmpresas = savedContratoEmpresaId ? [{ id: savedContratoEmpresaId, label: savedContratoEmpresaLabel }] : contratoEmpresas;

  const savedReleaseEmpresaId = record.empresaReleaseId || "";
  const releaseEmpresas = record.releaseEmpresas || [];
  const savedReleaseEmpresaLabel = record.nombre_empresa_release || releaseEmpresas.find((e) => e.id === savedReleaseEmpresaId)?.label || savedReleaseEmpresaId;
  const effectiveReleaseEmpresas = savedReleaseEmpresaId ? [{ id: savedReleaseEmpresaId, label: savedReleaseEmpresaLabel }] : releaseEmpresas;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      sweetAlert.error("Formato no válido", "Solo se permiten archivos PDF.");
      return;
    }
    try {
      setUploading(true);
      await onUploadAlta(record, file);
    } catch {
      sweetAlert.error("Error", "No se pudo subir el documento.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* Alta AFIP / Servicios: ver o subir el PDF (solo si el contrato tiene un estado impositivo). */}
      <td className="px-4 py-3" onClick={stop}>
        {estadoImpositivo ? (
          <div className="flex flex-col gap-1 min-w-[160px]">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{tituloAlta}</span>
            <div className="flex items-center gap-2">
              {record.altaDocumentoUrl ? (
                <a href={getImageUrl(record.altaDocumentoUrl)} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-700 dark:text-gray-200 flex items-center gap-1.5 min-w-0 hover:underline" title={record.altaDocumentoNombre || tituloAlta}>
                  <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 text-violet-600 shrink-0" />
                  <span className="truncate max-w-[110px]">{record.altaDocumentoNombre || "Ver documento"}</span>
                </a>
              ) : (
                <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 shrink-0" />
                  Sin documento
                </span>
              )}
              <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} title={record.altaDocumentoUrl ? "Reemplazar documento" : "Subir PDF"} className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                <FontAwesomeIcon icon={uploading ? faSpinner : faUpload} spin={uploading} className="h-4 w-4" />
              </button>
              <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
            </div>
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>

      {/* Contrato | Empresa: nombre + empresa(s) + descarga (menú si hay más de una empresa). */}
      <td className="px-4 py-3" onClick={stop}>
        <div className="flex items-center justify-between gap-2 min-w-[220px]">
          <span className="text-xs text-gray-700 dark:text-gray-200 flex items-center gap-1.5 flex-wrap min-w-0" title={tipoContrato}>
            <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 text-violet-600 shrink-0" />
            <span className="truncate max-w-[130px]">{tipoContrato}</span>
            {effectiveContratoEmpresas.map((emp) => (
              <span key={emp.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 shrink-0 whitespace-nowrap">
                {emp.label}
              </span>
            ))}
          </span>
          {canDownloadContract ? (
            <DownloadMenu empresas={effectiveContratoEmpresas} onDownload={(empresaId) => onDownloadContract(record, empresaId)} title="Descargar contrato" />
          ) : (
            <span className="text-xs text-gray-400 shrink-0" title="La plantilla de este tipo de contrato no tiene contenido redactado">Sin contenido</span>
          )}
        </div>
      </td>

      {/* Release | Empresa: por cada release activo, nombre + empresa(s) + descarga. */}
      <td className="px-4 py-3" onClick={stop}>
        {activeReleases.length === 0 ? (
          <span className="text-xs text-gray-400">—</span>
        ) : (
          <div className="flex flex-col gap-1.5 min-w-[220px]">
            {activeReleases.map((r) => (
              <div key={r._id} className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-700 dark:text-gray-200 flex items-center gap-1.5 flex-wrap min-w-0" title={r.name}>
                  <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 text-violet-600 shrink-0" />
                  <span className="truncate max-w-[130px]">{r.name}</span>
                  {effectiveReleaseEmpresas.map((emp) => (
                    <span key={emp.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-800/50 shrink-0 whitespace-nowrap">
                      {emp.label}
                    </span>
                  ))}
                </span>
                <DownloadMenu empresas={effectiveReleaseEmpresas} onDownload={(empresaId) => onDownloadRelease(record, r, empresaId)} title="Descargar release" />
              </div>
            ))}
          </div>
        )}
      </td>
    </>
  );
};

export const ContractsPage: React.FC = () => {
  const navigate = useNavigate();

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
  const [filterProjectId, setFilterProjectId] = useState("");

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
  const [mainTab, setMainTab] = useState<"contracts" | "management">("contracts");
  // Sub-pestañas de "Gestión de Contratos".
  const [mgmtTab, setMgmtTab] = useState<"afip" | "firma">("afip");

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

  // Nombre de descarga: la fila no trae proyecto/persona con la forma que espera buildDownloadFileName,
  // así que se le pasa un contrato-shim con los campos que usa.
  const downloadContractShim = (record: ContractOverviewRow) => ({ nombre_proyecto: record.projectName, nombre_contrato: record.nombre_contrato }) as unknown as Contract;
  const userShim = (record: ContractOverviewRow) => ({ firstName: record.userName, lastName: "" }) as any;

  const handleDownloadContractRow = async (record: ContractOverviewRow, empresaId?: string) => {
    const template = findTemplate(record as unknown as Contract, contratoFrames);
    if (!templateHasContent(template)) {
      sweetAlert.error("Sin contenido", "La plantilla de este tipo de contrato todavía no tiene contenido redactado.");
      return;
    }
    try {
      await contratoFrameAPI.downloadFilled(template as ContratoFrameItem, { userId: record.userId, projectId: record.projectId, contractIndex: record.contractIndex, empresaId }, buildDownloadFileName("Contrato", userShim(record), downloadContractShim(record)));
    } catch {
      sweetAlert.error("Error", "No se pudo descargar el contrato.");
    }
  };

  const handleDownloadReleaseRow = async (record: ContractOverviewRow, release: Release, empresaId?: string) => {
    try {
      await releasesAPI.downloadFilled(release, { userId: record.userId, projectId: record.projectId, contractIndex: record.contractIndex, empresaId }, buildDownloadFileName("Release", userShim(record), downloadContractShim(record), release.name));
    } catch {
      sweetAlert.error("Error", "No se pudo descargar el release.");
    }
  };

  const handleUploadAltaRow = async (record: ContractOverviewRow, file: File) => {
    await projectsAPI.uploadAltaDocumento(record.projectId, record.userId, record.contractIndex, file);
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
          <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            <button className={tabBtnClass(mainTab === "contracts")} onClick={() => setMainTab("contracts")}>
              Contratos
            </button>
            <button className={tabBtnClass(mainTab === "management")} onClick={() => setMainTab("management")}>
              Gestión de Contratos
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
            <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
              <button className={tabBtnClass(mgmtTab === "afip")} onClick={() => setMgmtTab("afip")}>
                Altas de AFIP | Constancia de CUIT
              </button>
              <button className={tabBtnClass(mgmtTab === "firma")} onClick={() => setMgmtTab("firma")}>
                Firma digital
              </button>
            </div>
          )}
        </div>
      }
    >
      {mainTab === "management" ? (
        mgmtTab === "afip" ? <ContractBulkAfipTab allEstados={allEstados} /> : <ContractBulkFirmaTab />
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
            <table className="w-full text-left border-collapse min-w-[2650px]">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-sm">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Usuario</th>
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
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Alta AFIP / Servicios</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Contrato | Empresa</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Release | Empresa</th>
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
                            <TramiteImpositivoBadge estado={estadoImpositivo} />
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
    </PageLayout>
  );
};
