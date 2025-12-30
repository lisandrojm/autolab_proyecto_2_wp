import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { faCalendar, faCog } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PageLayout } from "../components/ui/PageLayout";
import { ProjectHeaderSelector } from "../components/activity_logs_config/ProjectHeaderSelector";
import { ActivityLogCalendar } from "../components/activity_logs/ActivityLogCalendar";
import { ReportingScheduleModal, ReportSchedule } from "../components/activity_logs/ReportingScheduleModal";
import { sweetAlert } from "../utils/sweetAlert";

export const ManageActivityLogsCalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState<any>(null);

  // Frequency Config Modal state
  const [showConfigModal, setShowConfigModal] = useState(false);
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

  // Handle day click - navigate to report detail
  // Since it's not yet dynamic, we simulate by using a mocked report ID based on status
  // In a real implementation, this would get the actual report ID from an API
  const handleDayClick = (date: Date, status: "complete" | "missing" | "extra" | "none") => {
    const projectName = selectedProject?.name || "Proyecto";

    if (status === "missing") {
      sweetAlert.info("Sin Reporte", `No hay reporte para ${projectName} el día ${format(date, "dd/MM/yyyy")}. El coordinador no envió el reporte diario.`);
      return;
    }

    // Simulate getting a report ID - in reality this would come from the backend
    // We use REP-001 as the mock report to show the detail view
    const mockReportId = "REP-001";

    // Navigate to the activity logs page with the report ID to auto-open detail view
    navigate(`/hr/activity-logs?report=${mockReportId}`);
  };

  return (
    <PageLayout
      title="Calendario | Reporte de Novedades"
      subtitle="Visualiza el reporte mensual de novedades por proyecto"
      faIcon={{ icon: faCalendar }}
      onBack={() => navigate("/hr/activity-logs")}
      headerActions={
        selectedProject && (
          <button onClick={() => setShowConfigModal(true)} className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm" aria-label="Configurar Frecuencia" title="Configurar Frecuencia">
            <FontAwesomeIcon icon={faCog} className="h-4 w-4" />
          </button>
        )
      }
    >
      <div className="max-w-5xl mx-auto space-y-6">
        <ProjectHeaderSelector onSelectProject={setSelectedProject} selectedProjectId={selectedProject?._id} />

        {/* The calendar component handles the card styling and empty state */}
        <ActivityLogCalendar project={selectedProject} scheduleConfig={currentSchedule} onDayClick={handleDayClick} />

        {selectedProject && <ReportingScheduleModal isOpen={showConfigModal} onClose={() => setShowConfigModal(false)} projectName={selectedProject.name} initialSchedule={currentSchedule} onSave={handleSaveSchedule} />}
      </div>
    </PageLayout>
  );
};
