import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faUsers, faUserShield, faLayerGroup, faUserTie, faUserGraduate, faClock, faBuilding, faIdCard, faBriefcase, faFileContract, faUmbrellaBeach, faChevronDown, faChevronUp, faLock, faInfoCircle, faBell, faTriangleExclamation, faFileInvoice, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { formatCuit } from "../../utils/cuit";
import { noPoseeCuit } from "../contratos/ConstanciaBulk";
import { NombreArca, estadoNombreArca } from "../arca/NombreArca";
import { esperaCuentaBancaria, esperaDatosDeCuenta, motivoSinBancoDe, resumenSinBanco } from "../../utils/bancarios";
import { User } from "../../api/users";
import { Project } from "../../api/projects";
import { Client } from "../../api/clients";
import { Vacation } from "../../api/vacations";
import { RoleFrameItem } from "../../api/roleFrames";
import { Card } from "../ui/Card";
import { InfoModal } from "../ui/InfoModal";
import { MOBILE_ACTIVITY_LOGS } from "../../utils/permisosMobile";

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
  /**
   * Selección masiva, la misma que en la vista de tabla.
   *
   * Las tres van juntas o no va ninguna: sin `onToggleSeleccion` no se dibuja el check, porque un
   * check que no se puede tildar es peor que no tenerlo. `seleccionable` en `false` lo dibuja
   * apagado, con su motivo — que es lo que evita el «tildé 10 y dice 7».
   */
  seleccionado?: boolean;
  seleccionable?: boolean;
  motivoNoSeleccionable?: string;
  onToggleSeleccion?: () => void;
  actions?: {
    icon: any;
    title: string;
    onClick: () => void;
    className?: string;
  }[];
}

export const UserCard: React.FC<UserCardProps> = ({ user, allProjects, allClients, vacations = [], projectContext, userConfig, userLookup, allRoleFrames = [], onClick, actions, seleccionado, seleccionable = true, motivoNoSeleccionable, onToggleSeleccion }) => {
  const [vacationModalOpen, setVacationModalOpen] = React.useState(false);
  const [selectedVacationUser, setSelectedVacationUser] = React.useState<{ id: string; name: string } | null>(null);

  // --- Helper Functions (Replicados de UsersPage para independencia) ---

  const getUserActiveVacation = (userId: string) => {
    if (!vacations || vacations.length === 0) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return vacations.find((v) => {
      const vUserId = typeof v.userId === "object" && v.userId ? (v.userId as any)._id : v.userId;
      if (vUserId !== userId) return false;

      const statusUpper = v.status?.toUpperCase();
      if (statusUpper !== "APPROVED" && statusUpper !== "DELIVERED") return false;

      const start = new Date(v.startDate);
      const end = new Date(v.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      return today >= start && today <= end;
    });
  };

  const formatDateString = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      if (dateStr.includes("-") && dateStr.length >= 10) {
        const parts = dateStr.substring(0, 10).split("-");
        if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
      const d = new Date(dateStr);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const getUserVacationStatus = (userId: string) => {
    return !!getUserActiveVacation(userId);
  };

  const showVacationInfo = (empId: string, empName: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const activeVac = getUserActiveVacation(empId);
    if (!activeVac) return;
    setSelectedVacationUser({ id: empId, name: empName });
    setVacationModalOpen(true);
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

  const isSolicitud = user.metadata?.isSolicitud;
  /** Solicitudes de alta pendientes pedidas para ESTA persona (ver `solicitudesPendientes` en la API). */
  const solicitudesPendientes = user.solicitudesPendientes || [];
  const fullName = isSolicitud && user.metadata?.fullName ? user.metadata.fullName : user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : user.email.split("@")[0];

  // Helper for Project/Client badges in Solicitud
  const solicitudProjectBadges: any[] = [];
  if (isSolicitud && user.metadata?.projectIds) {
    user.metadata.projectIds.forEach((pId: any) => {
      const id = typeof pId === "object" ? pId?._id : pId;
      const project = allProjects.find((p) => p._id === id);
      if (project) {
        solicitudProjectBadges.push({ text: project.name, variant: "cyan" as const });
        const client = allClients.find((c) => c._id === (typeof project.clientId === "object" ? (project.clientId as any)?._id : project.clientId));
        if (client) {
          solicitudProjectBadges.push({ text: client.name, variant: "blue" as const });
        }
      }
    });
  }

  return (
    <Card
      key={user._id}
      onClick={onClick}
      className={`h-full hover:scale-105 hover:shadow-lg transition-all duration-200 ${onClick ? "cursor-pointer" : ""} ${isSolicitud ? "border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-900/10" : ""}`}
      header={{
        title: (
          <div className="flex items-center gap-2 flex-wrap">
            {/* `stopPropagation` porque la tarjeta entera abre la ficha, y tildar no es abrir. */}
            {onToggleSeleccion && (
              <input
                type="checkbox"
                checked={!!seleccionado}
                disabled={!seleccionable}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSeleccion();
                }}
                title={seleccionable ? "Tildar para las acciones masivas" : motivoNoSeleccionable}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              />
            )}
            <span className="truncate">{fullName}</span>
            {(() => {
              const activeVac = getUserActiveVacation(user._id);
              if (!activeVac) return null;
              const dateRangeStr = `Vacaciones: del ${formatDateString(activeVac.startDate)} al ${formatDateString(activeVac.endDate)}`;
              return (
                <button type="button" onClick={(e) => showVacationInfo(user._id, fullName, e)} className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:border-amber-500/30 transition-all shadow-sm cursor-pointer focus:outline-none" title={dateRangeStr}>
                  <FontAwesomeIcon icon={faUmbrellaBeach} className="text-[9px] mr-1" />
                  <span>VACACIONES</span>
                  <FontAwesomeIcon icon={faInfoCircle} className="text-[9px] ml-1 opacity-75 hover:opacity-100" />
                </button>
              );
            })()}
            {user.metadata?.solicitaCreacionCuenta && !user.metadata?.cuentaBancariaConfirmada && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-sm" title="Solicitó que le creen una cuenta bancaria">
                <FontAwesomeIcon icon={faBell} className="text-[9px] animate-pulse" />
                <span>CUENTA BANCARIA</span>
              </span>
            )}
            {user.metadata?.solicitaCambioCuenta && !user.metadata?.cambioCuentaConfirmada && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-sm" title="Solicitó un cambio de datos bancarios (pendiente de aplicar en el banco/FRAME)">
                <FontAwesomeIcon icon={faBell} className="text-[9px] animate-pulse" />
                <span>CAMBIO BANCARIO</span>
              </span>
            )}
          </div>
        ),
        subtitle: user.email,
        icon: faUser,
        iconClassName: isSolicitud ? "text-amber-600" : "text-blue-600",
        badges: [
          ...(isSolicitud ? [{ text: "Solicitud de Contratación", variant: "warning" as const }] : []),
          // Alta pedida para una persona que YA es usuario: se avisa en su propia ficha en vez de
          // crear una tarjeta aparte (el detalle, con el proyecto, va en la sección Proyectos).
          ...(solicitudesPendientes.length > 0 ? [{ text: `⚠ ${solicitudesPendientes.length} solicitud${solicitudesPendientes.length > 1 ? "es" : ""} de alta`, variant: "warning" as const }] : []),
          { text: user.metadata?.activo ? "Activo" : "Inactivo", variant: user.metadata?.activo ? "green" : "destructive" },
          // Sin CUIT/CUIL argentino: sus contratos van por el circuito "Sin CUIT" (el trámite de
          // ARCA queda pendiente). Mismo criterio y mismo estilo que el badge de Contratos.
          ...(noPoseeCuit(user.metadata?.cuit, user.metadata?.sinCuit)
            ? [
                {
                  text: "SIN CUIT",
                  variant: "default" as const,
                  className: "bg-violet-100 text-violet-800 border border-dashed border-violet-500 dark:bg-violet-500/25 dark:text-violet-200 dark:border-violet-400",
                },
              ]
            : []),
          ...solicitudProjectBadges,
          ...(user.isSystem
            ? [
                {
                  text: "Sistema",
                  variant: "default" as const,
                  className: "bg-orange-500/10 text-orange-500 border border-orange-500/50",
                },
              ]
            : []),
        ],
        badgesPosition: "top",
      }}
      footer={actions ? { actions } : undefined}
    >
      {/* DNI, CUIT y Antigüedad */}
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
        {user.metadata?.cuit && (
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
              <FontAwesomeIcon icon={faFileInvoice} className="text-gray-300" />
              CUIT
            </label>
            <div className="text-gray-900 dark:text-gray-100 text-sm font-semibold cursor-text select-all" title="Haz clic para copiar">
              {formatCuit(user.metadata.cuit)}
            </div>
          </div>
        )}
        {/*
          El nombre, validado contra ARCA o no. Mismo indicador que en Usuarios (tabla), en Contratos
          y en Validar obras sociales: un solo dato no puede tener tres formas de mostrarse.

          Se muestra SIEMPRE que haya CUIT, sobre todo cuando NO está validado: un campo que aparece
          solo cuando está bien no permite contestar «¿cuáles me faltan?».
        */}
        {user.metadata?.cuit && !user.metadata?.sinCuit && (
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
              <FontAwesomeIcon icon={faCircleCheck} className="text-gray-300" />
              Nombre
            </label>
            <div className="text-sm">
              <NombreArca estado={estadoNombreArca({ cuit: user.metadata?.cuit, sinCuit: user.metadata?.sinCuit, validadoAt: user.metadata?.nombreValidadoArcaAt })} fecha={user.metadata?.nombreValidadoArcaAt} conTexto />
            </div>
          </div>
        )}
        {/*
          PIDIÓ QUE LE ABRAN UNA CUENTA BANCARIA. Es una tarea de la productora, no un dato de la ficha.

          Sale del registro: la persona declaró «no tengo banco» y autorizó que se le abra una. Ese
          pedido quedaba guardado en su metadata y no lo veía nadie — la ficha se veía igual que la de
          cualquiera sin CBU cargado, así que nunca se sabía a quién había que hacerle el trámite.

          Se apaga solo cuando aparece el CBU (ver `esperaCuentaBancaria`): si alguien ya le cargó la
          cuenta, el pedido está cumplido y el aviso deja de tener sentido, sin que nadie tenga que
          acordarse de bajarle una bandera.
        */}
        {esperaCuentaBancaria(user.metadata) && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-[11.5px] text-amber-800 dark:text-amber-300 leading-snug">
              <strong>Falta abrirle la cuenta bancaria.</strong> Declaró no tener banco y autorizó que se le cree una a su nombre.
            </span>
          </div>
        )}
        {/* Las otras dos situaciones de «No tengo Banco»: trae su cuenta (pendiente hasta que haya CBU) u otra. */}
        {user.metadata?.tipoEntidadFinanciera === "sin_banco" && !user.metadata?.cbu && motivoSinBancoDe(user.metadata) && motivoSinBancoDe(user.metadata) !== "crear_cuenta" && (
          <div className={`flex items-start gap-2 rounded-md border px-2.5 py-2 ${esperaDatosDeCuenta(user.metadata) ? "border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-900/20" : "border-blue-200 dark:border-blue-800/70 bg-blue-50 dark:bg-blue-900/20"}`}>
            <FontAwesomeIcon icon={faTriangleExclamation} className={`h-3 w-3 mt-0.5 shrink-0 ${esperaDatosDeCuenta(user.metadata) ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"}`} />
            <span className={`text-[11.5px] leading-snug ${esperaDatosDeCuenta(user.metadata) ? "text-amber-800 dark:text-amber-300" : "text-blue-800 dark:text-blue-300"}`}>
              <strong>{esperaDatosDeCuenta(user.metadata) ? "Falta que envíe los datos de su cuenta." : "Sin banco."}</strong> {resumenSinBanco(user.metadata)}
            </span>
          </div>
        )}
        {(() => {
          const totalDaysCount =
            (user.metadata?.projects as any[])?.reduce((acc: number, p: any) => {
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
          const projectRespId = projectContext?.metadata?.responsableId;
          const userMetaId = user.metadata?.id;
          const isReallyResponsable = projectRespId && userMetaId && Number(projectRespId) === Number(userMetaId);

          // El rol llamado "Responsable de Proyecto" sigue existiendo y sigue dando permisos de
          // plataforma; lo que ya no da es la elegibilidad, que es el tilde de la ficha. Si la persona
          // ES la responsable de este proyecto, el badge verde lo dice y repetir el rol sobra.
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
              {isReallyResponsable && <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800">Supervisor del Proyecto</span>}
              {filteredRoles.slice(0, 3).map((role) => {
                // Se pinta distinto al rol que carga novedades, que es lo que antes se llamaba «coordinador».
                // Antes se miraba el nombre; ahora el permiso, que es lo que el rol realmente hace.
                const isCoord = (role.permissions || []).includes(MOBILE_ACTIVITY_LOGS);

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
              Rol/es Empresa
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

        {/* Altas pedidas para esta persona y todavía sin aprobar: se muestran acá, junto a sus
            proyectos, en vez de generar una tarjeta de usuario duplicada. */}
        {solicitudesPendientes.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <label className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
              <FontAwesomeIcon icon={faTriangleExclamation} />
              Solicitud de alta pendiente
            </label>
            {solicitudesPendientes.map((s) => (
              <div key={s._id} className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-amber-50/70 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/50">
                <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 text-amber-500 shrink-0" />
                {s.proyectos.length > 0 ? (
                  s.proyectos.map((p) => (
                    <span key={p._id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white dark:bg-gray-900 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-sm">
                      <FontAwesomeIcon icon={faBriefcase} className="mr-1 opacity-50" />
                      {p.name}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-amber-700 dark:text-amber-400 italic">Sin proyecto indicado</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {vacationModalOpen && selectedVacationUser && (
        <InfoModal
          isOpen={vacationModalOpen}
          onClose={() => {
            setVacationModalOpen(false);
            setSelectedVacationUser(null);
          }}
          title={`Vacaciones de ${selectedVacationUser.name}`}
          size="sm"
        >
          <div className="space-y-4 p-2 text-center">
            <div className="w-16 h-16 bg-amber-500/10 dark:bg-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400 border border-amber-500/20 dark:border-amber-500/30 shadow-sm">
              <FontAwesomeIcon icon={faUmbrellaBeach} className="text-3xl animate-pulse text-amber-500" />
            </div>
            <div className="space-y-2">
              <p className="text-base font-semibold text-slate-850 dark:text-slate-200">Período de Vacaciones Activo</p>
              {(() => {
                const activeVac = getUserActiveVacation(selectedVacationUser.id);
                if (!activeVac) return <p className="text-sm text-slate-500">No se encontraron vacaciones activas para este colaborador.</p>;
                return (
                  <div className="inline-block bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-100 dark:border-slate-800 shadow-sm mt-1">
                    <span className="text-lg font-black text-amber-600 dark:text-amber-400">
                      del {formatDateString(activeVac.startDate)} al {formatDateString(activeVac.endDate)}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </InfoModal>
      )}
    </Card>
  );
};
