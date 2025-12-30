import React, { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faChartPie, faChartSimple } from "@fortawesome/free-solid-svg-icons";
import { ReportSchedule } from "./ReportingScheduleModal";
import { Modal } from "../ui/Modal";

// Mock data generator for compliance - now schedule aware
const generateMockCompliance = (date: Date, schedule?: ReportSchedule): "complete" | "missing" | "extra" | "none" => {
  const dayIndex = getDay(date); // 0 = Sun, 1 = Mon...

  // Determine if this day is required by schedule
  let isRequired = true;
  if (schedule) {
    if (schedule.type === "workdays") {
      isRequired = dayIndex !== 0 && dayIndex !== 6;
    } else if (schedule.type === "custom") {
      isRequired = schedule.days.includes(dayIndex);
    }
  }

  // Determine if a report "exists" (Mock logic: random but deterministic based on date)
  const dayNum = date.getDate();
  const hasReport = dayNum % 3 !== 0; // 2/3rds have reports

  if (date > new Date()) return "none";

  if (isRequired) {
    if (hasReport) {
      return "complete";
    }
    return "missing";
  } else {
    // Not required
    if (hasReport) return "extra"; // Report sent on non-required day
    return "none"; // No report, not required -> Neutral
  }
};

interface ActivityLogCalendarProps {
  project?: any;
  scheduleConfig?: ReportSchedule;
  onDayClick?: (date: Date, status: "complete" | "missing" | "extra" | "none") => void;
}

export const ActivityLogCalendar: React.FC<ActivityLogCalendarProps> = ({ project, scheduleConfig, onDayClick }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showStatsModal, setShowStatsModal] = useState(false);

  const firstDay = startOfMonth(currentDate);
  const lastDay = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: firstDay, end: lastDay });

  // Calculate stats for the current month
  const stats = days.reduce(
    (acc, day) => {
      const status = generateMockCompliance(day, scheduleConfig);
      if (status === "complete") acc.reported++;
      if (status === "missing") acc.missing++;
      if (status === "extra") acc.extra++;
      return acc;
    },
    { reported: 0, missing: 0, extra: 0 }
  );

  // Calculate padding days for start of month
  const startPadding = Array(getDay(firstDay)).fill(null);

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  if (!project) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
        <p>Selecciona un proyecto para ver sus reportes.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100 capitalize">{format(currentDate, "MMMM yyyy", { locale: es })}</h3>
            <button onClick={() => setShowStatsModal(true)} className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm" title="Ver Estadísticas Mensuales">
              <FontAwesomeIcon icon={faChartSimple} className="w-4 h-4" />
            </button>
          </div>
          {scheduleConfig && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
              {scheduleConfig.type === "daily" && "Diario (L-D)"}
              {scheduleConfig.type === "workdays" && "Días Hábiles (L-V)"}
              {scheduleConfig.type === "custom" && "Personalizado"}
            </span>
          )}
        </div>
        <div className="flex space-x-1 sm:space-x-2">
          <button onClick={prevMonth} className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <FontAwesomeIcon icon={faChevronLeft} className="text-gray-600 dark:text-gray-400 h-3 w-3 sm:h-4 sm:w-4" />
          </button>
          <button onClick={nextMonth} className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <FontAwesomeIcon icon={faChevronRight} className="text-gray-600 dark:text-gray-400 h-3 w-3 sm:h-4 sm:w-4" />
          </button>
        </div>
      </div>

      {/* Week Days Header */}
      <div className="grid grid-cols-7 mb-1 sm:mb-2 text-center text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {["D", "L", "M", "M", "J", "V", "S"].map((day, idx) => (
          <div key={idx} className="py-1 sm:py-2">
            <span className="sm:hidden">{day}</span>
            <span className="hidden sm:inline">{["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][idx]}</span>
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {startPadding.map((_, i) => (
          <div key={`padding-${i}`} className="h-14 sm:h-20 lg:h-24 bg-gray-50/50 dark:bg-gray-800/50 rounded-md sm:rounded-lg"></div>
        ))}
        {days.map((day) => {
          const status = generateMockCompliance(day, scheduleConfig);
          const isToday = isSameDay(day, new Date());

          let statusColor = "bg-gray-50 dark:bg-gray-800"; // default / none
          let statusIcon = null;

          if (status === "complete") {
            statusColor = "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800";
            statusIcon = <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-500 shrink-0 shadow-sm" title="Reportado"></div>;
          } else if (status === "missing") {
            statusColor = "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800";
            statusIcon = <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-500 shrink-0 shadow-sm" title="No enviado"></div>;
          } else if (status === "extra") {
            statusColor = "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 opacity-75";
            statusIcon = <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-blue-500 shrink-0 shadow-sm" title="Reporte Extra"></div>;
          } else {
            // None (not required, no report)
            statusColor = "bg-gray-50 dark:bg-gray-800/50 opacity-50";
          }

          const handleDayClick = () => {
            if (status !== "none" && onDayClick) {
              onDayClick(day, status);
            }
          };

          return (
            <div key={day.toString()} onClick={handleDayClick} className={`h-14 sm:h-20 lg:h-24 p-1 sm:p-2 rounded-md sm:rounded-lg border ${statusColor} ${isToday ? "ring-2 ring-blue-500" : ""} relative group transition-all hover:shadow-md ${status !== "none" ? "cursor-pointer" : "cursor-default"} overflow-hidden flex flex-col justify-between`}>
              <div className="flex justify-between items-start w-full">
                <span className={`text-xs sm:text-sm font-semibold ${isSameMonth(day, currentDate) ? "text-gray-700 dark:text-gray-300" : "text-gray-400"}`}>{format(day, "d")}</span>
                {statusIcon}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 sm:mt-6 flex flex-wrap gap-6 text-sm text-gray-600 dark:text-gray-400 justify-start">
        <div className="flex items-center gap-2.5">
          <div className="w-4 h-4 rounded-full bg-green-500 shadow-sm ring-2 ring-green-100 dark:ring-green-900/30"></div>
          <span className="font-semibold text-gray-800 dark:text-gray-200">Reportado</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-4 h-4 rounded-full bg-red-500 shadow-sm ring-2 ring-red-100 dark:ring-red-900/30"></div>
          <span className="font-semibold text-gray-800 dark:text-gray-200">No enviado</span>
        </div>
        <div className="flex items-center gap-2 opacity-75">
          <div className="w-3 h-3 rounded-full bg-blue-500 shadow-sm"></div>
          <span className="font-medium text-xs">Extra</span>
        </div>
      </div>

      {/* Stats Modal */}
      <Modal isOpen={showStatsModal} onClose={() => setShowStatsModal(false)} title={`Estadísticas: ${format(currentDate, "MMMM yyyy", { locale: es })}`} size="md">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800">
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.reported}</div>
            <div className="text-sm font-medium text-green-600 dark:text-green-300">Días Reportados</div>
          </div>
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.missing}</div>
            <div className="text-sm font-medium text-red-600 dark:text-red-300">No Enviados</div>
          </div>
        </div>
        <div className="mt-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 flex justify-between items-center">
          <div>
            <div className="text-xl font-bold text-blue-700 dark:text-blue-400">{stats.reported + stats.missing}</div>
            <div className="text-xs font-medium text-blue-600 dark:text-blue-300">Total Días Requeridos</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-indigo-700 dark:text-indigo-400">{((stats.reported / (stats.reported + stats.missing || 1)) * 100).toFixed(0)}%</div>
            <div className="text-xs font-medium text-indigo-600 dark:text-indigo-300">Cumplimiento</div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
