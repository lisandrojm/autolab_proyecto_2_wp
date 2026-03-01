import { useState, useEffect, useMemo } from "react";
import Swal from "sweetalert2";
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
  faCheckCircle,
  faBriefcase,
  faUserTie,
  faUserGraduate,
  faRulerCombined,
  faIdCard,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import { useVacations } from "../hooks/useVacations";
import { useProfile } from "../hooks/useProfile";
import { sweetAlert } from "../utils/sweetAlert";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay, parseISO, isWithinInterval, isBefore, isAfter, addDays, subDays, isMonday, isSunday, isFriday, isSaturday, differenceInYears, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { mapVacationStatusToStatusTypeForMobile, mapVacationSignatureStateToStatusType, isVacationInFinalState } from "../../../../utils/statusHelpers";
import VacationDetailModal from "../components/VacationDetailModal";
import { VacationRequest } from "../../../../api/vacations";
import { InfoModal } from "../../../../components/ui/InfoModal";
import { calculateLCTVacationDays, calculateLCTDaysFromSeniority } from "../../../../utils/vacationLCT";
import { vacationConfigAPI, VacationConfig } from "../../../../api/vacationConfig";

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
  const { vacations, availableDays, occupiedDates, pendingDates, loading: vacationsLoading, createVacation, refetch } = useVacations();
  const { profile, stats, loading: profileLoading } = useProfile();

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
  const [showPendingInfoModal, setShowPendingInfoModal] = useState(false);
  const [showSignatureInfoModal, setShowSignatureInfoModal] = useState(false);
  const [showProfileInfoModal, setShowProfileInfoModal] = useState(false);
  const [globalConfig, setGlobalConfig] = useState<VacationConfig | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await vacationConfigAPI.getConfig();
        setGlobalConfig(config);
      } catch (error) {
        console.error("Error fetching global config:", error);
      }
    };
    fetchConfig();
  }, []);

  /* Días Corridos Rule calculation */
  const applyConsecutiveDaysRule = useMemo(() => {
    if (stats?.projectVacationConfig && stats.projectVacationConfig.useGlobalConfig === false) {
      return !!stats.projectVacationConfig.diasCorridos;
    }
    return !!globalConfig?.diasCorridos;
  }, [stats, globalConfig]);

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

  // Calculate Return Date (Next working day after end date)
  const returnDate = useMemo(() => {
    if (!endDate) return null;
    let d = addDays(parseISO(endDate), 1);
    while (isSaturday(d) || isSunday(d)) {
      d = addDays(d, 1);
    }
    return d;
  }, [endDate]);

  // Calculate available days consistent with display
  const totalSeniorityDays = useMemo(() => {
    return (profile?.metadata?.projects || []).reduce(
      (acc: number, p: any) =>
        acc +
        (p.contracts || []).reduce((cAcc: number, c: any) => {
          const start = new Date(c.fecha_alta_contrato);
          const end = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : new Date();
          return cAcc + Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        }, 0),
      0,
    );
  }, [profile]);
  const lctDays = totalSeniorityDays > 0 ? calculateLCTDaysFromSeniority(totalSeniorityDays) : profile?.hireDate ? calculateLCTVacationDays(profile.hireDate) : 0;
  const carryOver = profile?.carryOverVacationDays || 0;
  const isArrastreEnabled = globalConfig?.permiteArrastre ?? false;
  const calculatedTotal = lctDays + (globalConfig?.diasBeneficio || 0) + (profile?.extraVacationDays || 0) + (isArrastreEnabled ? carryOver : 0);
  const calculatedAvailable = calculatedTotal - (availableDays?.used || 0) - (availableDays?.pending || 0);

  const hasNoDays = calculatedAvailable <= 0;

  const suggestedEndDate = useMemo(() => {
    if (!startDate || calculatedAvailable <= 0) return null;
    const s = parseISO(startDate);
    const limit = Math.max(0, calculatedAvailable);

    if (applyConsecutiveDaysRule) {
      return addDays(s, limit - 1);
    } else {
      let needed = limit;
      let current = s;
      while (needed > 0) {
        if (!isSaturday(current) && !isSunday(current)) {
          needed--;
        }
        if (needed > 0) current = addDays(current, 1);
      }
      return current;
    }
  }, [startDate, calculatedAvailable, applyConsecutiveDaysRule]);

  const handleCalendarConfirm = async () => {
    if (startDate && endDate) {
      const start = parseISO(startDate);
      const end = parseISO(endDate);
      const daysRequested = differenceInDays(end, start) + 1;

      // Use calculatedAvailable instead of availableDays.available
      // If calculatedAvailable is negative, treat as 0 for positive checks, but here we check limit
      const limit = Math.max(0, calculatedAvailable);

      // DETERMINAR CONFIGURACIÓN A USAR (PROYECTO vs GLOBAL)
      const projectConfig = (stats as any)?.projectVacationConfig;
      const useProjectConfig = projectConfig && projectConfig.useGlobalConfig === false;

      const minDays = useProjectConfig ? (projectConfig.minDiasFraccion ?? 1) : (globalConfig?.minDiasFraccion ?? 7);

      const permiteFraccionadas = useProjectConfig ? (projectConfig.permiteFraccionadas ?? true) : (globalConfig?.permiteFraccionadas ?? true);

      // VALIDACIÓN DE VACACIONES FRACCIONADAS
      // Si la configuración impide fraccionar, el usuario debe solicitar TODO su saldo disponible
      if (!permiteFraccionadas) {
        if (daysRequested < limit) {
          await Swal.fire({
            icon: "warning",
            title: "Período Inválido",
            text: `La configuración actual no permite fraccionar las vacaciones. Debes solicitar el total de tus días disponibles (${limit} días), no puedes solicitar un período menor.`,
            confirmButtonText: "Entendido",
            confirmButtonColor: "#3b82f6",
            customClass: {
              popup: "mobile-swal-popup",
              title: "mobile-swal-title",
            },
          });
          return;
        }
      }

      if (daysRequested < minDays) {
        await Swal.fire({
          icon: "warning",
          title: "Fraccionamiento Mínimo",
          text: `El período de vacaciones no puede ser menor a ${minDays} días corridos.`,
          confirmButtonText: "Entendido",
          confirmButtonColor: "#3b82f6",
          customClass: {
            popup: "mobile-swal-popup",
            title: "mobile-swal-title",
          },
        });
        return;
      }

      if (daysRequested > limit) {
        await Swal.fire({
          icon: "warning",
          title: "Límite excedido",
          text: `Estás solicitando ${daysRequested} días, pero solo tienes ${limit} días disponibles.`,
          confirmButtonText: "Entendido",
          confirmButtonColor: "#3b82f6",
          customClass: {
            popup: "mobile-swal-popup",
            title: "mobile-swal-title",
          },
        });
        return;
      }

      const remainingBalance = limit - daysRequested;
      if (remainingBalance > 0 && remainingBalance < minDays) {
        const daysToLeaveMin = limit - minDays;
        const showOptionB = daysToLeaveMin > 0;

        const result = await Swal.fire({
          icon: "warning",
          title: "Conflicto con saldo restante",
          html: `Esta solicitud de <b>${daysRequested} días</b> dejaría un saldo de <b>${remainingBalance} días</b>.<br/><br/>
                 El mínimo permitido para dejar en el saldo es de <b>${minDays} días</b> (o consumo total).<br/><br/>
                 ¿Qué te gustaría hacer?`,
          showDenyButton: showOptionB,
          showCancelButton: true,
          confirmButtonText: `Tomar todo (${limit} días)`,
          denyButtonText: showOptionB ? `Tomar max. permitido (${daysToLeaveMin} días)` : undefined,
          cancelButtonText: "Corregir manualmente",
          confirmButtonColor: "#3b82f6",
          denyButtonColor: "#3b82f6",
          cancelButtonColor: "#334155",
          customClass: {
            popup: "mobile-swal-popup",
            title: "mobile-swal-title",
            htmlContainer: "text-sm text-gray-600 dark:text-gray-300",
            actions: "flex flex-col gap-2 p-1",
            confirmButton: "w-full rounded text-sm font-semibold",
            denyButton: "w-full rounded text-sm font-semibold order-2",
            cancelButton: "w-full rounded text-sm font-semibold !bg-slate-700 !text-white order-3",
          },
        });

        if (result.isConfirmed) {
          // Tomar todo (Consumption total)
          const newEndDate = addDays(parseISO(startDate), limit - 1);
          setEndDate(format(newEndDate, "yyyy-MM-dd"));
          setCalendarOpen(null);
          return;
        } else if (result.isDenied && showOptionB) {
          // Ajustar para dejar el mínimo (Leave minDays)
          const newEndDate = addDays(parseISO(startDate), daysToLeaveMin - 1);
          setEndDate(format(newEndDate, "yyyy-MM-dd"));
          setCalendarOpen(null);
          return;
        } else {
          // Corregir manualmente
          return;
        }
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
      await Swal.fire({
        icon: "success",
        title: "Solicitud enviada",
        text: "Tu solicitud de vacaciones ha sido creada correctamente",
        confirmButtonText: "Aceptar",
        confirmButtonColor: "#3b82f6",
        customClass: {
          popup: "mobile-swal-popup",
          title: "mobile-swal-title",
        },
      });
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
    if (totalSeniorityDays === 0) {
      if (!profile?.hireDate) return "0 días";
      const hireDate = parseISO(profile.hireDate);
      const years = differenceInYears(new Date(), hireDate);
      const months = Math.floor((differenceInDays(new Date(), hireDate) % 365) / 30);

      const parts = [];
      if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`);
      if (months > 0) parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);

      return parts.length > 0 ? parts.join(", ") : "0 días";
    }

    const years = Math.floor(totalSeniorityDays / 365);
    const remainingAfterYears = totalSeniorityDays % 365;
    const months = Math.floor(remainingAfterYears / 30);
    const days = remainingAfterYears % 30;

    const parts = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
    if (days > 0) parts.push(`${days} ${days === 1 ? "día" : "días"}`);

    return parts.length > 0 ? parts.join(", ") : "0 días";
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

  const handleClearSelection = () => {
    setStartDate("");
    setEndDate("");
    setCalendarOpen("start");
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

    // Fallback check - button should be disabled, but guard anyway
    if (isOccupied(day)) {
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
      // Logic: If user clicks a date BEFORE the current Start Date, they are correcting the Start Date.
      if (startDate && isBefore(day, parseISO(startDate))) {
        newStart = formattedDate;
        newEnd = "";
      } else {
        // Logic for End Date (Normal case)
        if (applyConsecutiveDaysRule && isFriday(day)) {
          const saturday = addDays(day, 1);
          const sunday = addDays(day, 2);

          // Verificar si los días agregados están ocupados
          if (isOccupied(saturday) || isOccupied(sunday)) {
            await sweetAlert.error("Error", "No se pueden agregar automáticamente el sábado y domingo porque uno de esos días está ocupado por otro miembro del equipo.");
            return;
          }

          await Swal.fire({
            icon: "info",
            title: "Días Corridos",
            text: "Al finalizar las vacaciones un viernes, se computan automáticamente el sábado y domingo como días corridos.",
            confirmButtonText: "Entendido",
            confirmButtonColor: "#3b82f6",
            customClass: {
              popup: "mobile-swal-popup",
              title: "mobile-swal-title",
            },
          });
          newEnd = format(sunday, "yyyy-MM-dd");
        } else if (applyConsecutiveDaysRule && isSaturday(day)) {
          const sunday = addDays(day, 1);

          // Verificar si el día agregado está ocupado
          if (isOccupied(sunday)) {
            await sweetAlert.error("Error", "No se puede agregar automáticamente el domingo porque está ocupado por otro miembro del equipo.");
            return;
          }

          await Swal.fire({
            icon: "info",
            title: "Días Corridos",
            text: "Al finalizar las vacaciones un sábado, se computa automáticamente el domingo como día corrido.",
            confirmButtonText: "Entendido",
            confirmButtonColor: "#3b82f6",
            customClass: {
              popup: "mobile-swal-popup",
              title: "mobile-swal-title",
            },
          });
          newEnd = format(sunday, "yyyy-MM-dd");
        } else {
          newEnd = formattedDate;
        }
      }
    }

    if (newStart && newEnd) {
      if (calendarOpen === "end" && (isFriday(day) || isSaturday(day))) {
        const s = parseISO(newStart);
        const e = parseISO(newEnd);
        const days = differenceInDays(e, s) + 1;
        // Use calculatedAvailable as limit
        const limit = Math.max(0, calculatedAvailable);

        if (days > limit) {
          const diff = days - limit;
          // Shift start date to fit limit
          const adjustedStart = addDays(s, diff);
          newStart = format(adjustedStart, "yyyy-MM-dd");

          await Swal.fire({
            icon: "info",
            title: "Ajuste Automático",
            text: `Se ha ajustado la fecha de inicio para incluir el fin de semana sin exceder tus días disponibles.`,
            confirmButtonText: "Entendido",
            confirmButtonColor: "#3b82f6",
            customClass: {
              popup: "mobile-swal-popup",
              title: "mobile-swal-title",
            },
          });
        }
      }

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
            <button onClick={() => onNavigate("home")} className="flex items-center justify-center w-10 h-10 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
              <FontAwesomeIcon icon={faArrowLeft} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
            </button>
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faUmbrellaBeach} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Mis Vacaciones</h1>
              <button onClick={() => setShowProfileInfoModal(true)} className="flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-500 transition-colors ml-1">
                <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {/* ALERTA VACACIONES ENTREGADAS (Activas) */}
        {vacations
          .filter((v) => v.status === "delivered")
          .filter((v) => {
            const end = getLocalDate(v.endDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            // Mostrar mientras NO haya pasado la fecha de fin (today <= end)
            return !isAfter(today, end);
          })
          .map((v) => {
            const returnDate = (() => {
              let d = addDays(getLocalDate(v.endDate), 1);
              while (isSaturday(d) || isSunday(d)) d = addDays(d, 1);
              return d;
            })();

            return (
              <div key={v._id} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 flex items-start gap-3 shadow-sm">
                <FontAwesomeIcon icon={faCheckCircle} className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                    Vacaciones Entregadas: {format(getLocalDate(v.startDate), "d MMM", { locale: es })} - {format(getLocalDate(v.endDate), "d MMM", { locale: es })}
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                    Regreso: <span className="font-bold capitalize">{format(returnDate, "EEEE d 'de' MMMM", { locale: es })}</span>
                  </p>
                </div>
              </div>
            );
          })}

        {/* TARJETA DE RESUMEN - Antigüedad elevada */}
        <div className="bg-white dark:bg-slate-900/70 rounded-xl p-4 border border-slate-200 dark:border-slate-700 relative overflow-hidden">
          {/* Header con Año y Botón de Info */}
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">Año {selectedYear}</h3>
            <div className="flex items-center text-slate-500 dark:text-slate-400">
              <button className="p-1 cursor-not-allowed opacity-50">
                <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4" />
              </button>
              <button className="p-1 cursor-not-allowed opacity-50">
                <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="dark:bg-slate-900 rounded p-4">
            {/* NUEVA FILA DE SALDO PRINCIPAL: Corridos vs. Hábiles */}
            <div className="flex flex-col justify-between items-center mb-4 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold uppercase text-slate-700 dark:text-slate-200 mr-2">Días Disponibles</h4>
                {/* Botón de Ayuda movido aquí */}
                <button onClick={() => setShowInfoModal(true)} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                  <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-baseline gap-4k w-full justify-around">
                {/* Días Corridos (Saldo Contable, el más grande) */}
                <div className="text-center">
                  <p className="text-xs text-slate-400">Total Anual</p>
                  <p className="text-3xl font-extrabold text-blue-500">{calculatedTotal}</p>
                </div>
                {/* Disponibles */}
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">Disponibles</p>
                  <p className="text-2xl font-bold text-blue-500">{calculatedAvailable}</p>
                </div>
                {/* Pendientes */}
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">Pendientes</p>
                  <p className="text-2xl font-bold text-yellow-500">{availableDays?.pending ?? "-"}</p>
                </div>
              </div>
            </div>

            {/* BALANCE DE DÍAS (Fila única 4 columnas o 2x2 para mobile) - BALANCE Contable y Uso */}
            <div className={`grid grid-cols-2 ${isArrastreEnabled ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-y-4 gap-x-2 text-center`}>
              {/* LCT */}
              <div className="bg-white dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                <p className="text-xs text-slate-400 mb-1">Por Ley (LCT)</p>
                <p className="text-lg font-bold text-slate-700 dark:text-slate-200">{lctDays}</p>
              </div>

              {/* Beneficio */}
              <div className="bg-white dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                <p className="text-xs text-slate-400 mb-1">Beneficio</p>
                <p className="text-lg font-bold text-blue-500">{(globalConfig?.diasBeneficio || 0) + (profile?.extraVacationDays || 0)}</p>
              </div>

              {/* Arrastre - Solo visible si está habilitado */}
              {isArrastreEnabled && (
                <div className="bg-white dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Arrastre</p>
                  <p className="text-lg font-bold text-gray-500">{carryOver}</p>
                </div>
              )}

              {/* Gozados */}
              <div className="bg-white dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
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
                <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Fechas</label>
                  <div onClick={() => !hasNoDays && setCalendarOpen("start")} className={`relative ${hasNoDays ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                    <input type="text" value={startDate && endDate ? `Desde ${format(getLocalDate(startDate), "dd/MM/yyyy")} Hasta ${format(getLocalDate(endDate), "dd/MM/yyyy")}` : startDate ? `Desde ${format(getLocalDate(startDate), "dd/MM/yyyy")} ...` : ""} readOnly disabled={hasNoDays} placeholder="Seleccionar rango de fechas" className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none cursor-pointer disabled:cursor-not-allowed" />
                    <FontAwesomeIcon icon={faCalendar} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Comentario (Opcional)</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={hasNoDays} rows={3} className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none disabled:opacity-60 disabled:cursor-not-allowed" placeholder="Describe el comentario de tu solicitud..." />
                </div>

                {/* Requiere Firma Info Box */}
                <div onClick={() => setShowSignatureInfoModal(true)} className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded text-amber-500 cursor-pointer hover:bg-amber-500/20 transition-colors">
                  <span className="font-bold text-sm">Requiere FIRMA</span>
                  <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded h-10 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={submitting || hasNoDays} className="flex-1 rounded h-10 bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
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
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium bg-gray-50 dark:bg-gray-600/50">
                              {format(getLocalDate(vacation.startDate), "d MMM", { locale: es })} - {format(getLocalDate(vacation.endDate), "d MMM", { locale: es })}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-sm bg-gray-50 dark:bg-gray-600/20 text-slate-700 dark:text-slate-300">{vacation.daysRequested} días</span>
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
                <h3 className="font-bold text-lg text-slate-900 dark:text-white capitalize">{format(viewDate, "MMMM yyyy", { locale: es })}</h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded p-1">
                  <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                    <FontAwesomeIcon icon={faChevronLeft} className="text-slate-600 dark:text-slate-400 w-4 h-4" />
                  </button>
                  <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                    <FontAwesomeIcon icon={faChevronRight} className="text-slate-600 dark:text-slate-400 w-4 h-4" />
                  </button>
                </div>
                <button onClick={handleClearSelection} className="px-3 py-1.5 rounded bg-blue-50 dark:bg-blue-600 text-blue-600 dark:text-white hover:bg-blue-100 dark:hover:bg-blue-900/80 transition-colors ml-2 text-xs font-medium" title="Borrar selección">
                  Limpiar
                </button>
                <button onClick={() => setCalendarOpen(null)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ml-1">
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
                  const isPendingOcc = pendingDates?.includes(formattedDay);

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

                  // Restriction Logic
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const isPast = isBefore(day, today);

                  let isExceedingLimit = false;
                  if (calendarOpen === "end" && startDate) {
                    const s = parseISO(startDate);
                    // Only calculate limit for days after start date
                    if (isAfter(day, s) || isSameDay(day, s)) {
                      const diff = differenceInDays(day, s) + 1;
                      const limit = Math.max(0, calculatedAvailable);
                      if (diff > limit) {
                        isExceedingLimit = true;
                      }
                    }
                  }

                  // Disable past dates, dates exceeding limit, AND occupied dates
                  const isDisabled = isPast || isExceedingLimit || isOccupiedDay;

                  const isSelected = isStart || isEnd || isInRange;
                  const isSuggested = !isSelected && !isDisabled && !isOccupiedDay && suggestedEndDate && calendarOpen === "end" && startDate && isAfter(day, parseISO(startDate)) && (isBefore(day, suggestedEndDate) || isSameDay(day, suggestedEndDate));

                  // Base classes
                  let classes = "h-10 w-full flex items-center justify-center text-sm font-medium transition-all relative";

                  const isReturnDay = returnDate && isSameDay(day, returnDate);

                  if (isReturnDay) {
                    classes += " bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded font-bold border-2 border-green-500/20";
                    if (isDisabled) {
                      classes += " cursor-not-allowed opacity-75";
                    }
                  } else if (isDisabled) {
                    classes += " cursor-not-allowed";
                    if (isOccupiedDay) {
                      if (isPendingOcc) {
                        // Pending Occupied Style (Yellow - another user has pending vacation)
                        classes += " bg-amber-200 text-amber-700 dark:bg-amber-800/40 dark:text-amber-300";
                      } else {
                        // Approved Occupied Style (Red - another user has approved vacation)
                        classes += " bg-red-200 text-red-700 dark:bg-red-800/40 dark:text-red-300";
                      }
                      const visualStart = !prevOcc || isMon;
                      const visualEnd = !nextOcc || isSun;
                      if (visualStart) classes += " rounded-l-lg";
                      else classes += " rounded-l-none";
                      if (visualEnd) classes += " rounded-r-lg";
                      else classes += " rounded-r-none";
                    } else {
                      classes += " text-slate-300 dark:text-slate-600 bg-slate-50 dark:bg-slate-800/20";
                    }
                  } else if (isSelected) {
                    classes += " bg-blue-900 text-white z-10";

                    classes += " border border-y-blue-800 dark:border-y-blue-400";
                    if (isStart || isMon) classes += " border-l-blue-800 dark:border-l-blue-400 rounded-l-lg";
                    else classes += " border-l-transparent rounded-l-none";
                    if (isEnd || isSun) classes += " border-r-blue-800 dark:border-r-blue-400 rounded-r-lg";
                    else classes += " border-r-transparent rounded-r-none";
                  } else if (isSuggested) {
                    classes += " bg-transparent text-sky-600 dark:text-white rounded";
                    classes += " border border-blue-500 border-dashed";
                  } else {
                    classes += " border-transparent border-2";
                    classes += !isCurrentMonth ? " text-slate-300 dark:text-slate-700" : " text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded";
                  }

                  // Generate title for disabled days
                  let dayTitle = "";
                  if (isOccupiedDay) {
                    dayTitle = isPendingOcc ? "Vacación pendiente de otro usuario" : "Vacación aprobada de otro usuario";
                  } else if (isPast) {
                    dayTitle = "Fecha pasada";
                  } else if (isExceedingLimit) {
                    dayTitle = "Excede límite de días";
                  }

                  return (
                    <button key={idx} onClick={() => !isDisabled && handleDateSelect(day)} disabled={isDisabled} className={classes} title={dayTitle}>
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FOOTER DEL CALENDARIO */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              {returnDate && (
                <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800 rounded-lg text-xs text-green-700 dark:text-green-300 flex items-start justify-center gap-2">
                  <span>
                    Vuelve a trabajar el <strong>{format(returnDate, "EEEE d 'de' MMMM", { locale: es })}</strong>. <br />
                    Si corresponde a tu jornada laboral.
                  </span>
                </div>
              )}
              {/* Estadísticas de Selección */}
              <div className="flex justify-between items-center mb-3 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                <div className="flex flex-col items-center w-full">
                  <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Disponibles</span>
                  <span className="text-lg font-bold text-blue-500">{Math.max(0, calculatedAvailable)}</span>
                </div>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>
                <div className="flex flex-col items-center w-full">
                  <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Seleccionados {applyConsecutiveDaysRule ? "(Corr.)" : "(Háb.)"}</span>
                  <span
                    className={`text-lg font-bold ${(() => {
                      // Calcular días seleccionados
                      if (!startDate || !endDate) return "text-slate-400";
                      // Reutilizamos lógica simple aquí o la extraemos
                      const s = parseISO(startDate);
                      const e = parseISO(endDate);
                      if (isBefore(e, s)) return "text-slate-400";

                      let count = 0;
                      if (applyConsecutiveDaysRule) {
                        count = differenceInDays(e, s) + 1;
                      } else {
                        // Días hábiles
                        const days = eachDayOfInterval({ start: s, end: e });
                        count = days.filter((d) => !isSaturday(d) && !isSunday(d)).length;
                      }

                      return count > calculatedAvailable ? "text-red-500" : "text-slate-900 dark:text-white";
                    })()}`}
                  >
                    {(() => {
                      if (!startDate || !endDate) return 0;
                      const s = parseISO(startDate);
                      const e = parseISO(endDate);
                      if (isBefore(e, s)) return 0;
                      if (applyConsecutiveDaysRule) {
                        return differenceInDays(e, s) + 1;
                      } else {
                        const days = eachDayOfInterval({ start: s, end: e });
                        return days.filter((d) => !isSaturday(d) && !isSunday(d)).length;
                      }
                    })()}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-4">
                <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-1">Vacaciones de otros usuarios (No seleccionables)</span>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border border-red-400 bg-red-200 dark:bg-red-800/40"></div>
                  <span className="text-xs text-slate-600 dark:text-slate-400">Vacaciones aprobadas / entregadas</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border border-amber-400 bg-amber-200 dark:bg-amber-800/40"></div>
                  <span className="text-xs text-slate-600 dark:text-slate-400">Vacaciones pendientes de aprobación</span>
                  <FontAwesomeIcon icon={faInfoCircle} className="w-3 h-3 text-slate-400 ml-auto" onClick={() => setShowPendingInfoModal(true)} />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    handleClearSelection();
                    setCalendarOpen(null);
                  }}
                  className="flex-1 rounded-lg h-10 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button onClick={handleCalendarConfirm} className="flex-1 rounded-lg h-10 bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20">
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE INFORMACIÓN DE PERFIL */}
      <InfoModal
        isOpen={showProfileInfoModal}
        onClose={() => setShowProfileInfoModal(false)}
        title="Información de Perfil"
        size="md"
        actions={[
          {
            label: "Cerrar",
            onClick: () => setShowProfileInfoModal(false),
            variant: "primary",
          },
        ]}
      >
        <div className="text-xs text-slate-500 dark:text-slate-400 grid grid-cols-1 gap-y-3">
          {/* Ingreso y Antigüedad */}
          <div className="space-y-1">
            <h4 className="font-semibold text-slate-900 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-1 mb-2">Datos Generales</h4>
            <div className="flex items-center gap-1">
              <FontAwesomeIcon icon={faCalendar} className="w-3 h-3 text-slate-400" />
              <span className="font-semibold">Ingreso:</span> {profile?.hireDate ? format(parseISO(profile.hireDate), "dd/MM/yyyy") : "—"}
            </div>
            <div className="flex items-center gap-1">
              <FontAwesomeIcon icon={faBuilding} className="w-3 h-3 text-slate-400" />
              <span className="font-semibold">Antigüedad Total:</span> {calculateAntiguedad()}
            </div>
          </div>

          {/* Sede, Rol Frame, Contrato, Horario y Fechas */}
          {((profile?.externalInfo?.sedes?.length ?? 0) > 0 || (profile?.externalInfo?.rolFrames?.length ?? 0) > 0 || (profile?.externalInfo?.contracts?.length ?? 0) > 0 || (profile?.externalInfo?.schedules?.length ?? 0) > 0 || (profile?.externalInfo?.projectDates?.length ?? 0) > 0) && (
            <div className="space-y-1">
              <h4 className="font-semibold text-slate-900 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 mt-2">Detalles Laborales</h4>
              {profile?.externalInfo?.sedes && profile.externalInfo.sedes.length > 0 && (
                <div className="flex items-center gap-1">
                  <FontAwesomeIcon icon={faBuilding} className="w-3 h-3 text-slate-400" />
                  <span className="font-semibold text-amber-600 dark:text-amber-400">Sede:</span> {profile.externalInfo.sedes.join(", ")}
                </div>
              )}
              {profile?.externalInfo?.rolFrames && profile.externalInfo.rolFrames.length > 0 && (
                <div className="flex items-center gap-1">
                  <FontAwesomeIcon icon={faIdCard} className="w-3 h-3 text-slate-400" />
                  <span className="font-semibold text-purple-600 dark:text-purple-400">Rol Frame:</span> {profile.externalInfo.rolFrames.join(", ")}
                </div>
              )}
              {profile?.externalInfo?.contracts && profile.externalInfo.contracts.length > 0 && (
                <div className="flex items-center gap-1">
                  <FontAwesomeIcon icon={faBriefcase} className="w-3 h-3 text-slate-400" />
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Contrato:</span> {profile.externalInfo.contracts.join(", ")}
                </div>
              )}
              {profile?.externalInfo?.schedules && profile.externalInfo.schedules.length > 0 && (
                <div className="flex items-center gap-1">
                  <FontAwesomeIcon icon={faClock} className="w-3 h-3 text-slate-400" />
                  <span className="font-semibold text-sky-600 dark:text-sky-400">Horario:</span> {profile.externalInfo.schedules.join(", ")}
                </div>
              )}
              {profile?.externalInfo?.projectDates && profile.externalInfo.projectDates.length > 0 && (
                <div className="flex items-center gap-1">
                  <FontAwesomeIcon icon={faCalendar} className="w-3 h-3 text-slate-400" />
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">Fechas:</span> {profile.externalInfo.projectDates.join(", ")}
                </div>
              )}
            </div>
          )}

          {/* Proyecto/s Actual/es */}
          <div className="space-y-1">
            <h4 className="font-semibold text-slate-900 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 mt-2">Ubicación</h4>
            <div className="flex items-start gap-1">
              <FontAwesomeIcon icon={faBriefcase} className="w-3 h-3 text-slate-400 mt-0.5" />
              <span className="font-semibold uppercase truncate">Proyecto/s Actual/es:</span>
              <span className="truncate">{stats?.project || "Sin proyectos"}</span>
            </div>

            {/* Cargo y Área */}
            <div className="flex items-center gap-1">
              <FontAwesomeIcon icon={faLayerGroup} className="w-3 h-3 text-slate-400" />
              <span className="font-semibold uppercase text-[10px]">Área:</span>
              {profile?.areaName || profile?.department || "Sin Área"}
            </div>
            <div className="flex items-center gap-1">
              <FontAwesomeIcon icon={faUserTie} className="w-3 h-3 text-slate-400" />
              <span className="font-semibold">Cargo:</span> {profile?.positionName || profile?.position || "Sin Cargo"}
            </div>
            <div className="flex items-center gap-1">
              <FontAwesomeIcon icon={faUserGraduate} className="w-3 h-3 text-slate-400" />
              <span className="font-semibold">Nivel:</span> {profile?.levelName || "Sin Nivel"}
            </div>
          </div>

          {/* Reglas */}
          <div className="space-y-1">
            <h4 className="font-semibold text-slate-900 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 mt-2">Configuración Aplicada</h4>
            <div className="flex items-start gap-1">
              <FontAwesomeIcon icon={faRulerCombined} className="w-3 h-3 text-slate-400 mt-0.5" />
              <span className="font-semibold uppercase text-[10px]">Reglas:</span>
              {(() => {
                const effConfig = (stats?.projectVacationConfig as any) ?? globalConfig;
                const meta = (stats as any)?.vacationRulesMeta;

                const fractionalAllowed = effConfig?.permiteFraccionadas;
                const minDays = effConfig?.minDiasFraccion ?? 1;

                const minDaysSource = meta?.minDiasSource || stats?.vacationConfigSource || "Global";
                const fracSource = meta?.fractionationSource || stats?.vacationConfigSource || "Global";
                const typeSource = meta?.diasCorridosSource || stats?.vacationConfigSource || "Global";

                return (
                  <div className="flex flex-col items-start gap-1">
                    {fractionalAllowed ? (
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                        Min: {minDays} días <span className="opacity-70">({minDaysSource})</span>
                      </span>
                    ) : (
                      <span className="text-[10px] bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800">
                        No Fracc. <span className="opacity-70">({fracSource})</span>
                      </span>
                    )}

                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      {applyConsecutiveDaysRule ? "Días Corridos" : "Días Hábiles"} <span className="opacity-70">({typeSource})</span>
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </InfoModal>

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

      {/* MODAL DE INFORMACIÓN SOBRE SOLICITUDES PENDIENTES */}
      <InfoModal
        isOpen={showPendingInfoModal}
        onClose={() => setShowPendingInfoModal(false)}
        title="Solicitudes Pendientes"
        size="sm"
        actions={[
          {
            label: "Entendido",
            onClick: () => setShowPendingInfoModal(false),
            variant: "primary",
          },
        ]}
      >
        <div className="text-slate-700 dark:text-slate-300">
          <p>Las fechas marcadas en amarillo indican que hay una solicitud de vacaciones en proceso de aprobación.</p>
          <p className="mt-2 text-sm text-slate-500 font-medium">Importante: Si esta solicitud es rechazada o cancelada, la fecha quedará disponible nuevamente para ser seleccionada.</p>
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

      {/* Floating Action Button for New Request */}
      {/* Floating Action Button for New Request */}
      <div className="fixed bottom-24 z-10 w-full xl:w-1/2 left-1/2 -translate-x-1/2 flex justify-end px-6 pointer-events-none">
        <button onClick={() => setShowForm(true)} disabled={loading || hasActiveRequest || hasNoDays} className="pointer-events-auto flex items-center justify-center w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100" title={hasActiveRequest ? "Ya tienes una solicitud en curso" : hasNoDays ? "Sin días disponibles" : "Nueva Solicitud"}>
          <FontAwesomeIcon icon={faPlus} className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
