import React, { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faEdit, faTrash, faBan, faLayerGroup, faToggleOn, faToggleOff, faUserTie, faGraduationCap, faTriangleExclamation, faBriefcase, faIdCard, faClock, faBuilding } from "@fortawesome/free-solid-svg-icons";
import { vacationOverlapsAPI, VacationOverlap } from "../../api/vacationOverlaps";
import { areasAPI, Area } from "../../api/areas";
import { clientsAPI, Client } from "../../api/clients";
import { positionsAPI, Position } from "../../api/positions";
import { levelsAPI, Level } from "../../api/levels";
import { projectsAPI, Project } from "../../api/projects";
import { roleFrameAPI, RoleFrameItem } from "../../api/roleFrames";
import { usersAPI, User } from "../../api/users";
import { sweetAlert } from "../../utils/sweetAlert";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";

// Schema validación Zod
const overlapSchema = z.object({
  areaId: z.string().optional(),
  positionId: z.string().optional(),
  levelId: z.string().optional(),
  projectId: z.string().optional(),
  clientId: z.string().optional(),
  roleFrameId: z.string().optional(),
  maxSimultaneousUsers: z.number().min(1, "Mínimo 1 usuario"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  useActiveContractSchedule: z.boolean().default(false),
});

type OverlapFormData = z.infer<typeof overlapSchema>;

export const VacationOverlapRules: React.FC = () => {
  const [rules, setRules] = useState<VacationOverlap[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [roleFrames, setRoleFrames] = useState<RoleFrameItem[]>([]);

  const [allUsers, setAllUsers] = useState<User[]>([]);

  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<VacationOverlap | null>(null);
  // Removed unused selectedClientId

  // State for eligible users in the form
  const [eligibleUsers, setEligibleUsers] = useState<User[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<OverlapFormData>({
    resolver: zodResolver(overlapSchema),
    defaultValues: {
      areaId: "",
      positionId: "",
      levelId: "",
      projectId: "",
      roleFrameId: "",
      maxSimultaneousUsers: 1,
      isActive: true,
      useActiveContractSchedule: false,
    },
  });

  // Watch individual fields to prevent infinite loops caused by object instability
  const wAreaId = watch("areaId");
  const wPositionId = watch("positionId");
  const wLevelId = watch("levelId");
  const wProjectId = watch("projectId");
  const wClientId = watch("clientId");
  const wRoleFrameId = watch("roleFrameId");
  const wUseActiveContractSchedule = watch("useActiveContractSchedule");

  // Dynamic Options filtering based on Project
  const availableOptions = useMemo(() => {
    const selectedProjectId = wProjectId;

    if (!selectedProjectId) {
      return {
        roleFrames: roleFrames,
        areas: areas,
        positions: positions,
        levels: levels,
        roleFramesDisabled: false,
        areasDisabled: false,
        positionsDisabled: false,
        levelsDisabled: false,
      };
    }

    // Filter users in selected project
    const projectUsers = allUsers.filter((user) => {
      const userProjects = user.projectIds?.map((p: any) => (typeof p === "object" ? p._id : p)) || [];
      return userProjects.map(String).includes(selectedProjectId);
    });

    if (projectUsers.length === 0) {
      return {
        roleFrames: [],
        areas: [],
        positions: [],
        levels: [],
        roleFramesDisabled: true,
        areasDisabled: true,
        positionsDisabled: true,
        levelsDisabled: true,
      };
    }

    // Extract unique IDs present in these users
    const validAreaIds = new Set<string>();
    const validPositionIds = new Set<string>();
    const validLevelIds = new Set<string>();
    const validRoleFrameIds = new Set<string>();

    projectUsers.forEach((user) => {
      const aId = typeof user.areaId === "object" ? user.areaId?._id : user.areaId;
      if (aId) validAreaIds.add(String(aId));
      const pId = typeof user.positionId === "object" ? user.positionId?._id : user.positionId;
      if (pId) validPositionIds.add(String(pId));
      const lId = typeof user.levelId === "object" ? user.levelId?._id : user.levelId;
      if (lId) validLevelIds.add(String(lId));

      user.metadata?.projects?.forEach((m: any) => {
        const rf = roleFrames.find((r) => r.externalId == m.rol_frame_id || r.data?.rol?.id == m.rol_frame_id);
        if (rf) validRoleFrameIds.add(String(rf._id));

        if (!rf && m.nombre_rol_frame) {
          const rfByName = roleFrames.find((r) => r.name && r.name.toLowerCase() === String(m.nombre_rol_frame).trim().toLowerCase());
          if (rfByName) validRoleFrameIds.add(String(rfByName._id));
        }
      });

      user.externalInfo?.rolFrames?.forEach((rfName: string) => {
        const rfByName = roleFrames.find((r) => r.name && r.name.toLowerCase() === String(rfName).trim().toLowerCase());
        if (rfByName) validRoleFrameIds.add(String(rfByName._id));
      });
    });

    return {
      roleFrames: roleFrames.filter((r) => validRoleFrameIds.has(String(r._id))),
      areas: areas.filter((a) => validAreaIds.has(String(a._id))),
      positions: positions.filter((p) => validPositionIds.has(String(p._id))),
      levels: levels.filter((l) => validLevelIds.has(String(l._id))),
      roleFramesDisabled: validRoleFrameIds.size === 0,
      areasDisabled: true,
      positionsDisabled: true,
      levelsDisabled: true,
    };
  }, [wProjectId, allUsers, roleFrames, areas, positions, levels]);

  // Reset fields if disabled or invalid after filter change
  useEffect(() => {
    if (availableOptions.areasDisabled && wAreaId) setValue("areaId", "");
    if (availableOptions.positionsDisabled && wPositionId) setValue("positionId", "");
    if (availableOptions.levelsDisabled && wLevelId) setValue("levelId", "");
    if (availableOptions.roleFramesDisabled && wRoleFrameId) setValue("roleFrameId", "");
  }, [availableOptions, wAreaId, wPositionId, wLevelId, wRoleFrameId, setValue]);

  // Manual registration for custom controls ensuring boolean handling
  useEffect(() => {
    register("useActiveContractSchedule");
  }, [register]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [rulesData, areasData, positionsData, levelsData, projectsData, roleFrameData, usersData, clientsData] = await Promise.all([vacationOverlapsAPI.list(), areasAPI.list({ limit: 100 }), positionsAPI.listAll(), levelsAPI.listAll(), projectsAPI.listAll(), roleFrameAPI.list(), usersAPI.list({ limit: 10000, isActive: true }), clientsAPI.listAll()]);

      setRules(rulesData);
      setClients(clientsData);
      setAreas(areasData.areas);
      setPositions(positionsData);
      setLevels(levelsData);
      setProjects(projectsData);
      setRoleFrames(roleFrameData);
      setAllUsers(usersData.users || []);
    } catch (error) {
      console.error(error);
      sweetAlert.error("Error", "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter users based on selected criteria
  useEffect(() => {
    if (!modalOpen) return;

    // Use explicit empty strings for safe checks
    const areaId = wAreaId || "";
    const positionId = wPositionId || "";
    const levelId = wLevelId || "";
    const projectId = wProjectId || "";
    const clientId = wClientId || "";
    const roleFrameId = wRoleFrameId || "";

    // If no criteria selected, show ALL users (Global Rule)
    if (!areaId && !positionId && !levelId && !projectId && !roleFrameId && !clientId) {
      setEligibleUsers(allUsers);
      return;
    }

    const filtered = allUsers.filter((user) => {
      let match = true;

      // ... (Area, Position, Level checks remain same but technically hidden) ...
      if (areaId) {
        const uAreaId = typeof user.areaId === "object" ? user.areaId?._id : user.areaId;
        if (String(uAreaId || "") !== areaId) match = false;
      }

      if (match && positionId) {
        const uPosId = typeof user.positionId === "object" ? user.positionId?._id : user.positionId;
        if (String(uPosId || "") !== positionId) match = false;
      }

      if (match && levelId) {
        const uLevelId = typeof user.levelId === "object" ? user.levelId?._id : user.levelId;
        if (String(uLevelId || "") !== levelId) match = false;
      }

      // Check Project
      if (match && projectId) {
        // user.projectIds is array of ObjectId/Strings
        const userProjects = user.projectIds?.map((p: any) => (typeof p === "object" ? p._id : p)) || [];
        // Ensure string comparison
        if (!userProjects.map(String).includes(projectId)) match = false;
      }

      // Check Client (if NO project selected, because if project is selected, client is implied/enforced by UI usually)
      // Actually, check if user is in ANY project of this client
      if (match && clientId) {
        // Find all projects of this user
        const userProjectIds = user.projectIds?.map((p: any) => (typeof p === "object" ? p._id : p)) || [];

        // Find if any of these projects belong to the selected client
        const belongsToClient = userProjectIds.some((pid) => {
          const proj = projects.find((p) => p._id === String(pid));
          if (!proj) return false;

          const pClientId = typeof proj.clientId === "object" ? proj.clientId._id : proj.clientId;
          return String(pClientId) === clientId;
        });

        if (!belongsToClient) match = false;
      }

      if (match && roleFrameId) {
        // ... (existing role logic) ...
        // Check metadata.projects for rol_frame_id
        // roleFrameId is the _id from DB. We need to find the RoleFrame object to compare externalId/ids/names
        const targetRoleFrame = roleFrames.find((rf) => rf._id === roleFrameId);
        if (targetRoleFrame) {
          let hasRole = false;

          // 1. Check metadata.projects by ID
          const userExtProjects = user.metadata?.projects || [];
          if (
            userExtProjects.some((p: any) => {
              return String(p.rol_frame_id) === String(targetRoleFrame.externalId) || String(p.rol_frame_id) === String(targetRoleFrame.data?.rol?.id);
            })
          ) {
            hasRole = true;
          }

          // 2. Check metadata.projects by Name (nombre_rol_frame)
          if (!hasRole && targetRoleFrame.name) {
            if (userExtProjects.some((p: any) => p.nombre_rol_frame && String(p.nombre_rol_frame).trim().toLowerCase() === String(targetRoleFrame.name).trim().toLowerCase())) {
              hasRole = true;
            }
          }

          // 3. Check externalInfo.rolFrames (array of strings, assume names)
          if (!hasRole && targetRoleFrame.name && user.externalInfo?.rolFrames) {
            if (user.externalInfo.rolFrames.some((rfName: string) => String(rfName).trim().toLowerCase() === String(targetRoleFrame.name).trim().toLowerCase())) {
              hasRole = true;
            }
          }

          if (!hasRole) match = false;
        } else {
          // If role frame logic is active but not found, maybe no match?
          match = false;
        }
      }

      if (match && wUseActiveContractSchedule) {
        // Check if user has any active contract with start/end time
        const hasSchedule = user.metadata?.projects?.some((p) => p.contracts?.some((c) => c.hora_inicio && c.hora_fin));
        if (!hasSchedule) match = false;
      }

      return match;
    });

    setEligibleUsers(filtered);
  }, [allUsers, wAreaId, wPositionId, wLevelId, wProjectId, wClientId, wRoleFrameId, wUseActiveContractSchedule, modalOpen, roleFrames]);

  const openCreate = () => {
    setEditingRule(null);
    reset({
      areaId: "",
      positionId: "",
      levelId: "",
      projectId: "",
      clientId: "",
      roleFrameId: "",
      maxSimultaneousUsers: 1,
      description: "",
      isActive: true,
      useActiveContractSchedule: false,
    });
    setModalOpen(true);
  };

  const openEdit = (rule: VacationOverlap) => {
    setEditingRule(rule);

    // Normalize IDs (they might be objects or strings)
    const getId = (val: any) => (typeof val === "object" && val !== null ? val._id : val || "");

    // Determine client ID
    let cId = getId(rule.clientId);
    if (!cId && rule.projectId) {
      // Fallback logic
      const pId = getId(rule.projectId);
      const proj = projects.find((p) => p._id === pId);
      if (proj) {
        cId = getId(proj.clientId);
      }
    }

    reset({
      areaId: getId(rule.areaId),
      positionId: getId(rule.positionId),
      levelId: getId(rule.levelId),
      projectId: getId(rule.projectId),
      clientId: cId,
      roleFrameId: getId(rule.roleFrameId),
      maxSimultaneousUsers: rule.maxSimultaneousUsers,
      description: rule.description || "",
      isActive: rule.isActive,
      useActiveContractSchedule: rule.useActiveContractSchedule || false,
    });
    setModalOpen(true);
  };

  const onSubmit = async (data: OverlapFormData) => {
    try {
      // Clean empty strings to undefined
      // Clean empty strings to undefined
      const payload = {
        areaId: data.areaId || undefined,
        positionId: data.positionId || undefined,
        levelId: data.levelId || undefined,
        projectId: data.projectId || undefined,
        clientId: data.clientId || undefined,
        roleFrameId: data.roleFrameId || undefined,
        maxSimultaneousUsers: data.maxSimultaneousUsers,
        description: data.description,
        isActive: data.isActive,
        useActiveContractSchedule: !!data.useActiveContractSchedule, // Ensure boolean
      };

      if (eligibleUsers.length > 0 && data.maxSimultaneousUsers > eligibleUsers.length) {
        // Warn but allow? Or block? Previous code blocked.
        setError("maxSimultaneousUsers", {
          type: "manual",
          message: `El máximo no puede ser mayor al total de usuarios coincidentes (${eligibleUsers.length})`,
        });
        return;
      }

      // If 0 users match, maybe warn?
      if (eligibleUsers.length === 0) {
        const confirm = await sweetAlert.confirm("¿Estás seguro?", "No hay usuarios que coincidan con estos criterios actualmente. ¿Deseas crear la regla de todos modos?");
        if (!confirm.isConfirmed) return;
      }

      if (editingRule) {
        await vacationOverlapsAPI.update(editingRule._id, payload);
        sweetAlert.success("Actualizado", "Regla actualizada correctamente");
      } else {
        await vacationOverlapsAPI.create(payload);
        sweetAlert.success("Creado", "Regla creada correctamente");
      }
      setModalOpen(false);
      fetchData();
    } catch (error: any) {
      console.error(error);
      const msg = error.response?.data?.error || "Error al guardar";
      sweetAlert.error("Error", msg);
    }
  };

  const handleToggleActive = async (rule: VacationOverlap) => {
    try {
      await vacationOverlapsAPI.update(rule._id, { isActive: !rule.isActive });
      const updatedRules = rules.map((r) => (r._id === rule._id ? { ...r, isActive: !r.isActive } : r));
      setRules(updatedRules);
      sweetAlert.success("Estado actualizado", `La regla ahora está ${!rule.isActive ? "activa" : "inactiva"}`);
    } catch (error) {
      console.error(error);
      sweetAlert.error("Error", "No se pudo actualizar el estado");
      fetchData();
    }
  };

  const handleDelete = async (rule: VacationOverlap) => {
    const confirm = await sweetAlert.confirm("Eliminar regla", "¿Estás seguro de eliminar esta regla de solapamiento?");
    if (confirm.isConfirmed) {
      try {
        await vacationOverlapsAPI.remove(rule._id);
        sweetAlert.success("Eliminado", "Regla eliminada");
        fetchData();
      } catch (error) {
        sweetAlert.error("Error", "No se pudo eliminar");
      }
    }
  };

  // Helper to count users for a specific rule (for the list view)
  const getRuleUserCount = (rule: VacationOverlap) => {
    // This is expensive to calculate for every row if users array is large.
    // But we have allUsers in memory.
    const rAreaId = typeof rule.areaId === "object" ? rule.areaId?._id : rule.areaId;
    const rPosId = typeof rule.positionId === "object" ? rule.positionId?._id : rule.positionId;
    const rLevelId = typeof rule.levelId === "object" ? rule.levelId?._id : rule.levelId;
    const rProjId = typeof rule.projectId === "object" ? rule.projectId?._id : rule.projectId;
    const rClientId = typeof rule.clientId === "object" ? rule.clientId?._id : rule.clientId;
    const rRoleFrameId = typeof rule.roleFrameId === "object" ? rule.roleFrameId?._id : rule.roleFrameId;

    return allUsers.filter((user) => {
      let match = true;

      if (rAreaId) {
        const uAreaId = typeof user.areaId === "object" ? user.areaId?._id : user.areaId;
        if (uAreaId !== rAreaId) match = false;
      }
      if (match && rPosId) {
        const uPosId = typeof user.positionId === "object" ? user.positionId?._id : user.positionId;
        if (uPosId !== rPosId) match = false;
      }
      if (match && rLevelId) {
        const uLevelId = typeof user.levelId === "object" ? user.levelId?._id : user.levelId;
        if (uLevelId !== rLevelId) match = false;
      }
      if (match && rProjId) {
        const userProjects = user.projectIds?.map((p: any) => (typeof p === "object" ? p._id : p)) || [];
        if (!userProjects.includes(rProjId)) match = false;
      }
      if (match && rClientId) {
        const userProjectIds = user.projectIds?.map((p: any) => (typeof p === "object" ? p._id : p)) || [];
        const belongsToClient = userProjectIds.some((pid) => {
          const proj = projects.find((p) => p._id === String(pid));
          if (!proj) return false;
          const pClientId = typeof proj.clientId === "object" ? proj.clientId._id : proj.clientId;
          return String(pClientId) === rClientId;
        });
        if (!belongsToClient) match = false;
      }
      if (match && rRoleFrameId) {
        const targetRoleFrame = roleFrames.find((rf) => rf._id === rRoleFrameId);
        if (targetRoleFrame) {
          const userExtProjects = user.metadata?.projects || [];
          // 1. check ID
          let hasRole = userExtProjects.some((p: any) => p.rol_frame_id == targetRoleFrame.externalId || p.rol_frame_id == targetRoleFrame.data?.rol?.id);

          // 2. check Name (metadata)
          if (!hasRole && targetRoleFrame.name) {
            hasRole = userExtProjects.some((p: any) => p.nombre_rol_frame && String(p.nombre_rol_frame).trim().toLowerCase() === String(targetRoleFrame.name).trim().toLowerCase());
          }

          // 3. check Name (external)
          if (!hasRole && targetRoleFrame.name && user.externalInfo?.rolFrames) {
            hasRole = user.externalInfo.rolFrames.some((rf: string) => String(rf).trim().toLowerCase() === String(targetRoleFrame.name).trim().toLowerCase());
          }

          if (!hasRole) match = false;
        } else {
          match = false;
        }
      }

      if (match && rule.useActiveContractSchedule) {
        const hasSchedule = user.metadata?.projects?.some((p) => p.contracts?.some((c) => c.hora_inicio && c.hora_fin));
        if (!hasSchedule) match = false;
      }

      return match;
    }).length;
  };

  if (loading) return <LoadingSpinner message="Cargando reglas..." />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Reglas de Solapamiento</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Define cuántas personas pueden estar de vacaciones simultáneamente según combinaciones de criterios.</p>
        </div>
        <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors">
          <FontAwesomeIcon icon={faPlus} />
          Nueva Regla
        </button>
      </div>

      {rules.length === 0 ? (
        <EmptyState icon={faBan} title="No hay reglas definidas" description="Crea reglas para restringir el solapamiento de vacaciones." action={{ label: "Crear Regla", onClick: openCreate }} />
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded overflow-hidden border border-gray-200 dark:border-gray-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Proyecto</th>
                <th className="px-6 py-3 font-medium">Role Frame</th>
                <th className="px-6 py-3 font-medium text-center">Horario Contrato</th>
                <th className="px-6 py-3 font-medium">Máx. Simultáneos</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rules.map((rule) => {
                const userCount = getRuleUserCount(rule);
                const limitExceeded = rule.maxSimultaneousUsers > userCount && userCount > 0;

                return (
                  <tr key={rule._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    {/* Col 1: Cliente */}
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white align-top">
                      {(() => {
                        let clientName = "";
                        if (rule.clientId) {
                          const client = typeof rule.clientId === "object" ? rule.clientId : clients.find((c) => c._id === rule.clientId);
                          clientName = client?.name || "";
                        } else if (rule.projectId) {
                          const proj = typeof rule.projectId === "object" ? rule.projectId : projects.find((p) => p._id === rule.projectId);
                          if (proj) {
                            const pClientId = typeof proj.clientId === "object" ? proj.clientId._id : proj.clientId;
                            const client = clients.find((cl) => cl._id === pClientId);
                            clientName = client?.name || "";
                          }
                        }

                        return clientName ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 w-fit">
                            <FontAwesomeIcon icon={faBuilding} className="text-[10px]" /> {clientName}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic text-xs">Todos (Global)</span>
                        );
                      })()}
                    </td>

                    {/* Col 2: Proyecto */}
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white align-top">
                      {rule.projectId ? (
                        (() => {
                          const proj = typeof rule.projectId === "object" ? rule.projectId : projects.find((p) => p._id === rule.projectId);
                          let projName = proj?.name || "Desconocido";

                          if (proj) {
                            const fullProj = projects.find((p) => p._id === (proj._id || String(rule.projectId)));
                            if (fullProj) projName = fullProj.name;
                          }

                          return (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-600 text-white dark:bg-blue-900 dark:text-blue-300 w-fit">
                              <FontAwesomeIcon icon={faBriefcase} className="text-[10px]" /> {projName}
                            </span>
                          );
                        })()
                      ) : (
                        <span className="text-gray-400 italic text-xs">—</span>
                      )}
                    </td>

                    {/* Col 3: Role Frame */}
                    <td className="px-6 py-4 align-top">
                      {rule.roleFrameId ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          <FontAwesomeIcon icon={faIdCard} className="text-[10px]" /> {typeof rule.roleFrameId === "object" ? rule.roleFrameId.name : roleFrames.find((r) => r._id === rule.roleFrameId)?.name}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">—</span>
                      )}
                    </td>

                    {/* Col 4: Horario Contrato */}
                    <td className="px-6 py-4 align-top text-center">
                      {rule.useActiveContractSchedule ? (
                        <div className="flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <FontAwesomeIcon icon={faClock} className="text-[10px]" /> Activo
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">Inactivo</span>
                      )}
                    </td>

                    {/* Col 5: Max Simultaneos */}
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300 align-top">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{rule.maxSimultaneousUsers} usuarios</span>
                          {limitExceeded && (
                            <div className="text-amber-500" title={`El límite (${rule.maxSimultaneousUsers}) es mayor que la cantidad de usuarios coincidentes (${userCount})`}>
                              <FontAwesomeIcon icon={faTriangleExclamation} />
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-normal">{userCount} coincidentes</div>
                      </div>
                    </td>

                    {/* Col 6: Estado (moved description inside or removed) */}
                    <td className="px-6 py-4 align-top">
                      <button onClick={() => handleToggleActive(rule)} className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${rule.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"}`}>
                        <FontAwesomeIcon icon={rule.isActive ? faToggleOn : faToggleOff} className="mr-2" />
                        {rule.isActive ? "Activa" : "Inactiva"}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => openEdit(rule)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors" title="Editar">
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button onClick={() => handleDelete(rule)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors" title="Eliminar">
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal using UI Component */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRule ? "Editar Regla" : "Nueva Regla"}
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">
              Cancelar
            </button>
            <button type="submit" form="overlap-form" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-500">
              {editingRule ? "Guardar Cambios" : "Crear Regla"}
            </button>
          </>
        }
      >
        <form id="overlap-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Row 1: Client Selection & Project */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
              <select
                {...register("clientId", {
                  onChange: () => {
                    setValue("projectId", "");
                    setValue("roleFrameId", "");
                  },
                })}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-700 dark:text-white"
              >
                <option value="">Todos</option>
                {clients.map((opt) => (
                  <option key={opt._id} value={opt._id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proyecto</label>
              <select
                {...register("projectId", {
                  onChange: () => {
                    setValue("roleFrameId", "");
                  },
                })}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-700 dark:text-white"
              >
                <option value="">Cualquiera</option>
                {projects
                  .filter((p) => !wClientId || (typeof p.clientId === "string" ? p.clientId === wClientId : p.clientId?._id === wClientId))
                  .map((opt) => (
                    <option key={opt._id} value={opt._id}>
                      {opt.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Row 2: RoleFrame */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role Frame</label>
              <select {...register("roleFrameId")} disabled={availableOptions.roleFramesDisabled} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-700 dark:text-white disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-500">
                <option value="">Cualquiera</option>
                {availableOptions.roleFrames.map((opt) => (
                  <option key={opt._id} value={opt._id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Spacer to force next row if we want strict grid (optional but safer) */}
            <div className="hidden md:block"></div>

            {/* Row 3: Active Contract Schedule */}
            <div className="md:col-span-2 flex flex-col pt-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Considerar Horario de Contrato Activo</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setValue("useActiveContractSchedule", !wUseActiveContractSchedule, { shouldValidate: true })} className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${wUseActiveContractSchedule ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"}`}>
                  <FontAwesomeIcon icon={wUseActiveContractSchedule ? faToggleOn : faToggleOff} className="mr-2" />
                  {wUseActiveContractSchedule ? "Activado" : "Desactivado"}
                </button>
              </div>
              <input type="checkbox" className="hidden" {...register("useActiveContractSchedule")} />
            </div>

            {/* Hidden Fields: Row 3: Area & Position, Row 4: Level */}
            {false && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Área{" "}
                    <span title="Desactivado para el MVP" className="text-gray-400 cursor-help">
                      (*)
                    </span>
                  </label>
                  <select {...register("areaId")} disabled={true} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-700 dark:text-white disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-500">
                    <option value="">Cualquiera</option>
                    {availableOptions.areas.map((opt) => (
                      <option key={opt._id} value={opt._id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Cargo{" "}
                    <span title="Desactivado para el MVP" className="text-gray-400 cursor-help">
                      (*)
                    </span>
                  </label>
                  <select {...register("positionId")} disabled={true} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-700 dark:text-white disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-500">
                    <option value="">Cualquiera</option>
                    {availableOptions.positions.map((opt) => (
                      <option key={opt._id} value={opt._id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nivel{" "}
                    <span title="Desactivado para el MVP" className="text-gray-400 cursor-help">
                      (*)
                    </span>
                  </label>
                  <select {...register("levelId")} disabled={true} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-700 dark:text-white disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-500">
                    <option value="">Cualquiera</option>
                    {availableOptions.levels.map((opt) => (
                      <option key={opt._id} value={opt._id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="text-xs text-gray-400 italic">(*) Selects desactivados para integración con Weprodu</div>

          {errors.areaId && <p className="text-xs text-red-500 mt-1">{errors.areaId.message}</p>}

          {/* User List Section */}
          <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded border border-gray-200 dark:border-gray-600 text-sm">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-gray-700 dark:text-gray-300">Usuarios Coincidentes</h4>
                <span className="text-gray-500 dark:text-gray-400 font-semibold">({eligibleUsers.length})</span>
              </div>
            </div>

            {eligibleUsers.length === 0 && <div className="text-gray-500 dark:text-gray-400 italic text-xs">No hay usuarios activos que coincidan con estos criterios.</div>}

            {eligibleUsers.length > 0 && (
              <div className="max-h-80 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {eligibleUsers.map((user) => {
                  // Helper to get names safely
                  // Removed Area/Position/Level from view as requested

                  // Projects & Clients Extraction
                  const projectNamesSet = new Set<string>();
                  const clientNamesSet = new Set<string>();

                  // 1. From user.clientIds
                  if (user.clientIds && Array.isArray(user.clientIds)) {
                    user.clientIds.forEach((c: any) => {
                      if (typeof c === "object" && c.name) {
                        clientNamesSet.add(c.name);
                      } else if (typeof c === "string") {
                        // just in case it's a string ID
                        const cl = clients.find((cl) => cl._id === c);
                        if (cl) clientNamesSet.add(cl.name);
                      }
                    });
                  }

                  // 2. From user.projectIds
                  if (user.projectIds && Array.isArray(user.projectIds)) {
                    user.projectIds.forEach((p: any) => {
                      let project: any = p;
                      // If p is just an ID string, try to find it in our loaded 'projects' list
                      if (typeof p === "string") {
                        project = projects.find((prj) => prj._id === p);
                      }

                      // If we have a project object
                      if (project) {
                        if (project.name) projectNamesSet.add(project.name);

                        // Try to get Client from this project
                        if (project.clientId) {
                          // If clientId is an object with name
                          if (typeof project.clientId === "object" && project.clientId.name) {
                            clientNamesSet.add(project.clientId.name);
                          }
                          // If clientId is an ID (string or object with _id), look it up in 'clients'
                          else {
                            const cId = typeof project.clientId === "object" ? project.clientId._id : project.clientId;
                            const client = clients.find((c) => c._id === String(cId));
                            if (client) clientNamesSet.add(client.name);
                          }
                        }
                        // If project inside user doesn't have clientId, maybe the one in 'projects' list does
                        else if (typeof p === "object" && p._id) {
                          const fullProject = projects.find((prj) => prj._id === p._id);
                          if (fullProject && fullProject.clientId) {
                            const cId = typeof fullProject.clientId === "object" ? fullProject.clientId._id : fullProject.clientId;
                            const client = clients.find((c) => c._id === String(cId));
                            if (client) clientNamesSet.add(client.name);
                          }
                        }
                      }
                    });
                  }

                  // 3. From metadata
                  user.metadata?.projects?.forEach((m: any) => {
                    if (m.nombre_proyecto) projectNamesSet.add(m.nombre_proyecto);
                  });

                  const projectNames = Array.from(projectNamesSet);
                  const clientNames = Array.from(clientNamesSet);

                  // Role Frames Extraction
                  const roleFrameNamesSet = new Set<string>();
                  user.metadata?.projects?.forEach((m: any) => {
                    if (m.nombre_rol_frame) {
                      roleFrameNamesSet.add(m.nombre_rol_frame);
                    } else if (m.rol_frame_id) {
                      const rf = roleFrames.find((r) => r.externalId == m.rol_frame_id || r.data?.rol?.id == m.rol_frame_id);
                      if (rf?.name) roleFrameNamesSet.add(rf.name);
                    }
                  });
                  if (user.externalInfo?.rolFrames && Array.isArray(user.externalInfo.rolFrames)) {
                    user.externalInfo.rolFrames.forEach((rf) => roleFrameNamesSet.add(rf));
                  }
                  const userRoleFrames = Array.from(roleFrameNamesSet);

                  return (
                    <div key={user._id} className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 flex flex-col gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-[10px] shrink-0">
                          {user.firstName?.charAt(0)}
                          {user.lastName?.charAt(0)}
                        </div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {user.firstName} {user.lastName}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 ml-8">
                        {/* Client Badges */}
                        {clientNames.map((name) => (
                          <span key={name} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800">
                            <FontAwesomeIcon icon={faBuilding} className="text-[9px]" /> {name}
                          </span>
                        ))}

                        {/* Project Badges */}
                        {projectNames.map((name) => (
                          <span key={name} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-600 text-white shadow-sm">
                            <FontAwesomeIcon icon={faBriefcase} className="text-[9px]" /> {name}
                          </span>
                        ))}

                        {/* Role Frame Badges */}
                        {userRoleFrames.map((name: string) => (
                          <span key={name} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-800 border border-purple-100 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800">
                            <FontAwesomeIcon icon={faIdCard} className="text-[9px]" /> {name}
                          </span>
                        ))}

                        {/* Empty state for badges if none found */}
                        {clientNames.length === 0 && projectNames.length === 0 && userRoleFrames.length === 0 && <span className="text-gray-400 italic text-[10px]">Sin datos clasificados</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Máximo de usuarios simultáneos</label>
            <input type="number" {...register("maxSimultaneousUsers", { valueAsNumber: true })} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-700 dark:text-white" min={1} />
            {errors.maxSimultaneousUsers && <p className="text-xs text-red-500 mt-1">{errors.maxSimultaneousUsers.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción (Opcional)</label>
            <textarea {...register("description")} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-700 dark:text-white" rows={3} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
            <button type="button" onClick={() => setValue("isActive", !watch("isActive"), { shouldValidate: true })} className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${watch("isActive") ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"}`}>
              <FontAwesomeIcon icon={watch("isActive") ? faToggleOn : faToggleOff} className="mr-2" />
              {watch("isActive") ? "Activa" : "Inactiva"}
            </button>
            <input type="hidden" {...register("isActive")} />
          </div>
        </form>
      </Modal>
    </div>
  );
};
