import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faUsers, faUserShield, faLayerGroup, faUserTie, faUserGraduate, faClock, faBuilding, faIdCard, faBriefcase, faFileContract, faUmbrellaBeach, faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { User } from "../../api/users";
import { Project } from "../../api/projects";
import { Client } from "../../api/clients";
import { Vacation } from "../../api/vacations";
import { RoleFrameItem } from "../../api/roleFrames";
import { Card } from "../ui/Card";

interface UserCardProps {
  user: User;
  allProjects: Project[];
  allClients: Client[];
  vacations: Vacation[];
  projectContext?: Project;
  userConfig?: any; // Configuración del usuario en el contexto de un proyecto (p.ej. shiftId, areaId)
  userLookup?: Map<number | string, string>; // Mapa para buscar nombres de empleados reemplazados
  allRoleFrames?: RoleFrameItem[];
  onClick?: () => void;
  actions?: {
    icon: any;
    title: string;
    onClick: () => void;
    className?: string;
  }[];
}

export const UserCard: React.FC<UserCardProps> = ({ user, allProjects, allClients, vacations = [], projectContext, userConfig, userLookup, allRoleFrames = [], onClick, actions }) => {
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
      let diff = h2 * 60 + m2 - (h1 * 60 + m1);
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
  const projectMap = new Map(allProjects.map((p) => [p._id, p]));
  const clientMap = new Map(allClients.map((c) => [c._id, c]));

  // Metadata del proyecto actual si aplica
  const currentProjectMeta = projectContext
    ? user.metadata?.projects?.find((p: any) => {
        const pId = p.projectId;
        const idToCheck = typeof pId === "object" ? (pId as any)?._id : pId;
        return idToCheck === projectContext._id;
      })
    : null;

  return (
    <Card
      key={user._id}
      onClick={onClick}
      className={`h-full hover:scale-105 hover:shadow-lg transition-all duration-200 ${onClick ? "cursor-pointer" : ""}`}
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
          { text: user.metadata?.activo ? "Activo" : "Inactivo", variant: user.metadata?.activo ? "green" : "destructive" },
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
      {/* DNI y Antigüedad */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {user.metadata?.documento && (
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
              <FontAwesomeIcon icon={faIdCard} className="text-gray-300" />
              Documento
            </label>
            <div className="text-gray-900 dark:text-gray-100 text-sm font-semibold cursor-text select-all" title="Haz clic para copiar">
              {user.metadata.documento}
            </div>

          </div>
        )}
        {(() => {
          const totalDaysCount = (user.metadata?.projects as any[])?.reduce((acc: number, p: any) => {
            return acc + (p.contracts?.reduce((pAcc: number, c: any) => pAcc + (c.cantidad_jornadas_laborales || 0), 0) || 0);
          }, 0) || 0;

          if (totalDaysCount === 0 && !user.metadata?.documento) return null;

          return (
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                <FontAwesomeIcon icon={faClock} className="text-gray-300" />
                Antigüedad Total
              </label>
              <div className="text-gray-900 dark:text-gray-100 text-sm font-semibold">
                {totalDaysCount} {totalDaysCount === 1 ? "día" : "días"}
              </div>

              {totalDaysCount > 0 && <div className="text-[9px] text-gray-400 mt-0.5 ml-1">({totalDaysCount} días en total)</div>}
            </div>
          );
        })()}
      </div>

      {/* Roles */}
      <div className="mb-3">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
          <FontAwesomeIcon icon={faUserShield} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
          Rol/es de Sistema
        </label>
        {(() => {
          const projectRespId = (projectContext?.metadataResolutions as any)?.responsable?._id || projectContext?.metadataResolutions?.responsable?.id || projectContext?.metadata?.responsableId || (projectContext?.metadata as any)?.id_responsable;
          const isReallyResponsable = projectRespId && user.metadata?.id && String(projectRespId) === String(user.metadata.id);

          const filteredRoles = user.roles.filter((r) => {
            const isResponsableRole = r.name.toLowerCase().includes("responsable");
            if (isResponsableRole && isReallyResponsable) return false;
            return true;
          });

          if (filteredRoles.length === 0 && !isReallyResponsable) {
            return <span className="text-xs text-gray-500 dark:text-gray-500">Sin roles</span>;
          }

          return (
            <div className="flex flex-wrap gap-1">
              {isReallyResponsable && <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800">Responsable de Proyecto</span>}
              {filteredRoles.slice(0, 3).map((role) => {
                const lower = role.name.toLowerCase();
                const isCoord = lower.includes("coordinador");

                let classes = "bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-300";
                if (isCoord) {
                  classes = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800";
                }

                return (
                  <span key={role._id} className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${classes}`}>
                    {role.name}
                  </span>
                );
              })}
              {filteredRoles.length > 3 && <span className="text-xs text-gray-500 dark:text-gray-500">+{filteredRoles.length - 3} más</span>}
            </div>
          );
        })()}
      </div>

      {/* Role Frame */}
      {(() => {
        const rfIds = user.metadata?.rolesFrameIds || (user.metadata as any)?.roles_frame;
        if (!rfIds || rfIds.length === 0) return null;

        return (
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
              <FontAwesomeIcon icon={faLayerGroup} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
              Rol/es Frame
            </label>
            <div className="flex flex-wrap gap-1">
              {rfIds.map((rf: any, idx: number) => {
                const roleFrameId = typeof rf === "string" ? rf : rf._id;
                const roleFrameObj = allRoleFrames.find((item) => item._id === roleFrameId);
                const roleFrameName = roleFrameObj ? roleFrameObj.name : typeof rf === "object" ? rf.name : roleFrameId;

                return (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold bg-purple-600 text-white dark:bg-purple-900 dark:text-purple-300 shadow-sm uppercase tracking-tight">
                    {roleFrameName}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Clientes y Proyectos Agrupados */}
      <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-800">
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

          // 2. Asegurar que los clientes asignados directamente también aparezcan
          user.clientIds?.forEach((c: any) => {
            const cId = typeof c === "string" ? c : c?._id;
            if (cId && !groups.has(cId)) {
              groups.set(cId, { name: clientMap.get(cId)?.name || "Cliente desconocido", projects: [] });
            }
          });

          if (groups.size === 0) {
            return (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faUsers} className="text-gray-300" />
                    Clientes
                  </label>
                  <span className="text-[10px] text-gray-400 italic">Sin clientes</span>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faBriefcase} className="text-gray-300" />
                    Proyectos
                  </label>
                  <span className="text-[10px] text-gray-400 italic">Sin proyectos</span>
                </div>
              </div>
            );
          }

          return (
            <div className="space-y-2">
              <div className="grid grid-cols-[120px_1fr] gap-4 px-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faUsers} className="text-gray-300" />
                  Clientes
                </label>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faBriefcase} className="text-gray-300" />
                  Proyectos
                </label>
              </div>
              
              <div className="space-y-1.5">
                {Array.from(groups.values()).map((group, idx) => (
                  <div key={idx} className="grid grid-cols-[120px_1fr] gap-4 p-2 rounded-lg bg-gray-50/50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800/50 items-start">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 shadow-sm uppercase truncate" title={group.name}>
                      {group.name}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {group.projects.length > 0 ? (
                        group.projects.map((p, pIdx) => (
                          <span key={pIdx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <FontAwesomeIcon icon={faBriefcase} className="mr-1 opacity-50" />
                            {p.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-gray-400 italic py-0.5">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </Card>
  );
};
