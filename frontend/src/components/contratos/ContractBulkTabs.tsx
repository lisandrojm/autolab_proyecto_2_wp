import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileInvoiceDollar, faFileSignature, faScrewdriverWrench, faCheck, faTriangleExclamation, faXmark, faFileLines, faGrip, faTable, faUser } from "@fortawesome/free-solid-svg-icons";
import { usersAPI, ContractOverviewRow } from "../../api/users";
import { infoAPI, InfoItem } from "../../api/info";
import { ContratoFrameItem } from "../../api/contratosFrame";
import { contratosAPI, ContratoItem } from "../../api/contratos";
import { categoriaSatAPI, CategoriaSatItem } from "../../api/categoriasSat";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../../api/simpleCatalog";
import { Release } from "../../api/release";
import { claveEstado, EstadoBadge, estadoLabel } from "../EstadoSelect";
import { isContractVigente } from "../team/ContractCard";
import { SearchAndFilters } from "../ui/SearchAndFilters";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";
import { ContractDocsColumns, ContractDocsHeaders, downloadContractRow, downloadReleaseRow, uploadAltaRow } from "./ContractRowDocs";
import { resolveAfip, AfipRowResult } from "./afipCompleteness";
import { buildAltaRecord, buildAltaTxt, downloadTxt } from "./afipTxt";
import { sweetAlert } from "../../utils/sweetAlert";

const obrasSocialesApi = createSimpleCatalogApi("/obras-sociales");

/** Mismas opciones de rol que el filtro de la pestaña Contratos. */
const MOBILE_ROLE_OPTIONS = [
  { value: "colaborador", label: "Mobile-Colaborador" },
  { value: "coordinador", label: "Mobile-Coordinador" },
];

/** Estilo de pestaña (subrayado), igual que el resto de los tabs de la app. */
const tabBtnClass = (active: boolean): string =>
  `px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
    active ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
  }`;

/** CUIT/CUIL formateado NN-NNNNNNNN-N (vacío si no tiene 11 dígitos). */
const fmtCuit = (raw?: string): string => {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : "";
};

/** YYYYMMDD de hoy para el nombre del archivo. */
const hoyStamp = (): string => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
};

type TipoImpositivo = "alta_temprana_afip" | "constancia_cuit";
const TIPO_LABEL: Record<TipoImpositivo, string> = {
  alta_temprana_afip: "Alta temprana de AFIP",
  constancia_cuit: "Constancia de CUIT",
};

/** Fila de contrato enriquecida con el trámite impositivo de su estado actual. */
type ImpositivoRow = ContractOverviewRow & { _tipo?: TipoImpositivo; _estadoName: string };

const fmtFecha = (s?: string): string => {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

/**
 * Sub-pestaña "Altas de AFIP | Constancia de CUIT": lista SOLO lectura de los contratos cuyo estado
 * actual es un estado impositivo, con su trámite (Alta temprana de AFIP / Constancia de CUIT),
 * filtros y exportación a CSV.
 */
export const ContractBulkAfipTab: React.FC<{ allEstados: InfoItem[]; contratoFrames: ContratoFrameItem[]; releases: Release[]; initialProjectId?: string }> = ({ allEstados, contratoFrames, releases, initialProjectId = "" }) => {
  const [rows, setRows] = useState<ContractOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTipo, setFilterTipo] = useState<"" | TipoImpositivo>("alta_temprana_afip");
  const [search, setSearch] = useState("");
  const [soloIncompletos, setSoloIncompletos] = useState(false);

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
  // Detalle de completitud de una fila (modal).
  const [detalle, setDetalle] = useState<{ row: ImpositivoRow; result: AfipRowResult } | null>(null);
  // Detalle de los datos para la Constancia de CUIT/CUIL (único requisito: el CUIT/CUIL).
  const [constancia, setConstancia] = useState<{ row: ImpositivoRow; cuil: string } | null>(null);

  useEffect(() => {
    categoriaSatAPI.list().then(setCategorias).catch(() => setCategorias([]));
    contratosAPI.list().then(setTipos).catch(() => setTipos([]));
    obrasSocialesApi.list().then(setObrasSociales).catch(() => setObrasSociales([]));
    infoAPI.listSedes().then(setSedes).catch(() => setSedes([]));
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

  const countAlta = impositivoRows.filter((x) => x.row._tipo === "alta_temprana_afip").length;
  const countCuit = impositivoRows.filter((x) => x.row._tipo === "constancia_cuit").length;
  const countCompletos = impositivoRows.filter((x) => x.result.completo).length;
  const countIncompletos = impositivoRows.length - countCompletos;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return impositivoRows.filter(({ row: r, result }) => {
      if (filterTipo && r._tipo !== filterTipo) return false;
      if (soloIncompletos && result.completo) return false;
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
      if (q) {
        const hay = [r.userName, r.userEmail, r.clientName, r.projectName, r.nombre_contrato].some((v) => (v || "").toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [impositivoRows, filterTipo, search, soloIncompletos, filterUserStatus, filterVigencia, filterRolMobile, filterTipoContrato, filterEstadoContrato, filterReemplazo, filterClientId, filterProjectId]);

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
  const selectableFiltered = useMemo(() => filtered.filter((x) => x.result.completo), [filtered]);
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

      {/* Sub-tabs por trámite impositivo (mismo estilo de pestañas que el resto de la app) */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        <button className={tabBtnClass(filterTipo === "alta_temprana_afip")} onClick={() => setFilterTipo("alta_temprana_afip")}>
          Alta temprana de AFIP ({countAlta})
        </button>
        <button className={tabBtnClass(filterTipo === "constancia_cuit")} onClick={() => setFilterTipo("constancia_cuit")}>
          Constancia de CUIT ({countCuit})
        </button>
      </div>

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
              onClick={() => generarTxt(fuenteTxt, "altas_afip")}
              disabled={fuenteTxt.every((x) => !x.result.completo)}
              title={seleccionados.length > 0 ? "Generar el TXT con los contratos seleccionados (solo los completos)" : "Generar el TXT con los contratos completos del listado (o marcá algunos con el check)"}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <FontAwesomeIcon icon={faFileLines} className="h-4 w-4" />
              Generar TXT (AFIP){seleccionados.length > 0 ? ` (${seleccionados.length})` : ""}
            </button>
          </div>
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
                      disabled={!result.completo}
                      onChange={() => toggleSel(rowKey(r))}
                      title={result.completo ? "Incluir esta persona en el TXT" : "Faltan datos AFIP: no se puede incluir en el TXT"}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    />
                    <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{r.userName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.userEmail}</p>
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
                    <button
                      onClick={() => setConstancia({ row: r, cuil })}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${cuil ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100" : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100"}`}
                    >
                      <FontAwesomeIcon icon={cuil ? faCheck : faTriangleExclamation} className="h-2.5 w-2.5" />
                      CUIT/CUIL: {cuil ? "OK" : "Falta 1"}
                    </button>
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
            <table className="w-full text-left border-collapse min-w-[2260px]">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-sm">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allSel} onChange={toggleAll} disabled={selectableFiltered.length === 0} title="Seleccionar todos los completos" className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" />
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Proyecto</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Trámite impositivo</th>
                  {filterTipo === "constancia_cuit" && (
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap" title="Dato para buscar la Constancia de Inscripción / CUIT en ARCA">Datos CUIT/CUIL</th>
                  )}
                  {filterTipo === "alta_temprana_afip" && <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Datos AFIP</th>}
                  <ContractDocsHeaders />
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Alta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map(({ row: r, result }) => (
                  <tr key={`${r._id}-${r.contractIndex}`} className={`hover:bg-gray-50 dark:hover:bg-gray-900/20 ${selected.has(rowKey(r)) ? "bg-emerald-50/50 dark:bg-emerald-900/10" : ""}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(rowKey(r))}
                        disabled={!result.completo}
                        onChange={() => toggleSel(rowKey(r))}
                        title={result.completo ? "Incluir esta persona en el TXT" : "Faltan datos AFIP: no se puede incluir en el TXT"}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{r.userName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.userEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.clientName || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.projectName || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.nombre_contrato || "—"}</td>
                    <td className="px-4 py-3">
                      <EstadoBadge name={r._estadoName} />
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
                    {filterTipo === "constancia_cuit" && (
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
                    />
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmtFecha(r.fecha_alta_contrato) || "—"}</td>
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
    </div>
  );
};

/**
 * Sub-pestaña "Firma digital": pendiente de definición. La gestión masiva de firma con proveedor
 * externo requiere (1) elegir el proveedor y sus credenciales/API y (2) un modelo de firma en los
 * contratos (hoy los contratos del miembro no tienen estado de firma). Queda como placeholder.
 */
export const ContractBulkFirmaTab: React.FC = () => (
  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-8">
    <div className="max-w-2xl mx-auto text-center flex flex-col items-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
        <FontAwesomeIcon icon={faFileSignature} className="h-6 w-6 text-blue-600 dark:text-blue-400" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Firma digital</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        Gestión masiva de firma de contratos: enviar a firmar en lote, marcar como firmados, seguimiento del estado y descarga de los firmados.
      </p>
      <ul className="text-sm text-gray-600 dark:text-gray-300 text-left space-y-2 mt-2">
        <li className="flex items-start gap-2.5">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
          <span>Requiere definir el proveedor de firma externo (DocuSign, firma AFIP, etc.) y sus credenciales/API.</span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
          <span>Requiere agregar un estado de firma a los contratos del miembro (hoy no existe en el modelo).</span>
        </li>
      </ul>
      <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-100 dark:border-amber-800">
        <FontAwesomeIcon icon={faScrewdriverWrench} className="h-3.5 w-3.5" />
        Pendiente: definir proveedor externo + modelo de firma
      </div>
    </div>
  </div>
);

export default ContractBulkAfipTab;
