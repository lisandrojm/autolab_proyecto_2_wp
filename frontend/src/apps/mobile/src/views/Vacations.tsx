import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCalendar,
  faUmbrellaBeach,
  faChevronLeft,
  faChevronRight,
  faBuilding, // Usado para Antigüedad
  faLayerGroup, // Usado para Área
  faTimes,
  faPlus,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import { useVacations } from "../hooks/useVacations";
import { useProfile } from "../hooks/useProfile";
import { sweetAlert } from "../utils/sweetAlert";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay, parseISO, isWithinInterval, isBefore, isAfter, addDays, subDays, isMonday, isSunday, differenceInYears, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { mapVacationStatusToStatusTypeForMobile, mapVacationSignatureStateToStatusType, isVacationInFinalState } from "../../../../utils/statusHelpers";
import VacationDetailModal from "../components/VacationDetailModal";
import { VacationRequest } from "../../../../api/vacations";
import { InfoModal } from "../../../../components/ui/InfoModal";
import { calculateLCTVacationDays } from "../../../../utils/vacationLCT";
import { globalVacationConfigAPI, GlobalVacationConfig } from "../../../../api/globalVacationConfig";

// Helper to parse date string as local date (ignoring time/timezone)
const getLocalDate = (dateString: string) => {
  if (!dateString) return new Date();
  const datePart = dateString.toString().split("T")[0];
  return parseISO(datePart);
};

interface VacationsProps {
  onNavigate: (view: ViewType) => void;
}

// Keeping this mock for calendar validation demo purposes only, as we don't have team calendar API hooked up here yet
// const MOCK_OCCUPIED_DATES = ["2025-12-20", "2025-12-21", "2025-12-22", "2025-12-24", "2025-12-25", "2026-01-01"];

export default function Vacations({ onNavigate }: VacationsProps) {
  const { vacations, availableDays, occupiedDates, loading: vacationsLoading, createVacation, refetch } = useVacations();
  const { profile, loading: profileLoading } = useProfile();

  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Modal State
  const [selectedVacation, setSelectedVacation] = useState<VacationRequest | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  // Nuevo estado para el modal de información/ayuda
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showSignatureInfoModal, setShowSignatureInfoModal] = useState(false);
  const [globalConfig, setGlobalConfig] = useState<GlobalVacationConfig | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await globalVacationConfigAPI.getConfig();
        setGlobalConfig(config);
      } catch (error) {
        console.error("Error fetching global config:", error);
      }
    };
    fetchConfig();
  }, []);

  // Refetch data when form opens to ensure availability is up to date
  useEffect(() => {
    if (showForm) {
      refetch();
    }
  }, [showForm]);

  // Stats State (Current Year only)
  const currentYear = new Date().getFullYear();
  const selectedYear = currentYear;

  const loading = vacationsLoading || profileLoading;

  // Calendar State for Form
  const [calendarOpen, setCalendarOpen] = useState<"start" | "end" | null>(null);
  const [viewDate, setViewDate] = useState(new Date());

  const hasNoDays = (availableDays?.available || 0) <= 0;

  const handleCalendarConfirm = async () => {
    if (startDate && endDate) {
      const start = parseISO(startDate);
      const end = parseISO(endDate);
      const daysRequested = differenceInDays(end, start) + 1;
      const available = availableDays?.available || 0;

      if (daysRequested < 7) {
        await sweetAlert.warning("Fraccionamiento Mínimo", "La licencia no puede ser menor a 7 días corridos, según la Ley de Contrato de Trabajo (LCT).");
        return;
      }

      if (daysRequested > available) {
        await sweetAlert.warning("Límite excedido", `Estás solicitando ${daysRequested} días, pero solo tienes ${available} días disponibles.`);
        return;
      }
    }
    setCalendarOpen(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      sweetAlert.error("Error", "Por favor selecciona fecha de inicio y fin");
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
      console.error("Error creating vacation:", error);
      const errorMessage = error.response?.data?.error || "No se pudo crear la solicitud. Intenta nuevamente.";
      await sweetAlert.error("Error", errorMessage);
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

  // Calendar Helpers (omitted for brevity)
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
    const formatted = format(day, "yyyy-MM-dd");
    return occupiedDates.includes(formatted);
  };

  const checkOverlap = (start: string, end: string) => {
    if (!start || !end) return false;
    const s = parseISO(start);
    const e = parseISO(end);
    return occupiedDates.some((occupiedDate) => {
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

  const hasActiveRequest = vacations.some((v) => ["pending", "pre_approved", "approved"].includes(v.status));

  return (
    <div className="flex-1 pb-24">
      {/* HEADER: Fijo y con el botón principal (SIN CAMBIOS) */}
      <div className="sticky top-0 border-b border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm px-4 py-4 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate("home")} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
              <FontAwesomeIcon icon={faArrowLeft} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
            </button>
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faUmbrellaBeach} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Mis Vacaciones</h1>
            </div>
          </div>
          <button onClick={() => setShowForm(true)} disabled={loading || hasActiveRequest} className="flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl w-10 h-10 sm:w-auto sm:h-10 sm:px-4 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20" title={hasActiveRequest ? "Ya tienes una solicitud en curso" : "Nueva Solicitud"}>
            <FontAwesomeIcon icon={faPlus} />
            <span className="hidden sm:inline">Nueva Solicitud</span>
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {/* TARJETA DE RESUMEN - Antigüedad elevada */}
        <div className="bg-white dark:bg-slate-900/70 rounded-xl p-4 border border-slate-200 dark:border-slate-700 relative overflow-hidden">
          {/* Encabezado: Año, Metadatos de Perfil y Ayuda */}
          <div className="flex justify-between items-start mb-2">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">Año {selectedYear}</h3>
              </div>

              {/* METADATOS: Antigüedad y Área (Separados de las métricas de días) */}
              <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-col gap-1 mb-1">
                {/* Antigüedad */}
                <span className="flex items-center gap-1">
                  <FontAwesomeIcon icon={faBuilding} className="w-3 h-3 text-slate-400" />
                  <span className="font-semibold">Antigüedad:</span> {calculateAntiguedad()} Años
                </span>
                {/* Área / Miembros */}
                <span className="flex items-center gap-1">
                  <FontAwesomeIcon icon={faLayerGroup} className="w-3 h-3 text-slate-400" />
                  <span className="font-semibold uppercase">Área:</span>
                  {profile?.areaName || profile?.department || "Sin Área"}
                  {profile?.areaMembers !== undefined && <span className="ml-1">| {profile.areaMembers} Miembro(s)</span>}
                </span>
              </div>
            </div>
            {/* Controles de Año (opcionales) */}
            <div className="flex items-center text-slate-500 dark:text-slate-400">
              <button className="p-1 cursor-not-allowed opacity-50">
                <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4" />
              </button>
              <button className="p-1 cursor-not-allowed opacity-50">
                <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="dark:bg-slate-900 rounded-lg p-4">
            {/* NUEVA FILA DE SALDO PRINCIPAL: Corridos vs. Hábiles */}
            <div className="flex flex-col justify-between items-center mb-4 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold uppercase text-slate-700 dark:text-slate-200 mr-2">Días Disponibles</h4>
                {/* Botón de Ayuda movido aquí */}
                <button onClick={() => setShowInfoModal(true)} className="text-slate-400 hover:text-blue-500 transition-colors p-1">
                  <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-baseline gap-4k w-full justify-around">
                {/* Días Corridos (Saldo Contable, el más grande) */}
                <div className="text-center">
                  <p className="text-xs text-slate-400">Total Anual</p>
                  <p className="text-3xl font-extrabold text-blue-500">{profile?.hireDate ? calculateLCTVacationDays(profile.hireDate) + (globalConfig?.diasBeneficio || 0) + (profile?.extraVacationDays || 0) : availableDays?.total || 0}</p>
                </div>
                {/* Disponibles */}
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">Disponibles</p>
                  <p className="text-2xl font-bold text-blue-500">{profile?.hireDate ? calculateLCTVacationDays(profile.hireDate) + (globalConfig?.diasBeneficio || 0) + (profile?.extraVacationDays || 0) - (availableDays?.used || 0) : (availableDays?.available ?? "-")}</p>
                </div>
                {/* Pendientes */}
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">Pendientes</p>
                  <p className="text-2xl font-bold text-yellow-500">{availableDays?.pending ?? "-"}</p>
                </div>
              </div>
            </div>

            {/* BALANCE DE DÍAS (Fila única 3x2) - BALANCE Contable y Uso */}
            {/* BALANCE DE DÍAS (Fila única 3x2) - BALANCE Contable y Uso */}
            <div className="grid grid-cols-3 gap-y-4 gap-x-2 text-center">
              {/* LCT */}
              <div>
                <p className="text-xs text-slate-400 mb-1">Por Ley (LCT)</p>
                <p className="text-lg font-bold text-slate-700 dark:text-slate-200">{profile?.hireDate ? calculateLCTVacationDays(profile.hireDate) : "-"}</p>
              </div>
              {/* Extra Empresa */}
              <div>
                <p className="text-xs text-slate-400 mb-1">Extra Empresa</p>
                <p className="text-lg font-bold text-blue-500">{(globalConfig?.diasBeneficio || 0) + (profile?.extraVacationDays || 0)}</p>
              </div>
              {/* Gozados */}
              <div>
                <p className="text-xs text-slate-400 mb-1">Gozados</p>
                <p className="text-lg font-bold">{availableDays?.used || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* FORM MODAL (SIN CAMBIOS) */}
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
                {hasNoDays && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                    <FontAwesomeIcon icon={faInfoCircle} className="text-red-500 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-red-700 dark:text-red-400 text-sm">Sin días disponibles</h4>
                      <p className="text-sm text-red-600 dark:text-red-300 mt-1">Usted no tiene más días disponibles de vacaciones en este período.</p>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Fecha de inicio</label>
                  <div onClick={() => !hasNoDays && setCalendarOpen("start")} className={`relative ${hasNoDays ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                    <input type="text" value={startDate} readOnly disabled={hasNoDays} placeholder="Seleccionar fecha" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none cursor-pointer disabled:cursor-not-allowed" />
                    <FontAwesomeIcon icon={faCalendar} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Fecha de fin</label>
                  <div onClick={() => !hasNoDays && setCalendarOpen("end")} className={`relative ${hasNoDays ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                    <input type="text" value={endDate} readOnly disabled={hasNoDays} placeholder="Seleccionar fecha" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none cursor-pointer disabled:cursor-not-allowed" />
                    <FontAwesomeIcon icon={faCalendar} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Comentario</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={hasNoDays} rows={3} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none disabled:opacity-60 disabled:cursor-not-allowed" placeholder="Describe el comentario de tu solicitud..." />
                </div>

                {/* Requiere Firma Info Box */}
                <div onClick={() => setShowSignatureInfoModal(true)} className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-500 cursor-pointer hover:bg-amber-500/20 transition-colors">
                  <span className="font-bold text-sm">Requiere FIRMA</span>
                  <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg h-10 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={submitting || hasNoDays} className="flex-1 rounded-lg h-10 bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {submitting ? "Enviando..." : "Enviar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* REQUESTS LIST (SIN CAMBIOS) */}
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
                              {format(getLocalDate(vacation.startDate), "d MMM", { locale: es })} - {format(getLocalDate(vacation.endDate), "d MMM", { locale: es })}
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

      {/* Calendar Modal (SIN CAMBIOS) */}
      {calendarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400  tracking-wider mb-0.5">
                  <FontAwesomeIcon icon={faLayerGroup} className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                  <span className="text-slate-500 dark:text-slate-400 uppercase">Área</span>
                  <span className="text">{profile?.areaName || profile?.department || "Área"}</span>
                </div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-white capitalize">{format(viewDate, "MMMM yyyy", { locale: es })}</h3>
              </div>
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
                {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => (
                  <div key={index} className="text-xs font-bold text-slate-400">
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
                <button onClick={handleCalendarConfirm} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE INFORMACIÓN/AYUDA (Explicación de Términos) REVISADO para doble saldo */}
      <InfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        title="Explicación de Disponibilidad"
        size="md"
        actions={[
          {
            label: "Entendido",
            onClick: () => setShowInfoModal(false),
            variant: "primary",
          },
        ]}
      >
        <div className="space-y-4 text-slate-700 dark:text-slate-300">
          <p className="font-semibold">Información sobre tu saldo:</p>
          <ul className="list-disc list-inside space-y-2 pl-2">
            <li>
              <strong>Días Disponibles:</strong> Es tu saldo total de días de vacaciones. Según la Ley de Contrato de Trabajo (LCT), estos días son <strong>corridos</strong>, lo que significa que incluyen fines de semana y feriados si caen dentro del período solicitado.
            </li>
          </ul>
          <p className="font-semibold mt-4">Otras Métricas:</p>
          <ul className="list-disc list-inside space-y-2 pl-2">
            <li>
              <strong>Beneficio Extra:</strong> Días de vacaciones <strong>adicionales</strong> que te otorga la empresa por política interna.
            </li>
            <li>
              <strong>Acumulados (Períodos Anteriores):</strong> Días de vacaciones que no gozaste y fueron transferidos.
            </li>
            <li>
              <strong>Pendientes:</strong> Solicitudes de vacaciones que están en proceso de aprobación.
            </li>
            <li>
              <strong>Gozados:</strong> Días de vacaciones que ya has utilizado y descontado.
            </li>
            <li>
              <strong>Antigüedad (Años):</strong> Años de servicio en la compañía.
            </li>
          </ul>
        </div>
      </InfoModal>

      {/* MODAL DE INFORMACIÓN DE FIRMA */}
      <InfoModal
        isOpen={showSignatureInfoModal}
        onClose={() => setShowSignatureInfoModal(false)}
        title="Firma de la solicitud"
        size="sm"
        actions={[
          {
            label: "Entendido",
            onClick: () => setShowSignatureInfoModal(false),
            variant: "primary",
          },
        ]}
      >
        <div className="text-slate-700 dark:text-slate-300">
          <p>Si la solicitud es aprobada, recibirás un email con un enlace para firmar digitalmente la aprobación. Podrás revisarlo desde cualquier dispositivo y ver el estado de la firma.</p>
        </div>
      </InfoModal>

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
