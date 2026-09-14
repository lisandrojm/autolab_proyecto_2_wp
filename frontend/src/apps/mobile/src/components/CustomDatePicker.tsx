import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faTimes, faCalendar, faCaretDown } from "@fortawesome/free-solid-svg-icons";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isBefore, isAfter, isToday, startOfYear, endOfYear } from "date-fns";
import { es } from "date-fns/locale";

interface CustomDatePickerProps {
  /** Sin label no se dibuja el rótulo: para formularios que ya ponen el suyo arriba del campo. */
  label?: string;
  value: string;
  onChange: (date: string) => void;
  minDate?: string;
  maxDate?: string;
  validateDate?: (date: Date) => { valid: boolean; message?: string };
  disabled?: boolean;
  /** Clases del botón que abre el calendario, para que se vea igual que los demás campos de donde se usa. */
  triggerClassName?: string;
  /**
   * Sin fecha elegida, abre eligiendo el AÑO en vez del mes actual.
   *
   * Para una fecha de nacimiento, llegar mes a mes hasta 1976 son cientos de toques: nadie lo hace, y el
   * que lo intenta abandona el formulario. Arranca en una página de años plausibles (hace unos 30).
   */
  abrirEnAnios?: boolean;
}

type Modo = "dias" | "meses" | "anios";
const ANIOS_POR_PAGINA = 12;

/** "YYYY-MM-DD" como fecha LOCAL: `new Date("YYYY-MM-DD")` la toma en UTC y en Argentina cae el día anterior. */
const fechaLocal = (iso: string) => new Date(iso + "T00:00:00");

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({ label, value, onChange, minDate, maxDate, validateDate, disabled, triggerClassName, abrirEnAnios }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  /*
    DÍAS, MESES O AÑOS. Tocar el título sube un nivel: del mes a elegir el mes, y de ahí a elegir el año.
    Antes el calendario sólo avanzaba de a un mes, que alcanza para un pedido o una vacación de este
    año pero no para una fecha lejana.
  */
  const [modo, setModo] = useState<Modo>("dias");

  // Al abrir: la vista arranca en la fecha elegida, o en los años si así se pidió y todavía no hay fecha.
  useEffect(() => {
    if (value && typeof value === "string") {
      const [y, m, d] = value.split("-").map(Number);
      setViewDate(new Date(y, m - 1, d));
    } else if (isOpen && abrirEnAnios) {
      setViewDate(new Date(new Date().getFullYear() - 30, 0, 1));
    }
    if (isOpen) setModo(!value && abrirEnAnios ? "anios" : "dias");
  }, [value, isOpen, abrirEnAnios]);

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

  /** Un período entero (mes o año) queda afuera si termina antes del mínimo o empieza después del máximo. */
  const periodoFuera = (inicio: Date, fin: Date) => (!!minDate && isBefore(fin, fechaLocal(minDate))) || (!!maxDate && isAfter(inicio, fechaLocal(maxDate)));

  const generateMonthDays = () => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    return eachDayOfInterval({ start: startDate, end: endDate });
  };

  const days = generateMonthDays();
  const weekDays = ["L", "M", "M", "J", "V", "S", "D"];

  const anioVista = viewDate.getFullYear();
  const inicioPagina = anioVista - (anioVista % ANIOS_POR_PAGINA);
  const elegido = value && typeof value === "string" ? fechaLocal(value) : null;

  const titulo = modo === "dias" ? format(viewDate, "MMMM yyyy", { locale: es }) : modo === "meses" ? String(anioVista) : `${inicioPagina} – ${inicioPagina + ANIOS_POR_PAGINA - 1}`;
  const anterior = () => setViewDate(modo === "dias" ? subMonths(viewDate, 1) : modo === "meses" ? subMonths(viewDate, 12) : new Date(anioVista - ANIOS_POR_PAGINA, viewDate.getMonth(), 1));
  const siguiente = () => setViewDate(modo === "dias" ? addMonths(viewDate, 1) : modo === "meses" ? addMonths(viewDate, 12) : new Date(anioVista + ANIOS_POR_PAGINA, viewDate.getMonth(), 1));

  const celdaPeriodo = (activo: boolean, fuera: boolean) =>
    `h-12 w-full rounded flex items-center justify-center text-sm font-medium capitalize transition-colors ${
      activo ? "bg-blue-500 text-white shadow-md" : fuera ? "opacity-30 cursor-not-allowed text-slate-400" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
    }`;

  return (
    <div className="relative">
      {label && <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{label}</label>}

      <button
        type="button"
        onClick={toggleCalendar}
        disabled={disabled}
        className={
          triggerClassName
            ? `${triggerClassName} flex items-center justify-between text-left ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`
            : `flex items-center justify-between w-full px-4 py-2 bg-white dark:bg-slate-800 border rounded cursor-pointer text-left ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-blue-400"} border-slate-300 dark:border-slate-700`
        }
      >
        {/* Con `triggerClassName` el color del texto lo pone el campo del formulario donde se usa: forzarlo acá lo dejaba ilegible sobre un fondo que no es el de la app. */}
        <span className={value && typeof value === "string" ? (triggerClassName ? "" : "text-slate-900 dark:text-slate-100") : "text-slate-400"}>{value && typeof value === "string" ? format(fechaLocal(value), "dd/MM/yyyy") : "dd/mm/aaaa"}</span>
        <FontAwesomeIcon icon={faCalendar} className="text-slate-400" />
      </button>

      {/* Modal / Popover */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setIsOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              {/* El título es un botón: sube de días a meses y de meses a años. En la página de años ya no hay más arriba. */}
              {modo === "anios" ? (
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">{titulo}</h3>
              ) : (
                <button
                  type="button"
                  onClick={() => setModo(modo === "dias" ? "meses" : "anios")}
                  title={modo === "dias" ? "Elegir mes y año" : "Elegir año"}
                  className="flex items-center gap-1.5 rounded px-1 -mx-1 font-bold text-lg text-slate-900 dark:text-white capitalize hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  {titulo}
                  <FontAwesomeIcon icon={faCaretDown} className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                </button>
              )}
              <div className="flex items-center gap-2">
                <button type="button" onClick={anterior} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                  <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </button>
                <button type="button" onClick={siguiente} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                  <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </button>
                <button type="button" onClick={() => setIsOpen(false)} className="ml-2 w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700">
                  <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>
            </div>

            {/* Grid */}
            <div className="p-4">
              {modo === "anios" && (
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: ANIOS_POR_PAGINA }, (_, i) => inicioPagina + i).map((anio) => {
                    const fuera = periodoFuera(startOfYear(new Date(anio, 0, 1)), endOfYear(new Date(anio, 0, 1)));
                    return (
                      <button
                        key={anio}
                        type="button"
                        disabled={fuera}
                        onClick={() => {
                          setViewDate(new Date(anio, viewDate.getMonth(), 1));
                          setModo("meses");
                        }}
                        className={celdaPeriodo(elegido?.getFullYear() === anio, fuera)}
                      >
                        {anio}
                      </button>
                    );
                  })}
                </div>
              )}

              {modo === "meses" && (
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 12 }, (_, mes) => {
                    const inicioMes = new Date(anioVista, mes, 1);
                    const fuera = periodoFuera(startOfMonth(inicioMes), endOfMonth(inicioMes));
                    return (
                      <button
                        key={mes}
                        type="button"
                        disabled={fuera}
                        onClick={() => {
                          setViewDate(inicioMes);
                          setModo("dias");
                        }}
                        className={celdaPeriodo(elegido?.getFullYear() === anioVista && elegido?.getMonth() === mes, fuera)}
                      >
                        {format(inicioMes, "MMM", { locale: es }).replace(".", "")}
                      </button>
                    );
                  })}
                </div>
              )}

              {modo === "dias" && (
                <>
                  <div className="grid grid-cols-7 mb-2 text-center">
                    {weekDays.map((d, i) => (
                      <div key={`${d}-${i}`} className="text-xs font-bold text-slate-400">
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
                          type="button"
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
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
