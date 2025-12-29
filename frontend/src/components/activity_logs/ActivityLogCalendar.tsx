import React, { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { ReportSchedule } from "./ReportingScheduleModal";

// Mock data generator for compliance - now schedule aware
const generateMockCompliance = (date: Date, schedule?: ReportSchedule): "complete" | "missing" | "partial" | "extra" | "none" => {
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
  // Let's say odd days have reports, even days don't.
  const dayNum = date.getDate();
  const hasReport = dayNum % 3 !== 0; // 2/3rds have reports
  const isPartial = hasReport && dayNum % 5 === 0;

  if (date > new Date()) return "none";

  if (isRequired) {
    if (hasReport) {
      return isPartial ? "partial" : "complete";
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
}

export const ActivityLogCalendar: React.FC<ActivityLogCalendarProps> = ({ project, scheduleConfig }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const firstDay = startOfMonth(currentDate);
  const lastDay = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: firstDay, end: lastDay });

  // Calculate padding days for start of month
  const startPadding = Array(getDay(firstDay)).fill(null);

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  if (!project) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400">
        <p>Selecciona un proyecto para ver sus reportes.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 capitalize">{format(currentDate, "MMMM yyyy", { locale: es })}</h3>
          {scheduleConfig && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
              {scheduleConfig.type === "daily" && "Diario (L-D)"}
              {scheduleConfig.type === "workdays" && "Días Hábiles (L-V)"}
              {scheduleConfig.type === "custom" && "Personalizado"}
            </span>
          )}
        </div>
        <div className="flex space-x-2">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <FontAwesomeIcon icon={faChevronLeft} className="text-gray-600 dark:text-gray-400" />
          </button>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <FontAwesomeIcon icon={faChevronRight} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Week Days Header */}
      <div className="grid grid-cols-7 mb-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day) => (
          <div key={day} className="py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {startPadding.map((_, i) => (
          <div key={`padding-${i}`} className="h-24 bg-gray-50/50 dark:bg-gray-800/50 rounded-lg"></div>
        ))}
        {days.map((day) => {
          const status = generateMockCompliance(day, scheduleConfig);
          const isToday = isSameDay(day, new Date());

          let statusColor = "bg-gray-50 dark:bg-gray-800"; // default / none
          let statusIcon = null;

          if (status === "complete") {
            statusColor = "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800";
            statusIcon = <div className="w-2 h-2 rounded-full bg-green-500" title="Reporte Completo"></div>;
          } else if (status === "missing") {
            statusColor = "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800";
            statusIcon = <div className="w-2 h-2 rounded-full bg-red-500" title="Falta Reporte"></div>;
          } else if (status === "partial") {
            statusColor = "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800";
            statusIcon = <div className="w-2 h-2 rounded-full bg-yellow-500" title="Parcial"></div>;
          } else if (status === "extra") {
            statusColor = "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 opacity-75";
            statusIcon = <div className="w-2 h-2 rounded-full bg-blue-500" title="Reporte Adicional"></div>;
          } else {
            // None (not required, no report)
            statusColor = "bg-gray-50 dark:bg-gray-800/50 opacity-50";
          }

          return (
            <div key={day.toString()} className={`h-24 p-2 rounded-lg border ${statusColor} ${isToday ? "ring-2 ring-blue-500" : ""} relative group transition-all hover:shadow-md cursor-pointer`}>
              <div className="flex justify-between items-start">
                <span className={`text-sm font-semibold ${isSameMonth(day, currentDate) ? "text-gray-700 dark:text-gray-300" : "text-gray-400"}`}>{format(day, "d")}</span>
                {statusIcon}
              </div>

              {status !== "none" && (
                <div className="mt-2 text-xs font-medium">
                  {status === "complete" && <span className="text-green-700 dark:text-green-400 block truncate">100% Asistencia</span>}
                  {status === "missing" && <span className="text-red-700 dark:text-red-400 block truncate">No enviado</span>}
                  {status === "partial" && <span className="text-yellow-700 dark:text-yellow-400 block truncate">Faltan firmas</span>}
                  {status === "extra" && <span className="text-blue-700 dark:text-blue-400 block truncate">Reporte Extra</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex gap-4 text-xs text-gray-600 dark:text-gray-400 justify-end">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500"></div> Completo
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-yellow-500"></div> Parcial
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500"></div> Faltante
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div> Extra
        </div>
      </div>
    </div>
  );
};
