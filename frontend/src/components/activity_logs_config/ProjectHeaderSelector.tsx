import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBuilding, faBriefcase, faSearch, faPlus } from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "../../stores/authStore";
import { clientsAPI } from "../../api/clients";

interface Project {
  _id: string;
  name: string;
  clientId?: {
    _id: string;
    name: string;
  };
  status?: string;
}

interface Client {
  _id: string;
  name: string;
}

interface ProjectHeaderSelectorProps {
  onSelectProject: (project: Project | null) => void;
  selectedProjectId?: string;
}

export const ProjectHeaderSelector: React.FC<ProjectHeaderSelectorProps> = ({ onSelectProject, selectedProjectId }) => {
  const navigate = useNavigate();
  const { tenantId } = useAuthStore();
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>(selectedProjectId || "");
  const [loading, setLoading] = useState(false);

  // Fetch Clients
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await clientsAPI.list({ limit: 100 });
        const clientList = response.clients || [];
        setClients(clientList);

        // Auto-select first client if available and none selected
        if (clientList.length > 0 && !selectedClient) {
          setSelectedClient(clientList[0]._id);
        }
      } catch (error) {
        console.error("Error fetching clients", error);
      }
    };
    fetchClients();
  }, [tenantId]);

  // Fetch Projects (optionally filtered by client)
  useEffect(() => {
    const fetchProjects = async () => {
      // Don't fetch if no client selected (unless we want to show all, but logic implies filtering)
      if (!selectedClient && clients.length > 0) return;

      setLoading(true);
      try {
        let url = `${import.meta.env.VITE_API_URL}/projects?limit=1000`;
        const headers: any = {
          Authorization: `Bearer ${useAuthStore.getState().token}`,
          "X-Tenant-Id": useAuthStore.getState().tenantId || localStorage.getItem("tenantId") || "",
        };

        if (selectedClient) {
          url = `${import.meta.env.VITE_API_URL}/clients/${selectedClient}/projects?limit=1000`;
        }

        const response = await fetch(url, { headers });
        if (response.ok) {
          const data = await response.json();
          // Adjust logic based on API response structure (data.projects or data)
          let projectsList = data.projects || data;

          if (Array.isArray(data)) projectsList = data;
          else if (data.docs) projectsList = data.docs;
          else if (data.data) projectsList = data.data; // Handle generic pagination if needed

          setProjects(projectsList || []);

          // Auto-select first project if available and none selected
          if (projectsList && projectsList.length > 0 && !selectedProject) {
            const firstProject = projectsList[0];
            setSelectedProject(firstProject._id);
            onSelectProject(firstProject);
          }
        }
      } catch (error) {
        console.error("Error fetching projects", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [selectedClient, tenantId]);

  // Handle Project Selection from Dropdown
  const handleProjectChange = (projectId: string) => {
    setSelectedProject(projectId);
    const project = projects.find((p) => p._id === projectId) || null;
    onSelectProject(project);

    // Auto-select client if project belongs to one and none selected?
    if (project && project.clientId && !selectedClient) {
      // Optional: setSelectedClient(project.clientId._id);
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 bg-white dark:bg-gray-800 mb-6">
      {/* Client Selector */}
      <div className="flex-1 relative">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cliente</label>
        {clients.length === 0 ? (
          <button
            onClick={() => navigate("/register-client")} // Correct route for client creation
            className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-blue-500 border-dashed rounded text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            <FontAwesomeIcon icon={faPlus} />
            <span>Crear Cliente</span>
          </button>
        ) : (
          <div className="relative">
            <FontAwesomeIcon icon={faBuilding} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <select
              value={selectedClient}
              onChange={(e) => {
                setSelectedClient(e.target.value);
                setSelectedProject(""); // Reset project when client changes
                onSelectProject(null);
              }}
              className="w-full pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none"
            >
              {/* Remove 'Todos los Clientes' if strictly forcing selection, but keeping it as fallback or explicit 'All' (though logic seems to filter projects by client) */}
              {/* If requirements are strict about 'always selected', we might remove the default option if lists are non-empty. But keeping it as 'Select' is fine if autoselect works. */}
              <option value="" disabled>
                Seleccionar Cliente
              </option>
              {clients.map((client) => (
                <option key={client._id} value={client._id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Project Selector */}
      <div className="flex-1 relative">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Proyecto</label>
        <div className="relative">
          <FontAwesomeIcon icon={faBriefcase} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <select value={selectedProject} onChange={(e) => handleProjectChange(e.target.value)} disabled={loading} className="w-full pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none disabled:opacity-50">
            <option value="">{loading ? "Cargando..." : "Seleccionar Proyecto"}</option>
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
