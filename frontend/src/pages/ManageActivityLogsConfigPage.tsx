import React, { useState, useEffect } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { ProjectHeaderSelector } from "../components/activity_logs_config/ProjectHeaderSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileText, faCheck } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { ReportSchedule } from "../types/activityTypes";
import { sweetAlert } from "../utils/sweetAlert";

const DAYS_OF_WEEK = [
  { id: 0, label: "Domingo" },
  { id: 1, label: "Lunes" },
  { id: 2, label: "Martes" },
  { id: 3, label: "Miércoles" },
  { id: 4, label: "Jueves" },
  { id: 5, label: "Viernes" },
  { id: 6, label: "Sábado" },
];

export const ManageActivityLogsConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [type, setType] = useState<ReportSchedule["type"]>("daily");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Default workdays
  const [openInfo, setOpenInfo] = useState(false);

  // Help integration - We can reuse "activityLogs" or create a new one.
  // User said "debe tener un info". I'll use a custom one essentially mimicking the modal's info.
  // Or I can add a new help key. For now, I'll pass custom content to PageLayout infoModal.

  const infoContent = (
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
    </div>
  );

  // Simulate loading schedule when project changes
  useEffect(() => {
    if (selectedProject) {
      // Here we would fetch the schedule for the selected project
      // For now, reset to default or some mock logic
      setType("daily");
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    }
  }, [selectedProject]);

  const handleTypeChange = (newType: ReportSchedule["type"]) => {
    setType(newType);
    if (newType === "daily") {
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    } else if (newType === "workdays") {
      setSelectedDays([1, 2, 3, 4, 5]);
    }
  };

  const toggleDay = (dayId: number) => {
    if (type !== "custom") return;
    setSelectedDays((prev) => (prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]));
  };

  const handleSave = () => {
    // Here we would save to backend
    console.log("Saving schedule for", selectedProject?.name, { type, days: selectedDays });
    sweetAlert.success("Configuración Guardada", `Se ha actualizado la frecuencia para ${selectedProject?.name || "el proyecto"}`);
  };

  const handleBack = () => {
    navigate("/hr/activity-logs");
  };

  return (
    <PageLayout
      title="Novedades | Configuración"
      subtitle="Configura la frecuencia de los reportes por proyecto"
      faIcon={{ icon: faFileText }}
      onBack={handleBack}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: "Frecuencia de Reporte",
        size: "md",
        content: infoContent,
      }}
      shouldShowInfo={true}
    >
      <div className="mx-auto space-y-6 animate-fade-in">
        {/* Project Selector Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Seleccionar Proyecto</h3>
          <ProjectHeaderSelector onSelectProject={setSelectedProject} selectedProjectId={selectedProject?._id} />
        </div>

        {selectedProject && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-8">
            {/* Frequency Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Frecuencia de Reporte</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button onClick={() => handleTypeChange("daily")} className={`p-4 rounded-lg border text-sm font-medium transition-all ${type === "daily" ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-2 ring-blue-600" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700"}`}>
                  <div className="mb-1 text-lg">Todos los días</div>
                  <div className="text-sm opacity-70">Lunes a Domingo</div>
                </button>
                <button onClick={() => handleTypeChange("workdays")} className={`p-4 rounded-lg border text-sm font-medium transition-all ${type === "workdays" ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-2 ring-blue-600" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700"}`}>
                  <div className="mb-1 text-lg">Días Hábiles</div>
                  <div className="text-sm opacity-70">Lunes a Viernes</div>
                </button>
                <button onClick={() => handleTypeChange("custom")} className={`p-4 rounded-lg border text-sm font-medium transition-all ${type === "custom" ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-2 ring-blue-600" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700"}`}>
                  <div className="mb-1 text-lg">Personalizado</div>
                  <div className="text-sm opacity-70">Elegir días específicos</div>
                </button>
              </div>
            </div>

            {/* Days Selection */}
            <div className={`transition-opacity duration-300 ${type === "custom" ? "opacity-100" : "opacity-50 pointer-events-none grayscale"}`}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Días requeridos</label>
              <div className="flex flex-wrap gap-3">
                {DAYS_OF_WEEK.map((day) => {
                  const isSelected = selectedDays.includes(day.id);
                  return (
                    <button
                      key={day.id}
                      onClick={() => toggleDay(day.id)}
                      disabled={type !== "custom"}
                      className={`
                        w-12 h-12 rounded-full flex items-center justify-center text-base font-semibold transition-all
                        ${isSelected ? "bg-blue-600 text-white shadow-md scale-110" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}
                      `}
                      title={day.label}
                    >
                      {day.label.charAt(0)}
                    </button>
                  );
                })}
              </div>
              {type !== "custom" && <p className="text-sm text-gray-500 mt-3">Selecciona "Personalizado" para editar días específicos.</p>}
            </div>

            {/* Info Box */}

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
              <button onClick={handleSave} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm">
                <FontAwesomeIcon icon={faCheck} />
                Guardar Configuración
              </button>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
