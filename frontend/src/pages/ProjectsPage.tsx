import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { projectsAPI, Project } from "../api/projects";
import { clientsAPI, Client } from "../api/clients";
import { useClientContextStore } from "../stores/clientContextStore";
import { PageLayout } from "../components/ui/PageLayout";
import { Card } from "../components/ui/Card";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { faBriefcase } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { setSelectedClient } = useClientContextStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [projectsData, clientsData] = await Promise.all([projectsAPI.listAll({ limit: 500 }), clientsAPI.listAll()]);
        setProjects(projectsData);
        setClients(clientsData);
      } catch (error) {
        console.error("Error fetching projects data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach((c) => map.set(c._id, c));
    return map;
  }, [clients]);

  const filteredProjects = useMemo(() => {
    if (!searchTerm) return projects;
    const lowerSearch = searchTerm.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(lowerSearch) || (typeof p.clientId === "object" ? p.clientId.name : clientMap.get(p.clientId)?.name)?.toLowerCase().includes(lowerSearch));
  }, [projects, searchTerm, clientMap]);

  const handleProjectClick = (project: Project) => {
    const cId = typeof project.clientId === "object" ? project.clientId._id : project.clientId;
    const client = clientMap.get(cId);

    if (client) {
      setSelectedClient(client);
    }

    navigate(`/projects/${project._id}`);
  };

  return (
    <PageLayout title="Proyectos" subtitle="Todos los proyectos del sistema" itemCount={filteredProjects.length} faIcon={{ icon: faBriefcase }} searchAndFilters={<SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por nombre o cliente..." />}>
      {loading ? (
        <LoadingSpinner message="Cargando proyectos..." />
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faBriefcase} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No se encontraron proyectos</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {filteredProjects.map((project) => {
            return (
              <Card
                key={project._id}
                onClick={() => handleProjectClick(project)}
                className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
                header={{
                  title: project.name,
                  subtitle: project.description,
                  icon: faBriefcase,
                  badges: [
                    {
                      text: project.status === "active" ? "Activo" : project.status === "on_hold" ? "En Espera" : project.status === "completed" ? "Completado" : "Archivado",
                      variant: project.status === "active" ? "green" : project.status === "on_hold" ? "warning" : project.status === "completed" ? "info" : "default",
                    },
                  ],
                  badgesPosition: "header-right",
                }}
                footer={{
                  leftContent: <div className="text-xs text-gray-500 dark:text-gray-500">Creado: {new Date(project.createdAt).toLocaleDateString()}</div>,
                }}
              />
            );
          })}
        </div>
      )}
    </PageLayout>
  );
};
