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

      <div className="flex flex-wrap gap-3">
        {/* Área */}
        <div className="flex flex-col">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
            <FontAwesomeIcon icon={faLayerGroup} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
            Área
          </label>
          {typeof user.areaId === "object" && user.areaId?.name ? (
            <div className="flex flex-wrap gap-1">
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-300">{user.areaId.name}</span>
            </div>
          ) : (
            <span className="text-xs text-gray-400">Sin área</span>
          )}
        </div>

        {/* Cargo */}
        <div className="flex flex-col">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
            <FontAwesomeIcon icon={faUserTie} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
            Cargo
          </label>
          {typeof user.positionId === "object" && user.positionId?.name ? <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">{user.positionId.name}</span> : <span className="text-xs text-gray-400">Sin cargo</span>}
        </div>

        {/* Nivel */}
        <div className="flex flex-col">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
            <FontAwesomeIcon icon={faUserGraduate} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
            Nivel
          </label>
          {typeof user.levelId === "object" && user.levelId?.name ? <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">{user.levelId.name}</span> : <span className="text-xs text-gray-400">Sin nivel</span>}
        </div>

        {/* Turno */}
        <div className="flex flex-col">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
            <FontAwesomeIcon icon={faClock} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
            Turno
          </label>
          {(() => {
            // Lógica de turno: Prioriza proyecto si hay contexto, sino base del usuario
            const shiftIdFromUser = user.turnos && user.turnos.length > 0 ? (typeof user.turnos[0] === "object" ? (user.turnos[0] as any)._id : user.turnos[0]) : undefined;
            
            // Si hay contexto de proyecto, buscamos el turno allí
            if (projectContext) {
              const finalShiftId = userConfig?.shiftId || shiftIdFromUser;
              const shiftInProject = (projectContext.turnos || []).find((t: any) => (typeof t === "object" ? t._id : t) === finalShiftId);
              
              if (shiftInProject) {
                return (
                  <div className="flex flex-col border border-indigo-100 dark:border-indigo-900/30 rounded p-1 bg-indigo-50/30 dark:bg-indigo-900/10">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-300 w-fit">
                      {typeof shiftInProject === "object" ? shiftInProject.name : "..."}
                    </span>
                    <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium ml-0.5 mt-0.5 tracking-tight italic">
                      {shiftInProject.startTime} - {shiftInProject.endTime}
                    </span>
                  </div>
                );
              }
            }
            
            // Fallback al turno base del usuario si no hay contexto o no se encontró en el proyecto
            const baseShift = (user.turnos && user.turnos.length > 0 && typeof user.turnos[0] === 'object') ? user.turnos[0] : null;
            if (baseShift) {
              return (
                <div className="flex flex-col">
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 w-fit">
                    {(baseShift as any).name}
                  </span>
                  {(baseShift as any).startTime && (
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 ml-1 italic">
                      {(baseShift as any).startTime} - {(baseShift as any).endTime}
                    </span>
                  )}
                </div>
              );
            }

            return <span className="text-xs text-gray-400">Sin turno</span>;
          })()}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-3">
        {/* Sede */}
        <div className="flex flex-col">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
            <FontAwesomeIcon icon={faBuilding} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
            Sede
          </label>
          {(() => {
            const sedes = getActiveSedes(user);
            return sedes.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {sedes.map((sede, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                    {sede}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-gray-400">Sin sede</span>
            );
          })()}
        </div>

        {/* Rol Frame */}
        <div className="flex flex-col">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
            <FontAwesomeIcon icon={faIdCard} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
            Rol Frame
          </label>
          {currentProjectMeta?.nombre_rol_frame || (user.externalInfo?.rolFrames && user.externalInfo.rolFrames.length > 0) ? (
            <div className="flex flex-wrap gap-1">
              {currentProjectMeta?.nombre_rol_frame ? (
                <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${currentProjectMeta.nombre_rol_frame.toLowerCase().includes("responsable") ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800" : "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800"}`}>
                  {currentProjectMeta.nombre_rol_frame}
                </span>
              ) : (
                user.externalInfo?.rolFrames?.map((rf: any, idx: number) => (
                  <span key={idx} className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${rf.toLowerCase().includes("responsable") ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800" : "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800"}`}>
                    {rf}
                  </span>
                ))
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-400">Sin rol frame</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-3">
        {/* Clientes */}
        <div className="flex flex-col">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
            <FontAwesomeIcon icon={faBriefcase} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
            Clientes
          </label>
          {(() => {
            const uniqueClients = new Set<string>();
            if (user.clientIds && user.clientIds.length > 0) {
              user.clientIds.forEach((c: any) => {
                const cId = typeof c === "string" ? c : c._id;
                if (cId) uniqueClients.add(cId);
              });
            }
            if (user.projectIds && user.projectIds.length > 0) {
              user.projectIds.forEach((p: any) => {
                const pId = typeof p === "string" ? p : p._id;
                const pFull = projectMap.get(pId) || (typeof p === "object" ? p : null);
                if (pFull) {
                  const c = pFull.clientId;
                  if (c) {
                    const cId = typeof c === "object" ? (c as any)._id : c;
                    if (cId) uniqueClients.add(cId);
                  }
                }
              });
            }
            const clientList = Array.from(uniqueClients).map((cid) => {
              const client = clientMap.get(cid);
              return client ? client.name : null;
            }).filter(Boolean);

            if (clientList.length > 0) {
              return (
                <div className="flex flex-wrap gap-1">
                  {clientList.map((name, idx) => (
                    <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                      {name}
                    </span>
                  ))}
                </div>
              );
            }
            return <span className="text-xs text-gray-400">Sin clientes</span>;
          })()}
        </div>

        {/* Otros Proyectos */}
        {!projectContext && (
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
              <FontAwesomeIcon icon={faBriefcase} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
              Proyectos
            </label>
            {user.projectIds && user.projectIds.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {user.projectIds.map((projectItem) => {
                  const pId = typeof projectItem === "object" ? (projectItem as any)._id : projectItem;
                  const pFull = projectMap.get(pId);
                  if (!pFull) return null;
                  return (
                    <span key={pId} className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                      {pFull.name}
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="text-xs text-gray-400">Sin proyectos</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mt-3">
        {/* Tipo de Contrato */}
        <div className="flex flex-col">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
            <FontAwesomeIcon icon={faFileContract} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
            Tipo Contrato
          </label>
          {getActiveContractType(user) ? (
            <div className="flex gap-2 items-center flex-wrap">
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">{getActiveContractType(user)}</span>
              {getActiveSchedule(user) && (
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                  <FontAwesomeIcon icon={faClock} className="mr-1 h-3 w-3" />
                  {getActiveSchedule(user)}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-400">Sin contrato activo</span>
          )}
        </div>
      </div>

      {/* Reemplazo */}
      {(isReplacement(user) || getReplacedEmployeeId(user)) && (
        <div className="flex flex-wrap gap-6 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          {isReplacement(user) && (
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                <FontAwesomeIcon icon={faUser} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
                Reemplazo
              </label>
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-300 w-fit">Sí</span>
            </div>
          )}
          {getReplacedEmployeeId(user) && (
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                <FontAwesomeIcon icon={faUser} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
                Reemplaza a
              </label>
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 w-fit">
                {(() => {
                  const rId = getReplacedEmployeeId(user);
                  return userLookup?.get(rId!) || `ID: ${rId}`;
                })()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Custom Schedule Indicator */}
      {userConfig && (userConfig.useProjectSchedule === false || (userConfig.startTime && userConfig.endTime)) && (
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-3 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded w-fit">
          <FontAwesomeIcon icon={faClock} /> Horario Personal: {userConfig.startTime} - {userConfig.endTime} 
          <span className="opacity-70 ml-1 text-[10px]">({calculateDuration(userConfig.startTime, userConfig.endTime)})</span>
        </div>
      )}
    </Card>
  );
};
