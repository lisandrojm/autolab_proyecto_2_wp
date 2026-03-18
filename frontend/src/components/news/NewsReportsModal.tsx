import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, eachDayOfInterval } from "date-fns";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExport, faCalendar, faBriefcase, faUser, faClock, faUserSlash, faMoneyBillWave, faSearch, faFileContract, faTimes, faIdBadge, faCalendarDays, faHourglassHalf, faDollarSign, faClipboardList, faLocationDot, faStar, faFileExcel, faCircleInfo, faChartSimple, faFileLines } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { User, UserProjectMetadata } from "../../api/users";
import { overtimeUtils, OvertimeSettings } from "../../utils/overtimeUtils";
import * as XLSX from "xlsx";

// This works with the already-formatted data from RequestsPage
interface FormattedReport {
  id: string;
  reportNumber?: string;
  date: string;
  projectIdRaw?: string;
  projectName: string;
  submittedBy: string;
  attendance: {
    id: string;
    employeeId: any;
    employeeName: string;
    status: string;
    overtimeHours: number;
    hasOvertime: boolean;
    absenceReason?: string;
    replacementName?: string;
    [key: string]: any;
  }[];
  [key: string]: any;
}

interface NewsReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reports: FormattedReport[];
  allUsers: User[];
  allProjects: { id: string; name: string }[];
}

interface EmployeeStats {
  employeeId: string;
  employeeName: string;
  absences: number;
  absenceDetails: Record<string, number>; // reason -> count
  overtimeHours: number;
  overtime50: number;
  overtime100: number;
  daysPresent: number;
  lateDays: number;
  totalRecords: number;
  sueldoJornada: number;
  sueldoMano: number;
  projectNames: string[];
  userProjectsData: UserProjectMetadata[];
  schedules: string[];
  overtimeEntries: { date: string; schedule: string; pct: number; hours: number }[];
  contractHoursPerDay: number;
  cantidadJornadasLaborales: number;
  activeContractsCount: number;
  hasContractSchedules: boolean;
  rowProjectId?: string;
  rowProjectName?: string;
  rowKey: string; // Unique identifier for the UI row
  contractType?: string;
  contractAlta?: string;
  contractBaja?: string;
  dailyAttendance: Record<string, { 
    status: string; 
    reason?: string;
    overtimeHours?: number;
    h50?: number;
    h100?: number;
    pct?: number;
    entryTime?: string;
    exitTime?: string;
  }>;
}

const getDailyHoursFromContract = (horaInicio?: string, horaFin?: string): number => {
  if (!horaInicio || !horaFin) return 8; // Default 8 hours
  const parseTime = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + (m || 0);
  };

  const startMinutes = parseTime(horaInicio);
  let endMinutes = parseTime(horaFin);

  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60; // Next day
  }

  return (endMinutes - startMinutes) / 60;
};

// Contract Detail Sub-Modal
// Improved isActiveContract to check for status and period overlap
const isActiveContract = (contract: any, periodStart?: Date, periodEnd?: Date) => {
  if (!contract.fecha_alta_contrato) return false;

  const getLocalMidnight = (dateString: string) => {
    if (!dateString) return null;
    const isoDate = dateString.substring(0, 10);
    const parts = isoDate.split("-");
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
    }
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Status check - many employees might have active-looking dates but are marked as BAJA
  const status = (contract.nombre_estado_empleado || "").toLowerCase();
  if (status.includes("baja") || status.includes("inactivo")) return false;

  const altaDate = getLocalMidnight(contract.fecha_alta_contrato);
  if (!altaDate) return false;

  const bajaDate = contract.fecha_baja_contrato ? getLocalMidnight(contract.fecha_baja_contrato) : null;

  // Use current date for "is it active now" or overlap with period
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // If period is provided, check for overlap
  if (periodStart && periodEnd) {
    if (bajaDate && bajaDate < periodStart) return false;
    if (altaDate > periodEnd) return false;
    return true;
  }

  // Fallback to "active now"
  if (bajaDate) {
    return today >= altaDate && today <= bajaDate;
  }
  return today >= altaDate;
};

const ContractDetailModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  employeeName: string;
  userProjectsData: UserProjectMetadata[];
  filterProjectId?: string;
  zIndex?: number;
  periodStart?: Date;
  periodEnd?: Date;
}> = ({ isOpen, onClose, employeeName, userProjectsData, filterProjectId, zIndex, periodStart, periodEnd }) => {
  const [showActiveOnly, setShowActiveOnly] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setShowActiveOnly(true);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // If a project filter is active, try to find the matching UserProject
  const relevantProjects = filterProjectId
    ? userProjectsData.filter((up) => {
        const upProjId = typeof up.projectId === "object" ? up.projectId?._id : up.projectId;
        return upProjId === filterProjectId;
      })
    : userProjectsData;

  // If filter produced no results, show all
  const projectsToShow = relevantProjects.length > 0 ? relevantProjects : userProjectsData;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 animate-fade-in" style={{ zIndex: zIndex || 60 }} onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FontAwesomeIcon icon={faFileContract} className="text-blue-600 dark:text-blue-400" />
              Detalle de Contrato
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{employeeName}</p>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center cursor-pointer gap-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Mostrar activos</span>
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={showActiveOnly} onChange={(e) => setShowActiveOnly(e.target.checked)} />
                <div className={`block w-10 h-6 rounded-full transition-colors ${showActiveOnly ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}></div>
                <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showActiveOnly ? "transform translate-x-4" : ""}`}></div>
              </div>
            </label>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              <FontAwesomeIcon icon={faTimes} className="text-lg" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(80vh-70px)] p-6 space-y-6">
          {projectsToShow.length === 0 ? (
            <div className="text-center py-8 text-gray-500 italic">No se encontraron datos de contrato.</div>
          ) : (
            projectsToShow.map((up, upIdx) => (
              <div key={upIdx} className="space-y-4">
                {/* Project Header */}
                <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <FontAwesomeIcon icon={faBriefcase} className="text-blue-500" />
                  <span className="font-semibold text-gray-900 dark:text-white">{up.nombre_proyecto}</span>
                  {up.nombre_rol_frame && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">{up.nombre_rol_frame}</span>}
                </div>

                {/* Contracts within the project */}
                {up.contracts && up.contracts.length > 0 ? (
                  (() => {
                    const filteredContracts = showActiveOnly ? up.contracts.filter((c) => isActiveContract(c, periodStart, periodEnd) || isActiveContract(c)) : up.contracts;

                    if (filteredContracts.length === 0) {
                      return <div className="text-sm text-gray-400 italic py-2">Sin contratos activos para este proyecto.</div>;
                    }

                    return filteredContracts.map((contract, cIdx) => (
                      <div key={cIdx} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 border border-gray-100 dark:border-gray-700 space-y-3">
                        {/* Contract title */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            Contrato #{cIdx + 1} {contract.nombre_contrato ? `— ${contract.nombre_contrato}` : ""}
                          </span>
                          {contract.nombre_estado_empleado && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${contract.nombre_estado_empleado?.toLowerCase().includes("activ") ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300"}`}>{contract.nombre_estado_empleado}</span>}
                        </div>

                        {/* Contract details grid */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                          <ContractField icon={faCalendarDays} label="Alta" value={formatContractDate(contract.fecha_alta_contrato)} highlight={isActiveContract(contract)} />
                          <ContractField icon={faCalendarDays} label="Baja" value={formatContractDate(contract.fecha_baja_contrato)} highlight={isActiveContract(contract)} />
                          <ContractField icon={faDollarSign} label="Sueldo Jornada" value={contract.sueldo_jornada != null ? `$${Number(contract.sueldo_jornada).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"} highlight />
                          <ContractField icon={faDollarSign} label="Sueldo Mano" value={contract.sueldo_mano != null ? `$${Number(contract.sueldo_mano).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"} highlight />
                          <ContractField icon={faHourglassHalf} label="Jornadas Lab." value={contract.cantidad_jornadas_laborales?.toString() || "-"} />
                          <ContractField icon={faLocationDot} label="Sede" value={contract.nombre_sede || "-"} />
                          <ContractField icon={faIdBadge} label="Rol" value={contract.nombre_rol_frame || "-"} />
                          <ContractField icon={faStar} label="Categoría SAT" value={contract.nombre_categoria_sat || "-"} />
                          <ContractField icon={faClock} label="Hora Inicio" value={contract.hora_inicio || "-"} />
                          <ContractField icon={faClock} label="Hora Fin" value={contract.hora_fin || "-"} />
                        </div>

                        {/* Observations */}
                        {contract.observaciones && (
                          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                            <div className="flex items-start gap-2">
                              <FontAwesomeIcon icon={faClipboardList} className="text-gray-400 mt-0.5 text-xs" />
                              <div>
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Observaciones</span>
                                <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{contract.observaciones}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ));
                  })()
                ) : (
                  <div className="text-sm text-gray-400 italic py-2">Sin contratos registrados para este proyecto.</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// Helper to format contract dates
function formatContractDate(dateStr?: string): string {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
}

// Helper component for contract field rows
const ContractField: React.FC<{ icon: any; label: string; value: string; highlight?: boolean }> = ({ icon, label, value, highlight }) => (
  <div className="flex items-center gap-2">
    <FontAwesomeIcon icon={icon} className="text-gray-400 text-xs w-3" />
    <span className="text-gray-500 dark:text-gray-400 text-xs">{label}:</span>
    <span className={`font-medium text-xs ${highlight ? "text-green-600 dark:text-green-400" : "text-gray-800 dark:text-gray-200"}`}>{value}</span>
  </div>
);

// Row Total Detail Sub-Modal
const TotalDetailModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  stats: EmployeeStats | null;
  glossary: OvertimeSettings;
  zIndex?: number;
}> = ({ isOpen, onClose, stats, glossary, zIndex }) => {
  if (!isOpen || !stats) return null;

  const salaryDivisor = glossary.salaryDivisorPercentage || 150;
  const baseHourCost = stats.sueldoMano / salaryDivisor;
  const cost50 = stats.overtime50 * baseHourCost * (1 + glossary.pct50 / 100);
  const cost100 = stats.overtime100 * baseHourCost * (1 + glossary.pct100 / 100);
  const liquidDays = stats.cantidadJornadasLaborales - stats.absences;
  const baseSalaryMonto = stats.sueldoJornada * liquidDays;
  const total = baseSalaryMonto + cost50 + cost100;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 animate-fade-in" style={{ zIndex: zIndex || 100 }} onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full overflow-hidden border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FontAwesomeIcon icon={faMoneyBillWave} className="text-green-600" />
            Cálculo de Monto Total
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="pb-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-bold text-gray-900 dark:text-white uppercase">{stats.employeeName}</p>
            <p className="text-[10px] text-gray-500 uppercase truncate">{stats.rowProjectName}</p>
          </div>

          <div className="space-y-2.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Jornadas en período:</span>
              <span className="font-medium text-gray-900 dark:text-white text-right">{stats.cantidadJornadasLaborales}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Ausencias:</span>
              <span className="font-medium text-red-600 text-right">-{stats.absences}</span>
            </div>
            <div className="flex justify-between text-xs font-bold border-t border-dashed border-gray-200 dark:border-gray-700 pt-2">
              <span>Días a liquidar:</span>
              <span className="text-right">{liquidDays}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Sueldo por jornada:</span>
              <span className="font-medium text-right">${stats.sueldoJornada.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-xs bg-green-50 dark:bg-green-900/10 p-2 rounded">
              <span className="font-semibold text-green-700 dark:text-green-400">Total Sueldo Base:</span>
              <span className="font-bold text-green-700 dark:text-green-400 text-right">${baseSalaryMonto.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            <div className="mt-4 pt-2 border-t border-gray-100 dark:border-gray-700">
              <p className="text-[9px] font-bold text-gray-400 uppercase mb-1.5">Monto por Horas Extras</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">
                    {stats.overtime50}hs extra al {glossary.pct50}%:
                  </span>
                  <span className="text-right">${cost50.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">
                    {stats.overtime100}hs extra al {glossary.pct100}%:
                  </span>
                  <span className="text-right">${cost100.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t-2 border-green-500 flex justify-between items-center text-base font-black text-green-600 dark:text-green-400">
              <span>MONTO TOTAL:</span>
              <span className="text-right">${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/30 px-6 py-3 text-[9px] text-gray-400 dark:text-gray-500 italic text-center">* El monto base se calcula sobre los días de contrato en el período menos las ausencias registradas.</div>
      </div>
    </div>
  );
};

// --- DAILY DETALLE MODAL ---
interface DailyDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: EmployeeStats | null;
  dateFrom: string;
  dateTo: string;
  zIndex?: number;
}

const DailyDetailModal: React.FC<DailyDetailModalProps> = ({ isOpen, onClose, stats, dateFrom, dateTo, zIndex }) => {
  if (!isOpen || !stats) return null;

  const dates = eachDayOfInterval({ start: parseISO(dateFrom), end: parseISO(dateTo) });
  const daysMap: Record<string, string> = { Monday: "Lun", Tuesday: "Mar", Wednesday: "Mie", Thursday: "Jue", Friday: "Vie", Saturday: "Sab", Sunday: "Dom" };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 animate-fade-in" style={{ zIndex: zIndex || 100 }} onClick={onClose}>
      <div className="bg-[#121826] text-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-gray-800 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800/50 flex items-center justify-between bg-gray-900/50">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-500/70 mb-1">Detalle Diario de Asistencia</h3>
            <p className="text-xl font-bold text-white">{stats.employeeName}</p>
            <p className="text-xs text-gray-500 font-medium">{stats.rowProjectName || "Sin Proyecto"}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-2 bg-white/5 rounded-full">
            <FontAwesomeIcon icon={faTimes} className="text-xl" />
          </button>
        </div>

        {/* Filters/Stats Bar */}
        <div className="px-6 py-3 bg-[#1a2234] border-b border-gray-800/50 flex flex-wrap gap-4 items-center">
          <div className="flex gap-4">
            <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-700/30">
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Pres:</span>
              <span className="text-sm font-bold text-green-500">{stats.daysPresent}</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-700/30">
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Aus:</span>
              <span className="text-sm font-bold text-red-500">{stats.absences}</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-700/30">
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Extra:</span>
              <span className="text-sm font-bold text-amber-500">{stats.overtimeHours}h</span>
            </div>
          </div>
          <div className="h-4 w-[1px] bg-gray-700 mx-2 hidden sm:block"></div>
          <div className="text-[10px] text-gray-400 font-medium">
            Período: <span className="text-blue-400 font-bold">{dateFrom.split("-").reverse().join("/")}</span> al <span className="text-blue-400 font-bold">{dateTo.split("-").reverse().join("/")}</span>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto bg-[#121826]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#121826] shadow-md z-10">
              <tr className="bg-gray-800/50 text-[10px] uppercase tracking-wider text-gray-400 font-bold border-b border-gray-700">
                <th className="py-3 px-6">Fecha / Día</th>
                <th className="py-3 px-6 text-center">Estado de Asistencia</th>
                <th className="py-3 px-6">Motivo / Detalle de Novedad</th>
                <th className="py-3 px-6 text-right">Información de Hs. Extras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {dates.map((date) => {
                const dateKey = format(date, "yyyy-MM-dd");
                const attendance = stats.dailyAttendance[dateKey];
                const dayName = format(date, "EEEE");
                const shortDay = daysMap[dayName] || format(date, "eee");

                return (
                  <tr key={dateKey} className={`hover:bg-white/[0.02] transition-colors ${attendance?.status === "absent" ? "bg-red-500/[0.02]" : ""}`}>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-200">{format(date, "dd/MM")}</span>
                        <span className="text-[10px] font-medium text-gray-500 uppercase py-0.5 px-2 bg-gray-800 rounded">{shortDay}</span>
                      </div>
                    </td>
                    <td className="py-3 px-6 text-center">
                      {attendance ? (
                        <span
                          className={`text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-widest border ${
                            attendance.status === "present"
                              ? "bg-green-500/10 text-green-500 border-green-500/20"
                              : attendance.status === "absent"
                                ? "bg-red-500/10 text-red-500 border-red-500/20"
                                : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                          }`}
                        >
                          {attendance.status === "present" ? "Presente" : attendance.status === "absent" ? "Ausente" : "Tardanza"}
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-gray-700 uppercase italic opacity-20">Sin Registro</span>
                      )}
                    </td>
                    <td className="py-3 px-6">
                      <span className="text-[11px] text-gray-400 italic">
                        {attendance?.reason ? (
                          <span className={`${attendance.status === "absent" ? "text-red-400 font-medium" : ""}`}>{attendance.reason}</span>
                        ) : "-"}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      {attendance?.overtimeHours ? (
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-bold text-blue-400">+{attendance.overtimeHours} h</span>
                          <span className="text-[9px] font-medium text-gray-500 uppercase tracking-tighter">
                            {attendance.pct}% • {attendance.entryTime} - {attendance.exitTime}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-700 text-sm">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#1a2234] border-t border-gray-800/50 flex justify-end">
          <button onClick={onClose} className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-all">
            Cerrar Detalle
          </button>
        </div>
      </div>
    </div>
  );
};

export const NewsReportsModal: React.FC<NewsReportsModalProps> = ({ isOpen, onClose, reports, allUsers, allProjects }) => {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [projectFilter, setProjectFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [contractModal, setContractModal] = useState<{ open: boolean; employeeName: string; data: UserProjectMetadata[] }>({ open: false, employeeName: "", data: [] });
  const [totalDetail, setTotalDetail] = useState<{ open: boolean; stats: EmployeeStats | null }>({ open: false, stats: null });
  const [dailyDetailModal, setDailyDetailModal] = useState<{ open: boolean; stats: EmployeeStats | null }>({ open: false, stats: null });
  const [showGlossary, setShowGlossary] = useState(false);
  const [showCalcInfo, setShowCalcInfo] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showActiveTableOnly, setShowActiveTableOnly] = useState(true);
  const [contractTypeFilter, setContractTypeFilter] = useState("all");
  const [glossary, setGlossary] = useState<OvertimeSettings>(overtimeUtils.getGlossary());

  useEffect(() => {
    if (isOpen) {
      setGlossary(overtimeUtils.getGlossary());
      setShowActiveTableOnly(true);
      setContractTypeFilter("all");
      setShowStats(false);
    }
  }, [isOpen]);

  const allContractTypes = useMemo(() => {
    const typesSet = new Set<string>();
    allUsers.forEach((u) => {
      u.metadata?.projects?.forEach((up) => {
        up.contracts?.forEach((c) => {
          const type = c.nombre_contrato;
          if (type && type.trim()) typesSet.add(type.trim());
        });
      });
    });
    return Array.from(typesSet).sort((a, b) => a.localeCompare(b));
  }, [allUsers]);

  // Helper to check if a time is within a range (format "HH:mm")
  const isTimeInRange = (time: string, start: string, end: string) => {
    const t = time.replace(":", "");
    const s = start.replace(":", "");
    const e = end.replace(":", "");
    if (s <= e) {
      return t >= s && t <= e;
    } else {
      // Over midnight case (not used in current logic but good practice)
      return t >= s || t <= e;
    }
  };

  // Helper to split overtime hours based on rules
  const splitOvertime = (date: string, startTime: string, endTime: string, totalHours: number) => {
    const d = new Date(date + "T00:00:00");
    const dayOfWeek = d.getDay(); // 0 Sunday, 1-5 Mon-Fri, 6 Sat

    // Sundays are always 100%
    if (dayOfWeek === 0) return { h50: 0, h100: totalHours };

    // For other days, we look at the start/end times if available
    if (startTime && endTime) {
      // Very simplified logic: if start time is in "day" range, we assume 50% for now
      // A more robust logic would calculate overlap with ranges
      let isDay = false;
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        isDay = isTimeInRange(startTime, glossary.weekdayDayStart, glossary.weekdayDayEnd);
      } else if (dayOfWeek === 6) {
        isDay = isTimeInRange(startTime, glossary.satDayStart, glossary.satDayEnd);
      }

      if (isDay) return { h50: totalHours, h100: 0 };
      return { h50: 0, h100: totalHours };
    }

    // Default fallback if no times: Mon-Fri 50%, Sat/Sun 100% (or adjust as needed)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) return { h50: totalHours, h100: 0, pct: glossary.pct50 };
    return { h50: 0, h100: totalHours, pct: glossary.pct100 };
  };

  // Build a map of userId -> User for quick lookup
  const usersMap = useMemo(() => {
    const map = new Map<string, User>();
    allUsers.forEach((u) => {
      if (u._id) map.set(u._id.toString(), u);
    });
    return map;
  }, [allUsers]);

  const statsByEmployee = useMemo(() => {
    const employeeMap = new Map<string, EmployeeStats>();
    const start = parseISO(dateFrom + "T00:00:00");
    const end = parseISO(dateTo + "T23:59:59");

    // Helper to normalize project names for consistent keys
    const normalizeProjectName = (name: string) =>
      (name || "")
        .trim()
        .toUpperCase()
        .replace(/[\s\-_]/g, "");

    const getLocalMidnight = (dateString: string) => {
      if (!dateString) return null;
      const isoDate = dateString.substring(0, 10);
      const parts = isoDate.split("-");
      if (parts.length === 3) {
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
      }
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const countContractOverlaps = (contracts: any[]) => {
      const coveredDates = new Set<string>();
      const startMs = start.getTime();
      const endMs = end.getTime();

      contracts.forEach((c) => {
        const cA = getLocalMidnight(c.fecha_alta_contrato);
        if (!cA) return;
        const cB = c.fecha_baja_contrato ? getLocalMidnight(c.fecha_baja_contrato) : null;

        let curr = new Date(cA);
        // Avoid infinite loop if no baja and we keep adding days
        const safetyEnd = cB ? cB.getTime() : endMs;

        while (curr.getTime() <= safetyEnd) {
          const t = curr.getTime();
          if (t >= startMs && t <= endMs) {
            coveredDates.add(curr.toISOString().substring(0, 10));
          }
          if (t >= endMs) break;
          curr.setDate(curr.getDate() + 1);
        }
      });
      return coveredDates.size;
    };

    // 1. Initialize from User Roster (Full Metadata Check)
    allUsers.forEach((user) => {
      if (!user._id) return;
      const userIdStr = user._id.toString();
      const userProjects = user.metadata?.projects || [];

      // Group metadata by normalized project name to merge contracts/IDs
      const groupedProjects = new Map<
        string,
        {
          originalName: string;
          projectId: string | undefined;
          allContracts: any[];
        }
      >();

      userProjects.forEach((up) => {
        const rawName = up.nombre_proyecto || "Desconocido";
        const normName = normalizeProjectName(rawName);
        if (normName === "DESCONOCIDO" && !up.projectId) return;

        if (!groupedProjects.has(normName)) {
          groupedProjects.set(normName, {
            originalName: rawName.trim(),
            projectId: typeof up.projectId === "object" ? up.projectId?._id : up.projectId,
            allContracts: [],
          });
        }
        const group = groupedProjects.get(normName)!;
        if (up.contracts) group.allContracts.push(...up.contracts);
      });

      // Process each unique project for this user
      groupedProjects.forEach((group, normName) => {
        const { originalName, projectId, allContracts } = group;

        // Project Filter check
        if (projectFilter !== "all") {
          const filterProj = allProjects.find((p) => p.id === projectFilter);
          const filterNorm = normalizeProjectName(filterProj?.name || "");
          if (projectId !== projectFilter && normName !== filterNorm) return;
        }

        // Active Contract filter
        const activeContracts = allContracts.filter((c) => isActiveContract(c, start, end));
        const activeCount = activeContracts.length;

        // STRICT: If switch is on, skip this project row if no active contracts overlap the period
        if (showActiveTableOnly && activeCount === 0) return;

        // Contract Type Filter check
        if (contractTypeFilter !== "all") {
          const targetsForFilter = showActiveTableOnly ? activeContracts : allContracts;
          const hasType = targetsForFilter.some((c) => c.nombre_contrato === contractTypeFilter);
          if (!hasType) return;
        }

        const mapKey = `${userIdStr}-${normName}`;

        // Pick best info from available contracts
        const targetList = showActiveTableOnly ? activeContracts : allContracts;
        let sueldoJornada = 0;
        let sueldoMano = 0;
        let contractHoursPerDay = 8;
        let cantidadJornadasLaborales = 0;
        let contractSchedules: string[] = [];

        targetList.forEach((contract) => {
          if (contract.hora_inicio && contract.hora_fin) {
            const hours = getDailyHoursFromContract(contract.hora_inicio, contract.hora_fin);
            const sched = `${contract.hora_inicio}-${contract.hora_fin} | ${hours}hs`;
            if (!contractSchedules.includes(sched)) contractSchedules.push(sched);
          }
        });

        let contractType = "";
        let contractAlta = "";
        let contractBaja = "";

        if (targetList.length > 0) {
          const last = targetList[targetList.length - 1]; // Latest contract
          sueldoJornada = last.sueldo_jornada || 0;
          sueldoMano = last.sueldo_mano || 0;
          if (last.hora_inicio && last.hora_fin) {
            contractHoursPerDay = getDailyHoursFromContract(last.hora_inicio, last.hora_fin);
          }
          contractType = last.nombre_contrato || "";
          contractAlta = last.fecha_alta_contrato || "";
          contractBaja = last.fecha_baja_contrato || "";

          // REVISED: Calculate overlap days instead of taking static value
          cantidadJornadasLaborales = countContractOverlaps(targetList);
        }

        employeeMap.set(mapKey, {
          employeeId: userIdStr,
          employeeName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Sin Nombre",
          absences: 0,
          absenceDetails: {},
          overtimeHours: 0,
          daysPresent: 0,
          lateDays: 0,
          totalRecords: 0,
          sueldoJornada,
          sueldoMano,
          projectNames: user.projectIds?.map((p) => p.name) || [],
          userProjectsData: userProjects,
          overtime50: 0,
          overtime100: 0,
          schedules: [...contractSchedules],
          overtimeEntries: [],
          contractHoursPerDay,
          cantidadJornadasLaborales,
          activeContractsCount: activeCount,
          hasContractSchedules: contractSchedules.length > 0,
          rowProjectId: projectId,
          rowProjectName: originalName,
          rowKey: mapKey,
          contractType,
          contractAlta,
          contractBaja,
          dailyAttendance: {},
        });
      });
    });

    // 2. Process Attendance Reports
    reports.forEach((report) => {
      try {
        const reportDate = parseISO(report.date + "T00:00:00");
        if (!isWithinInterval(reportDate, { start, end })) return;
      } catch {
        return;
      }

      if (projectFilter !== "all" && report.projectIdRaw !== projectFilter) return;

      report.attendance.forEach((record) => {
        const rawId = typeof record.employeeId === "object" ? record.employeeId?._id : record.employeeId;
        if (!rawId) return;
        const empIdStr = rawId.toString();

        const reportProjName = report.projectName || allProjects.find((p) => p.id === (report.projectIdRaw || ""))?.name || "Sin Proyecto";
        const normReportProjName = normalizeProjectName(reportProjName);
        const mapKey = `${empIdStr}-${normReportProjName}`;

        // Fallback Initialization (if not in roster or skipped previously)
        if (!employeeMap.has(mapKey)) {
          const user = usersMap.get(empIdStr);
          const userProjects = user?.metadata?.projects || [];

          let sueldoJornada = 0;
          let sueldoMano = 0;
          let contractHoursPerDay = 8;
          let cantidadJornadasLaborales = 0;
          let activeCount = 0;
          let contractSchedules: string[] = [];

          // Find matches in metadata by name
          const matchContracts: any[] = [];
          userProjects.forEach((up) => {
            if (normalizeProjectName(up.nombre_proyecto || "") === normReportProjName) {
              if (up.contracts) matchContracts.push(...up.contracts);
            }
          });

          const activeContracts = matchContracts.filter((c) => isActiveContract(c, start, end));
          activeCount = activeContracts.length;

          // STRICT: Skip addition if filter is on and no active contract
          if (showActiveTableOnly && activeCount === 0) return;

          // Contract Type Filter check
          if (contractTypeFilter !== "all") {
            const targetsForFilter = showActiveTableOnly ? activeContracts : matchContracts;
            const hasType = targetsForFilter.some((c) => c.nombre_contrato === contractTypeFilter);
            if (!hasType) return;
          }

          const targets = showActiveTableOnly ? activeContracts : matchContracts;
          targets.forEach((c) => {
            if (c.hora_inicio && c.hora_fin) {
              const h = getDailyHoursFromContract(c.hora_inicio, c.hora_fin);
              const s = `${c.hora_inicio}-${c.hora_fin} | ${h}hs`;
              if (!contractSchedules.includes(s)) contractSchedules.push(s);
            }
          });

          let contractType = "";
          let contractAlta = "";
          let contractBaja = "";

          if (targets.length > 0) {
            const last = targets[targets.length - 1];
            sueldoJornada = last.sueldo_jornada || 0;
            sueldoMano = last.sueldo_mano || 0;
            contractHoursPerDay = getDailyHoursFromContract(last.hora_inicio, last.hora_fin);
            contractType = last.nombre_contrato || "";
            contractAlta = last.fecha_alta_contrato || "";
            contractBaja = last.fecha_baja_contrato || "";

            // REVISED: Calculate overlap days
            cantidadJornadasLaborales = countContractOverlaps(targets);
          }

          employeeMap.set(mapKey, {
            employeeId: empIdStr,
            employeeName: record.employeeName || (user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "Desconocido"),
            absences: 0,
            absenceDetails: {},
            overtimeHours: 0,
            daysPresent: 0,
            lateDays: 0,
            totalRecords: 0,
            sueldoJornada,
            sueldoMano,
            projectNames: user?.projectIds?.map((p) => p.name) || [],
            userProjectsData: userProjects,
            overtime50: 0,
            overtime100: 0,
            schedules: [...contractSchedules],
            overtimeEntries: [],
            contractHoursPerDay,
            cantidadJornadasLaborales,
            activeContractsCount: activeCount,
            hasContractSchedules: contractSchedules.length > 0,
            rowProjectId: report.projectIdRaw,
            rowProjectName: reportProjName,
            rowKey: mapKey,
            contractType,
            contractAlta,
            contractBaja,
            dailyAttendance: {},
          });
        }

        const stats = employeeMap.get(mapKey);
        if (!stats) return;

        stats.totalRecords += 1;
        if (record.status === "present" || record.status === "late") {
          stats.daysPresent += 1;
          if (record.status === "late") stats.lateDays += 1;
        } else {
          stats.absences += 1;
          const reason = record.absenceReason || "Sin motivo";
          stats.absenceDetails[reason] = (stats.absenceDetails[reason] || 0) + 1;
        }

        // Track daily attendance with normalized key
        const dateKey = report.date.substring(0, 10);
        const ot = record.overtimeHours || 0;
        const { h50, h100, pct } = splitOvertime(report.date, record.overtimeEntryTime, record.overtimeExitTime, ot);

        stats.dailyAttendance[dateKey] = {
          status: record.status,
          reason: record.absenceReason || (record.status === "late" ? "Tardanza" : undefined),
          overtimeHours: ot,
          h50,
          h100,
          pct: pct || (h100 > 0 ? glossary.pct100 : glossary.pct50),
          entryTime: record.overtimeEntryTime,
          exitTime: record.overtimeExitTime,
        };

        stats.overtimeHours += ot;
        stats.overtime50 += h50;
        stats.overtime100 += h100;

        if (ot > 0) {
          const oTSched = record.overtimeEntryTime && record.overtimeExitTime ? `${record.overtimeEntryTime}-${record.overtimeExitTime}` : "Hs. Seteadas";
          const dFmt = format(parseISO(report.date + "T00:00:00"), "dd/MM");
          stats.overtimeEntries.push({ date: dFmt, schedule: oTSched, pct: pct || (h100 > 0 ? glossary.pct100 : glossary.pct50), hours: ot });
        }
      });
    });

    // 3. Final Pass: Recalculate totals from dailyAttendance to ensure absolute consistency
    employeeMap.forEach((stats) => {
      const attendance = Object.values(stats.dailyAttendance);
      stats.daysPresent = attendance.filter((a) => a.status === "present" || a.status === "late").length;
      stats.lateDays = attendance.filter((a) => a.status === "late").length;
      stats.absences = attendance.filter((a) => a.status === "absent").length;
    });

    // 4. Final Filtering & Sorting
    let results = Array.from(employeeMap.values());

    // STRICT RE-CHECK: Guarantee no 0-contract rows exist if filter is on
    if (showActiveTableOnly) {
      results = results.filter((emp) => emp.activeContractsCount > 0);
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      results = results.filter((s) => s.employeeName.toLowerCase().includes(lowerSearch));
    }

    return results.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [reports, dateFrom, dateTo, projectFilter, searchTerm, usersMap, glossary, showActiveTableOnly, allUsers, allProjects, contractTypeFilter]);

  const formattedMonthLabel = useMemo(() => {
    try {
      const dFrom = parseISO(dateFrom + "T00:00:00");
      const dTo = parseISO(dateTo + "T00:00:00");
      return `${format(dFrom, "dd/MM/yyyy")} - ${format(dTo, "dd/MM/yyyy")}`;
    } catch {
      return `${dateFrom} - ${dateTo}`;
    }
  }, [dateFrom, dateTo]);

  const activeProjectName = useMemo(() => {
    if (projectFilter === "all") return "Todos los Proyectos";
    return allProjects.find((p) => p.id === projectFilter)?.name || "Filtro activo";
  }, [projectFilter, allProjects]);

  const totalAbsences = statsByEmployee.reduce((acc, curr) => acc + curr.absences, 0);
  const totalOvertime50 = statsByEmployee.reduce((acc, curr) => acc + curr.overtime50, 0);
  const totalOvertime100 = statsByEmployee.reduce((acc, curr) => acc + curr.overtime100, 0);
  const totalCost = statsByEmployee.reduce((acc, curr) => {
    const salaryDivisor = glossary.salaryDivisorPercentage || 150;
    const baseHour = curr.sueldoMano / salaryDivisor;
    const cost50 = curr.overtime50 * baseHour * (1 + glossary.pct50 / 100);
    const cost100 = curr.overtime100 * baseHour * (1 + glossary.pct100 / 100);
    return acc + cost50 + cost100;
  }, 0);
  const totalSalaries = statsByEmployee.reduce((acc, curr) => acc + curr.sueldoJornada * (curr.cantidadJornadasLaborales - curr.absences), 0);
  const grandTotal = totalSalaries + totalCost;
  const totalEmployees = statsByEmployee.length;

  const handleExport = () => {
    const headers = ["Empleado", "Sueldo Jornada", "Sueldo Mano", "Precio Hora", "Hora Base Ex.", "Hora 50% Ex.", "Hora 100% Ex.", "Jornadas", "Proyectos", "Días Presente", "Ausencias", "Detalle Ausencias", "Hs. 50%", "Hs. 100%", "Detalle Hs. Extras", "Monto Extras", "Monto Total"];
    const rows = statsByEmployee.map((s) => {
      const salaryDivisor = glossary.salaryDivisorPercentage || 150;
      const baseHour = s.sueldoMano / salaryDivisor;
      const vExtra50 = baseHour * (1 + glossary.pct50 / 100);
      const vExtra100 = baseHour * (1 + glossary.pct100 / 100);
      const m50 = s.overtime50 * vExtra50;
      const normalHora = s.sueldoJornada / s.contractHoursPerDay;
      const m100 = s.overtime100 * vExtra100;
      const otDetail = s.overtimeEntries.map((e) => `${e.date} (${e.pct}%): ${e.schedule}`).join("; ");
      const salaryMonto = s.sueldoJornada * (s.cantidadJornadasLaborales - s.absences);
      return [
        `"${s.employeeName}"`,
        s.sueldoJornada,
        s.sueldoMano,
        normalHora.toFixed(2),
        baseHour.toFixed(2),
        vExtra50.toFixed(2),
        vExtra100.toFixed(2),
        s.cantidadJornadasLaborales,
        `"${s.rowProjectName}"`,
        s.daysPresent,
        s.absences,
        `"${Object.entries(s.absenceDetails)
          .map(([r, c]) => `${r}: ${c}`)
          .join("; ")}"`,
        s.overtime50,
        s.overtime100,
        `"${otDetail}"`,
        (m50 + m100).toFixed(2),
        (salaryMonto + m50 + m100).toFixed(2),
      ];
    });

    const csvIntro = [
      `"Fecha Desde","${dateFrom}"`,
      `"Fecha Hasta","${dateTo}"`,
      "", // Empty line
    ];
    const csvContent = "\uFEFF" + [...csvIntro, headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    // ... rest same
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `reporte_novedades_${dateFrom}_a_${dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportXLS = () => {
    const headers = ["Empleado", "Sueldo Jornada", "Sueldo Mano", "Precio Hora", "Hora Base Ex.", "Hora 50% Ex.", "Hora 100% Ex.", "Jornadas", "Proyectos", "Días Presente", "Ausencias", "Detalle Ausencias", "Hs. 50%", "Hs. 100%", "Detalle Hs. Extras", "Monto Extras", "Monto Total"];

    const rows = statsByEmployee.map((s) => {
      const salaryDivisor = glossary.salaryDivisorPercentage || 150;
      const baseHour = s.sueldoMano / salaryDivisor;
      const vExtra50 = baseHour * (1 + glossary.pct50 / 100);
      const vExtra100 = baseHour * (1 + glossary.pct100 / 100);
      const m50 = s.overtime50 * vExtra50;
      const normalHora = s.sueldoJornada / s.contractHoursPerDay;
      const m100 = s.overtime100 * vExtra100;
      const otDetail = s.overtimeEntries.map((e) => `${e.date} (${e.pct}%): ${e.schedule}`).join("; ");
      const salaryMonto = s.sueldoJornada * (s.cantidadJornadasLaborales - s.absences);
      return [
        s.employeeName,
        s.sueldoJornada,
        s.sueldoMano,
        Number(normalHora.toFixed(2)),
        Number(baseHour.toFixed(2)),
        Number(vExtra50.toFixed(2)),
        Number(vExtra100.toFixed(2)),
        s.cantidadJornadasLaborales,
        s.rowProjectName,
        s.daysPresent,
        s.absences,
        Object.entries(s.absenceDetails)
          .map(([r, c]) => `${r}: ${c}`)
          .join("; "),
        s.overtime50,
        s.overtime100,
        otDetail,
        Number((m50 + m100).toFixed(2)),
        Number((salaryMonto + m50 + m100).toFixed(2)),
      ];
    });

    // Add totals row
    const totalMontoSueldos = statsByEmployee.reduce((a, c) => a + c.sueldoJornada * (c.cantidadJornadasLaborales - c.absences), 0);
    rows.push([
      `TOTALES (${totalEmployees} empleados)`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      statsByEmployee.reduce((a, c) => a + c.daysPresent, 0),
      totalAbsences,
      "",
      totalOvertime50,
      totalOvertime100,
      "", // Detail column empty for total
      Number(totalCost.toFixed(2)),
      Number((totalMontoSueldos + totalCost).toFixed(2)),
    ] as any);

    const introRows = [
      ["Fecha Desde", dateFrom],
      ["Fecha Hasta", dateTo],
      [], // Empty row
    ];
    const wsData = [...introRows, headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Auto-fit column widths
    const colWidths = headers.map((h, i) => {
      let maxLen = h.length;
      rows.forEach((row) => {
        const cellVal = String(row[i] ?? "");
        if (cellVal.length > maxLen) maxLen = cellVal.length;
      });
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Novedades");
    XLSX.writeFile(wb, `reporte_novedades_${dateFrom}_a_${dateTo}.xlsx`);
  };

  const handleDailyExportXLS = () => {
    if (statsByEmployee.length === 0) return;

    const dates = eachDayOfInterval({ start: parseISO(dateFrom), end: parseISO(dateTo) });
    const daysMap: Record<string, string> = { Monday: "Lun", Tuesday: "Mar", Wednesday: "Mie", Thursday: "Jue", Friday: "Vie", Saturday: "Sab", Sunday: "Dom" };

    const headers = ["Empleado", "Proyecto", "Fecha", "Día", "Estado", "Motivo", "Hs Extras", "H. Entrada OT", "H. Salida OT", "% HS"];
    const rows: any[] = [];

    statsByEmployee.forEach((s) => {
      dates.forEach((date) => {
        const dateKey = format(date, "yyyy-MM-dd");
        const attendance = s.dailyAttendance[dateKey];
        const shortDay = daysMap[format(date, "EEEE")] || format(date, "eee");

        rows.push([
          s.employeeName,
          s.rowProjectName || "S/P",
          format(date, "dd/MM/yyyy"),
          shortDay,
          attendance ? (attendance.status === "present" ? "Presente" : attendance.status === "absent" ? "Ausente" : "Tardanza") : "Sin Registro",
          attendance?.reason || "-",
          attendance?.overtimeHours || 0,
          attendance?.entryTime || "-",
          attendance?.exitTime || "-",
          attendance?.pct ? `${attendance.pct}%` : "-",
        ]);
      });
      // Add divider row between employees
      rows.push(Array(headers.length).fill(""));
    });

    const introRows = [
      ["REPORTE CONSOLIDADO DIARIO", ""],
      ["Periodo:", `${dateFrom} al ${dateTo}`],
      ["Exportado el:", format(new Date(), "dd/MM/yyyy HH:mm")],
      [],
    ];

    const wsData = [...introRows, headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Styling
    const colWidths = [25, 20, 12, 8, 12, 25, 10, 12, 12, 8];
    ws["!cols"] = colWidths.map((w) => ({ wch: w }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detalle Diario");
    XLSX.writeFile(wb, `detalle_diario_consolidado_${dateFrom}_a_${dateTo}.xlsx`);
  };

  const handleOpenContract = (s: EmployeeStats) => {
    setContractModal({
      open: true,
      employeeName: s.employeeName,
      data: s.userProjectsData,
    });
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <span>Reportes de Novedades</span>
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({statsByEmployee.length})</span>
          </div>
        }
        size="full"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button onClick={handleExport} disabled={statsByEmployee.length === 0} className="px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              <FontAwesomeIcon icon={faFileExport} />
              Exportar CSV
            </button>
            <button onClick={handleExportXLS} disabled={statsByEmployee.length === 0} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              <FontAwesomeIcon icon={faFileExcel} />
              Exportar Consolidado Mes
            </button>
            <button onClick={handleDailyExportXLS} disabled={statsByEmployee.length === 0} className="px-5 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              <FontAwesomeIcon icon={faClipboardList} />
              Exportar Detalle Diario
            </button>
          </div>
        }
      >
        <div className="flex flex-col h-full space-y-5 p-6">
          <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
            {/* Primera fila */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha Desde</label>
                <div className="relative">
                  <FontAwesomeIcon icon={faCalendar} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs" />
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha Hasta</label>
                <div className="relative">
                  <FontAwesomeIcon icon={faCalendar} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs" />
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Proyecto</label>
                <div className="relative">
                  <FontAwesomeIcon icon={faBriefcase} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs" />
                  <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="w-full pl-8 pr-6 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none">
                    <option value="all">Todos</option>
                    {allProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1 lg:col-span-2">
                <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Buscar Empleado</label>
                <div className="relative">
                  <FontAwesomeIcon icon={faSearch} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs" />
                  <input type="text" placeholder="Nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
                </div>
              </div>
            </div>
            {/* Segunda fila: Filtros de estado, glosario y etiquetas de contexto */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
              <div className="flex items-center gap-6">
                <div className="flex items-center">
                  <label className="flex items-center cursor-pointer gap-2 py-0.5">
                    <div className="relative">
                      <input type="checkbox" className="sr-only" checked={showActiveTableOnly} onChange={(e) => setShowActiveTableOnly(e.target.checked)} />
                      <div className={`block w-8 h-4 rounded-full transition-colors ${showActiveTableOnly ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}></div>
                      <div className={`dot absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform ${showActiveTableOnly ? "transform translate-x-4" : ""}`}></div>
                    </div>
                    <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Contratos Activos</span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Tipo:</span>
                  <select value={contractTypeFilter} onChange={(e) => setContractTypeFilter(e.target.value)} className="text-[10px] bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200 outline-none min-w-[120px]">
                    <option value="all">Todos los tipos</option>
                    {allContractTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <button onClick={() => setShowGlossary(true)} className="flex items-center justify-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors font-semibold py-0.5" title="Ver configuración actual de horas extras">
                  <FontAwesomeIcon icon={faCircleInfo} />
                  Ver Glosario
                </button>

                <div className="h-4 w-[1px] bg-gray-300 dark:bg-gray-600 mx-2"></div>

                <button onClick={() => setShowStats(true)} className="flex items-center justify-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors font-semibold py-0.5" title="Ver resumen estadístico del período">
                  <FontAwesomeIcon icon={faChartSimple} />
                  Estadísticas
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 bg-white dark:bg-gray-800/50 px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Período</span>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{formattedMonthLabel}</span>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-gray-800/50 px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Proyecto</span>
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{activeProjectName}</span>
                </div>
                {totalOvertime50 + totalOvertime100 > 0 && (
                  <div className="text-[10px] font-medium text-gray-500 italic ml-2">
                    Total hs: <span className="font-bold text-amber-600">{(totalOvertime50 + totalOvertime100).toFixed(1)}h</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Read-Only Glossary Modal */}
          <Modal isOpen={showGlossary} onClose={() => setShowGlossary(false)} title="Glosario de Horas Extras" size="md" zIndex={100}>
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                <div className="flex gap-3">
                  <FontAwesomeIcon icon={faCircleInfo} className="text-blue-500 mt-1" />
                  <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">Este glosario define cómo se calculan automáticamente las horas extras en este reporte.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase mb-3 tracking-widest leading-none">Lunes a Viernes</h4>
                  <div className="text-sm font-bold text-gray-700 dark:text-gray-200">
                    {glossary.weekdayDayStart}hs — {glossary.weekdayDayEnd}hs
                  </div>
                  <div className="text-xs text-blue-600 font-medium mt-1">Recargo: {glossary.pct50}% (Diurno)</div>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase mb-3 tracking-widest leading-none">Sábados</h4>
                  <div className="text-sm font-bold text-gray-700 dark:text-gray-200">
                    {glossary.satDayStart}hs — {glossary.satDayEnd}hs
                  </div>
                  <div className="text-xs text-blue-600 font-medium mt-1">Recargo: {glossary.pct50}% (Diurno)</div>
                </div>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/30">
                <h4 className="text-[10px] font-black text-amber-700 dark:text-amber-500 uppercase mb-2 tracking-widest">Base de Cálculo</h4>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Divisor de Sueldo:</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{glossary.salaryDivisorPercentage}</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-amber-100 dark:border-amber-900/30">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Recargo Base 100%:</span>
                  <span className="text-sm font-bold text-red-600">{glossary.pct100}%</span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    setShowGlossary(false);
                    onClose(); // Close the reports modal
                    navigate("/requests/config", { state: { activeTab: "glossary" } });
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-all shadow-md hover:shadow-lg"
                >
                  Ir a Configuración
                </button>
              </div>
            </div>
          </Modal>

          {/* Calculation Info Modal */}
          <Modal isOpen={showCalcInfo} onClose={() => setShowCalcInfo(false)} title="Componentes del Precio Hora Extra" size="md" zIndex={100}>
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed font-medium">
                  El cálculo se basa en el <span className="text-blue-600 dark:text-blue-400 font-bold">Sueldo Mano</span> del empleado y el divisor mensual configurado.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase mb-3 tracking-widest leading-none">1. Precio Hora Base</h4>
                  <div className="text-sm font-bold text-gray-700 dark:text-gray-200">Sueldo Mano / {glossary.salaryDivisorPercentage} (Divisor)</div>
                  <p className="text-[10px] text-gray-500 mt-2 font-medium">Este es el valor unitario de la hora sobre el cual se aplican los recargos.</p>
                </div>

                <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/30">
                  <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase mb-3 tracking-widest leading-none">2. Precio Hora 50%</h4>
                  <div className="text-sm font-bold text-gray-700 dark:text-gray-200">Hora Base × {1 + glossary.pct50 / 100}</div>
                </div>

                <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                  <h4 className="text-[10px] font-black text-red-600 dark:text-red-500 uppercase mb-3 tracking-widest leading-none">3. Precio Hora 100%</h4>
                  <div className="text-sm font-bold text-gray-700 dark:text-gray-200">Hora Base × {1 + glossary.pct100 / 100}</div>
                </div>
              </div>

              <div className="text-[10px] text-gray-400 dark:text-gray-500 italic p-2 leading-tight">* Todos los porcentajes y el divisor se pueden modificar desde el Glosario de Extras en la configuración.</div>
            </div>
          </Modal>

          {/* Statistics Modal */}
          <Modal isOpen={showStats} onClose={() => setShowStats(false)} title="Estadísticas de Novedades" size="md" zIndex={100}>
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                <div className="flex gap-3">
                  <FontAwesomeIcon icon={faChartSimple} className="text-blue-500 mt-1" />
                  <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed font-medium">Resumen consolidado para el período y filtros seleccionados.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Empleados y Ausencias */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <FontAwesomeIcon icon={faUser} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider leading-none mb-1">Total Empleados</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">{totalEmployees}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-50 dark:border-gray-700/50">
                    <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                      <FontAwesomeIcon icon={faUserSlash} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider leading-none mb-1">Total Ausencias</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">{totalAbsences}</p>
                    </div>
                  </div>
                </div>

                {/* Costos */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                      <FontAwesomeIcon icon={faClock} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider leading-none mb-1">Costo Hs. Extras</p>
                      <p className="text-xl font-bold text-amber-600 leading-none">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-50 dark:border-gray-700/50">
                    <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                      <FontAwesomeIcon icon={faMoneyBillWave} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider leading-none mb-1">Total Final</p>
                      <p className="text-xl font-bold text-green-600 leading-none">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-medium italic">Período seleccionado:</span>
                  <span className="text-gray-900 dark:text-white font-bold">{formattedMonthLabel}</span>
                </div>
                <div className="flex justify-between items-center text-xs mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 font-medium italic">Proyecto filtros:</span>
                  <span className="text-gray-900 dark:text-white font-bold truncate max-w-[200px]">{activeProjectName}</span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={() => setShowStats(false)} className="px-6 py-2 bg-gray-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-all shadow-md hover:shadow-lg">
                  Entendido
                </button>
              </div>
            </div>
          </Modal>

          {/* Table */}
          <div className="flex-1 overflow-auto rounded border border-gray-200 dark:border-gray-700 min-h-0">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold shadow-sm">
                <tr>
                  <th className="py-2.5 px-3 text-center w-8"></th>
                  <th className="py-2.5 px-3 text-left">Empleado</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">S. Jornada</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">S. Mano</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">P. Hora</th>
                  <th className="py-2.5 px-3 text-right text-[10px] leading-tight whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="flex flex-col items-end">
                        <span>P. Hora Extra</span>
                        <span className="text-[8px] opacity-60">Base | 50% | 100%</span>
                      </div>
                      <button onClick={() => setShowCalcInfo(true)} className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors p-1" title="Ver detalle del cálculo">
                        <FontAwesomeIcon icon={faSearch} />
                      </button>
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Jornadas</th>
                  <th className="py-2.5 px-3 text-left">Proyectos</th>
                  <th className="py-2.5 px-2 text-center text-[10px] leading-tight">
                    Horario
                    <br />
                    Base
                  </th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Contrato: Cant | Fecha | Tipo</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Asistencias: Pres | Aus</th>
                  <th className="py-2.5 px-2 text-center text-[10px] leading-tight text-nowrap">Horario Extra</th>
                  <th className="py-2.5 px-2 text-right text-[10px] leading-tight text-nowrap">Hs. 50%</th>
                  <th className="py-2.5 px-2 text-right text-[10px] leading-tight text-nowrap">Hs. 100%</th>
                  <th className="py-2.5 px-2 text-right text-[10px] leading-tight whitespace-nowrap">Extras Total</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Monto Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {statsByEmployee.map((s) => {
                  return (
                    <React.Fragment key={s.rowKey}>
                      <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        {/* Modal Trigger */}
                        <td className="py-2.5 px-3 text-center">
                          <button onClick={() => setDailyDetailModal({ open: true, stats: s })} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Ver detalle diario en modal">
                            <FontAwesomeIcon icon={faClipboardList} className="text-xs" />
                          </button>
                        </td>
                        {/* Empleado */}
                        <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white">
                          <span className="truncate max-w-[140px]">{s.employeeName}</span>
                        </td>
                        {/* Sueldo Jornada */}
                        <td className="py-2.5 px-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">{s.sueldoJornada > 0 ? `$${s.sueldoJornada.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
                        {/* Sueldo Mano */}
                        <td className="py-2.5 px-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">{s.sueldoMano > 0 ? `$${s.sueldoMano.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
                        {/* Precio Hora */}
                        <td className="py-2.5 px-3 text-right text-xs font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {(() => {
                            const normalHora = s.sueldoJornada / s.contractHoursPerDay;
                            return normalHora > 0 ? `$${normalHora.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-gray-300 dark:text-gray-600">-</span>;
                          })()}
                        </td>
                        {/* Precio Hora Extra 50/100 */}
                        <td className="py-2.5 px-3 text-right text-[9px] font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap leading-tight">
                          {(() => {
                            const salaryDivisor = glossary.salaryDivisorPercentage || 150;
                            const baseHour = s.sueldoMano / salaryDivisor;
                            const v50 = baseHour * (1 + glossary.pct50 / 100);
                            const v100 = baseHour * (1 + glossary.pct100 / 100);
                            if (baseHour <= 0) return <span className="text-gray-300 dark:text-gray-600">-</span>;
                            return (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-gray-500 dark:text-gray-500 font-normal">Base: ${baseHour.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                                <span>50%: ${v50.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                                <span>100%: ${v100.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                              </div>
                            );
                          })()}
                        </td>
                        {/* Jornadas */}
                        <td className="py-2.5 px-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400">{s.cantidadJornadasLaborales || <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
                        {/* Proyectos */}
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1 max-w-[160px]">
                            {s.rowProjectName ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 truncate max-w-[120px]" title={s.rowProjectName}>
                                {s.rowProjectName}
                              </span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600 text-xs">-</span>
                            )}
                          </div>
                        </td>
                        {/* Horario Base */}
                        <td className="py-2.5 px-2 text-center whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            {s.schedules.length > 0 ? (
                              s.schedules.map((sc, scIdx) => (
                                <span key={scIdx} className="text-[9px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded px-1 lowercase whitespace-nowrap">
                                  {sc}
                                </span>
                              ))
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600">-</span>
                            )}
                          </div>
                        </td>
                        {/* Contrato */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {s.userProjectsData.length > 0 ? (
                            <div className="flex items-center justify-center gap-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${s.activeContractsCount > 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`} title="Cantidad de contratos">
                                {s.activeContractsCount}
                              </span>
                              <span className="text-gray-300 dark:text-gray-600">|</span>

                              {/* Información adicional: Fechas */}
                              <div className="flex flex-col text-[7px] leading-tight text-gray-400 dark:text-gray-500 font-medium uppercase tracking-tighter text-left">
                                {s.contractAlta && <span>A: {s.contractAlta.substring(0, 10).split("-").reverse().join("/")}</span>}
                                <span>B: {s.contractBaja ? s.contractBaja.substring(0, 10).split("-").reverse().join("/") : "-"}</span>
                              </div>

                              <span className="text-gray-300 dark:text-gray-600">|</span>

                              {/* Información adicional: Tipo */}
                              <span className="text-[7px] font-bold text-gray-500 dark:text-gray-400 leading-none uppercase tracking-tighter max-w-[80px] truncate" title={s.contractType}>
                                {s.contractType || "-"}
                              </span>

                              <span className="text-gray-300 dark:text-gray-600">|</span>
                              <button onClick={() => handleOpenContract(s)} className="text-gray-400 hover:text-blue-500 transition-colors p-1" title="Ver detalle de contrato">
                                <FontAwesomeIcon icon={faFileContract} className="text-xs" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600 text-xs">-</span>
                          )}
                        </td>
                        {/* Asistencias (Presente | Ausencias | Calendario) */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-green-600 dark:text-green-400 font-bold" title="Días Presente">
                              {s.daysPresent}
                            </span>
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <span className={`font-bold ${s.absences > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-gray-600"}`} title="Días Ausente">
                              {s.absences}
                            </span>
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <button onClick={() => setDailyDetailModal({ open: true, stats: s })} className="text-gray-400 hover:text-blue-500 transition-colors p-1" title="Ver detalle diario">
                               <FontAwesomeIcon icon={faCalendarDays} className="text-xs" />
                             </button>
                          </div>
                        </td>
                        {/* Horario Extra */}
                        <td className="py-2.5 px-2 text-center">
                          <div className="flex flex-col gap-0.5 max-w-[120px] mx-auto">
                            {s.overtimeEntries.length > 0 ? (
                              s.overtimeEntries.map((entry, eIdx) => (
                                <div key={eIdx} className="flex items-center gap-1 justify-center">
                                  <span className="text-[8px] font-bold text-gray-400 dark:text-gray-500">{entry.date}</span>
                                  <span className={`text-[9px] font-medium rounded px-1 lowercase whitespace-nowrap ${entry.pct === glossary.pct100 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800"}`}>
                                    {entry.schedule} <span className="text-[8px] opacity-70">({entry.pct}%)</span>
                                  </span>
                                </div>
                              ))
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600">-</span>
                            )}
                          </div>
                        </td>
                        {/* Hs 50% */}
                        <td className="py-2.5 px-2 text-right font-medium text-gray-600 dark:text-gray-400">{s.overtime50 > 0 ? `${s.overtime50}h` : <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
                        {/* Hs 100% */}
                        <td className="py-2.5 px-2 text-right font-medium text-amber-700 dark:text-amber-500">{s.overtime100 > 0 ? `${s.overtime100}h` : <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
                        {/* $ Extras */}
                        <td className="py-2.5 px-2 text-right font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
                          {(() => {
                            const salaryDivisor = glossary.salaryDivisorPercentage || 150;
                            const baseHour = s.sueldoMano / salaryDivisor;
                            const cost50 = s.overtime50 * baseHour * (1 + glossary.pct50 / 100);
                            const cost100 = s.overtime100 * baseHour * (1 + glossary.pct100 / 100);
                            return cost50 + cost100 > 0 ? `$${(cost50 + cost100).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-";
                          })()}
                        </td>
                        {/* Monto Total */}
                        <td className="py-2.5 px-3 text-right font-bold text-green-600 dark:text-green-400 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <span>
                              {(() => {
                                const salaryDivisor = glossary.salaryDivisorPercentage || 150;
                                const baseHour = s.sueldoMano / salaryDivisor;
                                const cost50 = s.overtime50 * baseHour * (1 + glossary.pct50 / 100);
                                const cost100 = s.overtime100 * baseHour * (1 + glossary.pct100 / 100);
                                const salaryMonto = s.sueldoJornada * (s.cantidadJornadasLaborales - s.absences);
                                return `$${(salaryMonto + cost50 + cost100).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`;
                              })()}
                            </span>
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <button onClick={() => setTotalDetail({ open: true, stats: s })} className="text-gray-400 hover:text-blue-500 transition-colors p-1" title="Ver detalle del cálculo">
                              <FontAwesomeIcon icon={faFileLines} className="text-xs" />
                            </button>
                          </div>
                        </td>

                      </tr>
                      {/* Sub-fila expansion eliminada a favor de Modal */}
                    </React.Fragment>
                  );
                })}
                {statsByEmployee.length === 0 && (
                  <tr>
                    <td colSpan={18} className="py-12 text-center text-gray-500 dark:text-gray-400 italic">
                      No se encontraron registros para el mes y filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
              {statsByEmployee.length > 0 && (
                <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold text-gray-700 dark:text-gray-300 border-t-2 border-gray-200 dark:border-gray-600">
                  <tr>
                    <td className="py-2.5 px-3">Totales ({totalEmployees})</td>
                    <td className="py-2.5 px-3"></td> {/* S. Jornada */}
                    <td className="py-2.5 px-3"></td> {/* S. Mano */}
                    <td className="py-2.5 px-3"></td> {/* P. Hora */}
                    <td className="py-2.5 px-3"></td> {/* P. Hora Extra */}
                    <td className="py-2.5 px-3"></td> {/* Jornadas */}
                    <td className="py-2.5 px-3"></td> {/* Proyectos */}
                    <td className="py-2.5 px-3"></td> {/* Horario Base */}
                    <td className="py-2.5 px-3"></td> {/* Contrato */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2 font-bold">
                        <span className="text-green-600 dark:text-green-400" title="Total Presentes">
                          {statsByEmployee.reduce((a, c) => a + c.daysPresent, 0)}
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <span className="text-red-600 dark:text-red-400" title="Total Ausencias">
                          {totalAbsences}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center"></td> {/* Horario Extra */}
                    <td className="py-2.5 px-2 text-right text-xs font-bold">{totalOvertime50}h</td>
                    <td className="py-2.5 px-2 text-right text-xs font-bold">{totalOvertime100}h</td>
                    <td className="py-2.5 px-2 text-right text-xs font-bold text-amber-600 dark:text-amber-400 border-x border-gray-100 dark:border-gray-700">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right font-black text-green-600 dark:text-green-400">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td></td> {/* Expand */}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </Modal>

      {/* Contract Detail Sub-Modal */}
      <ContractDetailModal isOpen={contractModal.open} onClose={() => setContractModal({ ...contractModal, open: false })} employeeName={contractModal.employeeName} userProjectsData={contractModal.data} filterProjectId={projectFilter !== "all" ? projectFilter : undefined} zIndex={100} periodStart={parseISO(dateFrom + "T00:00:00")} periodEnd={parseISO(dateTo + "T23:59:59")} />
      <TotalDetailModal isOpen={totalDetail.open} onClose={() => setTotalDetail({ open: false, stats: null })} stats={totalDetail.stats} glossary={glossary} zIndex={110} />
      <DailyDetailModal isOpen={dailyDetailModal.open} onClose={() => setDailyDetailModal({ open: false, stats: null })} stats={dailyDetailModal.stats} dateFrom={dateFrom} dateTo={dateTo} zIndex={120} />
    </>
  );
};
