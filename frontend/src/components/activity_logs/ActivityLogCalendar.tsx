import React, { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faCheckCircle, faTimesCircle, faExclamationCircle } from "@fortawesome/free-solid-svg-icons";

// Mock data generator for compliance
const generateMockCompliance = (date: Date) => {
  const day = date.getDate();
  // Random status: complete, partial, missing, none (future)
  if (date > new Date()) return "none";
  if (day % 7 === 0) return "missing"; // Sundays missing
  if (day % 3 === 0) return "partial";
  return "complete";
};

interface ActivityLogCalendarProps {
  project?: any; // Replace with proper type
}

export const ActivityLogCalendar: React.FC<ActivityLogCalendarProps> = ({ project }) => {
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
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 capitalize">{format(currentDate, "MMMM yyyy", { locale: es })}</h3>
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
          const status = generateMockCompliance(day);
          const isToday = isSameDay(day, new Date());

          let statusColor = "bg-gray-50 dark:bg-gray-800"; // default
          let statusText = "";
          let statusIcon = null;

          if (status === "complete") {
            statusColor = "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800";
            statusText = "Reporte OK";
            statusIcon = <div className="w-2 h-2 rounded-full bg-green-500"></div>;
          } else if (status === "missing") {
            statusColor = "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800";
            statusText = "Falta Reporte";
            statusIcon = <div className="w-2 h-2 rounded-full bg-red-500"></div>;
          } else if (status === "partial") {
            statusColor = "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800";
            statusText = "Incompleto";
            statusIcon = <div className="w-2 h-2 rounded-full bg-yellow-500"></div>;
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
      </div>
    </div>
  );
};
