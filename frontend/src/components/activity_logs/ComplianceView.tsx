import React, { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faFileExcel, faTriangleExclamation, faCircleCheck, faSpinner, faUser, faXmark, faUsers, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { ActivityLogCalendar } from './ActivityLogCalendar';
import { Modal } from '../ui/Modal';
import { sweetAlert } from '../../utils/sweetAlert';
import { complianceAPI, ComplianceResponse, CoordinatorCompliance } from '../../api/compliance';

interface ComplianceViewProps {
  projectFilter: string; // "all" o id
  areaFilter: string;
  shiftFilter: string;
  /** Abre el detalle de una novedad por su Nº (ej. "DEM-REG-000337"). */
  onOpenReport?: (reportNumber: string) => void;
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
/** Día de la semana de un "YYYY-MM-DD" sin drift de timezone. */
const weekdayOf = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).getDay();
};

// Persistencia: al abrir el detalle de una novedad este componente se desmonta,
// así que guardamos mes y coordinador elegido para restaurarlos al volver.
const LS_MONTH = 'novedades_compliance_month';
const LS_COORD = 'novedades_compliance_coordinator';
const readLS = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLS = (k: string, v: string | null) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* storage no disponible */
  }
};

export const ComplianceView: React.FC<ComplianceViewProps> = ({ projectFilter, areaFilter, shiftFilter, onOpenReport }) => {
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const saved = readLS(LS_MONTH);
    if (saved && /^\d{4}-\d{2}$/.test(saved)) {
      const [y, m] = saved.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  });
  const [data, setData] = useState<ComplianceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  /*
    El listado de faltantes pasa a un modal.

    Vivía desplegado al pie con su propio scroll: para un coordinador con 23 días vencidos empujaba el
    calendario y la lista de coordinadores fuera de la pantalla, y era lo que menos se mira —se entra
    a ver el detalle cuando ya se decidió mirar a esa persona.
  */
  const [showFaltantes, setShowFaltantes] = useState(false);
  /*
    Los totales NO se muestran acá. El 📊 que está al lado del mes, dentro del calendario, ya abre un
    modal con lo mismo (días reportados, no enviados, total requerido y % de cumplimiento). Tenerlos
    además como una franja de chips arriba era decir dos veces el mismo número y, de paso, empujaba
    Informe y Recordar contra el borde derecho.
  */
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState<string | null>(() => readLS(LS_COORD));
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    writeLS(LS_MONTH, format(viewMonth, 'yyyy-MM'));
  }, [viewMonth]);
  useEffect(() => {
    writeLS(LS_COORD, selectedCoordinatorId);
  }, [selectedCoordinatorId]);
  const [remindingIds, setRemindingIds] = useState<Set<string>>(new Set());
  const [remindingAll, setRemindingAll] = useState(false);

  const from = format(startOfMonth(viewMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(viewMonth), 'yyyy-MM-dd');
  const today = todayStr();
  const to = monthEnd < today ? monthEnd : today;
  const isFutureMonth = from > today;

  const params = useMemo(
    () => ({
      from,
      to,
      projectId: projectFilter !== 'all' ? projectFilter : undefined,
      areaId: areaFilter !== 'all' ? areaFilter : undefined,
      shiftId: shiftFilter !== 'all' ? shiftFilter : undefined,
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
      setError(err?.response?.data?.error || 'No se pudo cargar el cumplimiento.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.from, params.to, params.projectId, params.areaId, params.shiftId]);

  const selectedCoordinator = useMemo(() => (selectedCoordinatorId ? data?.coordinators.find((c) => c.userId === selectedCoordinatorId) || null : null), [data, selectedCoordinatorId]);

  // Calendario: agregado de todos, o sólo del coordinador elegido (se deriva de la data ya cargada).
  const complianceByDate = useMemo(() => {
    const map: Record<string, 'complete' | 'partial' | 'pending' | 'missing' | 'none'> = {};
    if (!selectedCoordinator) {
      (data?.calendar || []).forEach((d) => (map[d.date] = d.status));
      return map;
    }
    const agg: Record<string, { exp: number; sub: number; pend: number }> = {};
    const touch = (d: string) => (agg[d] = agg[d] || { exp: 0, sub: 0, pend: 0 });
    selectedCoordinator.projects.forEach((p) => {
      p.expectedDates.forEach((d) => touch(d).exp++);
      p.submittedDates.forEach((d) => touch(d).sub++);
      (p.pendingDates || []).forEach((d) => touch(d).pend++);
    });
    Object.entries(agg).forEach(([d, v]) => {
      const missing = v.exp - v.sub;
      if (v.exp === 0) map[d] = 'none';
      else if (missing <= 0) map[d] = 'complete';
      else if (v.sub === 0 && v.pend >= missing)
        map[d] = 'pending'; // todo lo que falta aún se puede cargar
      else if (v.sub === 0) map[d] = 'missing';
      else map[d] = 'partial';
    });
    return map;
  }, [data, selectedCoordinator]);

  // Nº de novedad por fecha: sólo con un coordinador elegido (ahí hay 1 novedad por día/proyecto).
  const dayLabels = useMemo(() => {
    if (!selectedCoordinator) return undefined;
    const map: Record<string, string[]> = {};
    selectedCoordinator.projects.forEach((p) => {
      Object.entries(p.reportsByDate || {}).forEach(([d, num]) => {
        map[d] = map[d] || [];
        map[d].push(num);
      });
    });
    return Object.fromEntries(Object.entries(map).map(([d, nums]) => [d, nums.join(', ')]));
  }, [selectedCoordinator]);


  const selectedDayData = useMemo(() => {
    if (!selectedDay) return null;
    const day = data?.calendar.find((c) => c.date === selectedDay);
    if (!day) return null;
    if (!selectedCoordinator) return day;
    return { ...day, missingCells: day.missingCells.filter((m) => m.userId === selectedCoordinator.userId) };
  }, [selectedDay, data, selectedCoordinator]);

  const remind = async (coordinatorIds?: string[]) => {
    try {
      const res = await complianceAPI.remind({ from, to, projectId: params.projectId, coordinatorIds });
      if (res.count > 0) sweetAlert.success('Recordatorios enviados', `Se notificó a ${res.count} supervisor(es).`);
      else sweetAlert.info?.('Sin envíos', 'No había supervisores pendientes por notificar (o ya tenían un recordatorio hoy).') ?? sweetAlert.success('Listo', 'Sin recordatorios nuevos que enviar.');
    } catch (err: any) {
      sweetAlert.error('Error', err?.response?.data?.error || 'No se pudieron enviar los recordatorios.');
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
    const r = await sweetAlert.confirm('¿Recordar a los que faltan?', `Se notificará a ${behind.length} supervisor(es) con novedades pendientes.`, 'Sí, notificar');
    if (!r.isConfirmed) return;
    setRemindingAll(true);
    await remind();
    setRemindingAll(false);
  };

  const exportReport = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    // Resumen por coordinador
    const summary = [['Supervisor', 'Esperadas', 'Enviadas', 'Faltantes', 'Cumplimiento %'], ...data.coordinators.map((c) => [c.name, c.expectedCount, c.submittedCount, c.missingCount, c.expectedCount ? Math.round((c.submittedCount / c.expectedCount) * 100) : 0])];
    const wsS = XLSX.utils.aoa_to_sheet(summary);
    wsS['!cols'] = [{ wch: 32 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsS, 'Resumen');
    // Detalle de faltantes
    const detail: (string | number)[][] = [['Supervisor', 'Proyecto', 'Área', 'Turnos del día', 'Día', 'Fecha faltante']];
    data.coordinators.forEach((c) =>
      c.projects.forEach((a) =>
        a.missingDates.forEach((d) => {
          const wd = weekdayOf(d);
          const turnosDelDia = a.turnosInfo ? a.turnosInfo.filter((t) => !t.days?.length || t.days.includes(wd)).map((t) => t.name) : a.turnos;
          detail.push([c.name, a.projectName, a.areas.join(', '), turnosDelDia.join(', '), DIAS[wd], fmtDate(d)]);
        }),
      ),
    );
    const wsD = XLSX.utils.aoa_to_sheet(detail);
    wsD['!cols'] = [{ wch: 32 }, { wch: 22 }, { wch: 18 }, { wch: 40 }, { wch: 6 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsD, 'Faltantes');
    XLSX.writeFile(wb, `cumplimiento_novedades_${from}_a_${to}.xlsx`);
    setShowReport(false);
  };

  return (
    <div className="space-y-4">
      {/* Acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/*
            Siempre hay un chip diciendo sobre quién se está mirando. Sin coordinador elegido antes no
            se dibujaba nada, y el calendario de "todos" se veía igual que el de alguien en particular:
            no había forma de saber qué estabas mirando salvo acordarte.
          */}
          {selectedCoordinator ? (
            <button onClick={() => setSelectedCoordinatorId(null)} title="Ver todos los supervisores" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/40">
              <FontAwesomeIcon icon={faUser} />
              {selectedCoordinator.name}
              <FontAwesomeIcon icon={faXmark} className="opacity-70" />
            </button>
          ) : (
            // Sin ✕: no hay filtro que sacar, esto ya es el estado sin filtrar.
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-semibold" title="Estás viendo el calendario combinado de todos los supervisores">
              <FontAwesomeIcon icon={faUsers} />
              Todos los supervisores
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-500/15">{(data?.coordinators || []).length}</span>
            </span>
          )}
          {selectedCoordinator && (
            <button
              onClick={() => setShowFaltantes(true)}
              // Mismo tratamiento que un día vencido en el calendario y que las filas del listado:
              // fondo rojo translúcido y borde fino rojo. El rojo sólido competía con "Recordar" y
              // parecía otra cosa.
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              title={`Ver las novedades que le faltan a ${selectedCoordinator.name}`}
            >
              <FontAwesomeIcon icon={faCircleInfo} />
              Novedades que le faltan
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-500/15 dark:bg-red-500/25">{selectedCoordinator.missingCount}</span>
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowReport(true)} disabled={!data} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50">
            <FontAwesomeIcon icon={faFileExcel} /> Informe
          </button>
          <button onClick={remindAll} disabled={!data || remindingAll || !data.coordinators.some((c) => c.missingCount > 0)} className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
            <FontAwesomeIcon icon={remindingAll ? faSpinner : faBell} className={remindingAll ? 'animate-spin' : ''} /> Recordar
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {isFutureMonth && <div className="rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-3 text-sm text-gray-500">Mes futuro: no hay días esperados todavía.</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
        {/* Calendario */}
        <div className="xl:col-span-2 relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 rounded">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin text-blue-500 text-2xl" />
            </div>
          )}
          <ActivityLogCalendar
            complianceByDate={complianceByDate}
            dayLabels={dayLabels}
            controlledMonth={viewMonth}
            onMonthChange={setViewMonth}
            onDayClick={(day, status) => {
              const d = format(day, 'yyyy-MM-dd');
              // Día reportado con Nº de novedad → abrir su detalle.
              const code = dayLabels?.[d];
              if (code && onOpenReport) {
                onOpenReport(code.split(',')[0].trim()); // si coordina varios proyectos, el primero
                return;
              }
              if (status === 'missing' || status === 'partial') setSelectedDay(d);
            }}
          />
        </div>

        {/* Panel de coordinadores */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200">Supervisores</h4>
            {selectedCoordinatorId ? (
              <button onClick={() => setSelectedCoordinatorId(null)} title="Volver al calendario de todos los supervisores" className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-bold text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                <FontAwesomeIcon icon={faUsers} /> Ver todos
              </button>
            ) : (
              <span className="text-[10px] text-gray-400">Clickeá uno para ver su calendario</span>
            )}
          </div>
          {/*
            `flex-1 min-h-0` en vez de un alto fijo: la lista ocupa lo que sobra de la celda del grid,
            así que crece con el alto del calendario en vez de cortarse a 560px y dejar aire abajo. El
            `min-h-0` es lo que permite que un hijo de flex se achique por debajo de su contenido y
            aparezca su propio scroll. El tope en `svh` es para que en pantallas muy altas no se pase
            del modal, que mide 96svh.
          */}
          <div className="space-y-1.5 flex-1 min-h-0 max-h-[calc(96svh-260px)] overflow-y-auto pr-1">
            {(data?.coordinators || []).length === 0 && !loading && <p className="text-xs text-gray-400 px-1 py-4 text-center">Sin supervisores con asignaciones en este período/filtro.</p>}
            {(data?.coordinators || []).map((c) => (
              <CoordinatorRow key={c.userId} c={c} selected={selectedCoordinatorId === c.userId} onSelect={() => setSelectedCoordinatorId((cur) => (cur === c.userId ? null : c.userId))} reminding={remindingIds.has(c.userId)} onRemind={() => remindOne(c.userId)} />
            ))}
          </div>
        </div>
      </div>

      {selectedCoordinator && (
        <Modal
          isOpen={showFaltantes}
          onClose={() => setShowFaltantes(false)}
          title={
            <span className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <FontAwesomeIcon icon={faCircleInfo} />
              Novedades que le faltan a {selectedCoordinator.name}
            </span>
          }
          subtitle={`${selectedCoordinator.missingCount} en ${fmtDate(from)} – ${fmtDate(to)} · Cada novedad cubre el día completo del supervisor en el proyecto (incluye los turnos que corren ese día).`}
          size="md"
          zIndex={60}
        >
          {selectedCoordinator.missingCount === 0 ? (
            <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
              <FontAwesomeIcon icon={faCircleCheck} /> Está al día: no le falta ninguna novedad en el período.
            </p>
          ) : (
            <div className="space-y-1.5">
              {selectedCoordinator.projects.flatMap((p) =>
                p.missingDates.map((d) => {
                  const wd = weekdayOf(d);
                  // Turnos que efectivamente corren ese día (si el backend mandó los días).
                  const turnosDelDia = p.turnosInfo ? p.turnosInfo.filter((t) => !t.days?.length || t.days.includes(wd)).map((t) => t.name) : p.turnos;
                  return (
                    <div key={`${p.projectId}-${d}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/15 px-3 py-2">
                      <span className="text-sm font-bold text-red-700 dark:text-red-300 w-28 shrink-0">
                        {DIAS[wd]} {fmtDate(d)}
                      </span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{p.projectName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold uppercase">{p.areas.join(', ')}</span>
                      {turnosDelDia.map((t, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-400 font-semibold">
                          {t}
                        </span>
                      ))}
                    </div>
                  );
                }),
              )}
            </div>
          )}
        </Modal>
      )}

      {/* Drill-down de un día */}
      <Modal isOpen={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay ? `Faltantes del ${fmtDate(selectedDay)}` : ''} size="md">
        {selectedDayData && selectedDayData.missingCells.length > 0 ? (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {selectedDayData.missingCells.map((cell, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{cell.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {cell.projectName} · {cell.label}
                  </p>
                </div>
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-red-500" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <FontAwesomeIcon icon={faCircleCheck} className="text-green-500" /> Sin faltantes ese día.
          </p>
        )}
      </Modal>

      {/* Confirmación de informe */}
      <Modal isOpen={showReport} onClose={() => setShowReport(false)} title="Exportar informe de cumplimiento" size="sm">
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Se exporta un Excel con el resumen por supervisor y el detalle de novedades faltantes del período {fmtDate(from)} al {fmtDate(to)}.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setShowReport(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">
            Cancelar
          </button>
          <button onClick={exportReport} className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
            Descargar Excel
          </button>
        </div>
      </Modal>
    </div>
  );
};

const CoordinatorRow: React.FC<{ c: CoordinatorCompliance; selected: boolean; onSelect: () => void; reminding: boolean; onRemind: () => void }> = ({ c, selected, onSelect, reminding, onRemind }) => {
  // Rojo SÓLO si tiene novedades con el plazo vencido. Las que todavía puede cargar son "pendientes".
  const pending = c.pendingCount ?? 0;
  const expired = c.expiredCount ?? Math.max(0, c.missingCount - pending);
  const isLate = expired > 0;
  const hasMissing = c.missingCount > 0;
  const border = selected ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-400/40' : isLate ? 'border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-900/10' : 'border-gray-200 dark:border-gray-600';
  return (
    <div onClick={onSelect} title="Ver el calendario de este supervisor" className={`cursor-pointer transition-all rounded-lg border px-3 py-2 hover:shadow-sm ${border}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{c.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span>
              {c.submittedCount}/{c.expectedCount} enviadas
            </span>
            {expired > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-600 dark:text-red-400">
                {expired} vencida{expired > 1 ? 's' : ''}
              </span>
            )}
            {pending > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400">{pending} a tiempo</span>}
          </p>
        </div>
        {hasMissing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemind();
            }}
            disabled={reminding}
            title="Enviar recordatorio"
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50"
          >
            <FontAwesomeIcon icon={reminding ? faSpinner : faBell} className={reminding ? 'animate-spin' : ''} /> Recordar
          </button>
        )}
      </div>
      {/* Proyecto · área · turno: SIEMPRE, no solo en el seleccionado. Es lo que distingue a dos
          coordinadores con números parecidos, y tenerlo escondido obligaba a clickear uno por uno
          para saber de qué equipo era cada quien. El borde acompaña el estado de la tarjeta. */}
      {c.projects.length > 0 && (
        <div className={`mt-2 pt-2 border-t space-y-1 ${selected ? 'border-blue-200 dark:border-blue-800' : 'border-gray-100 dark:border-gray-700'}`}>
          {c.projects.map((p) => (
            <p key={p.projectId} className="text-[10px] text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-700 dark:text-gray-300">{p.projectName}</span> · {p.areas.join(', ')} · {p.turnos.join(', ')}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};
