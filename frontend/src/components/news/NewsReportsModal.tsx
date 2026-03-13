import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExport, faCalendar, faBriefcase, faUser, faClock, faUserSlash, faMoneyBillWave, faSearch, faChevronDown, faChevronUp, faFileContract, faTimes, faIdBadge, faCalendarDays, faHourglassHalf, faDollarSign, faClipboardList, faLocationDot, faStar, faFileExcel, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
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
const isActiveContract = (contract: any) => {
  if (!contract.fecha_alta_contrato) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getLocalMidnight = (dateString: string) => {
    // Handles both "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm:ss.sssZ" formats without timezone shift
    const isoDate = dateString.substring(0, 10);
    const parts = isoDate.split("-");
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
    }
    const d = new Date(dateString);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const altaDate = getLocalMidnight(contract.fecha_alta_contrato);

  if (contract.fecha_baja_contrato) {
    const bajaDate = getLocalMidnight(contract.fecha_baja_contrato);
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
}> = ({ isOpen, onClose, employeeName, userProjectsData, filterProjectId }) => {
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
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
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
                    const filteredContracts = showActiveOnly ? up.contracts.filter(isActiveContract) : up.contracts;

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

export const NewsReportsModal: React.FC<NewsReportsModalProps> = ({ isOpen, onClose, reports, allUsers }) => {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [projectFilter, setProjectFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [contractModal, setContractModal] = useState<{ open: boolean; employeeName: string; data: UserProjectMetadata[] }>({ open: false, employeeName: "", data: [] });
  const [showGlossary, setShowGlossary] = useState(false);
  const [showActiveTableOnly, setShowActiveTableOnly] = useState(true);
  const [glossary, setGlossary] = useState<OvertimeSettings>(overtimeUtils.getGlossary());

  useEffect(() => {
    if (isOpen) {
      setGlossary(overtimeUtils.getGlossary());
      setShowActiveTableOnly(true);
    }
  }, [isOpen]);

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
    allUsers.forEach((u) => map.set(u._id, u));
    return map;
  }, [allUsers]);

  const uniqueProjects = useMemo(() => {
    const map = new Map<string, string>();
    reports.forEach((r) => {
      if (r.projectIdRaw) map.set(r.projectIdRaw, r.projectName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [reports]);

  const statsByEmployee = useMemo(() => {
    const employeeMap = new Map<string, EmployeeStats>();
    const start = parseISO(dateFrom + "T00:00:00");
    const end = parseISO(dateTo + "T23:59:59");

    reports.forEach((report) => {
      try {
        const reportDate = parseISO(report.date + "T00:00:00");
        if (!isWithinInterval(reportDate, { start, end })) return;
      } catch {
        return;
      }

      if (projectFilter !== "all" && report.projectIdRaw !== projectFilter) return;

      report.attendance.forEach((record) => {
        const empId = typeof record.employeeId === "object" ? record.employeeId?._id : record.employeeId;
        const empName = record.employeeName || "Desconocido";

        if (!empId) return;

        if (!employeeMap.has(empId)) {
          // Fetch user metadata for salary/project info
          const user = usersMap.get(empId);
          const userProjects = user?.metadata?.projects || [];

          // Get sueldo from the latest contract of the filtered project, or any
          let sueldoJornada = 0;
          let sueldoMano = 0;
          let contractHoursPerDay = 8;
          let cantidadJornadasLaborales = 0;
          let activeContractsCount = 0;
          let contractSchedules: string[] = [];

          if (userProjects.length > 0) {
            // First loop: Collect completely accurate schedules and counts from ALL target projects
            for (const up of userProjects) {
              const upProjId = typeof up.projectId === "object" ? up.projectId?._id : up.projectId;
              const isTargetProject = projectFilter === "all" || upProjId === projectFilter;

              if (up.contracts && up.contracts.length > 0 && isTargetProject) {
                const activesInProject = up.contracts.filter(isActiveContract);
                activeContractsCount += activesInProject.length;

                let targetContracts = showActiveTableOnly ? activesInProject : up.contracts;
                targetContracts.forEach((contract) => {
                  if (contract.hora_inicio && contract.hora_fin) {
                    const hours = getDailyHoursFromContract(contract.hora_inicio, contract.hora_fin);
                    const sched = `${contract.hora_inicio}-${contract.hora_fin} | ${hours}hs`;
                    if (!contractSchedules.includes(sched)) contractSchedules.push(sched);
                  }
                });
              }
            }

            // Second loop: Try to find sueldo from the latest contract of the filtered project
            for (const up of userProjects) {
              const upProjId = typeof up.projectId === "object" ? up.projectId?._id : up.projectId;
              const isTargetProject = projectFilter === "all" || upProjId === projectFilter;

              if (up.contracts && up.contracts.length > 0 && isTargetProject) {
                let targetContracts = up.contracts;
                if (showActiveTableOnly) {
                  targetContracts = targetContracts.filter(isActiveContract);
                }

                if (targetContracts.length > 0) {
                  // Get the last (most recent) contract from the target list
                  const lastContract = targetContracts[targetContracts.length - 1];
                  if (lastContract.sueldo_jornada) sueldoJornada = lastContract.sueldo_jornada;
                  if (lastContract.sueldo_mano) sueldoMano = lastContract.sueldo_mano;
                  if (lastContract.hora_inicio && lastContract.hora_fin) {
                    contractHoursPerDay = getDailyHoursFromContract(lastContract.hora_inicio, lastContract.hora_fin);
                  }
                  if (lastContract.cantidad_jornadas_laborales) cantidadJornadasLaborales = lastContract.cantidad_jornadas_laborales;
                  if (sueldoJornada > 0 || sueldoMano > 0) break;
                }
              }
            }
          }

          // Get project names from User.projectIds
          const projectNames = user?.projectIds?.map((p) => p.name) || [];

          employeeMap.set(empId, {
            employeeId: empId,
            employeeName: empName,
            absences: 0,
            absenceDetails: {},
            overtimeHours: 0,
            daysPresent: 0,
            lateDays: 0,
            totalRecords: 0,
            sueldoJornada,
            sueldoMano,
            projectNames,
            userProjectsData: userProjects,
            overtime50: 0,
            overtime100: 0,
            schedules: [...contractSchedules],
            overtimeEntries: [],
            contractHoursPerDay,
            cantidadJornadasLaborales,
            activeContractsCount,
            hasContractSchedules: contractSchedules.length > 0,
          });
        }

        const stats = employeeMap.get(empId)!;
        stats.totalRecords += 1;

        if (record.status === "present") {
          stats.daysPresent += 1;
        } else if (record.status === "late") {
          stats.daysPresent += 1;
          stats.lateDays += 1;
        } else {
          stats.absences += 1;
          const reason = record.absenceReason || "Sin motivo";
          stats.absenceDetails[reason] = (stats.absenceDetails[reason] || 0) + 1;
        }

        const totalHs = record.overtimeHours || 0;
        stats.overtimeHours += totalHs;

        // Split overtime
        const { h50, h100, pct } = splitOvertime(report.date, record.overtimeEntryTime, record.overtimeExitTime, totalHs);
        stats.overtime50 += h50;
        stats.overtime100 += h100;

        // Collect schedules from attendance if we don't have contract schedules
        if (!stats.hasContractSchedules && record.entryTime && record.exitTime) {
          const hours = getDailyHoursFromContract(record.entryTime, record.exitTime);
          const sched = `${record.entryTime}-${record.exitTime} | ${hours}hs`;
          if (!stats.schedules.includes(sched)) stats.schedules.push(sched);
        }
        if (totalHs > 0) {
          const oTSched = record.overtimeEntryTime && record.overtimeExitTime ? `${record.overtimeEntryTime}-${record.overtimeExitTime}` : "Hs. Seteadas";
          const dateFormatted = format(parseISO(report.date + "T00:00:00"), "dd/MM");
          stats.overtimeEntries.push({ date: dateFormatted, schedule: oTSched, pct: pct || (h100 > 0 ? glossary.pct100 : glossary.pct50), hours: totalHs });
        }
      });
    });

    let results = Array.from(employeeMap.values());

    if (showActiveTableOnly) {
      results = results.filter((emp) => {
        return emp.userProjectsData.some((up) => {
          const upProjId = typeof up.projectId === "object" ? up.projectId?._id : up.projectId;
          const isTargetProject = projectFilter === "all" || upProjId === projectFilter;
          if (!isTargetProject) return false;
          if (!up.contracts || up.contracts.length === 0) return false;
          return up.contracts.some(isActiveContract);
        });
      });
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      results = results.filter((s) => s.employeeName.toLowerCase().includes(lowerSearch));
    }

    return results.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [reports, dateFrom, dateTo, projectFilter, searchTerm, usersMap, glossary, showActiveTableOnly]);

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
    return uniqueProjects.find((p) => p.id === projectFilter)?.name || "Filtro activo";
  }, [projectFilter, uniqueProjects]);

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
  const totalSalaries = statsByEmployee.reduce((acc, curr) => acc + curr.sueldoJornada * curr.daysPresent, 0);
  const grandTotal = totalSalaries + totalCost;
  const totalEmployees = statsByEmployee.length;

  const handleExport = () => {
    const headers = ["Empleado", "Sueldo Jornada", "Sueldo Mano", "Precio Hora", "Jornadas", "Proyectos", "Días Presente", "Ausencias", "Detalle Ausencias", "Hs. 50%", "Hs. 100%", "Sueldo", "Detalle Hs. Extras", "Monto Extras", "Monto Total"];
    const rows = statsByEmployee.map((s) => {
      const salaryDivisor = glossary.salaryDivisorPercentage || 150;
      const baseHour = s.sueldoMano / salaryDivisor;
      const m50 = s.overtime50 * baseHour * (1 + glossary.pct50 / 100);
      const normalHora = s.sueldoJornada / s.contractHoursPerDay;
      const m100 = s.overtime100 * baseHour * (1 + glossary.pct100 / 100);
      const otDetail = s.overtimeEntries.map((e) => `${e.date} (${e.pct}%): ${e.schedule}`).join("; ");
      return [
        `"${s.employeeName}"`,
        s.sueldoJornada,
        s.sueldoMano,
        normalHora.toFixed(2),
        s.cantidadJornadasLaborales,
        `"${s.projectNames.join(", ")}"`,
        s.daysPresent,
        s.absences,
        `"${Object.entries(s.absenceDetails)
          .map(([r, c]) => `${r}: ${c}`)
          .join("; ")}"`,
        s.overtime50,
        s.overtime100,
        s.sueldoMano,
        `"${otDetail}"`,
        (m50 + m100).toFixed(2),
        (s.sueldoJornada * s.daysPresent + m50 + m100).toFixed(2),
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
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
    const headers = ["Empleado", "Sueldo Jornada", "Sueldo Mano", "Precio Hora", "Jornadas", "Proyectos", "Días Presente", "Ausencias", "Detalle Ausencias", "Hs. 50%", "Hs. 100%", "Sueldo", "Detalle Hs. Extras", "Monto Extras", "Monto Total"];

    const rows = statsByEmployee.map((s) => {
      const salaryDivisor = glossary.salaryDivisorPercentage || 150;
      const baseHour = s.sueldoMano / salaryDivisor;
      const m50 = s.overtime50 * baseHour * (1 + glossary.pct50 / 100);
      const normalHora = s.sueldoJornada / s.contractHoursPerDay;
      const m100 = s.overtime100 * baseHour * (1 + glossary.pct100 / 100);
      const otDetail = s.overtimeEntries.map((e) => `${e.date} (${e.pct}%): ${e.schedule}`).join("; ");
      return [
        s.employeeName,
        s.sueldoJornada,
        s.sueldoMano,
        Number(normalHora.toFixed(2)),
        s.cantidadJornadasLaborales,
        s.projectNames.join(", "),
        s.daysPresent,
        s.absences,
        Object.entries(s.absenceDetails)
          .map(([r, c]) => `${r}: ${c}`)
          .join("; "),
        s.overtime50,
        s.overtime100,
        s.sueldoMano,
        otDetail,
        Number((m50 + m100).toFixed(2)),
        Number((s.sueldoJornada * s.daysPresent + m50 + m100).toFixed(2)),
      ];
    });

    // Add totals row
    const totalMontoSueldos = statsByEmployee.reduce((a, c) => a + c.sueldoJornada * c.daysPresent, 0);
    rows.push([
      `TOTALES (${totalEmployees} empleados)`,
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
      "", // Sueldo
      "", // Detail column empty for total
      Number(totalCost.toFixed(2)),
      Number((totalMontoSueldos + totalCost).toFixed(2)),
    ] as any);

    const wsData = [headers, ...rows];
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
        title="Reportes de Novedades"
        size="95"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button onClick={handleExport} disabled={statsByEmployee.length === 0} className="px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              <FontAwesomeIcon icon={faFileExport} />
              Exportar CSV
            </button>
            <button onClick={handleExportXLS} disabled={statsByEmployee.length === 0} className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              <FontAwesomeIcon icon={faFileExcel} />
              Exportar Excel
            </button>
          </div>
        }
      >
        <div className="space-y-5">
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
                    {uniqueProjects.map((p) => (
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

            {/* Segunda fila */}
            <div className="flex justify-start items-center gap-6 pt-1">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Contratos</label>
                <div className="flex items-center">
                  <label className="flex items-center cursor-pointer gap-2 py-0.5">
                    <div className="relative">
                      <input type="checkbox" className="sr-only" checked={showActiveTableOnly} onChange={(e) => setShowActiveTableOnly(e.target.checked)} />
                      <div className={`block w-8 h-4 rounded-full transition-colors ${showActiveTableOnly ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}></div>
                      <div className={`dot absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform ${showActiveTableOnly ? "transform translate-x-4" : ""}`}></div>
                    </div>
                    <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300">Activos</span>
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-transparent uppercase tracking-wider mb-1 block select-none">Glosario</label>
                <button onClick={() => setShowGlossary(true)} className="flex items-center justify-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors font-medium py-0.5" title="Ver configuración actual de horas extras">
                  <FontAwesomeIcon icon={faCircleInfo} />
                  Ver Glosario
                </button>
              </div>
            </div>
          </div>

          {/* Read-Only Glossary Modal */}
          <Modal isOpen={showGlossary} onClose={() => setShowGlossary(false)} title="Glosario de Horas Extras" size="md">
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

          {/* Summary KPIs Section Header */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Período</span>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{formattedMonthLabel}</span>
              </div>
              <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Proyecto</span>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{activeProjectName}</span>
              </div>
            </div>
            {totalOvertime50 + totalOvertime100 > 0 && (
              <div className="text-[10px] font-medium text-gray-500 italic">
                Total hs. extras registradas: <span className="font-bold text-amber-600">{(totalOvertime50 + totalOvertime100).toFixed(1)}h</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pb-2">
            {/* Empleados */}
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 p-3 rounded-xl flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <FontAwesomeIcon icon={faUser} className="text-base" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black text-blue-600/70 dark:text-blue-400/70 uppercase tracking-wider mb-0.5">Empleados</p>
                <p className="text-2xl font-black text-blue-700 dark:text-blue-300 leading-none">{totalEmployees}</p>
              </div>
            </div>

            {/* Ausencias */}
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-3 rounded-xl flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                <FontAwesomeIcon icon={faUserSlash} className="text-base" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black text-red-600/70 dark:text-red-400/70 uppercase tracking-wider mb-0.5">Ausencias</p>
                <p className="text-2xl font-black text-red-700 dark:text-red-300 leading-none">{totalAbsences}</p>
              </div>
            </div>

            {/* Costo Hs. Extras */}
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-3 rounded-xl flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <FontAwesomeIcon icon={faClock} className="text-base" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black text-amber-600/70 dark:text-amber-400/70 uppercase tracking-wider mb-0.5">Costo Hs. Extras</p>
                <p className="text-2xl font-black text-amber-700 dark:text-amber-300 leading-none">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
              </div>
            </div>

            {/* Monto Total Final */}
            <div className="bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 p-3 rounded-xl flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 shrink-0">
                <FontAwesomeIcon icon={faMoneyBillWave} className="text-base" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black text-green-600/70 dark:text-green-400/70 uppercase tracking-wider mb-0.5">Total Final</p>
                <p className="text-2xl font-black text-green-700 dark:text-green-300 leading-none">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-auto max-h-[calc(100vh-480px)] rounded border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold shadow-sm">
                <tr>
                  <th className="py-2.5 px-3 text-left">Empleado</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">S. Jornada</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">S. Mano</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">P. Hora</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Jornadas</th>
                  <th className="py-2.5 px-3 text-left">Proyectos</th>
                  <th className="py-2.5 px-2 text-center text-[10px] leading-tight">
                    Horario
                    <br />
                    Base
                  </th>
                  <th className="py-2.5 px-3 text-center">Contrato</th>
                  <th className="py-2.5 px-3 text-center">Presente</th>
                  <th className="py-2.5 px-3 text-center">Ausencias</th>
                  <th className="py-2.5 px-2 text-center text-[10px] leading-tight">
                    Horario
                    <br />
                    Extra
                  </th>
                  <th className="py-2.5 px-2 text-right text-[10px] leading-tight">Hs. 50%</th>
                  <th className="py-2.5 px-2 text-right text-[10px] leading-tight">Hs. 100%</th>
                  <th className="py-2.5 px-2 text-right text-[10px] leading-tight">Sueldo</th>
                  <th className="py-2.5 px-2 text-right text-[10px] leading-tight whitespace-nowrap">$ Extras</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Monto Total</th>
                  <th className="py-2.5 px-3 text-center w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {statsByEmployee.map((s) => {
                  const isExpanded = expandedEmployee === s.employeeId;
                  const absenceEntries = Object.entries(s.absenceDetails);
                  const colCount = 15;
                  return (
                    <React.Fragment key={s.employeeId}>
                      <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
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
                        {/* Jornadas */}
                        <td className="py-2.5 px-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400">{s.cantidadJornadasLaborales || <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
                        {/* Proyectos */}
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1 max-w-[160px]">
                            {s.projectNames.length > 0 ? (
                              s.projectNames.map((pn, idx) => (
                                <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 truncate max-w-[120px]" title={pn}>
                                  {pn}
                                </span>
                              ))
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
                        <td className="py-2.5 px-3 text-center">
                          {s.userProjectsData.length > 0 ? (
                            <button onClick={() => handleOpenContract(s)} className="inline-flex items-center justify-center gap-1.5 mx-auto text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors px-2 py-1 flex-row rounded hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Ver detalle de contrato">
                              <FontAwesomeIcon icon={faFileContract} />
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${s.activeContractsCount > 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{s.activeContractsCount}</span>
                            </button>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600 text-xs">-</span>
                          )}
                        </td>
                        {/* Presente */}
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-green-600 dark:text-green-400 font-medium">{s.daysPresent}</span>
                        </td>

                        {/* Ausencias */}
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${s.absences > 0 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "text-gray-400 dark:text-gray-600"}`}>{s.absences}</span>
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
                        {/* Sueldo */}
                        <td className="py-2.5 px-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">{s.sueldoMano > 0 ? `$${s.sueldoMano.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
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
                          {(() => {
                            const salaryDivisor = glossary.salaryDivisorPercentage || 150;
                            const baseHour = s.sueldoMano / salaryDivisor;
                            const cost50 = s.overtime50 * baseHour * (1 + glossary.pct50 / 100);
                            const cost100 = s.overtime100 * baseHour * (1 + glossary.pct100 / 100);
                            return `$${(s.sueldoJornada * s.daysPresent + cost50 + cost100).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}`;
                          })()}
                        </td>
                        {/* Expand */}
                        <td className="py-2.5 px-3 text-center">
                          {absenceEntries.length > 0 && (
                            <button onClick={() => setExpandedEmployee(isExpanded ? null : s.employeeId)} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                              <FontAwesomeIcon icon={isExpanded ? faChevronUp : faChevronDown} className="text-xs" />
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && absenceEntries.length > 0 && (
                        <tr className="bg-gray-50/50 dark:bg-gray-800/50">
                          <td colSpan={colCount} className="py-2 px-4 pl-14">
                            <div className="flex flex-wrap gap-2">
                              {absenceEntries.map(([reason, count]) => (
                                <span key={reason} className="text-xs px-2 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30">
                                  {reason}: <strong>{count}</strong>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {statsByEmployee.length === 0 && (
                  <tr>
                    <td colSpan={15} className="py-12 text-center text-gray-500 dark:text-gray-400 italic">
                      No se encontraron registros para el mes y filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
              {statsByEmployee.length > 0 && (
                <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold text-gray-700 dark:text-gray-300 border-t-2 border-gray-200 dark:border-gray-600">
                  <tr>
                    <td className="py-2.5 px-3">Totales ({totalEmployees})</td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3"></td>
                    <td className="py-2.5 px-3 text-center text-green-600 dark:text-green-400">{statsByEmployee.reduce((a, c) => a + c.daysPresent, 0)}</td>
                    <td className="py-2.5 px-3 text-center text-red-600 dark:text-red-400">{totalAbsences}</td>
                    <td className="py-2.5 px-3 text-center"></td>
                    <td className="py-2.5 px-2 text-right text-xs">{totalOvertime50}h</td>
                    <td className="py-2.5 px-2 text-right text-xs">{totalOvertime100}h</td>
                    <td className="py-2.5 px-2 text-right text-xs font-semibold text-amber-600 dark:text-amber-400 border-x border-gray-100 dark:border-gray-700">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-green-600 dark:text-green-400">{`$${(statsByEmployee.reduce((a, c) => a + c.sueldoJornada * c.daysPresent, 0) + totalCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </Modal>

      {/* Contract Detail Sub-Modal */}
      <ContractDetailModal isOpen={contractModal.open} onClose={() => setContractModal({ open: false, employeeName: "", data: [] })} employeeName={contractModal.employeeName} userProjectsData={contractModal.data} filterProjectId={projectFilter !== "all" ? projectFilter : undefined} />
    </>
  );
};
