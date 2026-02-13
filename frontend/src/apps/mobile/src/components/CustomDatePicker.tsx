import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faTimes, faCalendar } from "@fortawesome/free-solid-svg-icons";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isBefore, isAfter, isToday } from "date-fns";
import { es } from "date-fns/locale";

interface CustomDatePickerProps {
  label: string;
  value: string;
  onChange: (date: string) => void;
  minDate?: string;
  maxDate?: string;
  validateDate?: (date: Date) => { valid: boolean; message?: string };
  disabled?: boolean;
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({ label, value, onChange, minDate, maxDate, validateDate, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  // Initialize viewDate from value if present
  useEffect(() => {
    if (value) {
      const [y, m, d] = value.split("-").map(Number);
      setViewDate(new Date(y, m - 1, d));
    }
  }, [value, isOpen]);

  const toggleCalendar = () => {
    if (!disabled) setIsOpen(!isOpen);
  };

  const handleDayClick = (day: Date) => {
    // Check if disabled/invalid
    if (validateDate) {
      const { valid } = validateDate(day);
      if (!valid) return;
    }

    // Check min/max
    const formattedDay = format(day, "yyyy-MM-dd");
    if (minDate && isBefore(day, new Date(minDate)) && formattedDay !== minDate) return;
    if (maxDate && isAfter(day, new Date(maxDate)) && formattedDay !== maxDate) return;

    onChange(formattedDay);
    setIsOpen(false);
  };

  const generateMonthDays = () => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    return eachDayOfInterval({ start: startDate, end: endDate });
  };

  const days = generateMonthDays();
  const weekDays = ["L", "M", "M", "J", "V", "S", "D"];

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{label}</label>

      {/* Input Trigger */}
      <div onClick={toggleCalendar} className={`flex items-center justify-between w-full px-4 py-2 bg-white dark:bg-slate-800 border rounded cursor-pointer ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-blue-400"} ${value ? "border-slate-300 dark:border-slate-700" : "border-slate-300 dark:border-slate-700"}`}>
        <span className={value ? "text-slate-900 dark:text-slate-100" : "text-slate-400"}>{value ? format(new Date(value + "T00:00:00"), "dd/MM/yyyy") : "dd/mm/aaaa"}</span>
        <FontAwesomeIcon icon={faCalendar} className="text-slate-400" />
      </div>

      {/* Modal / Popover */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setIsOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white capitalize">{format(viewDate, "MMMM yyyy", { locale: es })}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                  <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </button>
                <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                  <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </button>
                <button onClick={() => setIsOpen(false)} className="ml-2 w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700">
                  <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>
            </div>

            {/* Grid */}
            <div className="p-4">
              <div className="grid grid-cols-7 mb-2 text-center">
                {weekDays.map((d) => (
                  <div key={d} className="text-xs font-bold text-slate-400">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day) => {
                  const isCurrentMonth = isSameMonth(day, viewDate);
                  const formattedDay = format(day, "yyyy-MM-dd");
                  const isSelected = value === formattedDay;

                  let isDisabled = false;
                  // Min/Max check
                  if (minDate && isBefore(day, new Date(minDate)) && formattedDay !== minDate) isDisabled = true;
                  if (maxDate && isAfter(day, new Date(maxDate)) && formattedDay !== maxDate) isDisabled = true;

                  // Validation Check
                  if (!isDisabled && validateDate) {
                    const { valid } = validateDate(day);
                    if (!valid) isDisabled = true;
                  }

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => !isDisabled && handleDayClick(day)}
                      disabled={isDisabled}
                      className={`
                        h-10 w-full rounded flex items-center justify-center text-sm font-medium transition-colors
                        ${!isCurrentMonth ? "text-slate-300 dark:text-slate-700" : ""}
                        ${isSelected ? "bg-blue-500 text-white shadow-md" : ""}
                        ${!isSelected && !isDisabled ? "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200" : ""}
                        ${isDisabled ? "opacity-30 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50 text-slate-400" : ""}
                        ${isToday(day) && !isSelected ? "border border-blue-500 text-blue-500" : ""}
                      `}
                    >
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
