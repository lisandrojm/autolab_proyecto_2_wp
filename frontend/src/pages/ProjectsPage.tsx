import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { projectsAPI, Project } from "../api/projects";
import { clientsAPI, Client } from "../api/clients";
import { useClientContextStore } from "../stores/clientContextStore";
import { PageLayout } from "../components/ui/PageLayout";
import { Card } from "../components/ui/Card";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { faBriefcase, faBuilding } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { getHelp, hasHelp } from "../data/help/helpContent";

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { setSelectedClient } = useClientContextStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");

  const HELP_KEY = "projects";
  const helpEntry = getHelp(HELP_KEY);

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
    <PageLayout
      title="Proyectos"
      subtitle="Todos los proyectos del sistema"
      itemCount={filteredProjects.length}
      faIcon={{ icon: faBriefcase }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || "Ayuda",
        size: helpEntry?.size as any,
        content: helpEntry?.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      searchAndFilters={<SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por nombre o cliente..." />}
    >
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
                  avatar: {
                    src: typeof project.clientId === "object" ? (project.clientId as any).logo : undefined,
                    fallback: ((typeof project.clientId === "object" ? project.clientId.name : clientMap.get(project.clientId as string)?.name) || "?").charAt(0).toUpperCase(),
                    alt: typeof project.clientId === "object" ? project.clientId.name : undefined,
                  },
                  badges: [
                    {
                      text: project.status === "active" ? "Activo" : project.status === "on_hold" ? "En Espera" : project.status === "completed" ? "Completado" : "Archivado",
                      variant: project.status === "active" ? "green" : project.status === "on_hold" ? "warning" : project.status === "completed" ? "info" : "default",
                    },
                    {
                      text: (typeof project.clientId === "object" ? project.clientId.name : clientMap.get(project.clientId as string)?.name) || "Cliente Desconocido",
                      variant: "cyan",
                    },
                  ],
                  badgesPosition: "top",
                }}
                footer={{
                  leftContent: <div className="text-xs text-gray-500 dark:text-gray-500">Creado: {new Date(project.createdAt).toLocaleDateString()}</div>,
                }}
              >
                {/* Sede dentro del cuerpo de la card */}
                {project.metadataResolutions?.sede && (
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                      <FontAwesomeIcon icon={faBuilding} className="h-3 w-3 text-gray-400" />
                      Sede
                    </label>
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 w-fit">{project.metadataResolutions.sede.name || project.metadataResolutions.sede.data?.nombre || "Sede"}</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
};
