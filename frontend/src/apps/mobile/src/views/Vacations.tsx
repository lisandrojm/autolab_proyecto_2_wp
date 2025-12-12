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

export default function Vacations({ onNavigate }: VacationsProps) {
  const { vacations, availableDays, loading, createVacation } = useVacations();
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Calendar State
  const [calendarOpen, setCalendarOpen] = useState<"start" | "end" | null>(null);
  const [viewDate, setViewDate] = useState(new Date());

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
        return <FontAwesomeIcon icon={faCheckCircle} className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case "pending":
        return <FontAwesomeIcon icon={faClock} className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
      case "rejected":
        return <FontAwesomeIcon icon={faTimesCircle} className="w-5 h-5 text-red-600 dark:text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "approved":
        return "Aprobada";
      case "pending":
        return "Pendiente";
      case "rejected":
        return "Rechazada";
      case "cancelled":
        return "Cancelada";
      default:
        return status;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-100 dark:bg-green-900/50";
      case "pending":
        return "bg-yellow-100 dark:bg-yellow-900/50";
      case "rejected":
        return "bg-red-100 dark:bg-red-900/50";
      case "cancelled":
        return "bg-slate-100 dark:bg-slate-800";
      default:
        return "bg-slate-100 dark:bg-slate-800";
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
        <div className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
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

        {/* Available Days Card */}
        <div className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Días disponibles</p>
              {loading ? <div className="h-9 w-16 bg-slate-200 dark:bg-slate-700 rounded mt-1" /> : <p className="text-3xl font-bold text-primary">{availableDays?.available || 0}</p>}
            </div>
          </div>
        </div>

        <button onClick={() => setShowForm(!showForm)} disabled={loading} className="w-full flex items-center justify-center gap-2 rounded-lg h-12 px-4 bg-blue-500 text-white text-sm font-medium leading-normal shadow-sm hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none mb-6 disabled:opacity-50 disabled:cursor-not-allowed">
          {showForm ? "Cancelar" : "Nueva Solicitud"}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm mb-6">
            <div className="space-y-4">
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
              <button type="submit" disabled={submitting} className="w-full flex items-center justify-center rounded-lg h-10 bg-blue-500 text-white disabled:opacity-50 gap-1">
                {submitting ? "Enviando..." : "Enviar Solicitud"}
              </button>
            </div>
          </form>
        )}

        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Mis Solicitudes</h3>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
                <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            ))}
          </div>
        ) : vacations.length > 0 ? (
          <div className="space-y-3">
            {vacations.map((request) => (
              <div key={request._id} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{request.reason}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {new Date(request.startDate).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      -{" "}
                      {new Date(request.endDate).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      ({request.daysRequested} días)
                    </p>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${getStatusBg(request.status)}`}>
                    {getStatusIcon(request.status)}
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{getStatusText(request.status)}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Solicitado el{" "}
                  {new Date(request.createdAt).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-8 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400">No tienes solicitudes de vacaciones</p>
          </div>
        )}
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
