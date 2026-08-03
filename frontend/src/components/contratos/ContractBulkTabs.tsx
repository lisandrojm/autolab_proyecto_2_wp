import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileInvoiceDollar, faFileSignature, faScrewdriverWrench, faDownload, faSearch, faCheck, faTriangleExclamation, faXmark, faFileLines } from "@fortawesome/free-solid-svg-icons";
import { usersAPI, ContractOverviewRow } from "../../api/users";
import { infoAPI, InfoItem } from "../../api/info";
import { ContratoFrameItem } from "../../api/contratosFrame";
import { contratosAPI, ContratoItem } from "../../api/contratos";
import { categoriaSatAPI, CategoriaSatItem } from "../../api/categoriasSat";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../../api/simpleCatalog";
import { Release } from "../../api/release";
import { claveEstado, EstadoBadge } from "../EstadoSelect";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";
import { ContractDocsColumns, ContractDocsHeaders, downloadContractRow, downloadReleaseRow, uploadAltaRow } from "./ContractRowDocs";
import { resolveAfip, AfipRowResult } from "./afipCompleteness";
import { buildAltaRecord, buildAltaTxt, downloadTxt } from "./afipTxt";
import { sweetAlert } from "../../utils/sweetAlert";

const obrasSocialesApi = createSimpleCatalogApi("/obras-sociales");

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

/** Descarga las filas como CSV (separador ";", compatible con Excel en es-AR). */
const exportarCsv = (rows: ImpositivoRow[]) => {
  const headers = ["Usuario", "Email", "Cliente", "Proyecto", "Rol Frame", "Contrato", "Estado", "Trámite impositivo", "Alta", "Baja"];
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.userName,
      r.userEmail,
      r.clientName,
      r.projectName,
      r.nombreRolFrame,
      r.nombre_contrato,
      r._estadoName,
      r._tipo ? TIPO_LABEL[r._tipo] : "",
      fmtFecha(r.fecha_alta_contrato),
      fmtFecha(r.fecha_baja_contrato),
    ]
      .map(esc)
      .join(";"),
  );
  const csv = "﻿" + [headers.map(esc).join(";"), ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "contratos_impositivos.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/**
 * Sub-pestaña "Altas de AFIP | Constancia de CUIT": lista SOLO lectura de los contratos cuyo estado
 * actual es un estado impositivo, con su trámite (Alta temprana de AFIP / Constancia de CUIT),
 * filtros y exportación a CSV.
 */
export const ContractBulkAfipTab: React.FC<{ allEstados: InfoItem[]; contratoFrames: ContratoFrameItem[]; releases: Release[] }> = ({ allEstados, contratoFrames, releases }) => {
  const [rows, setRows] = useState<ContractOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTipo, setFilterTipo] = useState<"" | TipoImpositivo>("");
  const [search, setSearch] = useState("");
  const [soloIncompletos, setSoloIncompletos] = useState(false);

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
      if (q) {
        const hay = [r.userName, r.userEmail, r.clientName, r.projectName, r.nombre_contrato].some((v) => (v || "").toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [impositivoRows, filterTipo, search, soloIncompletos]);

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
      active ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40"
    }`;

  return (
    <div className="space-y-4">
      {/* Filtros + export */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button className={chip(filterTipo === "")} onClick={() => setFilterTipo("")}>
            Todos ({impositivoRows.length})
          </button>
          <button className={chip(filterTipo === "constancia_cuit")} onClick={() => setFilterTipo("constancia_cuit")}>
            Constancia de CUIT ({countCuit})
          </button>
          <button className={chip(filterTipo === "alta_temprana_afip")} onClick={() => setFilterTipo("alta_temprana_afip")}>
            Alta temprana de AFIP ({countAlta})
          </button>
          <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />
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
        <div className="flex items-center gap-2">
          <div className="relative">
            <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-3.5 w-3.5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar usuario, proyecto o contrato..."
              className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 w-full sm:w-72"
            />
          </div>
          <button
            onClick={() => generarTxt(filtered, "altas_afip")}
            disabled={countCompletos === 0}
            title={countCompletos === 0 ? "No hay contratos con datos AFIP completos" : "Generar el TXT de Alta masiva de AFIP con los contratos completos"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <FontAwesomeIcon icon={faFileLines} className="h-4 w-4" />
            Generar TXT (AFIP)
          </button>
          <button
            onClick={() => exportarCsv(filtered.map((x) => x.row))}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
            Exportar CSV
          </button>
        </div>
      </div>

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
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar max-h-[640px]">
            <table className="w-full text-left border-collapse min-w-[2200px]">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-sm">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Proyecto</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Trámite impositivo</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap" title="Dato para buscar la Constancia de Inscripción / CUIT en ARCA">Datos CUIT/CUIL</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Datos AFIP</th>
                  <ContractDocsHeaders />
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Alta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map(({ row: r, result }) => (
                  <tr key={`${r._id}-${r.contractIndex}`} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
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
