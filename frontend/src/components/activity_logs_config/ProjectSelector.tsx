import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faChevronRight, faBriefcase, faBuilding } from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "../../stores/authStore";
import { clientsAPI } from "../../api/clients";
import { LoadingSpinner } from "../ui/LoadingSpinner";

interface Client {
  _id: string;
  name: string;
}

interface Project {
  _id: string;
  name: string;
  clientId?: { name: string };
  status: string;
}

interface ProjectSelectorProps {
  onSelectProject: (project: Project) => void;
  selectedProjectId?: string;
  projects?: Project[];
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({ onSelectProject, selectedProjectId }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { token } = useAuthStore();

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [selectedClientId]);

  const getHeaders = () => {
    const tenantSlug = localStorage.getItem("tenantSlug");
    const tenantId = localStorage.getItem("tenantId");
    return {
      Authorization: `Bearer ${token}`,
      "X-Tenant-Id": tenantSlug || tenantId || "",
    };
  };

  const fetchClients = async () => {
    try {
      const response = await clientsAPI.list({ limit: 100 });
      setClients(response.clients || []);
    } catch (error) {
      console.error("Error fetching clients", error);
    }
  };

  const fetchProjects = async () => {
    setLoading(true);
    try {
      let url = `${import.meta.env.VITE_API_URL}/projects?limit=1000`;
      if (selectedClientId) {
        url = `${import.meta.env.VITE_API_URL}/clients/${selectedClientId}/projects?limit=1000`;
      }

      const response = await fetch(url, {
        headers: getHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      } else {
        setProjects([]);
      }
    } catch (error) {
      console.error("Error fetching projects", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="flex flex-col h-full border-r border-gray-200 dark:border-gray-700 w-64 lg:w-72 bg-gray-50 dark:bg-gray-800/50">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Proyectos Activos</h3>

        <div className="relative">
          <FontAwesomeIcon icon={faBuilding} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs" />
          <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-1 focus:ring-blue-500 appearance-none text-gray-700 dark:text-gray-300">
            <option value="">Todos los Clientes</option>
            {clients.map((client) => (
              <option key={client._id} value={client._id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs" />
          <input type="text" placeholder="Buscar proyecto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-1 focus:ring-blue-500" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <LoadingSpinner size="sm" message="Cargando..." />
        ) : filteredProjects.length > 0 ? (
          filteredProjects.map((project) => (
            <button key={project._id} onClick={() => onSelectProject(project)} className={`w-full text-left px-3 py-2.5 rounded text-sm transition-all flex items-center justify-between group ${selectedProjectId === project._id ? "bg-white dark:bg-gray-700 shadow-sm border border-gray-200 dark:border-gray-600 text-blue-600 dark:text-blue-400 font-medium" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-200"}`}>
              <div className="flex items-center gap-2 truncate">
                <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${selectedProjectId === project._id ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500"}`}>
                  <FontAwesomeIcon icon={faBriefcase} className="text-xs" />
                </div>
                <div className="truncate">
                  <div className="truncate">{project.name}</div>
                  {project.clientId && <div className="text-[10px] text-gray-400 truncate">{project.clientId.name}</div>}
                </div>
              </div>
              {selectedProjectId === project._id && <FontAwesomeIcon icon={faChevronRight} className="text-xs text-blue-500" />}
            </button>
          ))
        ) : (
          <div className="p-4 text-center text-gray-500 text-xs italic">{selectedClientId ? "No hay proyectos para este cliente" : "No se encontraron proyectos"}</div>
        )}
      </div>
    </div>
  );
};
