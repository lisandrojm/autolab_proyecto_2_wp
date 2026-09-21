import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faTimes, faCalendar, faInfoCircle, faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isBefore, isAfter, isToday, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { sweetAlert } from "../utils/sweetAlert";

interface CustomMultiDatePickerProps {
  label: string;
  value: string | string[];
  onChange: (dates: string | string[]) => void;
  minDate?: string;
  maxDate?: string;
  validateDate?: (date: Date) => { valid: boolean; message?: string };
  disabled?: boolean;
  remainingDays?: number;
}

export const CustomMultiDatePicker: React.FC<CustomMultiDatePickerProps> = ({ label, value, onChange, minDate, maxDate, validateDate, disabled, remainingDays }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [tempSelection, setTempSelection] = useState<string[]>([]);

  const selectedDates = Array.isArray(value) 
    ? value.filter(v => typeof v === "string") 
    : (typeof value === "string" && value ? [value] : []);

  useEffect(() => {
    if (isOpen) {
      setTempSelection([...selectedDates]);
      if (selectedDates.length > 0) {
        const [y, m, d] = selectedDates[selectedDates.length - 1].split("-").map(Number);
        setViewDate(new Date(y, m - 1, d));
      } else {
        setViewDate(new Date());
      }
    }
  }, [isOpen]);

  const toggleCalendar = () => {
    if (!disabled) setIsOpen(!isOpen);
  };

  const handleDayClick = (day: Date) => {
    const formattedDay = format(day, "yyyy-MM-dd");

    /*
      SACAR UN DÍA YA ELEGIDO SIEMPRE SE PUEDE, y va antes que cualquier control.

      Los límites y las validaciones son sobre lo que se AGREGA. Al revisar algo cargado hace una
      semana sus días ya son pasado: si el control también bloqueara quitarlos, quedarían clavados
      ahí sin más salida que vaciar todo con «Limpiar».
    */
    if (tempSelection.includes(formattedDay)) {
      setTempSelection(tempSelection.filter((d) => d !== formattedDay));
      return;
    }

    if (validateDate) {
      const { valid, message } = validateDate(day);
      if (!valid) {
        if (message) {
          sweetAlert.warning("Fecha no válida", message);
        }
        return;
      }
    }

    if (minDate && isBefore(day, new Date(minDate)) && formattedDay !== minDate) return;
    if (maxDate && isAfter(day, new Date(maxDate)) && formattedDay !== maxDate) return;

    if (typeof remainingDays === "number" && tempSelection.length >= remainingDays) {
      sweetAlert.warning("Límite excedido", `Solo tienes ${remainingDays} días disponibles.`);
      return;
    }
    setTempSelection([...tempSelection, formattedDay].sort());
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

  const handleConfirm = () => {
    onChange(tempSelection);
    setIsOpen(false);
  };


  const formatSelectionLabel = () => {
    if (selectedDates.length === 0) return "Seleccionar fechas...";
    if (selectedDates.length === 1) return format(parseISO(selectedDates[0]), "dd/MM/yyyy");
    return `${selectedDates.length} días seleccionados`;
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{label}</label>

      {/* Input Trigger */}
      <div onClick={toggleCalendar} className={`flex items-center justify-between w-full px-4 py-2 bg-white dark:bg-slate-800 border rounded cursor-pointer ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-blue-400"} border-slate-300 dark:border-slate-700`}>
        <span className={selectedDates.length > 0 ? "text-slate-900 dark:text-slate-100" : "text-slate-400"}>{formatSelectionLabel()}</span>
        <FontAwesomeIcon icon={faCalendar} className="text-slate-400" />
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setIsOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white capitalize">{format(viewDate, "MMMM yyyy", { locale: es })}</h3>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded p-1">
                  <button type="button" onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                    <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  </button>
                  <button type="button" onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                    <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  </button>
                </div>
                <button type="button" onClick={() => setTempSelection([])} className="px-3 py-1.5 rounded bg-blue-50 dark:bg-blue-600 text-blue-600 dark:text-white hover:bg-blue-100 dark:hover:bg-blue-900/80 transition-colors ml-2 text-xs font-medium">
                  Limpiar
                </button>
                <button type="button" onClick={() => setIsOpen(false)} className="ml-2 w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700">
                  <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto">
              <div className="grid grid-cols-7 mb-2 text-center">
                {weekDays.map((d) => (
                  <div key={d} className="text-xs font-bold text-slate-400">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 mb-4">
                {days.map((day) => {
                  const isCurrentMonth = isSameMonth(day, viewDate);
                  const formattedDay = format(day, "yyyy-MM-dd");
                  const isSelected = tempSelection.includes(formattedDay);

                  let isDisabled = false;
                  if (minDate && isBefore(day, new Date(minDate)) && formattedDay !== minDate) isDisabled = true;
                  if (maxDate && isAfter(day, new Date(maxDate)) && formattedDay !== maxDate) isDisabled = true;

                  if (!isDisabled && validateDate) {
                    const { valid } = validateDate(day);
                    if (!valid) isDisabled = true;
                  }

                  // Un día ya elegido nunca se apaga: hay que poder sacarlo (ver `handleDayClick`).
                  if (isSelected) isDisabled = false;

                  return (
                    <button
                      type="button"
                      key={day.toISOString()}
                      onClick={() => !isDisabled && handleDayClick(day)}
                      disabled={isDisabled}
                      className={`
                        h-10 w-full rounded flex items-center justify-center text-sm font-medium transition-colors border
                        ${!isCurrentMonth ? "text-slate-300 dark:text-slate-700" : ""}
                        ${isSelected ? "bg-blue-600 border-blue-600 text-white shadow-md font-bold" : "border-transparent"}
                        ${!isSelected && !isDisabled ? "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200" : ""}
                        ${isDisabled ? "opacity-30 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50 text-slate-400 border-dashed border-slate-300" : ""}
                        ${isToday(day) && !isSelected ? "border-blue-500 text-blue-500" : ""}
                      `}
                    >
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>

              {typeof remainingDays === "number" && (
                <div className="flex border-t border-slate-200 dark:border-slate-800 pt-4 mb-4">
                  <div className="flex-1 text-center border-r border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1 tracking-wider">Disponibles</p>
                    <p className="text-2xl font-bold text-blue-500">{remainingDays}</p>
                  </div>
                  <div className="flex-1 text-center">
                    <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1 tracking-wider">Seleccionados</p>
                    <p className="text-2xl font-bold text-slate-200">{tempSelection.length}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => setIsOpen(false)} className="flex-1 rounded-lg h-11 bg-slate-700 text-white font-medium hover:bg-slate-600 transition-colors bg-opacity-70 backdrop-blur">
                  Cancelar
                </button>
                <button type="button" onClick={handleConfirm} className="flex-1 rounded-lg h-11 bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors shadow-lg">
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
