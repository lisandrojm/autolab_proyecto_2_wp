import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarAlt, faCheckCircle, faTimesCircle, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { format, eachDayOfInterval, startOfMonth, endOfMonth, isWeekend, isSameDay } from "date-fns";
import { es } from "date-fns/locale";

interface HistoryTabProps {
  projectId: string; // To fetch history
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ projectId }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Mock Data Logic
  // In real implementation, fetch report statuses for the month

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // KPIs
  const kpis = {
    compliance: 85,
    totalReports: 18,
    missing: 3,
  };

  const getDayStatus = (date: Date) => {
    // Mock logic:
    // Weekends = Gray
    // Randomly Green or Red for weekdays
    if (isWeekend(date)) return "weekend";

    const day = date.getDate();
    if (day % 4 === 0) return "missing"; // Mock missing
    if (day > new Date().getDate()) return "future";
    return "submitted";
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* KPIs Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">Cumplimiento</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{kpis.compliance}%</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600">
            <FontAwesomeIcon icon={faCheckCircle} />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">Reportes</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{kpis.totalReports}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
            <FontAwesomeIcon icon={faCalendarAlt} />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">Faltantes</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{kpis.missing}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600">
            <FontAwesomeIcon icon={faExclamationTriangle} />
          </div>
        </div>
      </div>

      {/* Calendar Visualization */}
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 capitalize">{format(currentDate, "MMMM yyyy", { locale: es })}</h3>
          {/* Controls would go here */}
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-semibold text-gray-500 uppercase">
          <div>Dom</div>
          <div>Lun</div>
          <div>Mar</div>
          <div>Mie</div>
          <div>Jue</div>
          <div>Vie</div>
          <div>Sab</div>
        </div>
        <div className="grid grid-cols-7 gap-2 flex-1">
          {" "}
          // grid-rows dependent on weeks
          {/* Visual padding for start of month would be calculated here */}
          {Array.from({ length: monthStart.getDay() }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {days.map((day) => {
            const status = getDayStatus(day);
            let bg = "bg-white";
            let border = "border-gray-100";
            let content = null;

            if (status === "submitted") {
              bg = "bg-green-50 dark:bg-green-900/20";
              border = "border-green-200 dark:border-green-800";
              content = <FontAwesomeIcon icon={faCheckCircle} className="text-green-500 text-lg" />;
            } else if (status === "missing") {
              bg = "bg-red-50 dark:bg-red-900/20";
              border = "border-red-200 dark:border-red-800";
              content = <FontAwesomeIcon icon={faTimesCircle} className="text-red-400 text-lg" />;
            } else if (status === "weekend") {
              bg = "bg-gray-50 dark:bg-gray-800";
              border = "border-transparent";
            }

            return (
              <div key={day.toISOString()} className={`aspect-square rounded-lg border ${border} ${bg} flex flex-col items-center justify-center relative group`}>
                <span className={`text-xs absolute top-1 left-2 ${status === "weekend" ? "text-gray-300" : "text-gray-500"}`}>{day.getDate()}</span>
                {content}

                {/* Tooltip or popover on hover if submitted */}
                {status === "submitted" && <div className="hidden group-hover:block absolute bottom-full mb-2 bg-gray-900 text-white text-xs p-2 rounded z-10 w-32 text-center">Reporte enviado por Juan Perez</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
