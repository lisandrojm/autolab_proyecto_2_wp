import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faCog } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { ProjectHeaderSelector } from "../components/activity_logs_config/ProjectHeaderSelector";
import { ActivityLogCalendar } from "../components/activity_logs/ActivityLogCalendar";
import { ReportingScheduleModal, ReportSchedule } from "../components/activity_logs/ReportingScheduleModal";

export const ManageActivityLogsCalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Mock storage for project schedules
  const [projectSchedules, setProjectSchedules] = useState<Record<string, ReportSchedule>>({});

  const handleSaveSchedule = (schedule: ReportSchedule) => {
    if (selectedProject) {
      setProjectSchedules((prev) => ({
        ...prev,
        [selectedProject._id]: schedule,
      }));
    }
  };

  const currentSchedule = selectedProject ? projectSchedules[selectedProject._id] : undefined;

  return (
    <PageLayout
      title="Reporte de Novedades"
      subtitle="Visualiza el reporte mensual de novedades por proyecto"
      faIcon={{ icon: faCalendar }}
      onBack={() => navigate("/hr/activity-logs")}
      headerActions={
        selectedProject && (
          <button onClick={() => setShowConfigModal(true)} className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center shadow-sm" title="Configurar Frecuencia">
            <FontAwesomeIcon icon={faCog} className="h-4 w-4" />
          </button>
        )
      }
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <ProjectHeaderSelector onSelectProject={setSelectedProject} selectedProjectId={selectedProject?._id} />

        {/* The calendar component handles the card styling and empty state */}
        <ActivityLogCalendar project={selectedProject} scheduleConfig={currentSchedule} />

        {selectedProject && <ReportingScheduleModal isOpen={showConfigModal} onClose={() => setShowConfigModal(false)} projectName={selectedProject.name} initialSchedule={currentSchedule} onSave={handleSaveSchedule} />}
      </div>
    </PageLayout>
  );
};
