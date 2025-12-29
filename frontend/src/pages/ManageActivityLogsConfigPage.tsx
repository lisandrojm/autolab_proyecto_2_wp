import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "../components/ui/PageLayout";
import { ProjectHeaderSelector } from "../components/activity_logs_config/ProjectHeaderSelector";
import { TeamConfigTab } from "../components/activity_logs_config/TeamConfigTab";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear, faBriefcase } from "@fortawesome/free-solid-svg-icons";

export const ManageActivityLogsConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState<any>(null);

  return (
    <PageLayout title="Configuración de Novedades" subtitle="Gestiona miembros y notificaciones por proyecto" faIcon={{ icon: faGear }} onBack={() => navigate("/hr/activity-logs")}>
      <div className="max-w-6xl mx-auto">
        <ProjectHeaderSelector onSelectProject={setSelectedProject} selectedProjectId={selectedProject?._id} />

        {selectedProject ? (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{selectedProject.name}</h2>
              {selectedProject.clientId && <p className="text-sm text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide mt-1">{selectedProject.clientId.name}</p>}
            </div>
            <div className="p-0">
              <TeamConfigTab project={selectedProject} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-400 p-12 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 border-dashed">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <FontAwesomeIcon icon={faBriefcase} className="text-2xl text-gray-300 dark:text-gray-600" />
            </div>
            <p>Selecciona un Cliente y Proyecto arriba para configurar.</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
