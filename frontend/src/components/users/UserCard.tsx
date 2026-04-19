import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faUserShield,
  faLayerGroup,
  faUserTie,
  faUserGraduate,
  faClock,
  faBuilding,
  faIdCard,
  faBriefcase,
  faFileContract,
  faUmbrellaBeach,
  faChevronDown,
  faChevronUp,
} from "@fortawesome/free-solid-svg-icons";
import { User } from "../../api/users";
import { Project } from "../../api/projects";
import { Client } from "../../api/clients";
import { Vacation } from "../../api/vacations";
import { Card } from "../ui/Card";

interface UserCardProps {
  user: User;
  allProjects: Project[];
  allClients: Client[];
  vacations: Vacation[];
  projectContext?: Project;
  userConfig?: any; // Configuración del usuario en el contexto de un proyecto (p.ej. shiftId, areaId)
  userLookup?: Map<number | string, string>; // Mapa para buscar nombres de empleados reemplazados
  actions?: {
    icon: any;
    title: string;
    onClick: () => void;
    className?: string;
  }[];
}

export const UserCard: React.FC<UserCardProps> = ({
  user,
  allProjects,
  allClients,
  vacations = [],
  projectContext,
  userConfig,
  userLookup,
  actions,
}) => {
  // --- Helper Functions (Replicados de UsersPage para independencia) ---
  
  const getUserVacationStatus = (userId: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return vacations.some((v) => {
      if (v.userId !== userId || v.status !== "APPROVED") return false;
      const start = new Date(v.startDate);
      const end = new Date(v.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return today >= start && today <= end;
    });
  };

  const calculateDuration = (start?: string, end?: string) => {
    if (!start || !end) return "";
    try {
      const [h1, m1] = start.split(":").map(Number);
      const [h2, m2] = end.split(":").map(Number);
      let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (diff < 0) diff += 24 * 60;
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      return `${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
    } catch {
      return "";
    }
  };

  const getActiveSedes = (u: User): string[] => {
    const sedesSet = new Set<string>();
    if (u.metadata?.projects) {
      u.metadata.projects.forEach((p: any) => {
        if (p.contracts) {
          p.contracts.forEach((c: any) => {
            const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
            if (endDate) endDate.setHours(23, 59, 59, 999);
            const isActive = !endDate || endDate.getTime() >= new Date().getTime();
            if (isActive && c.nombre_sede) sedesSet.add(c.nombre_sede);
          });
        }
      });
    }
    return Array.from(sedesSet);
  };

  const getActiveContractType = (u: User): string | null => {
    let type: string | null = null;
    if (u.metadata?.projects) {
      u.metadata.projects.forEach((p: any) => {
        if (p.contracts) {
          p.contracts.forEach((c: any) => {
            const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
            if (endDate) endDate.setHours(23, 59, 59, 999);
            const isActive = !endDate || endDate.getTime() >= new Date().getTime();
            if (isActive && c.nombre_contrato) type = c.nombre_contrato;
          });
        }
      });
    }
    return type;
  };

  const getActiveSchedule = (u: User): string | null => {
    let schedule: string | null = null;
    if (u.metadata?.projects) {
      u.metadata.projects.forEach((p: any) => {
        if (p.contracts) {
          p.contracts.forEach((c: any) => {
            const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
            if (endDate) endDate.setHours(23, 59, 59, 999);
            const isActive = !endDate || endDate.getTime() >= new Date().getTime();
            if (isActive && (c.hora_inicio || c.hora_fin)) {
              schedule = `${c.hora_inicio || "?"} - ${c.hora_fin || "?"} Hs`;
            }
          });
        }
      });
    }
    return schedule;
  };

  const isReplacement = (u: User): boolean => {
    if (u.metadata?.projects) {
      for (const p of u.metadata.projects as any[]) {
        if (p.contracts) {
          for (const c of p.contracts) {
            const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
            if (endDate) endDate.setHours(23, 59, 59, 999);
            if ((!endDate || endDate.getTime() >= new Date().getTime()) && c.reemplazo) return true;
          }
        }
      }
    }
    return false;
  };

  const getReplacedEmployeeId = (u: User): string | number | null => {
    let replaced: string | number | null = null;
    if (u.metadata?.projects) {
      u.metadata.projects.forEach((p: any) => {
        if (p.contracts) {
          p.contracts.forEach((c: any) => {
            const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
            if (endDate) endDate.setHours(23, 59, 59, 999);
            if ((!endDate || endDate.getTime() >= new Date().getTime()) && c.empleado_id_reemplezado) {
              replaced = c.empleado_id_reemplezado;
            }
          });
        }
      });
    }
    return replaced;
  };

  // --- Mappings ---
  const projectMap = new Map(allProjects.map(p => [p._id, p]));
  const clientMap = new Map(allClients.map(c => [c._id, c]));

  // Metadata del proyecto actual si aplica
  const currentProjectMeta = projectContext ? user.metadata?.projects?.find((p: any) => {
    const pId = p.projectId;
    const idToCheck = typeof pId === "object" ? (pId as any)?._id : pId;
    return idToCheck === projectContext._id;
  }) : null;

  return (
    <Card
      key={user._id}
      className="h-full hover:scale-105 hover:shadow-lg transition-all duration-200"
      header={{
        title: user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : user.email.split("@")[0],
        subtitle: user.email,
        icon: faUser,
        iconClassName: "text-blue-600",
        badges: [
          ...(user.tenant && user.tenant.name
            ? [
                {
                  text: user.tenant.name,
                  variant: "default" as const,
                  className: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border-blue-200 dark:border-blue-800",
                },
              ]
            : []),
          { text: user.isActive ? "Activo" : "Inactivo", variant: user.isActive ? "green" : "destructive" },
          ...(getUserVacationStatus(user._id)
            ? [
                {
                  text: "DE VACACIONES",
                  variant: "warning" as const,
                  icon: faUmbrellaBeach,
                },
              ]
            : []),
        ],
        badgesPosition: "top",
      }}
      footer={actions ? { actions } : undefined}
    >
      {/* Roles */}
      <div className="mb-3">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
          <FontAwesomeIcon icon={faUserShield} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
          Rol/es
        </label>
        {user.roles.length === 0 ? (
          <span className="text-xs text-gray-500 dark:text-gray-500">Sin roles</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {user.roles.slice(0, 3).map((role) => {
              const lower = role.name.toLowerCase();
              const isCoord = lower.includes("coordinador");
              const isResponsable = lower.includes("responsable");
              
              let classes = "bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-300";
              if (isCoord) {
                classes = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800";
              } else if (isResponsable) {
                classes = "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800";
              }
              
              return (
                <span key={role._id} className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${classes}`}>
                  {role.name}
                </span>
              );
            })}
            {user.roles.length > 3 && <span className="text-xs text-gray-500 dark:text-gray-500">+{user.roles.length - 3} más</span>}
          </div>
        )}
      </div>

      {/* Clientes y Proyectos Agrupados */}
      <div className="space-y-4">
        {(() => {
          const groups = new Map<string, { name: string; projects: any[] }>();
          
          // 1. Procesar proyectos asignados para agruparlos por cliente
          user.projectIds?.forEach((p: any) => {
            const pId = typeof p === "string" ? p : p?._id;
            const pFull = projectMap.get(pId) || (typeof p === "object" ? p : null);
            if (pFull) {
              const cId = typeof pFull.clientId === "object" ? (pFull.clientId as any)?._id : pFull.clientId;
              if (cId) {
                if (!groups.has(cId)) {
                  groups.set(cId, { name: clientMap.get(cId)?.name || "Cliente desconocido", projects: [] });
                }
                groups.get(cId)!.projects.push(pFull);
              }
            }
          });

          // 2. Asegurar que los clientes asignados directamente también aparezcan (aunque no tengan proyectos específicos)
          user.clientIds?.forEach((c: any) => {
            const cId = typeof c === "string" ? c : c?._id;
            if (cId && !groups.has(cId)) {
              groups.set(cId, { name: clientMap.get(cId)?.name || "Cliente desconocido", projects: [] });
            }
          });

          if (groups.size === 0) {
            return <span className="text-xs text-gray-400 italic px-1">Sin clientes ni proyectos asignados</span>;
          }

          return Array.from(groups.values()).map((group, idx) => (
            <div key={idx} className="flex flex-col gap-2 p-2 rounded-lg bg-gray-50/50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800/50">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faBuilding} className="h-3 w-3 text-cyan-600 dark:text-cyan-400" />
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">
                  {group.name}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pl-5">
                {group.projects.length > 0 ? (
                  group.projects.map((p, pIdx) => (
                    <span key={pIdx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 shadow-sm">
                      <FontAwesomeIcon icon={faBriefcase} className="mr-1 opacity-50" />
                      {p.name}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-gray-400 italic">Sin proyectos específicos</span>
                )}
              </div>
            </div>
          ));
        })()}
      </div>
    </Card>
  );
};
