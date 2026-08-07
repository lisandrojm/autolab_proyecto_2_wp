import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileInvoiceDollar, faFileSignature, faCheck, faTriangleExclamation, faXmark, faFileLines, faGrip, faTable, faUser, faFilePdf, faPaperPlane, faSpinner, faDownload, faCircleInfo, faArrowUpRightFromSquare, faTrash } from "@fortawesome/free-solid-svg-icons";
import { usersAPI, ContractOverviewRow, Contract } from "../../api/users";
import { projectsAPI } from "../../api/projects";
import { companiesAPI, Company } from "../../api/companies";
import { infoAPI, InfoItem } from "../../api/info";
import { ContratoFrameItem } from "../../api/contratosFrame";
import { contratosAPI, ContratoItem } from "../../api/contratos";
import { categoriaSatAPI, CategoriaSatItem } from "../../api/categoriasSat";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../../api/simpleCatalog";
import { Release } from "../../api/release";
import { firmaDigitalAPI, FirmaDigitalConfig } from "../../api/firmaDigital";
import { claveEstado, EstadoBadge, EstadoSecundarioBadge, estadoLabel } from "../EstadoSelect";
import { isContractVigente, formatDate, estadoImpositivoDelContrato, findTemplate, templateHasContent, EmpresaOption } from "../team/ContractCard";
import { getImageUrl, downloadFileFromUrl } from "../../utils/imageHelpers";
import { SearchAndFilters } from "../ui/SearchAndFilters";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";
import { ContractDocsColumns, ContractDocsHeaders, downloadContractRow, downloadReleaseRow, uploadAltaRow } from "./ContractRowDocs";
import { resolveAfip, AfipRowResult } from "./afipCompleteness";
import { buildAltaRecord, buildAltaTxt, downloadTxt } from "./afipTxt";
import { ConstanciaBadge, ArcaBadge, DropboxBadge, BotonArca, BotonConsultarAfipBulk, BotonValidarCuit, constanciaPendiente, fmtCuit } from "./ConstanciaBulk";
import { sweetAlert } from "../../utils/sweetAlert";

const obrasSocialesApi = createSimpleCatalogApi("/obras-sociales");

/** Mismas opciones de rol que el filtro de la pestaña Contratos. */
const MOBILE_ROLE_OPTIONS = [
  { value: "colaborador", label: "Mobile-Colaborador" },
  { value: "coordinador", label: "Mobile-Coordinador" },
];

/** YYYYMMDD de hoy para el nombre del archivo. */
const hoyStamp = (): string => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
};

/** Mismo estilo que las pestañas principales (ContractsPage.tsx) — para el filtro de Empresa como tabs. */
const empresaTabClass = (active: boolean): string =>
  `px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
    active ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
  }`;

type TipoImpositivo = "alta_temprana_afip" | "constancia_cuit";
const TIPO_LABEL: Record<TipoImpositivo, string> = {
  alta_temprana_afip: "Alta temprana de AFIP",
  constancia_cuit: "Constancia de CUIT",
};

/** Fila de contrato enriquecida con el trámite impositivo de su estado actual. */
type ImpositivoRow = ContractOverviewRow & { _tipo?: TipoImpositivo; _estadoName: string };

/**
 * Columna "Estado Impositivo": el Estado impositivo (Alta AFIP / Alta Servicios) vinculado al TIPO de
 * contrato — no al estado actual, por eso sigue mostrándose igual en las tres pestañas aunque el
 * contrato ya haya avanzado (p. ej. a "Envío de documentación" o "Firma pendiente"). Mismo criterio
 * que la columna "Estado impositivo" de Gestionar Equipo (ProjectTeamPage.tsx).
 */
const EstadoImpositivoCell: React.FC<{ record: ContractOverviewRow; contratoFrames: ContratoFrameItem[]; allEstados: InfoItem[] }> = ({ record, contratoFrames, allEstados }) => {
  const estadoImpositivo = estadoImpositivoDelContrato(record as unknown as Contract, contratoFrames, allEstados);
  if (!estadoImpositivo) return <span className="text-xs text-gray-400">—</span>;
  return estadoImpositivo.data?.etiquetaSecundaria?.trim() ? (
    <EstadoSecundarioBadge estado={estadoImpositivo} className="text-[10px] whitespace-nowrap" />
  ) : (
    <EstadoBadge name={estadoImpositivo.name} className="text-[10px] whitespace-nowrap" />
  );
};

/**
 * Celda "Empresa Contrato" / "Empresa Release" de la pestaña Alta temprana de AFIP: elegir (o
 * cambiar) la empresa directo desde la tabla, sin abrir el wizard completo de "Configurar Miembro".
 * La de Contrato es obligatoria para poder generar el TXT (un mismo archivo se sube a la sesión de
 * ARCA de UNA sola empresa, así que cada contrato tiene que tener la suya definida antes de poder
 * incluirse); la de Release es opcional.
 */
const EmpresaSelectCell: React.FC<{ record: ContractOverviewRow; campo: "contrato" | "release"; requerido: boolean; onGuardado: () => void }> = ({ record, campo, requerido, onGuardado }) => {
  const [guardando, setGuardando] = useState(false);
  const empresas = (campo === "contrato" ? record.contratoEmpresas : record.releaseEmpresas) || [];
  const empresaIdActual = campo === "contrato" ? record.empresaContratoId : record.empresaReleaseId;

  const guardar = async (empresaId: string) => {
    setGuardando(true);
    try {
      if (campo === "contrato") await projectsAPI.updateContratoEmpresa(record.projectId, record.userId, record.contractIndex, empresaId);
      else await projectsAPI.updateReleaseEmpresa(record.projectId, record.userId, record.contractIndex, empresaId);
      onGuardado();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo guardar la empresa.");
    } finally {
      setGuardando(false);
    }
  };

  if (empresas.length === 0) {
    return (
      <span className="text-xs text-gray-400" title={`El proyecto no tiene empresas configuradas para ${campo === "contrato" ? "Contrato" : "Release"}`}>
        Sin empresas
      </span>
    );
  }

  const faltaYEsRequerido = requerido && !empresaIdActual;

  return (
    <select
      value={empresaIdActual || ""}
      disabled={guardando}
      onChange={(e) => guardar(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      title={empresaIdActual ? "Cambiar la empresa" : requerido ? "Elegí la empresa — es obligatoria para generar el TXT" : "Elegí la empresa (opcional)"}
      className={`text-xs rounded-md border px-2 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50 disabled:cursor-wait ${
        faltaYEsRequerido ? "border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400 font-semibold" : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
      }`}
    >
      <option value="">{empresaIdActual ? "Sin empresa" : "Elegir empresa..."}</option>
      {empresas.map((e) => (
        <option key={e.id} value={e.id}>
          {e.label}
        </option>
      ))}
    </select>
  );
};

/**
 * Sub-pestaña "Altas de AFIP | Constancia de CUIT": lista SOLO lectura de los contratos cuyo estado
 * actual es un estado impositivo, con su trámite (Alta temprana de AFIP / Constancia de CUIT),
 * filtros y exportación a CSV.
 */
export const ContractBulkAfipTab: React.FC<{
  allEstados: InfoItem[];
  contratoFrames: ContratoFrameItem[];
  releases: Release[];
  initialProjectId?: string;
  tipo: TipoImpositivo;
  /** Informa al padre la cantidad de contratos de cada trámite, para mostrarla en sus propias pestañas. */
  onCounts?: (counts: { alta: number; cuit: number }) => void;
}> = ({ allEstados, contratoFrames, releases, initialProjectId = "", tipo: filterTipo, onCounts }) => {
  const [rows, setRows] = useState<ContractOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [soloIncompletos, setSoloIncompletos] = useState(false);
  /** Sub-pestaña Constancia de CUIT: mostrar solo las que faltan o ya vencieron (el worklist). */
  const [soloPendientes, setSoloPendientes] = useState(false);

  // Mismo set de filtros que la pestaña Contratos (se aplican del lado del cliente sobre lo ya cargado).
  const [filterUserStatus, setFilterUserStatus] = useState("");
  const [filterVigencia, setFilterVigencia] = useState("");
  const [filterRolMobile, setFilterRolMobile] = useState("");
  const [filterTipoContrato, setFilterTipoContrato] = useState("");
  const [filterEstadoContrato, setFilterEstadoContrato] = useState("");
  const [filterReemplazo, setFilterReemplazo] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  // Preseleccionado cuando se entra desde el proyecto (Gestionar Equipo → Gestión masiva de Contratos).
  const [filterProjectId, setFilterProjectId] = useState(initialProjectId);
  // Empresa (ABM "Empresas"): agrupa/filtra las altas por la empleadora que las va a presentar en AFIP.
  const [filterEmpresaId, setFilterEmpresaId] = useState("");

  // Vista tabla / tarjetas (como Contratos): la tabla solo en pantallas grandes.
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const onResize = () => setIsLarge(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const effectiveViewMode = isLarge ? viewMode : "cards";

  // Catálogos para resolver los datos AFIP (completitud).
  const [categorias, setCategorias] = useState<CategoriaSatItem[]>([]);
  const [tipos, setTipos] = useState<ContratoItem[]>([]);
  const [obrasSociales, setObrasSociales] = useState<SimpleCatalogItem[]>([]);
  const [sedes, setSedes] = useState<InfoItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  // Detalle de completitud de una fila (modal).
  const [detalle, setDetalle] = useState<{ row: ImpositivoRow; result: AfipRowResult } | null>(null);
  // Detalle de los datos para la Constancia de CUIT/CUIL (único requisito: el CUIT/CUIL).
  const [constancia, setConstancia] = useState<{ row: ImpositivoRow; cuil: string } | null>(null);
  // Explicación de qué hace la columna "Verificar (Opc)" (modal informativo).
  const [verificarInfoOpen, setVerificarInfoOpen] = useState(false);
  // Explicación de qué hacer en AFIP/ARCA con el TXT ya generado (modal informativo).
  const [cargarArcaInfoOpen, setCargarArcaInfoOpen] = useState(false);
  // Explicación del flujo completo: Generar TXT → Cargar en ARCA → sincronización automática.
  const [flujoTxtInfoOpen, setFlujoTxtInfoOpen] = useState(false);
  // Explicación de qué son y de dónde salen los datos que exige la columna "Datos AFIP".
  const [datosAfipInfoOpen, setDatosAfipInfoOpen] = useState(false);
  // Explicación de qué es la columna "Datos CUIT/CUIL" y por qué gatea Validar / Validar ARCA Masivo.
  const [datosCuitInfoOpen, setDatosCuitInfoOpen] = useState(false);
  // Explicación de por qué "Empresa Contrato" es obligatoria (modal informativo).
  const [empresaContratoInfoOpen, setEmpresaContratoInfoOpen] = useState(false);

  useEffect(() => {
    categoriaSatAPI.list().then(setCategorias).catch(() => setCategorias([]));
    contratosAPI.list().then(setTipos).catch(() => setTipos([]));
    obrasSocialesApi.list().then(setObrasSociales).catch(() => setObrasSociales([]));
    infoAPI.listSedes().then(setSedes).catch(() => setSedes([]));
    companiesAPI.list().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  const afipCat = useMemo(() => ({ categorias, tipos, obrasSociales, sedes }), [categorias, tipos, obrasSociales, sedes]);

  const activeReleases = useMemo(() => releases.filter((r) => r.isActive), [releases]);

  // clave-estado (normalizada) → trámite impositivo, para los estados marcados como impositivos.
  const impositivoPorClave = useMemo(() => {
    const m = new Map<string, { tipo?: TipoImpositivo; name: string }>();
    allEstados
      .filter((e) => e.data?.esImpositivo)
      .forEach((e) => m.set(claveEstado(e.name), { tipo: e.data?.tipoImpositivo as TipoImpositivo | undefined, name: e.name }));
    return m;
  }, [allEstados]);

  const load = useCallback(() => {
    setLoading(true);
    return usersAPI
      .listContractsOverview({ limit: 5000 })
      .then((res) => setRows(res.rows))
      .catch(() => {
        /* noop */
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownloadContract = (record: ContractOverviewRow, empresaId?: string) => downloadContractRow(record, contratoFrames, empresaId);
  const handleDownloadRelease = (record: ContractOverviewRow, release: Release, empresaId?: string) => downloadReleaseRow(record, release, empresaId);
  const handleUploadAlta = async (record: ContractOverviewRow, file: File) => {
    await uploadAltaRow(record, file);
    load();
  };

  // Genera el TXT de Alta masiva de AFIP para los contratos con datos completos del conjunto dado;
  // omite los incompletos (no se puede armar una línea válida) e informa cuántos quedaron afuera.
  const generarTxt = (items: { row: ImpositivoRow; result: AfipRowResult }[], filenameBase: string) => {
    const registros = items.map((x) => buildAltaRecord(x.row, afipCat)).filter((r): r is string => r !== null);
    if (registros.length === 0) {
      sweetAlert.error("Sin datos completos", "Ningún contrato del conjunto tiene todos los datos AFIP cargados. Completá los faltantes (columna «Datos AFIP») antes de generar el TXT.");
      return;
    }
    const omitidos = items.length - registros.length;
    downloadTxt(buildAltaTxt(registros), `${filenameBase}_${hoyStamp()}.txt`);
    if (omitidos > 0) {
      sweetAlert.info("TXT generado", `Se incluyeron ${registros.length} alta(s). Se omitieron ${omitidos} contrato(s) por datos AFIP incompletos.`);
    } else {
      sweetAlert.success("TXT generado", `Se incluyeron ${registros.length} alta(s) en el archivo.`);
    }
  };

  // Solo los contratos cuyo estado actual es impositivo, con su chequeo de completitud AFIP.
  const impositivoRows = useMemo<{ row: ImpositivoRow; result: AfipRowResult }[]>(() => {
    const out: { row: ImpositivoRow; result: AfipRowResult }[] = [];
    for (const r of rows) {
      const imp = impositivoPorClave.get(claveEstado(r.nombre_estado_empleado || ""));
      if (imp) {
        const row: ImpositivoRow = { ...r, _tipo: imp.tipo, _estadoName: imp.name };
        out.push({ row, result: resolveAfip(row, afipCat) });
      }
    }
    return out;
  }, [rows, impositivoPorClave, afipCat]);

  // Empresa(s) a las que se le puede atribuir el contrato: la fija guardada si ya se descargó/eligió
  // una, o si no, todas las candidatas del proyecto (mismo criterio que el menú "Descargar con:" de
  // ContractRowDocs) — así el filtro no deja afuera contratos que todavía no fijaron una empresa.
  const empresasDelContrato = (r: ImpositivoRow): string[] => (r.empresaContratoId ? [r.empresaContratoId] : (r.contratoEmpresas || []).map((e) => e.id));

  // Filtros de la barra superior (búsqueda + filtro avanzado), sin el trámite ni los toggles propios
  // de cada pestaña: se usa tanto para la tabla como para los contadores de las pestañas, que deben
  // reflejar los filtros activos (p. ej. "Contratos: Vigentes") aunque pertenezcan al otro trámite.
  const matchesCommonFilters = useCallback(
    (r: ImpositivoRow): boolean => {
      const q = search.trim().toLowerCase();
      if (filterUserStatus && r.userActivo !== (filterUserStatus === "active")) return false;
      if (filterVigencia) {
        const vig = isContractVigente(r.fecha_alta_contrato, r.fecha_baja_contrato);
        if (filterVigencia === "vigente" ? !vig : vig) return false;
      }
      if (filterRolMobile && !(r.userRoles || []).some((rol) => (rol.name || "").toLowerCase().includes(filterRolMobile))) return false;
      if (filterTipoContrato && r.nombre_contrato !== filterTipoContrato) return false;
      if (filterEstadoContrato && estadoLabel(r.nombre_estado_empleado || "") !== filterEstadoContrato) return false;
      if (filterReemplazo && (filterReemplazo === "con" ? !r.reemplazo : r.reemplazo)) return false;
      if (filterClientId && r.clientId !== filterClientId) return false;
      if (filterProjectId && r.projectId !== filterProjectId) return false;
      if (filterEmpresaId && !empresasDelContrato(r).includes(filterEmpresaId)) return false;
      if (q) {
        const hay = [r.userName, r.userEmail, r.clientName, r.projectName, r.nombre_contrato].some((v) => (v || "").toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    },
    [search, filterUserStatus, filterVigencia, filterRolMobile, filterTipoContrato, filterEstadoContrato, filterReemplazo, filterClientId, filterProjectId, filterEmpresaId]
  );

  const rowsPorFiltrosComunes = useMemo(() => impositivoRows.filter((x) => matchesCommonFilters(x.row)), [impositivoRows, matchesCommonFilters]);

  const countAlta = rowsPorFiltrosComunes.filter((x) => x.row._tipo === "alta_temprana_afip").length;
  const countCuit = rowsPorFiltrosComunes.filter((x) => x.row._tipo === "constancia_cuit").length;
  const countCompletos = impositivoRows.filter((x) => x.result.completo).length;
  const countIncompletos = impositivoRows.length - countCompletos;

  // Ref para no re-disparar el aviso al padre por un `onCounts` con identidad nueva en cada render.
  const onCountsRef = useRef(onCounts);
  onCountsRef.current = onCounts;
  useEffect(() => {
    onCountsRef.current?.({ alta: countAlta, cuit: countCuit });
  }, [countAlta, countCuit]);

  // Constancias de CUIT: vigentes vs. pendientes (las que faltan o ya vencieron, que son las que hay
  // que volver a pedirle a ARCA). Se cuentan sobre todas las de ese trámite, como countAlta/countCuit.
  const constanciaRows = useMemo(() => impositivoRows.filter((x) => x.row._tipo === "constancia_cuit"), [impositivoRows]);
  const countConstPendientes = constanciaRows.filter((x) => constanciaPendiente(x.row)).length;
  const countConstVigentes = constanciaRows.length - countConstPendientes;

  const filtered = useMemo(() => {
    return rowsPorFiltrosComunes.filter(({ row: r, result }) => {
      if (filterTipo && r._tipo !== filterTipo) return false;
      if (soloIncompletos && result.completo) return false;
      if (soloPendientes && filterTipo === "constancia_cuit" && !constanciaPendiente(r)) return false;
      return true;
    });
  }, [rowsPorFiltrosComunes, filterTipo, soloIncompletos, soloPendientes]);

  // Opciones de los selects del filtro avanzado, derivadas de lo cargado.
  const clientOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => r.clientId && m.set(r.clientId, r.clientName || r.clientId));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);
  const projectOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.filter((r) => !filterClientId || r.clientId === filterClientId).forEach((r) => r.projectId && m.set(r.projectId, r.projectName || r.projectId));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, filterClientId]);
  const tipoContratoOptions = useMemo(() => {
    const s = new Set<string>();
    impositivoRows.forEach((x) => x.row.nombre_contrato && s.add(x.row.nombre_contrato));
    return [...s].sort().map((v) => ({ value: v, label: v }));
  }, [impositivoRows]);
  const estadoContratoOptions = useMemo(() => {
    const s = new Set<string>();
    impositivoRows.forEach((x) => x.row.nombre_estado_empleado && s.add(estadoLabel(x.row.nombre_estado_empleado)));
    return [...s].map((v) => ({ value: v, label: v }));
  }, [impositivoRows]);
  // Las empresas del filtro son las creadas en el ABM (no solo las ya usadas en algún contrato), para
  // poder elegir de antemano por cuál empresa se va a presentar el alta.
  const empresaOptions = useMemo(() => companies.map((c) => ({ value: c._id, label: c.razonSocial })).sort((a, b) => a.label.localeCompare(b.label)), [companies]);

  // Selección de filas para armar el TXT. Solo se pueden marcar los contratos con datos AFIP completos.
  const rowKey = (r: ContractOverviewRow) => `${r._id}-${r.contractIndex}`;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (k: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  // Qué hace falta para poder tildar una fila depende del trámite: en Alta temprana de AFIP son los
  // datos completos para el TXT; en Constancia de CUIT alcanza con tener el CUIT/CUIL cargado (es lo
  // único que necesita "Validar ARCA Masivo").
  const esSeleccionable = useCallback((row: ImpositivoRow, result: AfipRowResult): boolean => (filterTipo === "constancia_cuit" ? !!fmtCuit(row.cuit) : result.completo), [filterTipo]);
  const selectableFiltered = useMemo(() => filtered.filter((x) => esSeleccionable(x.row, x.result)), [filtered, esSeleccionable]);
  const allSel = selectableFiltered.length > 0 && selectableFiltered.every((x) => selected.has(rowKey(x.row)));
  const toggleAll = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (allSel) selectableFiltered.forEach((x) => n.delete(rowKey(x.row)));
      else selectableFiltered.forEach((x) => n.add(rowKey(x.row)));
      return n;
    });
  const seleccionados = useMemo(() => filtered.filter((x) => selected.has(rowKey(x.row))), [filtered, selected]);
  // El TXT se arma con lo seleccionado; si no hay selección, con todo lo filtrado (comodidad).
  const fuenteTxt = seleccionados.length > 0 ? seleccionados : filtered;
  // Con el filtro de Empresa puesto, el nombre del archivo lo deja claro (cada empresa presenta su TXT por separado).
  const empresaSeleccionada = companies.find((c) => c._id === filterEmpresaId);
  const nombreArchivoTxt = `altas_afip${empresaSeleccionada ? `_${empresaSeleccionada.razonSocial.replace(/[^a-zA-Z0-9]+/g, "_")}` : ""}`;

  return (
    <div className="space-y-4">
      {/* Buscador + filtro avanzado (mismo que Contratos) + vista + acciones */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-start justify-between">
        <div className="flex-1 w-full">
          <SearchAndFilters
            searchTerm={search}
            onSearchChange={setSearch}
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
              { label: "Cliente", value: filterClientId, onChange: setFilterClientId, placeholder: "Todos los clientes", options: clientOptions },
              { label: "Proyecto", value: filterProjectId, onChange: setFilterProjectId, placeholder: "Todos los proyectos", options: projectOptions },
              // "Empresa" en Alta temprana de AFIP se filtra con los tabs de abajo, no acá.
              ...(filterTipo === "alta_temprana_afip" ? [] : [{ label: "Empresa", value: filterEmpresaId, onChange: setFilterEmpresaId, placeholder: "Todas las empresas", options: empresaOptions }]),
              { label: "Rol/es", value: filterRolMobile, onChange: setFilterRolMobile, placeholder: "Todos los roles", options: MOBILE_ROLE_OPTIONS },
              { label: "Tipo de contrato", value: filterTipoContrato, onChange: setFilterTipoContrato, placeholder: "Todos los tipos", options: tipoContratoOptions },
              { label: "Estado de contrato", value: filterEstadoContrato, onChange: setFilterEstadoContrato, placeholder: "Todos los estados", options: estadoContratoOptions, renderOption: (opt: { label: string }) => <EstadoBadge name={opt.label} /> },
              { label: "Reemplazo", value: filterReemplazo, onChange: setFilterReemplazo, placeholder: "Con y sin reemplazo", options: [{ value: "con", label: "Con reemplazo" }, { value: "sin", label: "Sin reemplazo" }] },
            ]}
          />
        </div>
        {isLarge && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setViewMode("cards")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "cards" ? "bg-blue-500 text-white border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas">
              <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode("table")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "table" ? "bg-blue-500 text-white border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla">
              <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Filtro de Empresa Contrato como tabs — solo en Alta temprana de AFIP (en Constancia de CUIT no aplica). */}
      {filterTipo === "alta_temprana_afip" && empresaOptions.length > 0 && (
        <div className="flex items-center border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          <span className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap shrink-0">Empresa Contrato:</span>
          <button onClick={() => setFilterEmpresaId("")} className={empresaTabClass(filterEmpresaId === "")}>
            Todas
          </button>
          {empresaOptions.map((e) => (
            <button key={e.value} onClick={() => setFilterEmpresaId(e.value)} className={empresaTabClass(filterEmpresaId === e.value)}>
              {e.label}
            </button>
          ))}
        </div>
      )}

      {/* Barra de completitud + acción, en la misma línea. El TXT solo aplica a Alta temprana de AFIP. */}
      {filterTipo === "alta_temprana_afip" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200/60 dark:border-green-800/60" title="Contratos con todos los datos AFIP cargados">
              <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
              {countCompletos} completos
            </span>
            <button
              onClick={() => setSoloIncompletos((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${
                soloIncompletos
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/30"
              }`}
              title="Mostrar solo los contratos con datos AFIP faltantes"
            >
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
              {countIncompletos} incompletos
            </button>
          </div>
          <div className="flex items-center gap-3">
            {seleccionados.length > 0 && <span className="text-xs text-gray-500 dark:text-gray-400">{seleccionados.length} seleccionado(s)</span>}
            <button
              onClick={() => generarTxt(fuenteTxt, nombreArchivoTxt)}
              disabled={fuenteTxt.every((x) => !x.result.completo)}
              title={seleccionados.length > 0 ? "Generar el TXT con los contratos seleccionados (solo los completos)" : "Generar el TXT con los contratos completos del listado (o marcá algunos con el check)"}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <FontAwesomeIcon icon={faFileLines} className="h-4 w-4" />
              Generar TXT Masivo (AFIP){seleccionados.length > 0 ? ` (${seleccionados.length})` : ""}
            </button>
            <button type="button" onClick={() => setFlujoTxtInfoOpen(true)} title="Qué hacer con el TXT" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 shrink-0">
              <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
            </button>
            <button
              onClick={() => window.open("https://www.arca.gob.ar", "_blank", "noopener,noreferrer")}
              title="Abrir ARCA para subir el TXT ya generado"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shrink-0"
            >
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-4 w-4" />
              Cargar en ARCA
            </button>
            <button type="button" onClick={() => setCargarArcaInfoOpen(true)} title="Qué hacer en ARCA" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
              <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Constancia de CUIT: worklist (qué falta pedirle a ARCA). */}
      {filterTipo === "constancia_cuit" && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200/60 dark:border-green-800/60" title="Constancias cargadas y todavía vigentes">
              <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
              {countConstVigentes} vigentes
            </span>
            <button
              onClick={() => setSoloPendientes((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${
                soloPendientes
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/30"
              }`}
              title="Mostrar solo las constancias que faltan o ya vencieron"
            >
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
              {countConstPendientes} pendientes
            </button>
          </div>
          <BotonConsultarAfipBulk rows={seleccionados.length > 0 ? seleccionados.map((x) => x.row) : constanciaRows.map((x) => x.row)} onConsultado={load} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner message="Cargando contratos..." />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={faFileInvoiceDollar}
          title="Sin contratos impositivos"
          description={
            impositivoRows.length === 0
              ? "Ningún contrato tiene hoy un estado impositivo (Alta temprana de AFIP o Constancia de CUIT). Asigná uno de esos estados en el contrato del miembro."
              : "No hay resultados con los filtros aplicados."
          }
        />
      ) : effectiveViewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(({ row: r, result }) => {
            const cuil = fmtCuit(r.cuit);
            return (
              <div key={`${r._id}-${r.contractIndex}`} className={`bg-white dark:bg-gray-800 rounded-xl border p-4 flex flex-col gap-3 ${selected.has(rowKey(r)) ? "border-emerald-400 dark:border-emerald-700" : "border-gray-200 dark:border-gray-700"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selected.has(rowKey(r))}
                      disabled={!esSeleccionable(r, result)}
                      onChange={() => toggleSel(rowKey(r))}
                      title={esSeleccionable(r, result) ? (filterTipo === "constancia_cuit" ? "Incluir en Validar ARCA Masivo" : "Incluir esta persona en el TXT") : filterTipo === "constancia_cuit" ? "Falta el CUIT/CUIL de esta persona" : "Faltan datos AFIP: no se puede incluir en el TXT"}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    />
                    <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{r.userName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.userEmail}</p>
                      {fmtCuit(r.cuit) && <p className="text-[10px] text-gray-400 font-mono truncate">CUIT {fmtCuit(r.cuit)}</p>}
                    </div>
                  </div>
                  {r.nombre_estado_empleado && <EstadoBadge name={r.nombre_estado_empleado} className="shrink-0 text-[10px]" />}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-100 dark:border-gray-700/60">
                  <div className="min-w-0">
                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest">Cliente</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate block">{r.clientName || "—"}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest">Proyecto</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate block">{r.projectName || "—"}</span>
                  </div>
                  <div className="min-w-0 col-span-2">
                    <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest">Contrato</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate block">{r.nombre_contrato || "—"}</span>
                  </div>
                </div>

                {r._tipo && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap w-fit ${
                      r._tipo === "alta_temprana_afip"
                        ? "bg-purple-600 text-white border-purple-600 dark:bg-purple-500 dark:border-purple-500"
                        : "bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700"
                    }`}
                  >
                    <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" />
                    {TIPO_LABEL[r._tipo]}
                  </span>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/60">
                  {filterTipo === "constancia_cuit" && (
                    <>
                      <button
                        onClick={() => setConstancia({ row: r, cuil })}
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${cuil ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100" : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100"}`}
                      >
                        <FontAwesomeIcon icon={cuil ? faCheck : faTriangleExclamation} className="h-2.5 w-2.5" />
                        CUIT/CUIL: {cuil ? "OK" : "Falta 1"}
                      </button>
                      <ConstanciaBadge row={r} />
                      <BotonValidarCuit row={r} onConsultado={load} compacto />
                      {constanciaPendiente(r) && <BotonArca cuit={r.cuit} compacto />}
                    </>
                  )}
                  {filterTipo === "alta_temprana_afip" && (
                    <button
                      onClick={() => setDetalle({ row: r, result })}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${result.completo ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100" : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100"}`}
                    >
                      <FontAwesomeIcon icon={result.completo ? faCheck : faTriangleExclamation} className="h-2.5 w-2.5" />
                      AFIP: {result.completo ? "Completo" : `Faltan ${result.faltantes}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar max-h-[640px]">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[1950px]">
              <thead className="sticky top-0 z-40 bg-gray-50 dark:bg-gray-900 shadow-sm">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="sticky top-0 left-0 z-50 px-4 py-3 w-12 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
                    <input
                      type="checkbox"
                      checked={allSel}
                      onChange={toggleAll}
                      disabled={selectableFiltered.length === 0}
                      title={filterTipo === "constancia_cuit" ? "Seleccionar todos los que tienen CUIT/CUIL cargado" : "Seleccionar todos los completos"}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </th>
                  <th className="sticky top-0 left-12 z-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 border-r-2 border-gray-300 dark:border-gray-600 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)]">
                    Acciones
                  </th>
                  {filterTipo === "constancia_cuit" && (
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        Verificar (Opc)
                        <button type="button" onClick={() => setVerificarInfoOpen(true)} title="Qué hace esta columna" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 normal-case tracking-normal font-normal shrink-0">
                          <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                        </button>
                      </span>
                    </th>
                  )}
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Alta / Baja</th>
                  {filterTipo === "constancia_cuit" && (
                    <>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          Datos CUIT/CUIL
                          <button type="button" onClick={() => setDatosCuitInfoOpen(true)} title="Por qué a veces no se puede validar" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 normal-case tracking-normal font-normal shrink-0">
                            <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                          </button>
                        </span>
                      </th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap" title="Estado en el Padrón de AFIP/ARCA">ARCA</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap" title="Si la constancia quedó archivada en Dropbox">DROPBOX</th>
                    </>
                  )}
                  {filterTipo === "alta_temprana_afip" && (
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        Datos AFIP
                        <button type="button" onClick={() => setDatosAfipInfoOpen(true)} title="Por qué a veces no se puede generar el TXT" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 normal-case tracking-normal font-normal shrink-0">
                          <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                        </button>
                      </span>
                    </th>
                  )}
                  <ContractDocsHeaders showContrato={false} showRelease={false} altaLabel={filterTipo === "alta_temprana_afip" ? "Alta AFIP" : "Alta Servicios"} />
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">CUIT</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      Empresa Contrato
                      {filterTipo === "alta_temprana_afip" && (
                        <>
                          <span className="text-red-500">*</span>
                          <button type="button" onClick={() => setEmpresaContratoInfoOpen(true)} title="Por qué es obligatoria" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 normal-case tracking-normal font-normal shrink-0">
                            <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </span>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Empresa Release</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Proyecto</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Estado</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Estado Impositivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map(({ row: r, result }) => (
                  <tr key={`${r._id}-${r.contractIndex}`} className={`group hover:bg-gray-50 dark:hover:bg-gray-900/20 ${selected.has(rowKey(r)) ? "bg-emerald-50/50 dark:bg-emerald-900/10" : ""}`}>
                    <td className={`sticky left-0 z-20 px-4 py-3 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-[#1c2634] border-r border-gray-200 dark:border-gray-700 ${selected.has(rowKey(r)) ? "!bg-[#f6fefa] dark:!bg-[#1d2d37]" : ""}`}>
                      <input
                        type="checkbox"
                        checked={selected.has(rowKey(r))}
                        disabled={!esSeleccionable(r, result)}
                        onChange={() => toggleSel(rowKey(r))}
                        title={esSeleccionable(r, result) ? (filterTipo === "constancia_cuit" ? "Incluir en Validar ARCA Masivo" : "Incluir esta persona en el TXT") : filterTipo === "constancia_cuit" ? "Falta el CUIT/CUIL de esta persona" : "Faltan datos AFIP: no se puede incluir en el TXT"}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td
                      className={`sticky left-12 z-20 px-4 py-3 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-[#1c2634] border-r-2 border-gray-300 dark:border-gray-600 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)] ${selected.has(rowKey(r)) ? "!bg-[#f6fefa] dark:!bg-[#1d2d37]" : ""}`}
                    >
                      {filterTipo === "alta_temprana_afip" ? (
                        <button
                          type="button"
                          onClick={() => generarTxt([{ row: r, result }], `alta_afip_${r.userName.replace(/\s+/g, "_")}`)}
                          disabled={!result.completo}
                          title={result.completo ? "Generar el TXT de AFIP de esta persona" : !r.empresaContratoId ? "Elegí la Empresa del contrato para poder generar el TXT" : "Faltan datos AFIP para generar el TXT de esta persona"}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                            result.completo ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                          }`}
                        >
                          <FontAwesomeIcon icon={faFileLines} className="h-3 w-3" />
                          Generar TXT
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <BotonValidarCuit row={r} onConsultado={load} compacto />
                        </div>
                      )}
                    </td>
                    {filterTipo === "constancia_cuit" && (
                      <td className="px-4 py-3">{constanciaPendiente(r) ? <BotonArca cuit={r.cuit} compacto /> : <span className="text-xs text-gray-400">—</span>}</td>
                    )}
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-500 whitespace-nowrap">
                      {(() => {
                        const vigente = isContractVigente(r.fecha_alta_contrato, r.fecha_baja_contrato);
                        return (
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit ${vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{vigente ? "VIGENTE" : "NO VIGENTE"}</span>
                            <div className="flex flex-col gap-0.5 text-xs">
                              <span>
                                <span className="text-gray-400">Alta:</span> {formatDate(r.fecha_alta_contrato)}
                              </span>
                              <span>
                                <span className="text-gray-400">Baja:</span> {r.fecha_baja_contrato ? formatDate(r.fecha_baja_contrato) : "—"}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    {filterTipo === "constancia_cuit" && (
                      <>
                        <td className="px-4 py-3">
                          {(() => {
                            const cuil = fmtCuit(r.cuit);
                            return (
                              <button
                                onClick={() => setConstancia({ row: r, cuil })}
                                title="Ver los datos necesarios para buscar la Constancia de CUIT/CUIL en ARCA"
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap transition-colors ${
                                  cuil
                                    ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100"
                                    : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100"
                                }`}
                              >
                                <FontAwesomeIcon icon={cuil ? faCheck : faTriangleExclamation} className="h-2.5 w-2.5" />
                                {cuil ? "Completo" : "Falta 1"}
                              </button>
                            );
                          })()}
                        </td>
                        {/* Estado en AFIP/ARCA y archivado en Dropbox, por separado (acciones — Validar/ARCA — viven en la columna sticky "Acciones"). */}
                        <td className="px-4 py-3">
                          <ArcaBadge row={r} />
                        </td>
                        <td className="px-4 py-3">
                          <DropboxBadge row={r} />
                        </td>
                      </>
                    )}
                    {filterTipo === "alta_temprana_afip" && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDetalle({ row: r, result })}
                          title="Ver detalle de los datos AFIP"
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap transition-colors ${
                            result.completo
                              ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100"
                          }`}
                        >
                          <FontAwesomeIcon icon={result.completo ? faCheck : faTriangleExclamation} className="h-2.5 w-2.5" />
                          {result.completo ? "Completo" : `Faltan ${result.faltantes}`}
                        </button>
                      </td>
                    )}
                    <ContractDocsColumns
                      record={r}
                      contratoFrames={contratoFrames}
                      allEstados={allEstados}
                      activeReleases={activeReleases}
                      onDownloadContract={handleDownloadContract}
                      onDownloadRelease={handleDownloadRelease}
                      onUploadAlta={handleUploadAlta}
                      showContrato={false}
                      showRelease={false}
                      hideAltaLabel
                    />
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{r.userName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.userEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap font-mono">{fmtCuit(r.cuit) || "—"}</td>
                    {filterTipo === "alta_temprana_afip" && (
                      <>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <EmpresaSelectCell record={r} campo="contrato" requerido onGuardado={load} />
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <EmpresaSelectCell record={r} campo="release" requerido={false} onGuardado={load} />
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.clientName || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.projectName || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.nombre_contrato || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <EstadoBadge name={r._estadoName} />
                        {r._tipo ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${
                              r._tipo === "alta_temprana_afip"
                                ? "bg-purple-600 text-white border-purple-600 dark:bg-purple-500 dark:border-purple-500"
                                : "bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700"
                            }`}
                          >
                            <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" />
                            {TIPO_LABEL[r._tipo]}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">Sin trámite definido</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <EstadoImpositivoCell record={r} contratoFrames={contratoFrames} allEstados={allEstados} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detalle && (
        <Modal
          isOpen={!!detalle}
          onClose={() => setDetalle(null)}
          title={`Datos AFIP — ${detalle.row.userName}`}
          subtitle={`${detalle.row.projectName} · ${detalle.row.nombre_contrato}`}
          size="md"
          zIndex={70}
          footer={
            <div className="flex items-center justify-between gap-3 w-full">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{detalle.result.completo ? "Podés generar el alta de esta persona." : "Completá los faltantes para poder generar el TXT."}</span>
              <button
                onClick={() => generarTxt([detalle], `alta_afip_${detalle.row.userName.replace(/\s+/g, "_")}`)}
                disabled={!detalle.result.completo}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <FontAwesomeIcon icon={faFileLines} />
                Descargar TXT de esta persona
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                detalle.result.completo
                  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
              }`}
            >
              <FontAwesomeIcon icon={detalle.result.completo ? faCheck : faTriangleExclamation} />
              {detalle.result.completo ? "Listo para la carga masiva: todos los datos están cargados." : `Faltan ${detalle.result.faltantes} dato(s) para poder generar el TXT.`}
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {detalle.result.checks.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 min-w-0">
                    <FontAwesomeIcon icon={c.ok ? faCheck : faXmark} className={`h-3.5 w-3.5 shrink-0 ${c.ok ? "text-green-500" : "text-red-500"}`} />
                    <span className="truncate">{c.label}</span>
                  </span>
                  {c.ok ? (
                    <span className="text-sm font-mono text-gray-600 dark:text-gray-300 shrink-0">{c.value}</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-red-600 dark:text-red-400 shrink-0">Falta</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Los códigos salen de: Tipo de Contrato (modalidad, tipo de servicio, actividad, liquidación), Categoría SAT (categoría profesional y sueldo bruto), Obra Social (RNOS), Sede (sucursal) y los datos personales (CUIL).
            </p>
          </div>
        </Modal>
      )}

      {constancia && (
        <Modal
          isOpen={!!constancia}
          onClose={() => setConstancia(null)}
          title={`Constancia de CUIT/CUIL — ${constancia.row.userName}`}
          subtitle={`${constancia.row.projectName} · ${constancia.row.nombre_contrato}`}
          size="sm"
          zIndex={70}
          footer={
            <div className="flex items-center justify-between gap-3 w-full">
              <ConstanciaBadge row={constancia.row} />
              <BotonArca cuit={constancia.row.cuit} />
            </div>
          }
        >
          <div className="space-y-3">
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                constancia.cuil
                  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
              }`}
            >
              <FontAwesomeIcon icon={constancia.cuil ? faCheck : faTriangleExclamation} />
              {constancia.cuil ? "Listo para buscar la constancia en ARCA." : "Falta 1 dato para buscar la constancia."}
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <li className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 min-w-0">
                  <FontAwesomeIcon icon={constancia.cuil ? faCheck : faXmark} className={`h-3.5 w-3.5 shrink-0 ${constancia.cuil ? "text-green-500" : "text-red-500"}`} />
                  <span className="truncate">CUIT / CUIL</span>
                </span>
                {constancia.cuil ? (
                  <span className="text-sm font-mono text-gray-600 dark:text-gray-300 shrink-0">{constancia.cuil}</span>
                ) : (
                  <span className="text-[11px] font-semibold text-red-600 dark:text-red-400 shrink-0">Falta</span>
                )}
              </li>
            </ul>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Para obtener la <strong>Constancia de Inscripción / CUIT</strong> en ARCA se ingresa el <strong>CUIT/CUIL</strong> de la persona (es el único dato requerido). Si falta, cargalo en los datos personales del usuario.
            </p>
          </div>
        </Modal>
      )}

      {verificarInfoOpen && (
        <Modal isOpen={verificarInfoOpen} onClose={() => setVerificarInfoOpen(false)} title="Verificar (Opc)" size="sm" zIndex={80}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              Botón opcional para cotejar la constancia contra el original en el portal de AFIP/ARCA, además de la consulta automática al Padrón que ya hace "Validar".
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1.5 list-disc list-inside">
              <li>Copia el CUIT/CUIL de la persona al portapapeles.</li>
              <li>Abre el portal de ARCA en una pestaña nueva, listo para pegarlo.</li>
              <li>Solo aparece cuando la constancia está pendiente (falta, venció, o no se pudo archivar).</li>
            </ul>
          </div>
        </Modal>
      )}

      {cargarArcaInfoOpen && (
        <Modal isOpen={cargarArcaInfoOpen} onClose={() => setCargarArcaInfoOpen(false)} title="Cargar en ARCA" size="sm" zIndex={80}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">Este botón redirige a la página de AFIP/ARCA. Una vez ahí:</p>
            <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-2 list-decimal list-inside">
              <li>
                Iniciar sesión con Clave Fiscal en <span className="font-mono text-xs">https://www.arca.gob.ar</span> (dominio oficial actual — es el portal <span className="font-mono text-xs">afip.gob.ar</span> renombrado; si ya tenés abierto{" "}
                <span className="font-mono text-xs">portalcf.cloud.afip.gob.ar/portal/app/</span>, es el mismo portal de acceso).
              </li>
              <li>
                Una vez dentro, abrir el servicio <strong>"Simplificación Registral - Empleadores"</strong>.
              </li>
              <li>
                Ir a <strong>Relaciones Laborales → Carga masiva</strong>, donde se sube el archivo TXT con el formato de campos requerido.
              </li>
            </ol>
          </div>
        </Modal>
      )}

      {flujoTxtInfoOpen && (
        <Modal isOpen={flujoTxtInfoOpen} onClose={() => setFlujoTxtInfoOpen(false)} title="Qué hacer con el TXT" size="sm" zIndex={80}>
          <div className="space-y-3">
            <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-2 list-decimal list-inside">
              <li>
                <strong>Generar TXT Masivo (AFIP)</strong>: descarga el archivo TXT con las altas completas, listo para importar.
              </li>
              <li>
                <strong>Cargar en ARCA</strong>: abre el portal de AFIP/ARCA para importar ese TXT y generar las altas.
              </li>
              <li>
                Cuando AFIP sincronice las altas, se guardarán automáticamente en la carpeta de Dropbox <span className="font-mono text-xs">FZERO S.R.L/AFIP/Alta temprana de Afip</span> y los contratos van a aparecer en la bandeja <strong>Firma Digital</strong>.
              </li>
            </ol>
          </div>
        </Modal>
      )}

      {datosAfipInfoOpen && (
        <Modal isOpen={datosAfipInfoOpen} onClose={() => setDatosAfipInfoOpen(false)} title="Datos AFIP" size="sm" zIndex={80}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              El TXT de Alta temprana necesita un conjunto fijo de códigos por persona. Si a alguno le "Faltan N", significa que esos códigos no se pudieron armar todavía — y por eso ese contrato queda afuera del TXT hasta completarlos.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">Los códigos salen de:</p>
            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1.5 list-disc list-inside">
              <li>
                <strong>Tipo de Contrato</strong>: modalidad, tipo de servicio, actividad y modalidad de liquidación.
              </li>
              <li>
                <strong>Categoría SAT</strong>: categoría profesional y sueldo bruto.
              </li>
              <li>
                <strong>Obra Social</strong>: código RNOS.
              </li>
              <li>
                <strong>Sede</strong>: código de sucursal.
              </li>
              <li>
                <strong>Datos personales</strong>: CUIL.
              </li>
              <li>
                <strong>Empresa del Contrato</strong>: se elige en la columna "Empresa" — un mismo TXT se sube a la sesión de ARCA de una sola empresa, así que hace falta saber a cuál corresponde cada contrato.
              </li>
            </ul>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Tocá el badge "Faltan N" de una fila para ver exactamente cuáles faltan.</p>
          </div>
        </Modal>
      )}

      {datosCuitInfoOpen && (
        <Modal isOpen={datosCuitInfoOpen} onClose={() => setDatosCuitInfoOpen(false)} title="Datos CUIT/CUIL" size="sm" zIndex={80}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              Es el CUIT/CUIL de la persona, cargado en sus datos personales — el único dato que hace falta para buscar la Constancia de Inscripción en ARCA.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Si dice <strong>"Falta 1"</strong> es porque ese usuario todavía no tiene el CUIT/CUIL cargado. Hasta que se cargue, esa fila no se puede tildar y los botones <strong>"Validar"</strong> y <strong>"Validar ARCA Masivo"</strong> quedan deshabilitados para esa persona (no hay CUIT que consultar en el Padrón de AFIP).
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Cargá el CUIT/CUIL en los datos personales del usuario para poder validarlo.</p>
          </div>
        </Modal>
      )}

      {empresaContratoInfoOpen && (
        <Modal isOpen={empresaContratoInfoOpen} onClose={() => setEmpresaContratoInfoOpen(false)} title="Empresa Contrato" size="sm" zIndex={80}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              Es obligatoria porque un mismo TXT se sube a la sesión de ARCA de <strong>una sola empresa</strong>: sin saber a cuál corresponde cada contrato, no se puede armar el archivo (por eso las filas sin Empresa Contrato quedan afuera del TXT hasta que se elija una).
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              La Alta temprana de AFIP se genera con la <strong>misma empresa</strong> que la elegida acá como Empresa del Contrato — no hace falta volver a elegirla en otro lado.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};

/** Mismo dropdown que `DownloadMenu` (ContractCard.tsx) pero para la acción "Generar" (paso 1): no
 *  descarga nada, solo dispara `onGenerar(empresaId)` — el PDF queda guardado en el server. */
const GenerarMenu: React.FC<{ empresas: EmpresaOption[]; onGenerar: (empresaId?: string) => void; generando: boolean; label?: string }> = ({ empresas, onGenerar, generando, label = "Generar" }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const btnClass = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait transition-colors shrink-0 whitespace-nowrap";

  if (empresas.length <= 1) {
    return (
      <button type="button" onClick={() => onGenerar(empresas[0]?.id)} disabled={generando} title={label} className={btnClass}>
        <FontAwesomeIcon icon={generando ? faSpinner : faFileSignature} spin={generando} className="h-3 w-3" />
        {label}
      </button>
    );
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={generando} title="Elegir empresa para generar" className={btnClass}>
        <FontAwesomeIcon icon={generando ? faSpinner : faFileSignature} spin={generando} className="h-3 w-3" />
        {label}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
          <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Generar con:</p>
          {empresas.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                setOpen(false);
                onGenerar(e.id);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Si el contrato ya tiene todo lo que se puede generar de este tipo — usado para decidir si la fila
 *  se puede seleccionar para "Enviar a firmar" (hacen falta AMBOS: contrato y release(s), de los que
 *  efectivamente apliquen — ver `contratoRequiereFirma`/`releaseRequiereFirma` más abajo). */
const contratoGenerado = (r: ContractOverviewRow): boolean => !!r.firmaGeneradoAt;
const releasesGenerados = (r: ContractOverviewRow, releasesAplicables: Release[]): boolean => releasesAplicables.length === 0 || !!r.firmaReleasesGeneradoAt;

/** Si el Tipo de Contrato de la plantilla (populado en `template.contratoId`) tiene tildado "Se envía
 *  a firmar" — sin el dato poblado, se asume que sí (comportamiento previo a que existiera el campo). */
const contratoRequiereFirma = (template: ContratoFrameItem | null): boolean => {
  const contratoId = template?.contratoId;
  return typeof contratoId === "object" && contratoId ? contratoId.data?.requiereFirma !== false : true;
};

/** Mismo criterio que `contratoRequiereFirma`, para el Tipo de Release (`release.releaseTipoId`). */
const releaseRequiereFirma = (release: Release): boolean => {
  const tipo = release.releaseTipoId;
  return typeof tipo === "object" && tipo ? tipo.requiereFirma !== false : true;
};

/**
 * Si la fila tiene ALGO para enviar a firmar (el Contrato y/o el/los Release(s) que efectivamente
 * apliquen, según "Se envía a firmar") y ya está listo — es decir, generado lo que aplica y todavía
 * no enviado. Si NI el Contrato NI ningún Release de este contrato requieren firma, no hay nada que
 * mandar y la fila nunca se habilita.
 */
const calcularEnviable = (record: ContractOverviewRow, contratoFrames: ContratoFrameItem[], releasesAplicables: Release[]): boolean => {
  if (record.firmaEnviadaAt) return false;
  const template = findTemplate(record as unknown as Contract, contratoFrames);
  const contratoAplica = contratoRequiereFirma(template);
  const contratoOk = !contratoAplica || contratoGenerado(record);
  const releaseOk = releasesAplicables.length === 0 || releasesGenerados(record, releasesAplicables);
  const algoAplica = contratoAplica || releasesAplicables.length > 0;
  return algoAplica && contratoOk && releaseOk;
};

/**
 * Celda "Contrato" de la pestaña Firma digital: botón "Generar" independiente (con menú de empresa si
 * el proyecto tiene más de una) → una vez generado, ícono de PDF (ver) + descargar para revisar el PDF
 * antes de mandarlo a firmar (el envío en sí es la acción bulk "Enviar a firmar", habilitada recién
 * cuando también se generó el/los release(s) — ver `FirmaReleaseCell`). El estado "Enviado" se
 * muestra acá.
 */
const FirmaContratoCell: React.FC<{
  record: ContractOverviewRow;
  contratoFrames: ContratoFrameItem[];
  allEstados: InfoItem[];
  onGenerado: () => void;
}> = ({ record, contratoFrames, allEstados, onGenerado }) => {
  const [generando, setGenerando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const template = findTemplate(record as unknown as Contract, contratoFrames);
  const puedeGenerar = templateHasContent(template);
  const requiereFirma = contratoRequiereFirma(template);
  const tramite = estadoImpositivoDelContrato(record as unknown as Contract, contratoFrames, allEstados)?.data?.tipoImpositivo as TipoImpositivo | undefined;

  const savedContratoEmpresaId = record.empresaContratoId || "";
  const contratoEmpresas = record.contratoEmpresas || [];
  const empresasParaGenerar: EmpresaOption[] = savedContratoEmpresaId
    ? [{ id: savedContratoEmpresaId, label: record.nombre_empresa_contrato || contratoEmpresas.find((e) => e.id === savedContratoEmpresaId)?.label || savedContratoEmpresaId }]
    : contratoEmpresas;

  const generar = async (empresaId?: string) => {
    if (!template) return;
    setGenerando(true);
    try {
      await firmaDigitalAPI.generarContrato({
        projectId: record.projectId,
        userId: record.userId,
        contractIndex: record.contractIndex,
        contratoTemplateId: template._id,
        empresaContratoId: empresaId,
        tramite,
      });
      onGenerado();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo generar el contrato.");
    } finally {
      setGenerando(false);
    }
  };

  const descargar = async () => {
    if (!record.firmaContratoUrl) return;
    setDescargando(true);
    try {
      await downloadFileFromUrl(record.firmaContratoUrl, record.firmaContratoNombre || "Contrato.pdf");
    } catch {
      sweetAlert.error("Error", "No se pudo descargar el contrato.");
    } finally {
      setDescargando(false);
    }
  };

  const eliminar = async () => {
    const confirm = await sweetAlert.confirm("Eliminar contrato generado", "Se borra el PDF generado y se puede volver a generar (por ejemplo, para elegir otra empresa). Esto no afecta nada ya enviado a firmar.", "Sí, eliminar", "Cancelar");
    if (!confirm.isConfirmed) return;
    setEliminando(true);
    try {
      await firmaDigitalAPI.eliminarContrato({ projectId: record.projectId, userId: record.userId, contractIndex: record.contractIndex });
      onGenerado();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo eliminar el contrato.");
    } finally {
      setEliminando(false);
    }
  };

  if (!contratoGenerado(record)) {
    return (
      <div className="flex items-center justify-center min-w-[120px]" onClick={(e) => e.stopPropagation()}>
        {!requiereFirma ? (
          <span className="text-xs text-gray-400" title="Este Tipo de Contrato no tiene tildado &quot;Se envía a firmar&quot;">
            No se envía a Firma
          </span>
        ) : puedeGenerar ? (
          <GenerarMenu empresas={empresasParaGenerar} onGenerar={generar} generando={generando} label="Generar Contrato" />
        ) : (
          <span className="text-xs text-gray-400" title="La plantilla de este tipo de contrato no tiene contenido redactado">
            Sin plantilla
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 min-w-[120px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-center gap-3">
        <a href={getImageUrl(record.firmaContratoUrl)} target="_blank" rel="noopener noreferrer" title={record.firmaContratoNombre || "Ver Contrato"} className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
          <FontAwesomeIcon icon={faFilePdf} className="h-6 w-6 text-violet-600" />
        </a>
        <button
          type="button"
          onClick={descargar}
          disabled={descargando}
          title="Descargar contrato"
          className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FontAwesomeIcon icon={descargando ? faSpinner : faDownload} spin={descargando} className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={eliminar}
          disabled={eliminando}
          title="Eliminar y volver a generar"
          className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FontAwesomeIcon icon={eliminando ? faSpinner : faTrash} spin={eliminando} className="h-4 w-4" />
        </button>
      </div>
      {record.firmaEnviadaAt && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 whitespace-nowrap w-fit">
          <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5" />
          Enviado
        </span>
      )}
    </div>
  );
};

/**
 * Celda "Release" de la pestaña Firma digital: botón "Generar" independiente (mismo patrón que
 * Contrato, con menú de empresa si aplica) → una vez generados, ícono de PDF (ver) + descargar por
 * cada release activo.
 */
const FirmaReleaseCell: React.FC<{
  record: ContractOverviewRow;
  contratoFrames: ContratoFrameItem[];
  allEstados: InfoItem[];
  /** Todos los releases activos del proyecto (para saber si hay alguno, más allá de si aplican). */
  activeReleases: Release[];
  /** Solo los releases activos cuyo Tipo tiene tildado "Se envía a firmar". */
  releasesAplicables: Release[];
  onGenerado: () => void;
}> = ({ record, contratoFrames, allEstados, activeReleases, releasesAplicables, onGenerado }) => {
  const [generando, setGenerando] = useState(false);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const firmaReleases = record.firmaReleases || [];
  const tramite = estadoImpositivoDelContrato(record as unknown as Contract, contratoFrames, allEstados)?.data?.tipoImpositivo as TipoImpositivo | undefined;

  const savedReleaseEmpresaId = record.empresaReleaseId || "";
  const releaseEmpresas = record.releaseEmpresas || [];
  const empresasParaGenerar: EmpresaOption[] = savedReleaseEmpresaId
    ? [{ id: savedReleaseEmpresaId, label: record.nombre_empresa_release || releaseEmpresas.find((e) => e.id === savedReleaseEmpresaId)?.label || savedReleaseEmpresaId }]
    : releaseEmpresas;

  const generar = async (empresaId?: string) => {
    setGenerando(true);
    try {
      await firmaDigitalAPI.generarRelease({
        projectId: record.projectId,
        userId: record.userId,
        contractIndex: record.contractIndex,
        releaseIds: releasesAplicables.map((r) => r._id),
        empresaReleaseId: empresaId,
        tramite,
      });
      onGenerado();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudieron generar los release(s).");
    } finally {
      setGenerando(false);
    }
  };

  const descargar = async (url: string, nombre: string) => {
    setDescargando(url);
    try {
      await downloadFileFromUrl(url, nombre);
    } catch {
      sweetAlert.error("Error", "No se pudo descargar el release.");
    } finally {
      setDescargando(null);
    }
  };

  const eliminar = async () => {
    const confirm = await sweetAlert.confirm("Eliminar release(s) generados", "Se borran los PDFs generados (todos juntos, se generan como grupo) y se puede volver a generar. Esto no afecta nada ya enviado a firmar.", "Sí, eliminar", "Cancelar");
    if (!confirm.isConfirmed) return;
    setEliminando(true);
    try {
      await firmaDigitalAPI.eliminarRelease({ projectId: record.projectId, userId: record.userId, contractIndex: record.contractIndex });
      onGenerado();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudieron eliminar los release(s).");
    } finally {
      setEliminando(false);
    }
  };

  if (activeReleases.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  if (releasesAplicables.length === 0) {
    return (
      <span className="text-xs text-gray-400" title="Ningún Tipo de Release de este proyecto tiene tildado &quot;Se envía a firmar&quot;">
        No se envía a Firma
      </span>
    );
  }

  if (!releasesGenerados(record, releasesAplicables)) {
    return (
      <div className="flex items-center justify-center min-w-[120px]" onClick={(e) => e.stopPropagation()}>
        <GenerarMenu empresas={empresasParaGenerar} onGenerar={generar} generando={generando} label="Generar Release" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 min-w-[150px]" onClick={(e) => e.stopPropagation()}>
      {firmaReleases.map((r) => {
        const label = activeReleases.find((ar) => ar._id === r.releaseId)?.name || "Release";
        return (
          <div key={r.releaseId} className="flex items-center justify-center gap-3">
            <a href={getImageUrl(r.url)} target="_blank" rel="noopener noreferrer" title={r.nombre} className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
              <FontAwesomeIcon icon={faFilePdf} className="h-6 w-6 text-violet-600" />
            </a>
            <button
              type="button"
              onClick={() => descargar(r.url, r.nombre)}
              disabled={descargando === r.url}
              title={`Descargar ${label}`}
              className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={descargando === r.url ? faSpinner : faDownload} spin={descargando === r.url} className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={eliminar}
              disabled={eliminando}
              title="Eliminar y volver a generar"
              className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={eliminando ? faSpinner : faTrash} spin={eliminando} className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Celda "Acciones" de la pestaña Firma digital: "Enviar a firmar" individual, por fila — mismo
 * criterio de habilitación que la selección para el envío masivo (lo que efectivamente aplique según
 * "Se envía a firmar" — Contrato y/o Release(s) — generado, todavía no enviado). Una vez enviado,
 * muestra el mismo badge "Enviado" que ya se ve en la celda de Contrato.
 */
const FirmaEnviarCell: React.FC<{
  record: ContractOverviewRow;
  contratoAplica: boolean;
  releasesAplicables: Release[];
  tipoImpositivo?: TipoImpositivo;
  onEnviado: () => void;
}> = ({ record, contratoAplica, releasesAplicables, tipoImpositivo, onEnviado }) => {
  const [enviando, setEnviando] = useState(false);
  const contratoOk = !contratoAplica || contratoGenerado(record);
  const releaseOk = releasesAplicables.length === 0 || releasesGenerados(record, releasesAplicables);
  const puedeEnviar = (contratoAplica || releasesAplicables.length > 0) && contratoOk && releaseOk && !record.firmaEnviadaAt;

  const enviar = async () => {
    const confirm = await sweetAlert.confirm(
      "Enviar a firmar",
      'Se van a subir el Contrato y el/los Release(s) de esta persona a la carpeta "Outbox" de Dropbox para que Dropbox Sign los importe. ¿Continuar?',
      "Sí, enviar",
      "Cancelar"
    );
    if (!confirm.isConfirmed) return;
    setEnviando(true);
    try {
      const res = await firmaDigitalAPI.enviar([{ projectId: record.projectId, userId: record.userId, contractIndex: record.contractIndex, tipoImpositivo, incluirContrato: contratoAplica }]);
      const resultado = res.resultados[0];
      if (resultado && !resultado.ok) {
        sweetAlert.error("No se pudo enviar", resultado.error || "Error desconocido.");
      } else {
        sweetAlert.success("Enviado", "Se envió a firmar correctamente.");
      }
      onEnviado();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo enviar a firmar.");
    } finally {
      setEnviando(false);
    }
  };

  if (record.firmaEnviadaAt) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 whitespace-nowrap">
        <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5" />
        Enviado
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={enviar}
      disabled={!puedeEnviar || enviando}
      title={puedeEnviar ? "Enviar a firmar esta persona" : "Generá primero el Contrato y el/los Release(s)"}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
    >
      <FontAwesomeIcon icon={enviando ? faSpinner : faPaperPlane} spin={enviando} className="h-3 w-3" />
      Enviar a firmar
    </button>
  );
};

/**
 * Sub-pestaña "Firma digital": lista los contratos que ya terminaron su trámite impositivo (Alta
 * temprana de AFIP archivada, o Constancia de CUIT archivada — el cron de Dropbox ya los movió solo
 * al estado "Envío de documentación", ver `estadoDropboxCronService.ts`). Flujo en dos pasos:
 * 1) "Generar" arma el Contrato + Release(s) y los deja para revisar (ojito) — no envía nada.
 * 2) "Enviar a firmar" (bulk, o individual desde la columna "Acciones") sube los ya generados a la
 *    carpeta Dropbox "Outbox" que vigila Dropbox Sign (+ el Alta temprana de AFIP ya cargada, si ese
 *    fue el trámite de origen). La Constancia de CUIT nunca se sube: ya cumplió su función al mover
 *    al contrato a este estado.
 */
export const ContractBulkFirmaTab: React.FC<{
  allEstados: InfoItem[];
  contratoFrames: ContratoFrameItem[];
  releases: Release[];
}> = ({ allEstados, contratoFrames, releases }) => {
  const [rows, setRows] = useState<ContractOverviewRow[]>([]);
  const [config, setConfig] = useState<FirmaDigitalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterEmpresaId, setFilterEmpresaId] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    companiesAPI.list().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  const activeReleases = useMemo(() => releases.filter((r) => r.isActive), [releases]);
  // Solo los releases activos cuyo Tipo tiene tildado "Se envía a firmar" — los demás no se generan
  // ni se mandan a firmar acá, aunque sigan existiendo como release del proyecto.
  const releasesQueFirman = useMemo(() => activeReleases.filter(releaseRequiereFirma), [activeReleases]);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([usersAPI.listContractsOverview({ limit: 5000 }), firmaDigitalAPI.config()])
      .then(([res, cfg]) => {
        setRows(res.rows);
        setConfig(cfg);
      })
      .catch(() => {
        /* noop */
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Trámite impositivo de ORIGEN del contrato (por su tipo/plantilla, no por el estado actual —
  // sigue siendo válido aunque el contrato ya haya avanzado a "Envío de documentación").
  const tipoDelRow = useCallback(
    (r: ContractOverviewRow): TipoImpositivo | undefined => {
      const estado = estadoImpositivoDelContrato(r as unknown as Contract, contratoFrames, allEstados);
      return estado?.data?.tipoImpositivo as TipoImpositivo | undefined;
    },
    [contratoFrames, allEstados]
  );

  const claveEnvio = config?.estadoEnvioDocNombre ? claveEstado(config.estadoEnvioDocNombre) : null;
  const rowsEnEnvio = useMemo(() => (claveEnvio ? rows.filter((r) => claveEstado(r.nombre_estado_empleado || "") === claveEnvio) : []), [rows, claveEnvio]);

  const empresasDelContrato = (r: ContractOverviewRow): string[] => (r.empresaContratoId ? [r.empresaContratoId] : (r.contratoEmpresas || []).map((e) => e.id));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rowsEnEnvio.filter((r) => {
      if (filterClientId && r.clientId !== filterClientId) return false;
      if (filterProjectId && r.projectId !== filterProjectId) return false;
      if (filterEmpresaId && !empresasDelContrato(r).includes(filterEmpresaId)) return false;
      if (q) {
        const hay = [r.userName, r.userEmail, r.clientName, r.projectName, r.nombre_contrato].some((v) => (v || "").toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [rowsEnEnvio, search, filterClientId, filterProjectId, filterEmpresaId]);

  const clientOptions = useMemo(() => {
    const m = new Map<string, string>();
    rowsEnEnvio.forEach((r) => r.clientId && m.set(r.clientId, r.clientName || r.clientId));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rowsEnEnvio]);
  const projectOptions = useMemo(() => {
    const m = new Map<string, string>();
    rowsEnEnvio.filter((r) => !filterClientId || r.clientId === filterClientId).forEach((r) => r.projectId && m.set(r.projectId, r.projectName || r.projectId));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rowsEnEnvio, filterClientId]);
  const empresaOptions = useMemo(() => companies.map((c) => ({ value: c._id, label: c.razonSocial })).sort((a, b) => a.label.localeCompare(b.label)), [companies]);

  const rowKey = (r: ContractOverviewRow) => `${r._id}-${r.contractIndex}`;
  const toggleSel = (k: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  // Solo se pueden marcar (y enviar) los contratos con Contrato Y Release(s) ya generados (botones
  // independientes) y todavía no enviados.
  const enviables = useMemo(() => filtered.filter((r) => calcularEnviable(r, contratoFrames, releasesQueFirman)), [filtered, contratoFrames, releasesQueFirman]);
  const allSel = enviables.length > 0 && enviables.every((r) => selected.has(rowKey(r)));
  const toggleAll = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (allSel) enviables.forEach((r) => n.delete(rowKey(r)));
      else enviables.forEach((r) => n.add(rowKey(r)));
      return n;
    });
  const seleccionados = useMemo(() => enviables.filter((r) => selected.has(rowKey(r))), [enviables, selected]);
  // Igual criterio que "Generar TXT (AFIP)": sin selección, se manda todo lo filtrado (comodidad).
  const fuenteEnvio = seleccionados.length > 0 ? seleccionados : enviables;

  const handleEnviar = async () => {
    if (fuenteEnvio.length === 0) return;
    const confirm = await sweetAlert.confirm(
      "Enviar a firmar",
      `Se van a subir los documentos de ${fuenteEnvio.length} contrato(s) a la carpeta "Outbox" de Dropbox para que Dropbox Sign los importe. ¿Continuar?`,
      "Sí, enviar",
      "Cancelar"
    );
    if (!confirm.isConfirmed) return;
    setEnviando(true);
    try {
      const targets = fuenteEnvio.map((r) => ({
        projectId: r.projectId,
        userId: r.userId,
        contractIndex: r.contractIndex,
        tipoImpositivo: tipoDelRow(r),
        incluirContrato: contratoRequiereFirma(findTemplate(r as unknown as Contract, contratoFrames)),
      }));
      const res = await firmaDigitalAPI.enviar(targets);
      const fallidos = res.resultados.filter((x) => !x.ok);
      if (fallidos.length > 0) {
        sweetAlert.error("Algunos envíos fallaron", `${res.enviados} enviado(s) correctamente. ${fallidos.length} fallaron: ${fallidos.map((f) => f.error).slice(0, 3).join(" · ")}`);
      } else {
        sweetAlert.success("Enviado", `${res.enviados} contrato(s) enviado(s) a firmar.`);
      }
      setSelected(new Set());
      load();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo enviar a firmar.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-start justify-between">
        <div className="flex-1 w-full">
          <SearchAndFilters
            searchTerm={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por usuario, proyecto o contrato..."
            selectFilters={[
              { label: "Cliente", value: filterClientId, onChange: setFilterClientId, placeholder: "Todos los clientes", options: clientOptions },
              { label: "Proyecto", value: filterProjectId, onChange: setFilterProjectId, placeholder: "Todos los proyectos", options: projectOptions },
              { label: "Empresa", value: filterEmpresaId, onChange: setFilterEmpresaId, placeholder: "Todas las empresas", options: empresaOptions },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!loading && config && !config.outboxCarpeta && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
              No se encontró la carpeta "Outbox" configurada (Documentos → Configurar transición automática)
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {seleccionados.length > 0 && <span className="text-xs text-gray-500 dark:text-gray-400">{seleccionados.length} seleccionado(s)</span>}
          <button
            onClick={handleEnviar}
            disabled={enviando || fuenteEnvio.length === 0 || !config?.outboxCarpeta}
            title={seleccionados.length > 0 ? "Enviar a firmar los contratos seleccionados" : 'Enviar a firmar todos los contratos generados del listado (o marcá algunos con el check)'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <FontAwesomeIcon icon={enviando ? faSpinner : faPaperPlane} spin={enviando} className="h-4 w-4" />
            Enviar a firmar{fuenteEnvio.length > 0 ? ` (${fuenteEnvio.length})` : ""}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner message="Cargando contratos..." />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={faFileSignature}
          title="Sin contratos para firmar"
          description={
            rowsEnEnvio.length === 0
              ? 'Ningún contrato está hoy en el estado de "Envío de documentación" (se llega ahí automáticamente al archivar el Alta temprana de AFIP o la Constancia de CUIT).'
              : "No hay resultados con los filtros aplicados."
          }
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar max-h-[640px]">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[1600px]">
              <thead className="sticky top-0 z-40 bg-gray-50 dark:bg-gray-900 shadow-sm">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="sticky top-0 left-0 z-50 px-4 py-3 w-12 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
                    <input type="checkbox" checked={allSel} onChange={toggleAll} disabled={enviables.length === 0} title="Seleccionar todos los generados" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" />
                  </th>
                  <th className="sticky top-0 left-12 z-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 border-r-2 border-gray-300 dark:border-gray-600 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)]">
                    Acciones
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Alta / Baja</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Trámite</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Release</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">CUIT</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Proyecto</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Tipo de Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Estado</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Estado Impositivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((r) => {
                  const tipo = tipoDelRow(r);
                  const template = findTemplate(r as unknown as Contract, contratoFrames);
                  const contratoAplica = contratoRequiereFirma(template);
                  const enviable = calcularEnviable(r, contratoFrames, releasesQueFirman);
                  return (
                    <tr key={rowKey(r)} className={`group hover:bg-gray-50 dark:hover:bg-gray-900/20 ${selected.has(rowKey(r)) ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}>
                      <td className={`sticky left-0 z-20 px-4 py-3 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-[#1c2634] border-r border-gray-200 dark:border-gray-700 ${selected.has(rowKey(r)) ? "!bg-[#f7faff] dark:!bg-[#1f2b3f]" : ""}`}>
                        <input
                          type="checkbox"
                          checked={selected.has(rowKey(r))}
                          disabled={!enviable}
                          onChange={() => toggleSel(rowKey(r))}
                          title={enviable ? "Incluir en el envío a firmar" : r.firmaEnviadaAt ? "Ya se envió a firmar" : 'Generá primero el Contrato y el/los Release(s) ("Generar")'}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className={`sticky left-12 z-20 px-4 py-3 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-[#1c2634] border-r-2 border-gray-300 dark:border-gray-600 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)] ${selected.has(rowKey(r)) ? "!bg-[#f7faff] dark:!bg-[#1f2b3f]" : ""}`}>
                        <FirmaEnviarCell record={r} contratoAplica={contratoAplica} releasesAplicables={releasesQueFirman} tipoImpositivo={tipo} onEnviado={load} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-500 whitespace-nowrap">
                        {(() => {
                          const vigente = isContractVigente(r.fecha_alta_contrato, r.fecha_baja_contrato);
                          return (
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit ${vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{vigente ? "VIGENTE" : "NO VIGENTE"}</span>
                              <div className="flex flex-col gap-0.5 text-xs">
                                <span>
                                  <span className="text-gray-400">Alta:</span> {formatDate(r.fecha_alta_contrato)}
                                </span>
                                <span>
                                  <span className="text-gray-400">Baja:</span> {r.fecha_baja_contrato ? formatDate(r.fecha_baja_contrato) : "—"}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {tipo ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${
                              tipo === "alta_temprana_afip"
                                ? "bg-purple-600 text-white border-purple-600 dark:bg-purple-500 dark:border-purple-500"
                                : "bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700"
                            }`}
                          >
                            <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" />
                            {TIPO_LABEL[tipo]}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <FirmaContratoCell record={r} contratoFrames={contratoFrames} allEstados={allEstados} onGenerado={load} />
                      </td>
                      <td className="px-4 py-3">
                        <FirmaReleaseCell record={r} contratoFrames={contratoFrames} allEstados={allEstados} activeReleases={activeReleases} releasesAplicables={releasesQueFirman} onGenerado={load} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{r.userName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{r.userEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap font-mono">{fmtCuit(r.cuit) || "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.clientName || "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.projectName || "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.nombre_contrato || "—"}</td>
                      <td className="px-4 py-3">
                        <EstadoBadge name={r.nombre_estado_empleado || ""} />
                      </td>
                      <td className="px-4 py-3">
                        <EstadoImpositivoCell record={r} contratoFrames={contratoFrames} allEstados={allEstados} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractBulkAfipTab;
