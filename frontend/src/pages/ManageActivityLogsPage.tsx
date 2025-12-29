// ... imports
import React, { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileText, faFilter, faSearch, faPen, faUser, faCalendar, faTrash, faUserSlash, faGear, faGrip, faTable, faBriefcase, faChartSimple, faClock, faCheck, faCheckCircle, faTimesCircle, faBan, faTimes, faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { CardItemGeneric } from "../components/ui/CardItemGeneric";
import { Modal } from "../components/ui/Modal";
import { ActivityReport, AttendanceRecord, AttendanceStatus } from "../types/activityTypes";
import { getHelp, hasHelp } from "../data/help/helpContent";

// ... (MOCK_AREAS, MOCK_REPORTS, AttendanceTable, AbsenceBlock components remain identical, omitting for brevity in this replace block if not changing, but since I'm replacing the whole file content structure to be safe with the new function placement, I will include them or rely on the tool to just insert what I need if I were using multi-replace. Since I need to construct the whole page logic for the view toggle, I will replace the main component logic.)

// ... reusing MOCK_AREAS and MOCK_REPORTS ...
const MOCK_AREAS = [
  { id: "1", name: "Editores" },
  { id: "2", name: "Libertador" },
  { id: "3", name: "Peinado y Maquillaje" },
  { id: "4", name: "Técnica Mañana" },
  { id: "5", name: "Técnica Noche" },
  { id: "6", name: "Vestuario" },
];

const MOCK_REPORTS: ActivityReport[] = [
  {
    id: "REP-001",
    date: "2024-05-15",
    formName: "Técnica Mañana",
    projectName: "Gran Hermano",
    areaId: "4",
    status: "sent",
    submittedBy: "Juan Perez",
    submittedAt: "2024-05-15T09:00:00Z",
    comments: "6 am Oscar Rodriguez - Paula Riofrio (1 h Extra)\n10 pm Gabriela Romero - Victoria Raffo (1 h extra)\nDamian Tiero vino en lugar de Mauricio Aquino\nRodrigo Aguirre entro 18 hs\nDejo por aca quienes trabajaron hoy siendo feriado:\nJosé Alessio Silva",
    attendance: [
      { id: "1", employeeId: "E001", employeeName: "BARBONA AGUSTIN", areaId: "2", areaName: "Libertador", hasOvertime: false, overtimeHours: 0, status: "absent", absenceReason: "Compensatorio", replacementName: "JALUF Guido" },
      { id: "2", employeeId: "E002", employeeName: "GIUNTA Lucas", areaId: "2", areaName: "Libertador", hasOvertime: false, overtimeHours: 0, status: "present", entryTime: "08:00", exitTime: "17:00" },
      { id: "3", employeeId: "E003", employeeName: "JORDAN Alejandro", areaId: "2", areaName: "Libertador", hasOvertime: false, overtimeHours: 0, status: "present", entryTime: "08:00", exitTime: "17:00" },
      { id: "4", employeeId: "E004", employeeName: "BOREA Hector", areaId: "4", areaName: "Técnica Mañana", hasOvertime: true, overtimeHours: 1, status: "present", entryTime: "06:30", exitTime: "13:00", overtimeEntryTime: "13:00", overtimeExitTime: "14:00" },
      { id: "5", employeeId: "E005", employeeName: "EANDI AXEL", areaId: "4", areaName: "Técnica Mañana", hasOvertime: true, overtimeHours: 1, status: "present", entryTime: "06:30", exitTime: "13:00", overtimeEntryTime: "13:00", overtimeExitTime: "14:00" },
      { id: "6", employeeId: "E006", employeeName: "HENRIQUEZ ALISTE Andres", areaId: "4", areaName: "Técnica Mañana", hasOvertime: false, overtimeHours: 0, status: "absent", absenceReason: "Enfermedad", notes: "Avisó por whatsapp" },
      { id: "7", employeeId: "E007", employeeName: "HERNANDEZ DUNN Facundo Ariel", areaId: "4", areaName: "Técnica Mañana", hasOvertime: true, overtimeHours: 1, status: "present", entryTime: "06:30", exitTime: "13:00", overtimeEntryTime: "13:00", overtimeExitTime: "14:00" },
    ],
  },
  {
    id: "REP-002",
    date: "2024-05-16",
    formName: "Libertador",
    projectName: "Got Talent",
    areaId: "2",
    status: "pending_signature",
    submittedBy: "Maria Gonzalez",
    submittedAt: "2024-05-16T18:00:00Z",
    comments: "Todo normal en la jornada.",
    attendance: [],
  },
];

const AttendanceTable: React.FC<{ attendance: AttendanceRecord[] }> = ({ attendance }) => {
  return (
    <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="py-3 px-4">Colaborador</th>
            <th className="py-3 px-4 text-center">Presente</th>
            <th className="py-3 px-4">Area</th>
            <th className="py-3 px-4 text-center">Entrada</th>
            <th className="py-3 px-4 text-center">Salida</th>
            <th className="py-3 px-4 text-center">Hs. Exts.</th>
            <th className="py-3 px-4 text-center">Entrada Exts.</th>
            <th className="py-3 px-4 text-center">Salida Exts.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {attendance.map((record) => {
            const isAbsent = record.status !== "present" && record.status !== "late";
            return (
              <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className={`py-3 px-4 font-medium ${isAbsent ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>{record.employeeName}</td>
                <td className="py-3 px-4 text-center">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${!isAbsent ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{!isAbsent ? "Sí" : "No"}</span>
                </td>
                <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{record.areaName}</td>
                <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-400">{record.entryTime || "-"}</td>
                <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-400">{record.exitTime || "-"}</td>
                <td className="py-3 px-4 text-center">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${record.overtimeHours > 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"}`}>{record.overtimeHours}</span>
                </td>
                <td className="py-3 px-4 text-center text-xs font-medium">{record.overtimeEntryTime ? <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded">{record.overtimeEntryTime}</span> : <span className="text-gray-400 dark:text-gray-600">-</span>}</td>
                <td className="py-3 px-4 text-center text-xs font-medium">{record.overtimeExitTime ? <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded">{record.overtimeExitTime}</span> : <span className="text-gray-400 dark:text-gray-600">-</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const AbsenceBlock: React.FC<{ title: string; type: AttendanceStatus; records: AttendanceRecord[] }> = ({ title, type, records }) => {
  const relevantRecords = records.filter((r) => {
    if (type === "compensatory") return r.status === "compensatory" || r.absenceReason === "Compensatorio";
    if (type === "sick") return r.status === "sick" || r.absenceReason === "Enfermedad";
    if (type === "unpaid") return r.status === "unpaid" || r.absenceReason === "Sin Goce de Sueldo";
    if (type === "vacation") return r.status === "vacation" || r.absenceReason === "Vacaciones";
    return false;
  });

  const count = relevantRecords.length;
  // Default open if there are records
  const [isOpen, setIsOpen] = useState(count > 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button onClick={() => setIsOpen(!isOpen)} className="px-5 py-4 flex justify-between items-center w-full text-left focus:outline-none hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {title} <span className={count > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-gray-500 font-normal"}>({count})</span>
        </h3>
        <FontAwesomeIcon icon={isOpen ? faChevronUp : faChevronDown} className="text-gray-400 text-xs" />
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 dark:border-gray-700 animate-fade-in">
          {count > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-500 font-medium border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <tr>
                    <th className="py-2 px-5 text-left w-1/2 font-semibold">Colaborador</th>
                    <th className="py-2 px-5 text-left w-1/2 font-semibold">Reemplazo / Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {relevantRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                      <td className="py-2.5 px-5 font-medium text-red-600 dark:text-red-400">{rec.employeeName}</td>
                      <td className="py-2.5 px-5 text-gray-600 dark:text-gray-400">{rec.replacementName || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-4 text-center text-sm text-gray-500 italic bg-gray-50/30 dark:bg-gray-900/10">No hay registro de Ausentes por {title}</div>
          )}
        </div>
      )}
    </div>
  );
};

import { useNavigate } from "react-router-dom";

export const ManageActivityLogsPage: React.FC = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [listLayout, setListLayout] = useState<"table" | "cards">("table");
  const [selectedReport, setSelectedReport] = useState<ActivityReport | null>(null);
  const [openInfo, setOpenInfo] = useState(false);
  const [showDetailStatsModal, setShowDetailStatsModal] = useState(false);
  const [detailTab, setDetailTab] = useState<"attendance" | "absences" | "comments">("attendance");

  // Filters
  const [dateFilter, setDateFilter] = useState("daily"); // daily, weekly, monthly
  const [areaFilter, setAreaFilter] = useState("all");
  const [showStatsModal, setShowStatsModal] = useState(false);

  // Stats calculation
  const stats = React.useMemo(() => {
    let totalReports = MOCK_REPORTS.length;
    let totalAbsences = 0;
    let totalOvertimeHours = 0;

    MOCK_REPORTS.forEach((report) => {
      report.attendance.forEach((record) => {
        if (record.status !== "present" && record.status !== "late") {
          totalAbsences++;
        }
        if (record.overtimeHours > 0) {
          totalOvertimeHours += record.overtimeHours;
        }
      });
    });

    return { totalReports, totalAbsences, totalOvertimeHours };
  }, []);

  // Help integration
  const HELP_KEY = "activityLogs";
  const helpEntry = getHelp(HELP_KEY);

  const handleViewDetail = (report: ActivityReport) => {
    setSelectedReport(report);
    setViewMode("detail");
    setDetailTab("attendance");
  };

  const handleBackToList = () => {
    setSelectedReport(null);
    setViewMode("list");
  };

  // Helper for ID format
  const formatReportId = (id: string) => {
    // Mock transformation: REP-001 -> DEM-REG-000001
    const num = id.split("-")[1] || "000000";
    return `DEM-REG-${num.padStart(6, "0")}`;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // --- RENDER CARDS VIEW ---
  const renderCardsView = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MOCK_REPORTS.map((report) => {
          const badgesTop = [
            <span key="id" className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400">
              {formatReportId(report.id)}
            </span>,
          ];

          return (
            <CardItemGeneric
              key={report.id}
              title={report.submittedBy}
              subtitle={report.formName}
              avatarFallback={getInitials(report.submittedBy)}
              badgesTop={badgesTop}
              footerLeft={
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <FontAwesomeIcon icon={faCalendar} className="h-3 w-3" />
                  <span>{format(new Date(report.date), "dd MMM yyyy", { locale: es })}</span>
                </div>
              }
              footerActions={[
                {
                  icon: faTrash,
                  onClick: (e) => {
                    e?.stopPropagation();
                    // Delete logic would go here
                  },
                  title: "Eliminar",
                  variant: "default",
                },
              ]}
              onClick={() => handleViewDetail(report)}
            >
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                <span className="font-medium">{report.attendance.length}</span> registros de asistencia
              </div>
            </CardItemGeneric>
          );
        })}
        {MOCK_REPORTS.length === 0 && <div className="col-span-full py-12 text-center text-gray-500">No se encontraron reportes.</div>}
      </div>
    );
  };

  // --- RENDER DETAIL VIEW ---
  if (viewMode === "detail" && selectedReport) {
    return (
      <PageLayout
        title={selectedReport.projectName}
        badge={{
          text: format(new Date(selectedReport.date), "EEEE d 'de' MMMM, yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase()),
          variant: "default",
        }}
        faIcon={{ icon: faBriefcase }}
        infoModal={{
          isOpen: openInfo,
          onOpen: () => setOpenInfo(true),
          onClose: () => setOpenInfo(false),
          title: helpEntry.title,
          subtitle: null, // Don't show page subtitle in info modal
          size: helpEntry.size,
          content: helpEntry.content,
        }}
        shouldShowInfo={hasHelp(HELP_KEY)}
        onBack={handleBackToList}
        headerActions={
          <button onClick={() => setShowDetailStatsModal(true)} className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm" aria-label="Ver estadísticas del reporte" title="Ver estadísticas del reporte">
            <FontAwesomeIcon icon={faChartSimple} className="h-4 w-4" />
          </button>
        }
      >
        <div className="space-y-6 animate-fade-in">
          {/* Header Info Card Removed as per request to save space */}

          {/* ... Tabs ... */}

          {/* Detail Stats Modal */}
          <Modal
            isOpen={showDetailStatsModal}
            onClose={() => setShowDetailStatsModal(false)}
            title={
              <div className="flex items-center gap-3">
                <span>Estadísticas: {selectedReport.projectName}</span>
                <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs px-2.5 py-0.5 rounded-full font-medium border border-blue-200 dark:border-blue-800">{format(new Date(selectedReport.date), "dd MMM yyyy", { locale: es })}</span>
              </div>
            }
            size="md"
          >
            <div className="flex flex-wrap gap-4 justify-center">
              <div className="rounded-xl shadow-sm p-4 py-2 flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                <FontAwesomeIcon icon={faUser} className="lg:h-5 w-5 opacity-80" />
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-medium opacity-80">Total Personal</span>
                  <span className="lg:text-lg font-bold">{selectedReport.attendance.length}</span>
                </div>
              </div>

              <div className="rounded-xl shadow-sm p-4 py-2 flex items-center gap-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                <FontAwesomeIcon icon={faUserSlash} className="lg:h-5 w-5 opacity-80" />
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-medium opacity-80">Ausentes</span>
                  <span className="lg:text-lg font-bold">{selectedReport.attendance.filter((r) => r.status !== "present" && r.status !== "late").length}</span>
                </div>
              </div>

              <div className="rounded-xl shadow-sm p-4 py-2 flex items-center gap-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
                <FontAwesomeIcon icon={faClock} className="lg:h-5 w-5 opacity-80" />
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-medium opacity-80">Hs. Extras</span>
                  <span className="lg:text-lg font-bold">{selectedReport.attendance.reduce((acc, curr) => acc + (curr.overtimeHours || 0), 0)}</span>
                </div>
              </div>
            </div>
          </Modal>

          {/* Tabs Navigation */}
          {/* Tabs Navigation */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 bg-white dark:bg-gray-800 rounded-t-lg px-2 pt-2">
            <button onClick={() => setDetailTab("attendance")} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${detailTab === "attendance" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
              Asistencia del Personal ({selectedReport.attendance.length})
            </button>
            <button onClick={() => setDetailTab("absences")} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${detailTab === "absences" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
              Ausentes ({selectedReport.attendance.filter((r) => r.status !== "present" && r.status !== "late").length})
            </button>
            <button onClick={() => setDetailTab("comments")} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${detailTab === "comments" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
              Comentarios ({selectedReport.comments ? 1 : 0})
            </button>
          </div>

          <div className="space-y-6">
            {detailTab === "attendance" &&
              (selectedReport.attendance.length > 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-0 overflow-hidden animate-fade-in">
                  <div className="p-4">
                    <AttendanceTable attendance={selectedReport.attendance} />
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">No hay registro de Asistencia del Personal</div>
              ))}

            {detailTab === "absences" &&
              (selectedReport.attendance.filter((r) => r.status !== "present" && r.status !== "late").length > 0 ? (
                <div className="space-y-4 animate-fade-in">
                  <AbsenceBlock type="compensatory" title="Compensatorios" records={selectedReport.attendance} />
                  <AbsenceBlock type="sick" title="Enfermedad" records={selectedReport.attendance} />
                  <AbsenceBlock type="unpaid" title="Sin goce de sueldo" records={selectedReport.attendance} />
                  <AbsenceBlock type="vacation" title="Por Vacaciones" records={selectedReport.attendance} />
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">No hay registro de Ausentes</div>
              ))}
            {detailTab === "comments" &&
              (selectedReport.comments ? (
                <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-5 animate-fade-in">
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded border border-yellow-100 dark:border-yellow-900/30 text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-line">{selectedReport.comments}</div>
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">No hay comentarios</div>
              ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  // --- RENDER LIST VIEW ---
  return (
    <PageLayout
      title="Registro de Novedades"
      subtitle="Historial de reportes diarios de asistencia y novedades"
      faIcon={{ icon: faFileText }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      headerActions={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowStatsModal(true)} className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm" aria-label="Ver resumen" title="Ver resumen">
            <FontAwesomeIcon icon={faChartSimple} className="h-4 w-4" />
          </button>
          <button onClick={() => navigate("/hr/activity-logs/calendar")} className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm" aria-label="Ver calendario" title="Ver calendario">
            <FontAwesomeIcon icon={faCalendar} className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Filters - Styled like ManageVacationsPage */}
        <div className="mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar solicitudes..." // Matching text from request/image
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="relative">
            <FontAwesomeIcon icon={faFilter} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} className="pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none">
              <option value="all">Todas las Areas</option>
              {MOCK_AREAS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <FontAwesomeIcon icon={faCalendar} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none">
              <option value="daily">Diario</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setListLayout("cards")} className={`px-4 py-1.5 rounded-md transition-all ${listLayout === "cards" ? "bg-blue-500 text-white shadow-sm" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border dark:border-gray-700"}`} title="Vista de tarjetas" aria-label="Vista de tarjetas">
              <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
            </button>
            <button onClick={() => setListLayout("table")} className={`px-4 py-1.5 rounded-md transition-all ${listLayout === "table" ? "bg-blue-500 text-white shadow-sm" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border dark:border-gray-700"}`} title="Vista de tabla" aria-label="Vista de tabla">
              <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* List Content */}
        {listLayout === "cards" ? (
          renderCardsView()
        ) : (
          <div className="overflow-x-auto rounded border dark:border-slate-800">
            <table className="w-full dark:bg-slate-800/80 table-auto">
              <thead>
                <tr>
                  <th className="text-left text-nowrap py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">No Registro</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Fecha Reg.</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Proyecto</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300" title="Total Registros de Asistencia">
                    Registros
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Ausentes</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Hs. Extras</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Enviado Por</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300"></th>
                </tr>
              </thead>
              <tbody>
                {MOCK_REPORTS.map((report) => (
                  <tr key={report.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => handleViewDetail(report)}>
                    <td className="py-3 px-4">
                      <span className="bg-gray-50 dark:bg-gray-600/20 text-xs text-nowrap text-gray-600 dark:text-gray-400 px-2 rounded">{formatReportId(report.id)}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-400">{format(new Date(report.date), "dd MMM yyyy", { locale: es })}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                        <FontAwesomeIcon icon={faBriefcase} className="text-blue-400 text-xs" />
                        {report.projectName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 font-medium">{report.attendance.length}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {(() => {
                        const absentCount = report.attendance.filter((r) => r.status !== "present").length;
                        return absentCount > 0 ? <span className="text-red-600 dark:text-red-400 font-medium">{absentCount}</span> : "0";
                      })()}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {(() => {
                        const overtimeCount = report.attendance.filter((r) => r.hasOvertime).length;
                        return overtimeCount > 0 ? <span className="text-green-600 dark:text-green-400 font-medium">{overtimeCount}</span> : "0";
                      })()}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {report.submittedBy}
                      <div className="text-xs text-gray-400">{format(new Date(report.submittedAt), "HH:mm")} hs</div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors px-2 py-1 rounded" title="Eliminar">
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                ))}
                {MOCK_REPORTS.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      No se encontraron reportes para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={showStatsModal} onClose={() => setShowStatsModal(false)} title="Resumen de Novedades" size="md">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 justify-center">
            {[
              { label: "Reportes", value: stats.totalReports, icon: faFileText, color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" },
              { label: "Ausentes", value: stats.totalAbsences, icon: faUserSlash, color: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" },
              { label: "Hs. Extras", value: stats.totalOvertimeHours, icon: faClock, color: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" },
            ].map((stat, index) => (
              <div key={index} className={`rounded-xl shadow-sm p-4 py-2 flex items-center gap-3 ${stat.color}`}>
                <FontAwesomeIcon icon={stat.icon} className="lg:h-5 w-5 opacity-80" />
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-medium opacity-80">{stat.label}</span>
                  <span className="lg:text-lg font-bold">{stat.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
};
