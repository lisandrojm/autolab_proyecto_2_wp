import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCalendar, faUmbrellaBeach, faChevronLeft, faChevronRight, faBuilding, faTimes, faPlus, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import { useVacations } from "../hooks/useVacations";
import { useProfile } from "../hooks/useProfile";
import { sweetAlert } from "../utils/sweetAlert";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay, parseISO, isWithinInterval, isBefore, isAfter, addDays, subDays, isMonday, isSunday, differenceInYears } from "date-fns";
import { es } from "date-fns/locale";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { mapVacationStatusToStatusTypeForMobile, mapVacationSignatureStateToStatusType, isVacationInFinalState } from "../../../../utils/statusHelpers";
import VacationDetailModal from "../components/VacationDetailModal";
import { VacationRequest } from "../../../../api/vacations";

interface VacationsProps {
  onNavigate: (view: ViewType) => void;
}

// Keeping this mock for calendar validation demo purposes only, as we don't have team calendar API hooked up here yet
const MOCK_OCCUPIED_DATES = ["2025-12-20", "2025-12-21", "2025-12-22", "2025-12-24", "2025-12-25", "2026-01-01"];

export default function Vacations({ onNavigate }: VacationsProps) {
  const { vacations, availableDays, loading: vacationsLoading, createVacation, refetch } = useVacations();
  const { profile, loading: profileLoading } = useProfile();

  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Modal State
  const [selectedVacation, setSelectedVacation] = useState<VacationRequest | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Stats State (Current Year only)
  const currentYear = new Date().getFullYear();
  // We can simulate year selection but data comes from backend as 'current state'.
  // For UI consistency with the mock, we can show the current year.
  const selectedYear = currentYear;

  const loading = vacationsLoading || profileLoading;

  // Calendar State for Form
  const [calendarOpen, setCalendarOpen] = useState<"start" | "end" | null>(null);
  const [viewDate, setViewDate] = useState(new Date());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate || !reason) {
      sweetAlert.error("Error", "Por favor completa todos los campos");
      return;
    }

    try {
      setSubmitting(true);
      await createVacation({
        startDate,
        endDate,
        reason,
      });
      await sweetAlert.success("Solicitud enviada", "Tu solicitud de vacaciones ha sido creada correctamente");
      setShowForm(false);
      setStartDate("");
      setEndDate("");
      setReason("");
    } catch (error: any) {
      // Error handled in hook or globally
    } finally {
      setSubmitting(false);
    }
  };

  const handleVacationClick = (vacation: VacationRequest) => {
    setSelectedVacation(vacation);
    setShowDetailModal(true);
  };

  const calculateAntiguedad = () => {
    if (!profile?.hireDate) return 0;
    return differenceInYears(new Date(), parseISO(profile.hireDate));
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
    return MOCK_OCCUPIED_DATES.some((occupiedDate) => {
      const occ = parseISO(occupiedDate);
      return isWithinInterval(occ, { start: s, end: e });
    });
  };

  const handleDateSelect = async (day: Date) => {
    const formattedDate = format(day, "yyyy-MM-dd");

    if (isOccupied(day)) {
      await sweetAlert.error("Fecha no disponible", "Este día ya está ocupado por otro miembro de tu equipo.");
      return;
    }

    let newStart = startDate;
    let newEnd = endDate;

    if (calendarOpen === "start") {
      newStart = formattedDate;
      if (endDate && isAfter(day, parseISO(endDate))) {
        newEnd = "";
      }
    } else if (calendarOpen === "end") {
      newEnd = formattedDate;
      if (startDate && isBefore(day, parseISO(startDate))) {
        newStart = "";
      }
    }

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
      setCalendarOpen("end");
    } else {
      setEndDate(newEnd);
      if (newStart !== startDate) setStartDate(newStart);
    }
  };

  return (
    <div className="flex-1 pb-24">
      {/* HEADER */}
      <div className="sticky top-0 border-b border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm px-4 py-4 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate("home")} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
              <FontAwesomeIcon icon={faArrowLeft} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                <FontAwesomeIcon icon={faUmbrellaBeach} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Mis Vacaciones</h1>
              </div>
            </div>
          </div>
          <button onClick={() => setShowForm(true)} disabled={loading} className="flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl w-10 h-10 sm:w-auto sm:h-10 sm:px-4 font-medium transition-colors disabled:opacity-50 shadow-lg shadow-blue-500/20">
            <FontAwesomeIcon icon={faPlus} />
            <span className="hidden sm:inline">Nueva Solicitud</span>
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-2">
        {/* AREA INFO CARD */}
        <div className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-blue-200 dark:hover:border-blue-800 transition-colors relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div>
                  <FontAwesomeIcon icon={faLayerGroup} className="text-blue-200 text-xl" />
                </div>
                <div>
                  <p className="text-blue-200 text-xs font-medium uppercase tracking-wider">Área</p>
                  <h2 className="text-lg font-bold">{profile?.areaName || profile?.department || "Sin Área"}</h2>
                </div>
              </div>
              <div>{profile?.areaMembers !== undefined && <p className="text-blue-200/80 text-xs mt-0.5">{profile.areaMembers} Miembros</p>}</div>
            </div>
          </div>
        </div>

        {/* STATS CARD with Year Selector (Simple Display) */}
        <div className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-blue-200 dark:hover:border-blue-800 transition-colors relative overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <button className="p-1 text-slate-500 cursor-not-allowed">
              <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-lg">Año {selectedYear}</h3>
            <button className="p-1 text-slate-500 cursor-not-allowed">
              <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-y-6 gap-x-2 text-center">
            <div>
              <p className="text-xs text-slate-400 mb-1">Antigüedad</p>
              <p className="text-xl font-bold">{calculateAntiguedad()}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Pendientes</p>
              <p className="text-xl font-bold">{vacations.filter((v) => v.status === "pending").length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Gozados</p>
              <p className="text-xl font-bold">{availableDays?.used || 0}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Beneficio</p>
              <p className="text-xl font-bold">{availableDays?.total || 0}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Corridos</p>
              <p className="text-xl font-bold text-blue-400">{availableDays?.available || 0}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Hábiles</p>
              {/* Not available in API, show placeholder */}
              <p className="text-xl font-bold text-slate-500">-</p>
            </div>
          </div>
        </div>

        {/* FORM MODAL */}
        {showForm && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
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
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none" placeholder="Describe el comentario de tu solicitud..." required />
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

        {/* REQUESTS LIST */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 mt-2">Mis Solicitudes</h3>

          <div className="space-y-3">
            {loading ? (
              [1, 2].map((i) => (
                <div key={i} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 animate-pulse">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-2"></div>
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
                </div>
              ))
            ) : vacations.length > 0 ? (
              vacations.map((vacation) => (
                <div key={vacation._id} className="bg-white border dark:border-slate-700 dark:bg-slate-900/70 rounded-xl p-4 shadow-sm cursor-pointer" onClick={() => handleVacationClick(vacation)}>
                  <div className="flex flex-col items-start gap-3">
                    <div className="flex-1 w-full">
                      <div className="flex flex-col items-start justify-between mb-2 w-full space-y-2">
                        <div className="flex justify-between gap-2 items-center w-full">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-block px-2 py-0.5 text-[12px] text-gray-400 dark:text-gray-400 bg-blue-50 dark:bg-gray-600/20 rounded">{vacation.vacationNumber || vacation._id.slice(-6).toUpperCase()}</span>
                            <StatusBadge type={mapVacationStatusToStatusTypeForMobile(vacation.status)} size="sm" />
                            <StatusBadge type={mapVacationSignatureStateToStatusType(vacation)} size="sm" overrideStyle={isVacationInFinalState(vacation.status)} />
                          </div>
                        </div>

                        <div className="flex items-center w-full">
                          <div className="flex flex-wrap gap-1.5">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-gray-50 dark:bg-gray-600/50">
                              {format(parseISO(vacation.startDate), "d MMM", { locale: es })} - {format(parseISO(vacation.endDate), "d MMM", { locale: es })}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-sm bg-gray-50 dark:bg-gray-600/20 text-slate-700 dark:text-slate-300">{vacation.daysRequested} días</span>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-slate-400">{format(parseISO(vacation.createdAt), "dd/MM/yyyy")}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">No tienes solicitudes registradas</div>
            )}
          </div>
        </div>
      </div>

      {/* Calendar Modal */}
      {calendarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
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

                  if (isOccupiedDay) {
                    classes += " bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border-transparent";
                    const visualStart = !prevOcc || isMon;
                    const visualEnd = !nextOcc || isSun;
                    if (visualStart) classes += " rounded-l-lg";
                    else classes += " rounded-l-none";
                    if (visualEnd) classes += " rounded-r-lg";
                    else classes += " rounded-r-none";
                  } else if (isSelected) {
                    if (isStart || isEnd) {
                      classes += " bg-blue-900 text-white z-10";
                    } else {
                      classes += " bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
                    }
                    classes += " border border-y-blue-800 dark:border-y-blue-400";
                    if (isStart || isMon) classes += " border-l-blue-800 dark:border-l-blue-400 rounded-l-lg";
                    else classes += " border-l-transparent rounded-l-none";
                    if (isEnd || isSun) classes += " border-r-blue-800 dark:border-r-blue-400 rounded-r-lg";
                    else classes += " border-r-transparent rounded-r-none";
                  } else {
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

      <VacationDetailModal
        vacation={selectedVacation}
        profile={profile}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedVacation(null);
        }}
        onRefresh={refetch}
      />
    </div>
  );
}
