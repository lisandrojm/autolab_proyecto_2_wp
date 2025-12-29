import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { ProjectHeaderSelector } from "../components/activity_logs_config/ProjectHeaderSelector";
import { ActivityLogCalendar } from "../components/activity_logs/ActivityLogCalendar";

export const ManageActivityLogsCalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState<any>(null);

  return (
    <PageLayout title="Reporte de Novedades" subtitle="Visualiza el reporte mensual de novedades por proyecto" faIcon={{ icon: faCalendar }} onBack={() => navigate("/hr/activity-logs")}>
      <div className="max-w-6xl mx-auto space-y-6">
        <ProjectHeaderSelector onSelectProject={setSelectedProject} selectedProjectId={selectedProject?._id} />

        {/* The calendar component handles the card styling and empty state */}
        <ActivityLogCalendar project={selectedProject} />
      </div>
    </PageLayout>
  );
};
