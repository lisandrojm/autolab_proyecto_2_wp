import { useState, useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faPhone, faBriefcase, faCalendar, faSignOutAlt, faUserCheck, faBuilding, faIdCard, faClock, faLayerGroup, faFileContract, faMoneyBillWave, faChevronDown, faCheckCircle, faUserShield, faUsers } from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "../../../../stores/authStore";
import { sweetAlert } from "../utils/sweetAlert";
import { useProfile } from "../hooks/useProfile";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { projectsAPI, Project } from "../../../../api/projects";
import { areasAPI, Area } from "../../../../api/areas";
import { shiftsAPI, Shift } from "../../../../api/shifts";

export default function Profile() {
  const { profile, stats, loading } = useProfile();
  const { user, logout } = useAuthStore();
   const [selectedProjectIndex, setSelectedProjectIndex] = useState(0);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [currentFullProject, setCurrentFullProject] = useState<Project | null>(null);

  const getProjectDetails = (proj: any) => {
    if (!proj) return null;

    const findArea = (id: string) => allAreas.find(a => String(a._id) === String(id));
    const findShift = (id: string) => allShifts.find(s => String(s._id) === String(id));

    // Filter contracts to only those that match this project's ID or name
    const matchedContracts = proj.contracts?.filter((c: any) => {
      if (!c) return false;
      
      // Cross-reference project external/metadata ID if available
      const extProjId = proj.externalProjectId || proj.metadata?.id;
      if (extProjId && c.proyecto_id && Number(c.proyecto_id) !== Number(extProjId)) {
        return false;
      }
      
      // Cross-reference project name
      const projName = proj.nombre_proyecto || proj.name;
      if (projName && c.nombre_proyecto && String(c.nombre_proyecto).toLowerCase() !== String(projName).toLowerCase()) {
        return false;
      }
      
      return true;
    }) || [];

    // Find active contract or just the first one from the matched contracts
    const activeContract =
      matchedContracts.find((c: any) => {
        const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
        if (endDate) endDate.setHours(23, 59, 59, 999);
        return !endDate || endDate.getTime() >= new Date().getTime();
      }) || matchedContracts[0];

    const isResponsable = Number(proj.metadata?.responsableId) === Number(profile?.metadata?.id);

    const shiftNames: string[] = [];
    const detailedShifts: any[] = [];

    const myIds = [profile?.userId, profile?._id, user?._id, profile?.metadata?.id].filter(Boolean).map(id => String(id));

    // Find ALL team configuration entries for this user with robust matching
    const myTeamConfigs = proj.teamConfig?.filter((c: any) => {
      const uid = typeof c.userId === "object" ? (c.userId?._id || c.userId?.id || c.userId?.userId || c.userId?.metadata?.id) : c.userId;
      const myIdsMatch = [profile?.userId, profile?._id, user?._id, profile?.metadata?.id].filter(Boolean).map(id => String(id));
      
      let isMatch = uid && myIdsMatch.includes(String(uid));

      // Fallback to Email match
      if (!isMatch) {
        const uEmail = typeof c.userId === "object" ? (c.userId?.email || c.userId?.correo) : null;
        const myEmail = user?.email || profile?.email;
        if (uEmail && myEmail && String(uEmail).toLowerCase() === String(myEmail).toLowerCase()) isMatch = true;
      }

      // Fallback to Name match
      if (!isMatch) {
        const uName = typeof c.userId === "object" ? (c.userId?.firstName && c.userId?.lastName ? `${c.userId.firstName} ${c.userId.lastName}` : (c.userId?.name || c.userId?.nombre)) : null;
        const myName = user?.name || user?.nombre || `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim();
        if (uName && myName && uName.toLowerCase().includes(myName.toLowerCase())) isMatch = true;
      }

      return isMatch;
    }) || [];

    const coordinatedShiftsGrouped: any[] = [];
    const coordinatedKeys = new Set<string>();

    if (proj.coordinatorAssignments && Array.isArray(proj.coordinatorAssignments)) {
      const grouped = new Map<string, { areaName: string; shifts: { name: string; time: string; order: number }[] }>();

      proj.coordinatorAssignments.forEach((asm: any) => {
        const uid = typeof asm.userId === "object" ? (asm.userId?._id || asm.userId?.id || asm.userId?.userId || asm.userId?.metadata?.id) : asm.userId;
        const myIdsMatch = [profile?.userId, profile?._id, user?._id, profile?.metadata?.id].filter(Boolean).map(id => String(id));
        
        let isMatch = uid && myIdsMatch.includes(String(uid));
        if (!isMatch) {
          const asmEmail = typeof asm.userId === "object" ? (asm.userId?.email || asm.userId?.correo) : null;
          const myEmail = user?.email || profile?.email;
          if (asmEmail && myEmail && String(asmEmail).toLowerCase() === String(myEmail).toLowerCase()) isMatch = true;
        }
        if (!isMatch) {
          const asmName = typeof asm.userId === "object" ? (asm.userId?.firstName && asm.userId?.lastName ? `${asm.userId.firstName} ${asm.userId.lastName}` : (asm.userId?.name || asm.userId?.nombre)) : null;
          const myName = user?.name || user?.nombre || `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim();
          if (asmName && myName && asmName.toLowerCase().includes(myName.toLowerCase())) isMatch = true;
        }

        if (isMatch) {
          const areaId = typeof asm.areaId === "object" ? (asm.areaId?._id || asm.areaId?.id) : asm.areaId;
          const shiftId = typeof asm.shiftId === "object" ? (asm.shiftId?._id || asm.shiftId?.id) : asm.shiftId;
          
          if (areaId && shiftId) {
            coordinatedKeys.add(`${areaId}-${shiftId}`);
          }
          
          const areaObj = findArea(areaId) || ((asm.areaId && typeof asm.areaId === "object" && (asm.areaId.name || asm.areaId.nombre)) ? asm.areaId : null);
          const shiftObj = findShift(shiftId) || ((asm.shiftId && typeof asm.shiftId === "object" && (asm.shiftId.name || asm.shiftId.nombre)) ? asm.shiftId : null);

          const aIdStr = String(areaId);
          const areaName = areaObj?.name || areaObj?.nombre || "Área";
          const shiftName = shiftObj?.name || shiftObj?.nombre || "Turno";

          if (!grouped.has(aIdStr)) {
            grouped.set(aIdStr, { areaName, shifts: [] });
          }
          
          const shifts = grouped.get(aIdStr)!.shifts;
          if (!shifts.some(s => s.name === shiftName)) {
            shifts.push({
              name: shiftName,
              time: (shiftObj?.startTime && shiftObj?.endTime) ? `${shiftObj.startTime} - ${shiftObj.endTime}` : (shiftObj?.hora_inicio && shiftObj?.hora_fin ? `${shiftObj.hora_inicio} - ${shiftObj.hora_fin}` : "Sin horario"),
              order: Number(shiftObj?.order) || 0
            });
          }
        }
      });

      Array.from(grouped.entries()).forEach(([aId, data]) => {
        data.shifts.sort((a, b) => a.order - b.order);
        coordinatedShiftsGrouped.push({ areaId: aId, ...data });
      });
    }

    // Collect all assignments from all matching team configs AND the active contract
    let allStandardAssignments: any[] = [];
    myTeamConfigs.forEach((tc: any) => {
      if (tc.areaShiftAssignments && Array.isArray(tc.areaShiftAssignments)) {
        allStandardAssignments = [...allStandardAssignments, ...tc.areaShiftAssignments];
      }
    });
    if (activeContract?.areaShiftAssignments && Array.isArray(activeContract.areaShiftAssignments)) {
      allStandardAssignments = [...allStandardAssignments, ...activeContract.areaShiftAssignments];
    }

    // Process and deduplicate standard assignments, excluding coordinated ones
    if (allStandardAssignments.length > 0) {
      const seenAssignments = new Set<string>();
      
      allStandardAssignments.forEach((asa: any) => {
        const aId = typeof asa.areaId === "object" ? (asa.areaId?._id || asa.areaId?.id) : asa.areaId;
        const areaObj = findArea(aId);
        const areaName = areaObj?.name || areaObj?.nombre || asa.nombre_area || asa.areaName || "Área";
        
        const processShift = (s: any) => {
          const shiftId = typeof s === "object" ? (s._id || s.id) : s;
          const fullShift = findShift(shiftId);
          const name = fullShift?.name || fullShift?.nombre || s.name || s.nombre || (typeof s === "string" ? s : "Turno");
          
          const uniqueKey = `${areaName}-${name}`.toLowerCase();
          
          if (seenAssignments.has(uniqueKey)) return;
          
          seenAssignments.add(uniqueKey);

          detailedShifts.push({
            name,
            time: fullShift?.hora_inicio && fullShift?.hora_fin ? `${fullShift.hora_inicio} - ${fullShift.hora_fin}` : (s.hora_inicio && s.hora_fin ? `${s.hora_inicio} - ${s.hora_fin}` : (s.startTime && s.endTime ? `${s.startTime} - ${s.endTime}` : "Sin horario")),
            area: areaName,
            order: Number(fullShift?.order || s.order || 0)
          });
          shiftNames.push(name);
        };

        if (asa.shiftIds && Array.isArray(asa.shiftIds)) {
          asa.shiftIds.forEach(processShift);
        } else if (asa.shiftId) {
          processShift(asa.shiftId);
        } else if (asa.shifts && Array.isArray(asa.shifts)) {
          asa.shifts.forEach(processShift);
        }
      });
    }

    // Sort standard detailedShifts list by order
    detailedShifts.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Fallback: if no standard shifts found but coordinator assignments exist,
    // use coordinator assignments as the standard area/turno display
    if (detailedShifts.length === 0 && coordinatedShiftsGrouped.length > 0) {
      coordinatedShiftsGrouped.forEach((group: any) => {
        group.shifts.forEach((s: any) => {
          detailedShifts.push({
            name: s.name,
            time: s.time,
            area: group.areaName,
            order: s.order || 0,
          });
          shiftNames.push(s.name);
        });
      });
    }

    const uniqueShiftNames = Array.from(new Set(shiftNames)).join(", ");

    return {
      name: proj.nombre_proyecto || proj.name || "Sin nombre",
      client: proj.nombre_cliente || "Sin cliente",
      sede: activeContract?.nombre_sede || "Sin sede",
      roleFrame: (proj.nombre_rol_frame && proj.nombre_rol_frame !== "Sin rol frame")
        ? proj.nombre_rol_frame
        : ((activeContract?.nombre_rol_frame && activeContract.nombre_rol_frame !== "Sin rol frame")
          ? activeContract.nombre_rol_frame
          : "Sin rol frame"),
      area: activeContract?.nombre_area || proj.nombre_area || "Sin área",
      schedule: activeContract?.hora_inicio && activeContract?.hora_fin ? `${activeContract.hora_inicio} - ${activeContract.hora_fin}` : "Sin horario",
      isResponsable,
      contractType: activeContract?.nombre_contrato || "Sin contrato",
      salary: activeContract?.sueldo_mano,
      dates: activeContract?.fecha_alta_contrato ? `${format(new Date(activeContract.fecha_alta_contrato), "dd/MM/yy")} - ${activeContract.fecha_baja_contrato ? format(new Date(activeContract.fecha_baja_contrato), "dd/MM/yy") : "Actualidad"}` : "Sin fechas",
      shiftsText: uniqueShiftNames || activeContract?.nombre_turno || "Sin turno",
      detailedShifts,
      coordinatedShifts: coordinatedShiftsGrouped,
    };
  };

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setIsLoadingProjects(true);
        const [projects, areas, shifts] = await Promise.all([
          projectsAPI.listAll(),
          areasAPI.listAll(),
          shiftsAPI.getAll()
        ]);
        setAllProjects(projects);
        setAllAreas(areas);
        setAllShifts(shifts);
      } catch (err) {
        console.error("Error fetching projects for profile:", err);
      } finally {
        setIsLoadingProjects(false);
      }
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    const fetchFullProject = async () => {
      const currentProj = profile?.metadata?.projects?.[selectedProjectIndex];
      const pid = currentProj?._id || currentProj?.projectId;
      if (!pid) return;

      try {
        const fullProj = await projectsAPI.getProject(pid);
        setCurrentFullProject(fullProj);
      } catch (err) {
        console.error("Error fetching full project details:", err);
      }
    };
    if (profile?.metadata?.projects) {
      fetchFullProject();
    }
  }, [selectedProjectIndex, profile]);

  const currentProjectSummary = profile?.metadata?.projects?.[selectedProjectIndex];
  const targetProjectId = currentProjectSummary?._id || currentProjectSummary?.projectId;
  const targetProjectName = currentProjectSummary?.nombre_proyecto || currentProjectSummary?.name;

  const fullProjectDataFromCache = useMemo(() => {
    if (!targetProjectId && !targetProjectName) return null;
    return allProjects.find(p => 
      (targetProjectId && String(p._id) === String(targetProjectId)) || 
      (targetProjectName && (p.name === targetProjectName || p.nombre_proyecto === targetProjectName))
    );
  }, [allProjects, targetProjectId, targetProjectName]);

  const projectToProcess = useMemo(() => {
    if (!currentProjectSummary) return null;
    const baseProject = (currentFullProject || fullProjectDataFromCache || {}) as any;
    return {
      ...baseProject,
      ...currentProjectSummary,
      teamConfig: baseProject.teamConfig || currentProjectSummary.teamConfig,
      coordinatorAssignments: baseProject.coordinatorAssignments || currentProjectSummary.coordinatorAssignments,
    };
  }, [currentFullProject, fullProjectDataFromCache, currentProjectSummary]);

  const selectedProjectInfo = useMemo(() => {
    return getProjectDetails(projectToProcess);
  }, [projectToProcess, profile, allAreas, allShifts]);

  if (loading || isLoadingProjects) return null;

  const isMobileCoordinator = user?.roles?.some((r) => r.toLowerCase().includes("coordinador"));
  const isMobileCollaborator = user?.roles?.some((r) => r.toLowerCase().includes("colaborador"));

  const userRole = isMobileCoordinator ? "Mobile-Coordinador" : isMobileCollaborator ? "Mobile-Colaborador" : "Usuario";
  const roleColor = isMobileCoordinator ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800" : "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20";

  const userProjects = profile?.metadata?.projects || [];

  // 2. Calculate Seniority
  const calculateTotalSeniority = () => {
    if (!profile?.metadata?.projects) return { totalDays: 0, text: "0 días" };

    const totalDays = (profile.metadata.projects || []).reduce(
      (acc: number, p: any) =>
        acc +
        (p.contracts || []).reduce((cAcc: number, c: any) => {
          const start = new Date(c.fecha_alta_contrato);
          const end = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : new Date();
          return cAcc + Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        }, 0),
      0,
    );

    if (totalDays === 0) return { totalDays: 0, text: "0 días" };

    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    const days = totalDays % 30;

    const parts = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
    if (days > 0) parts.push(`${days} ${days === 1 ? "día" : "días"}`);

    return { totalDays, text: parts.join(", ") };
  };

  const seniority = calculateTotalSeniority();

  const handleLogout = async () => {
    const result = await sweetAlert.confirm("¿Cerrar sesión?", "¿Estás seguro de que deseas salir?", "Sí, cerrar sesión", "Cancelar");
    if (result.isConfirmed) {
      logout();
      await sweetAlert.success("Sesión cerrada", "Has salido correctamente");
    }
  };

  return (
    <div className="flex-1 pb-24 px-4 pt-4 space-y-4 animate-in fade-in duration-500">
      {/* Compact Header Section */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900/70 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Mi Perfil</h1>
            <div className={`px-2 py-0.5 rounded-md flex items-center gap-1 ${roleColor}`}>
              <p className="text-[9px] font-black uppercase tracking-tighter">{userRole}</p>
            </div>
          </div>
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400 leading-none">
            {profile?.firstName} {profile?.lastName}
          </p>
          <p className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mt-1.5">ID: {profile?._id?.slice(-6).toUpperCase()}</p>
        </div>
        <button onClick={handleLogout} className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-500 flex items-center justify-center border border-rose-100 dark:border-rose-900/50">
          <FontAwesomeIcon icon={faSignOutAlt} />
        </button>
      </div>

      {/* Stats Section - Compact Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-900/70 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-500">
            <FontAwesomeIcon icon={faClock} size="sm" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 dark:text-slate-100 leading-tight">{seniority.text || "0 días"}</p>
            <p className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">Antigüedad</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900/70 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500">
            <FontAwesomeIcon icon={faBriefcase} size="sm" />
          </div>
          <div>
            <p className="text-lg font-black text-slate-900 dark:text-slate-100 leading-tight">{stats?.vacations?.available || 0}</p>
            <p className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">Vacaciones</p>
          </div>
        </div>
      </div>

      {/* History & Contact - More compact */}
      <div className="bg-white dark:bg-slate-900/70 rounded-2xl p-4 shadow-sm space-y-3 border border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-[1px] bg-slate-100 dark:bg-slate-800"></div>
          <h3 className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Historial y Contacto</h3>
          <div className="flex-1 h-[1px] bg-slate-100 dark:bg-slate-800"></div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-100 dark:border-slate-700">
              <FontAwesomeIcon icon={faCalendar} size="sm" />
            </div>
            <div className="flex justify-between flex-1 items-center">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Ingreso</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{profile?.hireDate ? format(new Date(profile.hireDate), "dd MMM yyyy", { locale: es }) : "N/A"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-100 dark:border-slate-700">
              <FontAwesomeIcon icon={faEnvelope} size="sm" />
            </div>
            <div className="flex justify-between flex-1 items-center overflow-hidden">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Email</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate ml-4">{profile?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-100 dark:border-slate-700">
              <FontAwesomeIcon icon={faPhone} size="sm" />
            </div>
            <div className="flex justify-between flex-1 items-center">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Teléfono</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{profile?.phone || "Sin teléfono"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Project Details Section - Compact version */}
      <div className="bg-white dark:bg-slate-900/70 rounded-2xl p-4 shadow-sm space-y-4 border border-slate-100 dark:border-slate-800">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest flex items-center gap-2">Asignación</h3>
          </div>
          {userProjects.length > 1 && (
            <div className="flex flex-col gap-1 max-w-[220px]">
              <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Seleccionar proyecto</label>
              <div className="relative">
                <select className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-[11px] font-bold pr-8 text-primary focus:ring-2 focus:ring-primary/20 shadow-sm cursor-pointer" value={selectedProjectIndex} onChange={(e) => setSelectedProjectIndex(Number(e.target.value))}>
                  {userProjects.map((p, idx) => (
                    <option key={idx} value={idx}>
                      {p.nombre_proyecto || p.name || `Proyecto ${idx + 1}`}
                    </option>
                  ))}
                </select>
                <FontAwesomeIcon icon={faChevronDown} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[8px] text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        {selectedProjectInfo ? (
          <div key={selectedProjectIndex} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Project Header Compact */}
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[8px] font-black text-primary uppercase tracking-widest">{selectedProjectInfo.client}</span>
              </div>
              <p className="text-base font-black text-slate-900 dark:text-slate-100 leading-tight mb-2">{selectedProjectInfo.name}</p>
              <div className="flex flex-wrap gap-2">
                {selectedProjectInfo.isResponsable ? (
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500 text-white text-[8px] font-black uppercase tracking-wider shadow-sm">
                    <FontAwesomeIcon icon={faUserShield} size="xs" />
                    Responsable de Proyecto
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[8px] font-black uppercase tracking-wider shadow-sm">
                    <FontAwesomeIcon icon={faUsers} size="xs" />
                    Equipo de Proyecto
                  </div>
                )}
                
                {profile?.roleNames?.filter((role: string) => !role.toLowerCase().includes("responsable de proyecto")).map((role: string, idx: number) => {
                  const lowerRole = role.toLowerCase();
                  const isCoord = lowerRole.includes("coordinador");
                  const isColab = lowerRole.includes("colaborador");
                  
                  let badgeStyles = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
                  if (isCoord) badgeStyles = "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800";
                  if (isColab) badgeStyles = "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800";

                  return (
                    <div key={idx} className={`inline-flex items-center px-2 py-1 rounded-md border text-[8px] font-black uppercase tracking-wider ${badgeStyles}`}>
                      {role}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Grid details Compact */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50/50 dark:bg-slate-800/30 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                <p className="text-[8px] font-black text-slate-400 uppercase flex items-center gap-1.5 tracking-widest mb-1">
                  <FontAwesomeIcon icon={faBuilding} className="text-slate-300" /> Sede
                </p>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{selectedProjectInfo.sede}</p>
              </div>
              <div className="bg-slate-50/50 dark:bg-slate-800/30 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                <p className="text-[8px] font-black text-slate-400 uppercase flex items-center gap-1.5 tracking-widest mb-1">
                  <FontAwesomeIcon icon={faIdCard} className="text-slate-300" /> Rol Frame
                </p>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{selectedProjectInfo.roleFrame}</p>
              </div>
            </div>

            {/* Contract Info List Compact */}
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Contrato</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{selectedProjectInfo.contractType}</p>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Vigencia</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{selectedProjectInfo.dates}</p>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Horario</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{selectedProjectInfo.schedule}</p>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/10 mt-2">
                <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Sueldo en mano</p>
                <p className="text-lg font-black text-slate-900 dark:text-slate-100">$ {selectedProjectInfo.salary ? Number(selectedProjectInfo.salary).toLocaleString("es-ES") : "N/A"}</p>
              </div>
            </div>

            {/* Turnos Sections */}
            <div className="space-y-4">
              {/* Standard Assigned Shifts */}
              <div className="space-y-2">
                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest text-center">Area / Turno</p>
                {selectedProjectInfo.detailedShifts.length > 0 ? (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                    <div className="space-y-3">
                      {(() => {
                        const grouped = new Map<string, { areaName: string; shifts: any[] }>();
                        selectedProjectInfo.detailedShifts.forEach((s: any) => {
                          if (!grouped.has(s.area)) grouped.set(s.area, { areaName: s.area, shifts: [] });
                          grouped.get(s.area)!.shifts.push(s);
                        });
                        return Array.from(grouped.values()).map((group, gidx) => (
                          <div key={gidx} className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[9px] bg-blue-500/15 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 flex items-center gap-1 font-black uppercase tracking-widest">
                                <FontAwesomeIcon icon={faLayerGroup} className="text-[8px]" />
                                {group.areaName}
                              </span>
                              {group.shifts.map((s, sidx) => (
                                <span key={sidx} className="text-[9px] bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-500/15 flex items-center gap-1 font-bold uppercase">
                                  <FontAwesomeIcon icon={faClock} className="text-[8px] opacity-70" />
                                  {s.name}{s.time && s.time !== "Sin horario" ? ` (${s.time})` : ""}
                                </span>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-center">
                    <p className="text-[10px] text-slate-400 italic font-medium">Sin turnos asignados</p>
                  </div>
                )}
              </div>

              {/* Coordinated Shifts - Show when coordinator assignments exist */}
              {selectedProjectInfo.coordinatedShifts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest text-center">Area / Turno Coordinada</p>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                    <div className="space-y-3">
                      {selectedProjectInfo.coordinatedShifts.map((group: any, gidx: number) => (
                        <div key={gidx} className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[9px] bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-500/20 flex items-center gap-1 font-black uppercase tracking-widest">
                              <FontAwesomeIcon icon={faLayerGroup} className="text-[8px]" />
                              {group.areaName}
                            </span>
                            {group.shifts.map((s: any, sidx: number) => (
                              <span key={sidx} className="text-[9px] bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-500/15 flex items-center gap-1 font-bold uppercase">
                                <FontAwesomeIcon icon={faClock} className="text-[8px] opacity-70" />
                                {s.name}{s.time && s.time !== "Sin horario" ? ` (${s.time})` : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-10 text-center space-y-3">
            <FontAwesomeIcon icon={faBriefcase} className="text-slate-200 dark:text-slate-800 text-2xl" />
            <p className="text-[10px] text-slate-400 italic font-medium">Sin proyectos asignados</p>
          </div>
        )}
      </div>
    </div>
  );
}
