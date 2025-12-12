import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCalendar, faCheckCircle, faClock, faTimesCircle, faUmbrellaBeach, faChevronLeft, faChevronRight, faUsers, faBuilding, faTimes } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import { useVacations } from "../hooks/useVacations";
import { sweetAlert } from "../utils/sweetAlert";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay, parseISO, isWithinInterval, isBefore, isAfter, addDays, subDays, isMonday, isSunday } from "date-fns";
import { es } from "date-fns/locale";

interface VacationsProps {
  onNavigate: (view: ViewType) => void;
}

// MOCK DATA
const MOCK_AREA_INFO = {
  name: "Desarrollo",
  userCount: 12,
};

const MOCK_OCCUPIED_DATES = ["2025-12-20", "2025-12-21", "2025-12-22", "2025-12-24", "2025-12-25", "2026-01-01"];

const MOCK_REQUESTS = [
  {
    id: "VAC-001-2025",
    status: "pending",
    type: "Vacaciones",
    dates: "20 Dic - 02 Ene",
    days: "14 días",
    requestDate: "12/12/2025",
    tags: ["Vacaciones", "14 días", "Goce de sueldo"],
  },
  {
    id: "VAC-002-2025",
    status: "approved",
    type: "Día de estudio",
    dates: "15 Nov",
    days: "1 día",
    requestDate: "10/11/2025",
    tags: ["Estudio", "1 día", "Certificado"],
  },
  {
    id: "VAC-003-2025",
    status: "rejected",
    type: "Asuntos personales",
    dates: "01 Oct - 03 Oct",
    days: "3 días",
    requestDate: "25/09/2025",
    tags: ["Personal", "3 días", "Sin goce"],
  },
];

const MOCK_VACATION_STATS: Record<number, { antiguedad: number; pendientes: number; gozados: number; beneficio: number; corridos: number; habiles: number }> = {
  2024: {
    antiguedad: 21,
    pendientes: 0,
    gozados: 21,
    beneficio: 0,
    corridos: 25,
    habiles: 18,
  },
  2025: {
    antiguedad: 24,
    pendientes: 2,
    gozados: 4,
    beneficio: 2,
    corridos: 14,
    habiles: 10,
  },
  2026: {
    antiguedad: 28,
    pendientes: 0,
    gozados: 0,
    beneficio: 5,
    corridos: 0,
    habiles: 0,
  },
};

export default function Vacations({ onNavigate }: VacationsProps) {
  const { vacations, availableDays, loading, createVacation } = useVacations();
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Stats State
  const [selectedYear, setSelectedYear] = useState(2025);

  // Calendar State
  const [calendarOpen, setCalendarOpen] = useState<"start" | "end" | null>(null);
  const [viewDate, setViewDate] = useState(new Date());

  const currentStats = MOCK_VACATION_STATS[selectedYear] || MOCK_VACATION_STATS[2025];

  const handlePrevYear = () => {
    const years = Object.keys(MOCK_VACATION_STATS).map(Number).sort();
    const currentIndex = years.indexOf(selectedYear);
    if (currentIndex > 0) {
      setSelectedYear(years[currentIndex - 1]);
    }
  };

  const handleNextYear = () => {
    const years = Object.keys(MOCK_VACATION_STATS).map(Number).sort();
    const currentIndex = years.indexOf(selectedYear);
    if (currentIndex < years.length - 1) {
      setSelectedYear(years[currentIndex + 1]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await createVacation({
        startDate,
        endDate,
        reason,
      });
      await sweetAlert.success("¡Solicitud creada!", "Tu solicitud de vacaciones ha sido enviada");
      setShowForm(false);
      setStartDate("");
      setEndDate("");
      setReason("");
    } catch (err: any) {
      await sweetAlert.error("Error", err.response?.data?.error || "Error al crear solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <FontAwesomeIcon icon={faCheckCircle} className="w-3 h-3" />;
      case "pending":
        return <FontAwesomeIcon icon={faClock} className="w-3 h-3" />;
      case "rejected":
        return <FontAwesomeIcon icon={faTimesCircle} className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "approved":
        return "Aprobado";
      case "pending":
        return "Pendiente";
      case "rejected":
        return "Rechazado";
      case "cancelled":
        return "Cancelado";
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "text-blue-500 bg-blue-500/10 border-blue-500/20";
      case "pending":
        return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
      case "rejected":
        return "text-red-500 bg-red-500/10 border-red-500/20";
      default:
        return "text-slate-500 bg-slate-500/10 border-slate-500/20";
    }
  };

  // Calendar Helpers
  const generateCalendarDays = () => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    return eachDayOfInterval({
      start: startDate,
      end: endDate,
    });
  };

  const isOccupied = (day: Date) => {
    return MOCK_OCCUPIED_DATES.includes(format(day, "yyyy-MM-dd"));
  };

  const checkOverlap = (start: string, end: string) => {
    if (!start || !end) return false;
    const s = parseISO(start);
    const e = parseISO(end);

    // Check if any occupied date falls within the range
    return MOCK_OCCUPIED_DATES.some((occupiedDate) => {
      const occ = parseISO(occupiedDate);
      return isWithinInterval(occ, { start: s, end: e });
    });
  };

  const handleDateSelect = async (day: Date) => {
    const formattedDate = format(day, "yyyy-MM-dd");

    // Prevent selecting occupied dates directly
    if (isOccupied(day)) {
      await sweetAlert.error("Fecha no disponible", "Este día ya está ocupado por otro miembro de tu equipo.");
      return;
    }

    let newStart = startDate;
    let newEnd = endDate;

    if (calendarOpen === "start") {
      newStart = formattedDate;
      // If end date exists and is before new start, clear end date
      if (endDate && isAfter(day, parseISO(endDate))) {
        newEnd = "";
      }
    } else if (calendarOpen === "end") {
      newEnd = formattedDate;
      // If start date exists and is after new end, clear start date
      if (startDate && isBefore(day, parseISO(startDate))) {
        newStart = "";
      }
    }

    // Check for overlap if we have a valid range
    if (newStart && newEnd) {
      const hasOverlap = checkOverlap(newStart, newEnd);
      if (hasOverlap) {
        await sweetAlert.error("Conflicto de fechas", "El rango seleccionado se solapa con vacaciones de otros miembros del equipo. Por favor selecciona otras fechas.");
        return;
      }
    }

    if (calendarOpen === "start") {
      setStartDate(newStart);
      if (newEnd !== endDate) setEndDate(newEnd);
      // Auto-switch to end date selection
      setCalendarOpen("end");
    } else {
      setEndDate(newEnd);
      if (newStart !== startDate) setStartDate(newStart);
      // Don't close automatically, let user confirm
    }
  };

  return (
    <div className="flex-1 pb-24 relative">
      <div className="sticky top-0 z-10 p-4 pb-2 order-t border-b border-slate-800 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate("home")} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800">
            <FontAwesomeIcon icon={faArrowLeft} className="w-6 h-6 text-slate-900 dark:text-slate-100" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              <FontAwesomeIcon icon={faUmbrellaBeach} className="w-6 h-6 text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mis Vacaciones</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Area Info Card */}
        <div className="flex flex-col space-y-2 bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <FontAwesomeIcon icon={faBuilding} />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Área</p>
                <p className="font-bold text-slate-900 dark:text-slate-100">{MOCK_AREA_INFO.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <FontAwesomeIcon icon={faUsers} />
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400">Miembros</p>
                <p className="font-bold text-slate-900 dark:text-slate-100">{MOCK_AREA_INFO.userCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Vacation Stats Card */}
        <div className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <button onClick={handlePrevYear} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors disabled:opacity-30" disabled={selectedYear <= Math.min(...Object.keys(MOCK_VACATION_STATS).map(Number))}>
              <FontAwesomeIcon icon={faChevronLeft} className="text-slate-500 dark:text-slate-400" />
            </button>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Año {selectedYear}</h2>
            <button onClick={handleNextYear} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors disabled:opacity-30" disabled={selectedYear >= Math.max(...Object.keys(MOCK_VACATION_STATS).map(Number))}>
              <FontAwesomeIcon icon={faChevronRight} className="text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-y-4 gap-x-2">
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 leading-tight">Antigüedad</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{currentStats.antiguedad}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 leading-tight">Pendientes</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{currentStats.pendientes}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 leading-tight">Gozados</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{currentStats.gozados}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 leading-tight">Beneficio</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{currentStats.beneficio}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 leading-tight">Corridos</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{currentStats.corridos}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 leading-tight">Hábiles</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{currentStats.habiles}</p>
            </div>
          </div>
        </div>

        <button onClick={() => setShowForm(true)} disabled={loading} className="w-full flex items-center justify-center gap-2 rounded-lg h-12 px-4 bg-blue-500 text-white text-sm font-medium leading-normal shadow-sm hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none mb-6 disabled:opacity-50 disabled:cursor-not-allowed">
          Nueva Solicitud
        </button>

        {showForm && (
          <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-xl shadow-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Nueva Solicitud</h3>
                <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Fecha de inicio</label>
                  <div onClick={() => setCalendarOpen("start")} className="relative cursor-pointer">
                    <input type="text" value={startDate} readOnly placeholder="Seleccionar fecha" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none cursor-pointer" />
                    <FontAwesomeIcon icon={faCalendar} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Fecha de fin</label>
                  <div onClick={() => setCalendarOpen("end")} className="relative cursor-pointer">
                    <input type="text" value={endDate} readOnly placeholder="Seleccionar fecha" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none cursor-pointer" />
                    <FontAwesomeIcon icon={faCalendar} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Comentario</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none" placeholder="Describe el comentario de tu solicitud..." />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg h-10 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={submitting} className="flex-1 rounded-lg h-10 bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors disabled:opacity-50">
                    {submitting ? "Enviando..." : "Enviar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Mis Solicitudes</h3>

        <div className="space-y-3">
          {MOCK_REQUESTS.map((request) => (
            <div key={request.id} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">{request.id}</span>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded border ${getStatusColor(request.status)}`}>
                  {getStatusIcon(request.status)}
                  <span className="text-xs font-bold">{getStatusText(request.status)}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {request.tags.map((tag, idx) => (
                  <span key={idx} className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium">
                    {tag}
                  </span>
                ))}
              </div>

              <p className="text-xs text-slate-400 dark:text-slate-500">{request.requestDate}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Modal */}
      {calendarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white capitalize">{format(viewDate, "MMMM yyyy", { locale: es })}</h3>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                  <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                    <FontAwesomeIcon icon={faChevronLeft} className="text-slate-600 dark:text-slate-400 w-4 h-4" />
                  </button>
                  <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                    <FontAwesomeIcon icon={faChevronRight} className="text-slate-600 dark:text-slate-400 w-4 h-4" />
                  </button>
                </div>
                <button onClick={() => setCalendarOpen(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ml-2">
                  <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-7 mb-2 text-center">
                {["L", "M", "M", "J", "V", "S", "D"].map((day) => (
                  <div key={day} className="text-xs font-bold text-slate-400">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-1">
                {generateCalendarDays().map((day, idx) => {
                  const isCurrentMonth = isSameMonth(day, viewDate);
                  const formattedDay = format(day, "yyyy-MM-dd");

                  // Occupied Logic
                  const isOccupiedDay = isOccupied(day);
                  const isMon = isMonday(day);
                  const isSun = isSunday(day);

                  // Neighbors for Occupied
                  const prevOcc = isOccupied(subDays(day, 1));
                  const nextOcc = isOccupied(addDays(day, 1));

                  // Selection Logic
                  const isStart = startDate === formattedDay;
                  const isEnd = endDate === formattedDay;

                  let isInRange = false;
                  if (startDate && endDate) {
                    const s = parseISO(startDate);
                    const e = parseISO(endDate);
                    if (isBefore(s, e) || isSameDay(s, e)) {
                      isInRange = isWithinInterval(day, { start: s, end: e });
                    }
                  }

                  const isSelected = isStart || isEnd || isInRange;

                  // Base classes
                  let classes = "h-10 w-full flex items-center justify-center text-sm font-medium transition-all relative";

                  // Colors and Borders
                  if (isOccupiedDay) {
                    classes += " bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border-transparent";
                    // Radius for occupied
                    const visualStart = !prevOcc || isMon;
                    const visualEnd = !nextOcc || isSun;
                    if (visualStart) classes += " rounded-l-lg";
                    else classes += " rounded-l-none";
                    if (visualEnd) classes += " rounded-r-lg";
                    else classes += " rounded-r-none";
                  } else if (isSelected) {
                    // Selection Colors
                    if (isStart || isEnd) {
                      classes += " bg-blue-900 text-white z-10";
                    } else {
                      classes += " bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
                    }

                    // Selection Borders (Dark Blue Outline)
                    classes += " border border-y-blue-800 dark:border-y-blue-400"; // Top/Bottom always

                    // Left Border
                    if (isStart || isMon) classes += " border-l-blue-800 dark:border-l-blue-400";
                    else classes += " border-l-transparent";

                    // Right Border
                    if (isEnd || isSun) classes += " border-r-blue-800 dark:border-r-blue-400";
                    else classes += " border-r-transparent";

                    // Radius for selection
                    const visualSelStart = isStart || isMon;
                    const visualSelEnd = isEnd || isSun;
                    if (visualSelStart) classes += " rounded-l-lg";
                    else classes += " rounded-l-none";
                    if (visualSelEnd) classes += " rounded-r-lg";
                    else classes += " rounded-r-none";
                  } else {
                    // Default / Empty
                    classes += " border-transparent border-2";
                    classes += !isCurrentMonth ? " text-slate-300 dark:text-slate-700" : " text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg";
                  }

                  return (
                    <button key={idx} onClick={() => handleDateSelect(day)} className={classes} title={isOccupiedDay ? "Ocupado por otro usuario" : ""}>
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-4 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="w-3 h-3 rounded-full bg-red-100 dark:bg-red-900/30 block"></span>
                <span>Ocupado</span>
                <span className="w-3 h-3 rounded-full bg-blue-100 dark:bg-blue-900/30 border border-blue-800 dark:border-blue-400 ml-2 block"></span>
                <span>Selección</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setCalendarOpen(null)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                  Cancelar
                </button>
                <button onClick={() => setCalendarOpen(null)} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
