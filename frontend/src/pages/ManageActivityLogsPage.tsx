import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileText, faFilter, faSearch, faEye, faArrowLeft, faCheckCircle, faClock, faPen, faUser, faBuilding, faCalendar, faPrint, faTrash, faUserSlash, faGear } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ActivityReport, AttendanceRecord, AttendanceStatus } from "../types/activityTypes";
import { getHelp, hasHelp } from "../data/help/helpContent";

// --- MOCK DATA ---
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
    areaId: "4",
    status: "sent",
    submittedBy: "Juan Perez",
    submittedAt: "2024-05-15T09:00:00Z",
    comments: "6 am Oscar Rodriguez - Paula Riofrio (1 h Extra)\n10 pm Gabriela Romero - Victoria Raffo (1 h extra)\nDamian Tiero vino en lugar de Mauricio Aquino\nRodrigo Aguirre entro 18 hs\nDejo por aca quienes trabajaron hoy siendo feriado:\nJosé Alessio Silva",
    attendance: [
      { id: "1", employeeId: "E001", employeeName: "BARBONA AGUSTIN", areaId: "2", areaName: "Libertador", hasOvertime: false, overtimeHours: 0, status: "absent", absenceReason: "Compensatorio", replacementName: "JALUF Guido" },
      { id: "2", employeeId: "E002", employeeName: "GIUNTA Lucas", areaId: "2", areaName: "Libertador", hasOvertime: false, overtimeHours: 0, status: "present", entryTime: "08:00", exitTime: "17:00" },
      { id: "3", employeeId: "E003", employeeName: "JORDAN Alejandro", areaId: "2", areaName: "Libertador", hasOvertime: false, overtimeHours: 0, status: "present", entryTime: "08:00", exitTime: "17:00" },
      { id: "4", employeeId: "E004", employeeName: "BOREA Hector", areaId: "4", areaName: "Técnica Mañana", hasOvertime: true, overtimeHours: 1, status: "present", entryTime: "06:30", exitTime: "13:00" },
      { id: "5", employeeId: "E005", employeeName: "EANDI AXEL", areaId: "4", areaName: "Técnica Mañana", hasOvertime: true, overtimeHours: 1, status: "present", entryTime: "06:30", exitTime: "13:00" },
      { id: "6", employeeId: "E006", employeeName: "HENRIQUEZ ALISTE Andres", areaId: "4", areaName: "Técnica Mañana", hasOvertime: false, overtimeHours: 0, status: "absent", absenceReason: "Enfermedad", notes: "Avisó por whatsapp" },
      { id: "7", employeeId: "E007", employeeName: "HERNANDEZ DUNN Facundo Ariel", areaId: "4", areaName: "Técnica Mañana", hasOvertime: true, overtimeHours: 0, status: "present", entryTime: "06:30", exitTime: "13:00" },
    ],
  },
  {
    id: "REP-002",
    date: "2024-05-16",
    formName: "Libertador",
    areaId: "2",
    status: "pending_signature",
    submittedBy: "Maria Gonzalez",
    submittedAt: "2024-05-16T18:00:00Z",
    comments: "Todo normal en la jornada.",
    attendance: [],
  },
];

// --- COMPONENTS ---

const AttendanceTable: React.FC<{ attendance: AttendanceRecord[] }> = ({ attendance }) => {
  return (
    <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="py-3 px-4">Colaborador</th>
            <th className="py-3 px-4 text-center">Hizo horas extras</th>
            <th className="py-3 px-4">Area</th>
            <th className="py-3 px-4 text-center">Entrada</th>
            <th className="py-3 px-4 text-center">Salida</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {attendance.map((record) => {
            const isAbsent = record.status !== "present" && record.status !== "late";
            return (
              <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className={`py-3 px-4 font-medium ${isAbsent ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>{record.employeeName}</td>
                <td className="py-3 px-4 text-center">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${record.hasOvertime ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"}`}>{record.hasOvertime ? "Sí" : "No"}</span>
                </td>
                <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{record.areaName}</td>
                <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-400">{record.entryTime || "-"}</td>
                <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-400">{record.exitTime || "-"}</td>
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

  const hasAbsences = relevantRecords.length > 0;

  return (
    <div className="flex flex-col group">
      <div className="px-5 py-3 flex justify-between items-center bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${hasAbsences ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>{hasAbsences ? "Sí" : "No"}</span>
      </div>
      {hasAbsences && (
        <div className="px-5 pb-4 bg-gray-50/50 dark:bg-gray-900/20 shadow-inner">
          <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs uppercase text-gray-500 font-medium border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="py-2 px-4 text-left w-1/2">Colaborador</th>
                  <th className="py-2 px-4 text-left w-1/2">Reemplazo / Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {relevantRecords.map((rec) => (
                  <tr key={rec.id}>
                    <td className="py-2 px-4 font-medium text-gray-800 dark:text-gray-200">{rec.employeeName}</td>
                    <td className="py-2 px-4 text-gray-600 dark:text-gray-400">{rec.replacementName || "-"}</td>
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

// --- MAIN PAGE COMPONENT ---
export const ManageActivityLogsPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [selectedReport, setSelectedReport] = useState<ActivityReport | null>(null);
  const [openInfo, setOpenInfo] = useState(false);

  // Filters
  const [dateFilter, setDateFilter] = useState("daily"); // daily, weekly, monthly
  const [areaFilter, setAreaFilter] = useState("all");

  // Help integration
  const HELP_KEY = "activityLogs";
  const helpEntry = getHelp(HELP_KEY);

  const handleViewDetail = (report: ActivityReport) => {
    setSelectedReport(report);
    setViewMode("detail");
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

  // --- RENDER DETAIL VIEW ---
  if (viewMode === "detail" && selectedReport) {
    return (
      <PageLayout
        title="Detalle de Novedades"
        subtitle={`Reporte: ${selectedReport.formName} - ${format(new Date(selectedReport.date), "dd/MM/yyyy")}`}
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
        onBack={handleBackToList}
      >
        <div className="space-y-6 animate-fade-in">
          {/* Header Info Card */}
          <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Formulario / Área</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400">
                  <FontAwesomeIcon icon={faBuilding} className="h-4 w-4" />
                </div>
                <span className="font-semibold text-gray-900 dark:text-white">{selectedReport.formName}</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Fecha Reporte</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded text-purple-600 dark:text-purple-400">
                  <FontAwesomeIcon icon={faCalendar} className="h-4 w-4" />
                </div>
                <span className="font-semibold text-gray-900 dark:text-white">{format(new Date(selectedReport.date), "EEEE d 'de' MMMM, yyyy", { locale: es })}</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Estado Firma</span>
              <div className="mt-1">
                {selectedReport.status === "sent" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <FontAwesomeIcon icon={faCheckCircle} /> Enviado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    <FontAwesomeIcon icon={faClock} /> Pendiente Firma
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left Column: Attendance Table */}
            <div className="xl:col-span-2 space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <FontAwesomeIcon icon={faUser} className="text-gray-400" />
                    Asistencia del Personal
                  </h3>
                  <span className="text-xs font-medium text-gray-500">{selectedReport.attendance.length} registros</span>
                </div>
                <div className="p-4">
                  <AttendanceTable attendance={selectedReport.attendance} />
                </div>
              </div>

              {/* Comments Section */}
              <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faPen} className="text-gray-400" />
                  Comentarios Generales
                </h3>
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded border border-yellow-100 dark:border-yellow-900/30 text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-line">{selectedReport.comments}</div>
              </div>
            </div>

            {/* Right Column: Absence Blocks Group */}
            <div className="xl:col-span-1 space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50">
                  <FontAwesomeIcon icon={faUserSlash} className="text-gray-400" />
                  <h3 className="font-semibold text-gray-900 dark:text-white">Ausentes</h3>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  <AbsenceBlock type="compensatory" title="Compensatorios" records={selectedReport.attendance} />
                  <AbsenceBlock type="sick" title="Enfermedad" records={selectedReport.attendance} />
                  <AbsenceBlock type="unpaid" title="Sin goce de sueldo" records={selectedReport.attendance} />
                  <AbsenceBlock type="vacation" title="Por Vacaciones" records={selectedReport.attendance} />
                </div>
              </div>
            </div>
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
        <button className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm" title="Exportar">
          <FontAwesomeIcon icon={faGear} />
        </button>
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
        </div>

        {/* Table List */}
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs uppercase text-gray-500">
                <th className="py-4 px-6 font-semibold">Fecha</th>
                <th className="py-4 px-6 font-semibold">No Registro</th>
                <th className="py-4 px-6 font-semibold">Área / Formulario</th>
                <th className="py-4 px-6 font-semibold">Enviado Por</th>
                <th className="py-4 px-6 font-semibold">Estado</th>
                <th className="py-4 px-6 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {MOCK_REPORTS.map((report) => (
                <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer" onClick={() => handleViewDetail(report)}>
                  <td className="py-4 px-6 text-sm font-semibold text-gray-900 dark:text-white">{format(new Date(report.date), "dd MMM yyyy", { locale: es })}</td>
                  <td className="py-4 px-6">
                    <span className="text-xs font-mono text-gray-500">{formatReportId(report.id)}</span>
                  </td>
                  <td className="py-4 px-6">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      <FontAwesomeIcon icon={faBuilding} className="text-gray-400 text-xs" />
                      {report.formName}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-400">
                    {report.submittedBy}
                    <div className="text-xs text-gray-400">{format(new Date(report.submittedAt), "HH:mm")} hs</div>
                  </td>
                  <td className="py-4 px-6">{report.status === "sent" ? <StatusBadge type="firma_enviado_a_firmar" /> : <StatusBadge type="firma_pendiente" />}</td>
                  <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end items-center gap-2">
                      <button onClick={() => handleViewDetail(report)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium text-sm inline-flex items-center gap-1 transition-colors px-2 py-1 rounded" title="Ver Detalle">
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                      <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors px-2 py-1 rounded" title="Eliminar">
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {MOCK_REPORTS.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    No se encontraron reportes para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageLayout>
  );
};
