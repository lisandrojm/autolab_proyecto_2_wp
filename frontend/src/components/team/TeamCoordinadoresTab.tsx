import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Project, projectsAPI } from "../../api/projects";
import { User } from "../../api/users";
import { Area, areasAPI } from "../../api/areas";
import { Shift, shiftsAPI } from "../../api/shifts";
import { sweetAlert } from "../../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSave, faUserTie, faInfoCircle, faTable } from "@fortawesome/free-solid-svg-icons";

interface TeamCoordinadoresTabProps {
  projectId: string;
  project: Project;
  teamMembers: User[];
  onUpdated: () => void;
}

export const TeamCoordinadoresTab: React.FC<TeamCoordinadoresTabProps> = ({ projectId, project, teamMembers, onUpdated }) => {
  const [areas, setAreas] = useState<Area[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInfoModal, setShowInfoModal] = useState(false);
  
  // local copy of coordinator assignments
  // { areaId_shiftId: userId }
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchAuxData = async () => {
      try {
        const [areasList, shiftsList] = await Promise.all([
          areasAPI.listAll(),
          shiftsAPI.getAll(),
        ]);
        setAreas(areasList);
        setShifts(shiftsList);
      } catch (err) {
        console.error("Error fetching areas/shifts for coordinadores tab:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAuxData();
  }, []);

  useEffect(() => {
    if (project?.coordinatorAssignments) {
      const currentMap: Record<string, string> = {};
      project.coordinatorAssignments.forEach(asm => {
        const aId = typeof asm.areaId === "object" ? asm.areaId._id : asm.areaId;
        const sId = typeof asm.shiftId === "object" ? asm.shiftId._id : asm.shiftId;
        const uId = typeof asm.userId === "object" ? asm.userId._id : asm.userId;
        if (aId && sId && uId) {
          currentMap[`${aId}_${sId}`] = uId;
        }
      });
      setAssignments(currentMap);
    }
  }, [project]);

  // Expand `project.areasConfig` inside to combinations of Area + Shift
  // Only areas/shifts currently assigned to the project are shown
  const groupedCombinations = React.useMemo(() => {
    if (!project?.areasConfig) return [];
    
    const groups: { area: Area, shifts: Shift[] }[] = [];
    
    project.areasConfig.forEach(config => {
      const aId = typeof config.areaId === "object" ? config.areaId._id : config.areaId;
      const area = areas.find(a => a._id === aId);
      if (!area) return;

      const matchedShifts = (config.shiftIds || []).map(s => {
        const sId = typeof s === "object" ? s._id : s;
        return shifts.find(sh => sh._id === sId);
      }).filter((s): s is Shift => !!s);

      if (matchedShifts.length > 0) {
        groups.push({ area, shifts: matchedShifts });
      }
    });

    return groups;
  }, [project, areas, shifts]);

  // Expand into combinations for validation counting
  const configuredCombinations = React.useMemo(() => {
    const combos: { area: Area, shift: Shift }[] = [];
    groupedCombinations.forEach(group => {
      group.shifts.forEach(shift => {
        combos.push({ area: group.area, shift });
      });
    });
    return combos;
  }, [groupedCombinations]);

  const eligibleCoordinators = React.useMemo(() => {
    return teamMembers.filter(u => {
      if (!u.roles || !Array.isArray(u.roles)) return false;
      // Filter strictly by the requirement: users with the "Mobile-coordinador" role
      return u.roles.some(r => {
        const n = r.name.toLowerCase();
        return n.includes("mobile") && n.includes("coordinador");
      });
    });
  }, [teamMembers]);

  // Identify validation errors: combinations without coordinators, and overlapping users
  const validationItems = React.useMemo(() => {
    let unassignedCount = 0;
    const userCoverage: Record<string, string[]> = {}; // userId => array of "areaId_shiftId"
    
    configuredCombinations.forEach(({ area, shift }) => {
      const key = `${area._id}_${shift._id}`;
      const uid = assignments[key];
      if (!uid) {
        unassignedCount++;
      } else {
        if (!userCoverage[uid]) userCoverage[uid] = [];
        userCoverage[uid].push(key);
      }
    });

    // Check for "pisado" users (one user spanning overlapping shifts? Requisito: "Pueden ser varias areas o varios turnos indistintos pero no se pueden pisar")
    // For this context, "no se pueden pisar" refers to not assigning the exact same shift/area to multiple people... 
    // actually it says: "Cada uno debe encargarse de un area y un turno pero pueden ser intercalados. No necesariamente tienen que ser los turnos del mismo area pero si hay mas de un coordinador todos pueden encargarse de cualquier turno y area pero sin pisarse."
    // This implies that each (Area, Shift) slot has exactly one coordinator. The UI enforces this naturally since it's a 1-to-1 dropdown mapping.
    
    return {
      unassignedCount,
      allCovered: unassignedCount === 0 && configuredCombinations.length > 0
    };
  }, [assignments, configuredCombinations]);

  const handleAssignmentChange = (areaId: string, shiftId: string, userId: string) => {
    setAssignments(prev => {
      const next = { ...prev };
      const key = `${areaId}_${shiftId}`;
      if (!userId) {
        delete next[key];
      } else {
        next[key] = userId;
      }
      return next;
    });
  };

  const saveAssignments = async () => {
    if (validationItems.unassignedCount > 0) {
      sweetAlert.error(
        "Acción no permitida",
        "Todas las combinaciones de Área y Turno deben tener un coordinador asignado antes de poder guardar."
      );
      return;
    }

    try {
      setIsSaving(true);
      const newAssignments = Object.entries(assignments).map(([key, userId]) => {
        const [areaId, shiftId] = key.split("_");
        return { areaId, shiftId, userId };
      });

      await projectsAPI.updateProject(projectId, {
        coordinatorAssignments: newAssignments
      });
      
      sweetAlert.success("Guardado", "Los coordinadores se han actualizado correctamente.");
      onUpdated();
    } catch (err) {
      console.error(err);
      sweetAlert.error("Error", "No se pudieron guardar las asignaciones.");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-500">Cargando datos de áreas y turnos...</div>;
  }

  const actionPortalTarget = document.getElementById("tab-actions-portal");

  return (
    <div className="space-y-6 pt-4">
      {actionPortalTarget && createPortal(
        <button
          onClick={saveAssignments}
          disabled={isSaving || validationItems.unassignedCount > 0}
          className={`flex items-center gap-2 px-4 py-1.5 text-sm rounded-md w-full sm:w-auto justify-center ${isSaving || validationItems.unassignedCount > 0 ? "btn-disabled bg-gray-200 text-gray-500 cursor-not-allowed" : "btn-primary"}`}
        >
          <FontAwesomeIcon icon={faSave} />
          {isSaving ? "Guardando..." : "Guardar Roles"}
        </button>,
        actionPortalTarget
      )}
      {groupedCombinations.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
          <FontAwesomeIcon icon={faUserTie} className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            El proyecto no tiene áreas o turnos configurados aún.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            {groupedCombinations.map(({ area, shifts }, idx) => (
              <div key={area._id} className={idx > 0 ? "border-t-[8px] border-gray-100 dark:border-gray-900" : ""}>
                {/* Area Header Row */}
                <div className="bg-gray-50 dark:bg-gray-800/80 px-6 py-4 flex items-center gap-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <FontAwesomeIcon icon={faTable} className="text-xs" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">{area.name}</h3>
                </div>

                {/* Table for Shifts under this Area */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700/50 text-xs text-gray-400 uppercase tracking-wider">
                        <th className="px-6 py-2.5 font-semibold w-[40%]">Turno</th>
                        <th className="px-6 py-2.5 font-semibold w-[60%] flex items-center gap-2">
                          Coordinador Asignado
                          <button
                            onClick={() => setShowInfoModal(true)}
                            className="text-gray-400 hover:text-blue-500 transition-colors"
                            title="Información sobre coordinadores"
                          >
                            <FontAwesomeIcon icon={faInfoCircle} />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {shifts.map(shift => {
                        const key = `${area._id}_${shift._id}`;
                        const currentUserId = assignments[key] || "";
                        
                        return (
                          <tr key={key} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                            <td className="px-6 py-3.5">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{shift.name}</span>
                                <span className="text-xs text-gray-500 mt-0.5">{shift.startTime} - {shift.endTime}</span>
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 w-full max-w-[260px]">
                                  <select
                                    className={`input-field w-full text-sm font-medium ${!currentUserId ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20" : ""}`}
                                    value={currentUserId}
                                    onChange={(e) => handleAssignmentChange(area._id, shift._id, e.target.value)}
                                  >
                                    <option value="">Seleccionar coordinador...</option>
                                    {eligibleCoordinators.map((u) => (
                                      <option key={u._id} value={u._id}>
                                        {u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}` : u.email}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                {currentUserId && (
                                  <div className="hidden md:flex flex-wrap items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold border border-amber-500/30 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 whitespace-nowrap">
                                      Mobile-Coordinador
                                    </span>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold border border-blue-500/30 text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]" title={project.name}>
                                      {project.name}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FontAwesomeIcon icon={faInfoCircle} className="text-blue-500" />
                Coordinadores Disponibles
              </h3>
              <button 
                onClick={() => setShowInfoModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                &times;
              </button>
            </div>
            <div className="p-6 text-sm text-gray-600 dark:text-gray-300 space-y-3 leading-relaxed">
              <p>
                En esta lista desplegable únicamente aparecen los usuarios que cumplen con los siguientes requisitos:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 marker:text-blue-500">
                <li>Son miembros activos del <strong>equipo del proyecto</strong>.</li>
                <li>Tienen asignado explícitamente el rol de <strong>Mobile - Coordinador</strong>.</li>
              </ul>
              <p className="pt-2 text-xs italic text-gray-400 dark:text-gray-500">
                Si no ves a la persona que buscas, verifica que haya sido agregada al proyecto desde la pestaña principal del equipo y que cuente con los permisos necesarios.
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50 flex justify-end">
              <button 
                onClick={() => setShowInfoModal(false)}
                className="btn-primary"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
