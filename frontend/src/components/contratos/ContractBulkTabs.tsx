import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileInvoiceDollar, faFileSignature, faScrewdriverWrench, faDownload, faSearch } from "@fortawesome/free-solid-svg-icons";
import { usersAPI, ContractOverviewRow } from "../../api/users";
import { InfoItem } from "../../api/info";
import { claveEstado, EstadoBadge } from "../EstadoSelect";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { EmptyState } from "../ui/EmptyState";

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
export const ContractBulkAfipTab: React.FC<{ allEstados: InfoItem[] }> = ({ allEstados }) => {
  const [rows, setRows] = useState<ContractOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTipo, setFilterTipo] = useState<"" | TipoImpositivo>("");
  const [search, setSearch] = useState("");

  // clave-estado (normalizada) → trámite impositivo, para los estados marcados como impositivos.
  const impositivoPorClave = useMemo(() => {
    const m = new Map<string, { tipo?: TipoImpositivo; name: string }>();
    allEstados
      .filter((e) => e.data?.esImpositivo)
      .forEach((e) => m.set(claveEstado(e.name), { tipo: e.data?.tipoImpositivo as TipoImpositivo | undefined, name: e.name }));
    return m;
  }, [allEstados]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    usersAPI
      .listContractsOverview({ limit: 5000 })
      .then((res) => {
        if (alive) setRows(res.rows);
      })
      .catch(() => {
        /* noop */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Solo los contratos cuyo estado actual es impositivo.
  const impositivoRows = useMemo<ImpositivoRow[]>(() => {
    const out: ImpositivoRow[] = [];
    for (const r of rows) {
      const imp = impositivoPorClave.get(claveEstado(r.nombre_estado_empleado || ""));
      if (imp) out.push({ ...r, _tipo: imp.tipo, _estadoName: imp.name });
    }
    return out;
  }, [rows, impositivoPorClave]);

  const countAlta = impositivoRows.filter((r) => r._tipo === "alta_temprana_afip").length;
  const countCuit = impositivoRows.filter((r) => r._tipo === "constancia_cuit").length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return impositivoRows.filter((r) => {
      if (filterTipo && r._tipo !== filterTipo) return false;
      if (q) {
        const hay = [r.userName, r.userEmail, r.clientName, r.projectName, r.nombre_contrato].some((v) => (v || "").toLowerCase().includes(q));
        if (!hay) return false;
      }
      return true;
    });
  }, [impositivoRows, filterTipo, search]);

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
          <button className={chip(filterTipo === "alta_temprana_afip")} onClick={() => setFilterTipo("alta_temprana_afip")}>
            Alta temprana de AFIP ({countAlta})
          </button>
          <button className={chip(filterTipo === "constancia_cuit")} onClick={() => setFilterTipo("constancia_cuit")}>
            Constancia de CUIT ({countCuit})
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
            onClick={() => exportarCsv(filtered)}
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
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-sm">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Proyecto</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Trámite impositivo</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Alta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((r) => (
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
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmtFecha(r.fecha_alta_contrato) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
