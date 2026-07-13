import React, { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import * as XLSX from "xlsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faFileExcel, faTriangleExclamation, faCircleCheck, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { ActivityLogCalendar } from "./ActivityLogCalendar";
import { Modal } from "../ui/Modal";
import { sweetAlert } from "../../utils/sweetAlert";
import { complianceAPI, ComplianceResponse, CoordinatorCompliance } from "../../api/compliance";

interface ComplianceViewProps {
  projectFilter: string; // "all" o id
  areaFilter: string;
  shiftFilter: string;
}

const todayStr = () => format(new Date(), "yyyy-MM-dd");
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export const ComplianceView: React.FC<ComplianceViewProps> = ({ projectFilter, areaFilter, shiftFilter }) => {
  const [viewMonth, setViewMonth] = useState(new Date());
  const [data, setData] = useState<ComplianceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [remindingIds, setRemindingIds] = useState<Set<string>>(new Set());
  const [remindingAll, setRemindingAll] = useState(false);

  const from = format(startOfMonth(viewMonth), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(viewMonth), "yyyy-MM-dd");
  const today = todayStr();
  const to = monthEnd < today ? monthEnd : today;
  const isFutureMonth = from > today;

  const params = useMemo(
    () => ({
      from,
      to,
      projectId: projectFilter !== "all" ? projectFilter : undefined,
      areaId: areaFilter !== "all" ? areaFilter : undefined,
      shiftId: shiftFilter !== "all" ? shiftFilter : undefined,
    }),
    [from, to, projectFilter, areaFilter, shiftFilter],
  );

  const fetchData = async () => {
    if (isFutureMonth) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await complianceAPI.get(params);
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.error || "No se pudo cargar el cumplimiento.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.from, params.to, params.projectId, params.areaId, params.shiftId]);

  const complianceByDate = useMemo(() => {
    const map: Record<string, "complete" | "partial" | "missing" | "none"> = {};
    (data?.calendar || []).forEach((d) => (map[d.date] = d.status));
    return map;
  }, [data]);

  const selectedDayData = useMemo(() => (selectedDay ? data?.calendar.find((c) => c.date === selectedDay) : null), [selectedDay, data]);

  const remind = async (coordinatorIds?: string[]) => {
    try {
      const res = await complianceAPI.remind({ from, to, projectId: params.projectId, coordinatorIds });
      if (res.count > 0) sweetAlert.success("Recordatorios enviados", `Se notificó a ${res.count} coordinador(es).`);
      else sweetAlert.info?.("Sin envíos", "No había coordinadores pendientes por notificar (o ya tenían un recordatorio hoy).") ?? sweetAlert.success("Listo", "Sin recordatorios nuevos que enviar.");
    } catch (err: any) {
      sweetAlert.error("Error", err?.response?.data?.error || "No se pudieron enviar los recordatorios.");
    }
  };

  const remindOne = async (userId: string) => {
    setRemindingIds((s) => new Set(s).add(userId));
    await remind([userId]);
    setRemindingIds((s) => {
      const n = new Set(s);
      n.delete(userId);
      return n;
    });
  };

  const remindAll = async () => {
    const behind = data?.coordinators.filter((c) => c.missingCount > 0) || [];
    if (behind.length === 0) return;
    const r = await sweetAlert.confirm("¿Recordar a los que faltan?", `Se notificará a ${behind.length} coordinador(es) con novedades pendientes.`, "Sí, notificar");
    if (!r.isConfirmed) return;
    setRemindingAll(true);
    await remind();
    setRemindingAll(false);
  };

  const exportReport = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    // Resumen por coordinador
    const summary = [
      ["Coordinador", "Esperadas", "Enviadas", "Faltantes", "Cumplimiento %"],
      ...data.coordinators.map((c) => [c.name, c.expectedCount, c.submittedCount, c.missingCount, c.expectedCount ? Math.round((c.submittedCount / c.expectedCount) * 100) : 0]),
    ];
    const wsS = XLSX.utils.aoa_to_sheet(summary);
    wsS["!cols"] = [{ wch: 32 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsS, "Resumen");
    // Detalle de faltantes
    const detail: (string | number)[][] = [["Coordinador", "Proyecto", "Área", "Turno", "Fecha faltante"]];
    data.coordinators.forEach((c) =>
      c.projects.forEach((a) => a.missingDates.forEach((d) => detail.push([c.name, a.projectName, a.areas.join(", "), a.turnos.join(", "), fmtDate(d)]))),
    );
    const wsD = XLSX.utils.aoa_to_sheet(detail);
    wsD["!cols"] = [{ wch: 32 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsD, "Faltantes");
    XLSX.writeFile(wb, `cumplimiento_novedades_${from}_a_${to}.xlsx`);
    setShowReport(false);
  };

  return (
    <div className="space-y-4">
      {/* Totales + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <StatChip label="Esperadas" value={data?.totals.expected ?? 0} tone="gray" />
          <StatChip label="Enviadas" value={data?.totals.submitted ?? 0} tone="green" />
          <StatChip label="Faltantes" value={data?.totals.missing ?? 0} tone="red" />
          <StatChip label="Cumplimiento" value={`${data?.totals.compliancePct ?? 0}%`} tone="blue" />
          <StatChip label="Coord. atrasados" value={data?.totals.coordinatorsBehind ?? 0} tone="amber" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowReport(true)} disabled={!data} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50">
            <FontAwesomeIcon icon={faFileExcel} /> Informe
          </button>
          <button onClick={remindAll} disabled={!data || remindingAll || (data?.totals.coordinatorsBehind ?? 0) === 0} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
            <FontAwesomeIcon icon={remindingAll ? faSpinner : faBell} className={remindingAll ? "animate-spin" : ""} /> Recordar a los que faltan
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {isFutureMonth && <div className="rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-3 text-sm text-gray-500">Mes futuro: no hay días esperados todavía.</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Calendario */}
        <div className="xl:col-span-2 relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 rounded">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin text-blue-500 text-2xl" />
            </div>
          )}
          <ActivityLogCalendar
            complianceByDate={complianceByDate}
            controlledMonth={viewMonth}
            onMonthChange={setViewMonth}
            onDayClick={(day, status) => {
              if (status === "missing" || status === "partial") setSelectedDay(format(day, "yyyy-MM-dd"));
            }}
          />
        </div>

        {/* Panel de coordinadores */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2 px-1">Coordinadores</h4>
          <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
            {(data?.coordinators || []).length === 0 && !loading && <p className="text-xs text-gray-400 px-1 py-4 text-center">Sin coordinadores con asignaciones en este período/filtro.</p>}
            {(data?.coordinators || []).map((c) => (
              <CoordinatorRow key={c.userId} c={c} reminding={remindingIds.has(c.userId)} onRemind={() => remindOne(c.userId)} />
            ))}
          </div>
        </div>
      </div>

      {/* Drill-down de un día */}
      <Modal isOpen={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay ? `Faltantes del ${fmtDate(selectedDay)}` : ""} size="md">
        {selectedDayData && selectedDayData.missingCells.length > 0 ? (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {selectedDayData.missingCells.map((cell, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{cell.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{cell.projectName} · {cell.label}</p>
                </div>
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-red-500" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 flex items-center gap-2"><FontAwesomeIcon icon={faCircleCheck} className="text-green-500" /> Sin faltantes ese día.</p>
        )}
      </Modal>

      {/* Confirmación de informe */}
      <Modal isOpen={showReport} onClose={() => setShowReport(false)} title="Exportar informe de cumplimiento" size="sm">
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Se exporta un Excel con el resumen por coordinador y el detalle de novedades faltantes del período {fmtDate(from)} al {fmtDate(to)}.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setShowReport(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Cancelar</button>
          <button onClick={exportReport} className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Descargar Excel</button>
        </div>
      </Modal>
    </div>
  );
};

const StatChip: React.FC<{ label: string; value: string | number; tone: "gray" | "green" | "red" | "blue" | "amber" }> = ({ label, value, tone }) => {
  const tones: Record<string, string> = {
    gray: "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700",
    green: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
    red: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    amber: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  };
  return (
    <div className={`px-3 py-1.5 rounded-lg border ${tones[tone]}`}>
      <div className="text-lg font-black leading-none">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80 mt-0.5">{label}</div>
    </div>
  );
};

const CoordinatorRow: React.FC<{ c: CoordinatorCompliance; reminding: boolean; onRemind: () => void }> = ({ c, reminding, onRemind }) => {
  const behind = c.missingCount > 0;
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${behind ? "border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-900/10" : "border-gray-100 dark:border-gray-700"}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{c.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {c.submittedCount}/{c.expectedCount} enviadas
          {behind && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-600 dark:text-red-400">{c.missingCount} faltan</span>}
        </p>
      </div>
      {behind && (
        <button onClick={onRemind} disabled={reminding} title="Enviar recordatorio" className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50">
          <FontAwesomeIcon icon={reminding ? faSpinner : faBell} className={reminding ? "animate-spin" : ""} /> Recordar
        </button>
      )}
    </div>
  );
};
