import React, { useState, useEffect } from "react";
import { X, ChevronRight } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolder, faBullhorn } from "@fortawesome/free-solid-svg-icons";

interface Project {
  _id: string;
  name: string;
  description?: string;
  clientId: {
    _id: string;
    name: string;
  };
}

interface Campaign {
  _id: string;
  name: string;
  description?: string;
  projectId: string;
  clientId: string;
}

interface ProjectCampaignSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (projectId: string, campaignId: string, clientId: string) => void;
}

export const ProjectCampaignSelector: React.FC<ProjectCampaignSelectorProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  const { token, tenantId } = useAuthStore();
  const [step, setStep] = useState<"project" | "campaign">("project");
  const [projects, setProjects] = useState<Project[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
      setStep("project");
      setSelectedProject(null);
      setSearchTerm("");
    }
  }, [isOpen]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/projects`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaigns = async (projectId: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/campaigns?projectId=${projectId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Tenant-Id": tenantId,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCampaigns(data);
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSelect = async (project: Project) => {
    setSelectedProject(project);
    await fetchCampaigns(project._id);
    setStep("campaign");
    setSearchTerm("");
  };

  const handleCampaignSelect = (campaign: Campaign) => {
    if (selectedProject) {
      onSelect(selectedProject._id, campaign._id, selectedProject.clientId._id);
      onClose();
    }
  };

  const handleBack = () => {
    setStep("project");
    setSelectedProject(null);
    setCampaigns([]);
    setSearchTerm("");
  };

  if (!isOpen) return null;

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.clientId?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCampaigns = campaigns.filter((campaign) =>
    campaign.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {step === "campaign" && (
              <button
                onClick={handleBack}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <ChevronRight className="h-5 w-5 rotate-180" />
              </button>
            )}
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {step === "project" ? "Seleccionar Proyecto" : "Seleccionar Campaña"}
              </h3>
              {step === "campaign" && selectedProject && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Proyecto: {selectedProject.name}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            placeholder={step === "project" ? "Buscar proyecto..." : "Buscar campaña..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : step === "project" ? (
            <div className="space-y-2">
              {filteredProjects.length === 0 ? (
                <div className="text-center py-12">
                  <FontAwesomeIcon
                    icon={faFolder}
                    className="h-12 w-12 text-gray-400 mx-auto mb-4"
                  />
                  <p className="text-gray-600 dark:text-gray-400">
                    No se encontraron proyectos
                  </p>
                </div>
              ) : (
                filteredProjects.map((project) => (
                  <button
                    key={project._id}
                    onClick={() => handleProjectSelect(project)}
                    className="w-full text-left p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <FontAwesomeIcon
                        icon={faFolder}
                        className="h-5 w-5 text-primary-600 dark:text-primary-400 mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                          {project.name}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Cliente: {project.clientId?.name || "Sin cliente"}
                        </p>
                        {project.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 line-clamp-2">
                            {project.description}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCampaigns.length === 0 ? (
                <div className="text-center py-12">
                  <FontAwesomeIcon
                    icon={faBullhorn}
                    className="h-12 w-12 text-gray-400 mx-auto mb-4"
                  />
                  <p className="text-gray-600 dark:text-gray-400">
                    No se encontraron campañas en este proyecto
                  </p>
                </div>
              ) : (
                filteredCampaigns.map((campaign) => (
                  <button
                    key={campaign._id}
                    onClick={() => handleCampaignSelect(campaign)}
                    className="w-full text-left p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <FontAwesomeIcon
                        icon={faBullhorn}
                        className="h-5 w-5 text-primary-600 dark:text-primary-400 mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                          {campaign.name}
                        </h4>
                        {campaign.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 line-clamp-2">
                            {campaign.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
