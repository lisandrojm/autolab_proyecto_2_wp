import React, { useState, useEffect } from "react";
import { Modal } from "../ui/Modal";
import { InfoModal } from "../ui/InfoModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarCheck, faCheck, faInfoCircle } from "@fortawesome/free-solid-svg-icons";

export interface ReportSchedule {
  type: "daily" | "workdays" | "custom";
  days: number[]; // 0 = Sunday, 1 = Monday, ...
}

interface ReportingScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSchedule?: ReportSchedule;
  onSave: (schedule: ReportSchedule) => void;
  projectName: string;
  projectSelector?: React.ReactNode;
}

const DAYS_OF_WEEK = [
  { id: 0, label: "Domingo" },
  { id: 1, label: "Lunes" },
  { id: 2, label: "Martes" },
  { id: 3, label: "Miércoles" },
  { id: 4, label: "Jueves" },
  { id: 5, label: "Viernes" },
  { id: 6, label: "Sábado" },
];

export const ReportingScheduleModal: React.FC<ReportingScheduleModalProps> = ({ isOpen, onClose, initialSchedule, onSave, projectName, projectSelector }) => {
  const [type, setType] = useState<ReportSchedule["type"]>("daily");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Default workdays
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (initialSchedule) {
      setType(initialSchedule.type);
      setSelectedDays(initialSchedule.days);
    } else {
      // Defaults
      setType("daily");
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    }
  }, [initialSchedule, isOpen]);

  const handleTypeChange = (newType: ReportSchedule["type"]) => {
    setType(newType);
    if (newType === "daily") {
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    } else if (newType === "workdays") {
      setSelectedDays([1, 2, 3, 4, 5]);
    }
  };

  const toggleDay = (dayId: number) => {
    if (type !== "custom") return; // Only editable in custom
    setSelectedDays((prev) => (prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]));
  };

  const handleSave = () => {
    onSave({ type, days: selectedDays });
    onClose();
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`Configurar Frecuencia: ${projectName}`} size="md">
        <div className="space-y-6">
          {projectSelector && <div className="pb-4 border-b border-gray-200 dark:border-gray-700">{projectSelector}</div>}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Frecuencia de Reporte</label>
              <button onClick={() => setShowInfo(true)} className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors" title="¿Qué es la frecuencia de reporte?">
                <FontAwesomeIcon icon={faInfoCircle} className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button onClick={() => handleTypeChange("daily")} className={`p-3 rounded-lg border text-sm font-medium transition-all ${type === "daily" ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-500" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700"}`}>
                <div className="mb-1">Todos los días</div>
                <div className="text-xs opacity-70">Lun - Dom</div>
              </button>
              <button onClick={() => handleTypeChange("workdays")} className={`p-3 rounded-lg border text-sm font-medium transition-all ${type === "workdays" ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-500" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700"}`}>
                <div className="mb-1">Días Hábiles</div>
                <div className="text-xs opacity-70">Lun - Vie</div>
              </button>
              <button onClick={() => handleTypeChange("custom")} className={`p-3 rounded-lg border text-sm font-medium transition-all ${type === "custom" ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-500" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700"}`}>
                <div className="mb-1">Personalizado</div>
                <div className="text-xs opacity-70">Elegir días</div>
              </button>
            </div>
          </div>

          <div className={`transition-opacity duration-300 ${type === "custom" ? "opacity-100" : "opacity-50 pointer-events-none grayscale"}`}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Días requeridos</label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = selectedDays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    onClick={() => toggleDay(day.id)}
                    disabled={type !== "custom"}
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all
                      ${isSelected ? "bg-blue-600 text-white shadow-sm scale-110" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}
                    `}
                    title={day.label}
                  >
                    {day.label.charAt(0)}
                  </button>
                );
              })}
            </div>
            {type !== "custom" && <p className="text-xs text-gray-500 mt-2">Selecciona "Personalizado" para editar días específicos.</p>}
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800/50">
            <div className="flex gap-3">
              <FontAwesomeIcon icon={faCalendarCheck} className="text-yellow-600 dark:text-yellow-500 mt-0.5" />
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <span className="font-semibold block mb-0.5">Impacto en el Calendario</span>
                Los días seleccionados se marcarán como "Faltante" (Rojo) si no se envía un reporte. Los días no seleccionados no afectarán el cumplimiento.
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
            <button onClick={handleSave} className="btn-primary flex items-center gap-2">
              <FontAwesomeIcon icon={faCheck} />
              Guardar Configuración
            </button>
          </div>
        </div>
      </Modal>

      {/* Info Modal */}
      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title="Frecuencia de Reporte">
        <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
          <p>
            La <strong className="text-gray-900 dark:text-white">Frecuencia de Reporte</strong> define los días de la semana en que el coordinador debe enviar el <strong className="text-gray-900 dark:text-white">Reporte Diario de Novedades</strong> para este proyecto.
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
              <div>
                <strong className="text-gray-900 dark:text-white">Todos los días:</strong> Se requiere un reporte cada día, de lunes a domingo.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
              <div>
                <strong className="text-gray-900 dark:text-white">Días Hábiles:</strong> Se requiere un reporte solo de lunes a viernes.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
              <div>
                <strong className="text-gray-900 dark:text-white">Personalizado:</strong> Permite seleccionar días específicos según las necesidades del proyecto.
              </div>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800/50 mt-4">
            <p className="text-blue-800 dark:text-blue-200">
              <strong>Importante:</strong> Si un día está marcado como requerido y no se envía el reporte correspondiente, el calendario mostrará ese día como "Faltante" (en rojo).
            </p>
          </div>
        </div>
      </InfoModal>
    </>
  );
};
