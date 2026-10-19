import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Project, projectsAPI } from "../../api/projects";
import { User } from "../../api/users";
import { Area, areasAPI } from "../../api/areas";
import { Shift, shiftsAPI } from "../../api/shifts";
import { cachedFetch } from "../../utils/refCache";
import { infoAPI } from "../../api/info";
import { sedesDelForm } from "../../utils/sedesProyecto";
import { claveAreaTurno, claveFilaArea, partirClaveAreaTurno, sedeDe } from "@compartido/areaTurno";
// Coordinar un turno requiere poder cargar sus novedades, que es un permiso. Ver ese módulo.
import { coordinaAreas, permisosDeRoles, PROJECT_SUPERVISOR } from "../../utils/permisosMobile";
import { sweetAlert } from "../../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSave, faUserTie, faInfoCircle, faTable, faLocationDot } from "@fortawesome/free-solid-svg-icons";

interface TeamCoordinadoresTabProps {
  projectId: string;
  project: Project;
  teamMembers: User[];
  onUpdated: () => void;
  onGoToTeam?: () => void;
}


export const TeamCoordinadoresTab: React.FC<TeamCoordinadoresTabProps> = ({ projectId, project, teamMembers, onUpdated, onGoToTeam }) => {
  const navigate = useNavigate();

  const [areas, setAreas] = useState<Area[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [autoShown, setAutoShown] = useState(false);

  
  // Copia local de los supervisores: { claveAreaTurno (área::turno[::s<sede>]) → userId }.
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  // El catálogo de sedes, para el título «Edición · Libertador» de las filas con sede.
  const [sedesCatalogo, setSedesCatalogo] = useState<Array<{ name?: string; data?: any }>>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchAuxData = async () => {
      try {
        const [areasList, shiftsList, sedesList] = await Promise.all([
          cachedFetch("areas:all", () => areasAPI.listAll()),
          cachedFetch("shifts:all", () => shiftsAPI.getAll()),
          cachedFetch("info:sede", () => infoAPI.listByType("sede")).catch(() => []),
        ]);
        setAreas(areasList);
        setShifts(shiftsList);
        setSedesCatalogo(sedesList as any[]);
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
        const uId = typeof asm.userId === "object" ? asm.userId._id : asm.userId;
        if (asm.areaId && asm.shiftId && uId) {
          currentMap[claveAreaTurno(asm)] = uId;
        }
      });
      setAssignments(currentMap);
    }
  }, [project]);

  // Expand `project.areasConfig` inside to combinations of Area + Shift
  // Only areas/shifts currently assigned to the project are shown
  const groupedCombinations = React.useMemo(() => {
    if (!project?.areasConfig) return [];
    
    // Una entrada por FILA de `areasConfig` (área + sede): la misma área puede estar una vez por sede.
    const groups: { area: Area, sedeId: number | null, shifts: Shift[] }[] = [];
    
    project.areasConfig.forEach(config => {
      const aId = typeof config.areaId === "object" ? config.areaId._id : config.areaId;
      const area = areas.find(a => a._id === aId);
      if (!area) return;

      const matchedShifts = (config.shiftIds || []).map(s => {
        const sId = typeof s === "object" ? s._id : s;
        return shifts.find(sh => sh._id === sId);
      }).filter((s): s is Shift => !!s)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      if (matchedShifts.length > 0) {
        groups.push({ area, sedeId: sedeDe((config as any).sedeId), shifts: matchedShifts });
      }
    });

    return groups;
  }, [project, areas, shifts]);

  // Expand into combinations for validation counting
  const configuredCombinations = React.useMemo(() => {
    const combos: { area: Area, sedeId: number | null, shift: Shift }[] = [];
    groupedCombinations.forEach(group => {
      group.shifts.forEach(shift => {
        combos.push({ area: group.area, sedeId: group.sedeId, shift });
      });
    });
    return combos;
  }, [groupedCombinations]);

  /*
    Candidatos: los del equipo que PUEDEN CARGAR NOVEDADES.

    Antes se buscaba la palabra "mobile" y "coordinador" en el nombre del rol. Esos dos roles dejaron
    de existir como algo fijo —cualquiera arma los suyos y los llama como quiera—, así que el filtro
    se habría vaciado sin avisar. Lo que hace falta para coordinar un turno es el permiso, no el
    nombre: sin él, esa persona no tendría dónde cargar las novedades de su área.
  */
  /*
    Quién puede quedar a cargo de un área/turno: quien ya supervisa áreas y turnos (rol Supervisor) y
    también quien es coordinador del proyecto (rol Coordinador). Al guardar, el server le agrega el rol
    Supervisor a quien quede asignado: un coordinador que se pone a supervisar queda con los dos roles.
  */
  const eligibleCoordinators = React.useMemo(() => teamMembers.filter((u) => coordinaAreas(u.roles) || permisosDeRoles(u.roles).has(PROJECT_SUPERVISOR)), [teamMembers]);

  useEffect(() => {
    if (!loading && eligibleCoordinators.length === 0 && groupedCombinations.length > 0 && !autoShown) {
      setShowInfoModal(true);
      setAutoShown(true);
    }
  }, [loading, eligibleCoordinators.length, groupedCombinations.length, autoShown]);


  // Identify validation errors: combinations without coordinators, and overlapping users
  const validationItems = React.useMemo(() => {
    let unassignedCount = 0;
    const userCoverage: Record<string, string[]> = {}; // userId => array of "areaId_shiftId"
    
    configuredCombinations.forEach(({ area, sedeId, shift }) => {
      const key = claveAreaTurno({ areaId: area._id, shiftId: shift._id, sedeId });
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

  const handleAssignmentChange = (key: string, userId: string) => {
    setAssignments(prev => {
      const next = { ...prev };
      if (!userId) {
        delete next[key];
      } else {
        next[key] = userId;
      }
      return next;
    });
  };

  const saveAssignments = async () => {

    try {
      setIsSaving(true);
      // Cada clave lleva su sede ("área::turno::s<sede>"): se reenvía para que no se pierda al guardar.
      // Se mandan todas, como antes (también las de filas que ya no están): no se borra nada de rebote.
      const newAssignments = Object.entries(assignments)
        .map(([key, userId]) => {
          const { areaId, shiftId, sedeId } = partirClaveAreaTurno(key);
          return { areaId, shiftId, userId, ...(sedeId ? { sedeId } : {}) };
        });

      await projectsAPI.updateProject(projectId, {
        coordinatorAssignments: newAssignments
      });
      
      sweetAlert.success("Guardado", "Los supervisores se han actualizado correctamente.");
      onUpdated();
    } catch (err) {
      console.error(err);
      sweetAlert.error("Error", "No se pudieron guardar las asignaciones.");
    } finally {
      setIsSaving(false);
    }
  };

  const sedesProyecto = sedesDelForm(project?.metadata);
  const sedePrincipal = sedesProyecto[0] || null;

  /** Las sedes que se le pueden sumar a un área: la principal (fila sin sede) si no la tiene, y las otras del proyecto sin fila. */
  const sedesParaSumar = (areaId: string): Array<number | null> => {
    const usadas = new Set((project?.areasConfig || []).filter((ac: any) => String(typeof ac.areaId === "object" ? ac.areaId?._id : ac.areaId) === areaId).map((ac: any) => sedeDe(ac.sedeId)));
    const tienePrincipal = usadas.has(null) || (sedePrincipal != null && usadas.has(sedePrincipal));
    return [...(tienePrincipal ? [] : [null]), ...sedesProyecto.filter((id) => id !== sedePrincipal && !usadas.has(id))];
  };

  /*
    SUMAR UNA SEDE A UN ÁREA DESDE ACÁ (pedido del 18/10/2026), sin ir a Editar Proyecto: agrega la
    fila área + sede a «Configuración por Área» con los mismos turnos del área, y aparece su bloque
    para elegirle supervisor. Se guardan también los supervisores que estén elegidos y sin guardar:
    al releer el proyecto se perderían.
  */
  const sumarSede = async (areaId: string, sedeId: number | null) => {
    const filas = (project?.areasConfig || []).map((ac: any) => ({
      areaId: String(typeof ac.areaId === "object" ? ac.areaId?._id : ac.areaId),
      shiftIds: (ac.shiftIds || []).map((x: any) => String(typeof x === "object" ? x?._id : x)),
      ...(sedeDe(ac.sedeId) ? { sedeId: sedeDe(ac.sedeId)! } : {}),
    }));
    const ultimo = filas.map((f) => f.areaId).lastIndexOf(areaId);
    if (ultimo < 0) return;
    filas.splice(ultimo + 1, 0, { areaId, shiftIds: [...filas[ultimo].shiftIds], ...(sedeId ? { sedeId } : {}) });
    const coordinatorAssignments = Object.entries(assignments).map(([key, userId]) => {
      const { areaId: a, shiftId, sedeId: sd } = partirClaveAreaTurno(key);
      return { areaId: a, shiftId, userId, ...(sd ? { sedeId: sd } : {}) };
    });
    try {
      setIsSaving(true);
      await projectsAPI.updateProject(projectId, { areasConfig: filas as any, coordinatorAssignments });
      sweetAlert.success("Sede agregada", "Elegí el supervisor de la nueva sede y guardá.");
      onUpdated();
    } catch (err) {
      console.error(err);
      sweetAlert.error("Error", "No se pudo agregar la sede al área.");
    } finally {
      setIsSaving(false);
    }
  };
  const nombreSede = (id: number) => {
    const sd = sedesCatalogo.find((x) => Number(x.data?.id) === id);
    return String(sd?.data?.nombre || sd?.name || `Sede ${id}`);
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
          disabled={isSaving}
          className={`btn-primary flex items-center justify-center text-sm p-2 gap-2 w-full sm:w-auto text-white ${isSaving ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <FontAwesomeIcon icon={faSave} className="h-3 w-3 lg:h-4 lg:w-4" />
          <span>{isSaving ? "Guardando..." : "Guardar Roles"}</span>
        </button>,


        actionPortalTarget
      )}
      {groupedCombinations.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
          <FontAwesomeIcon icon={faUserTie} className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            El proyecto no tiene áreas o turnos configurados aún.
          </p>
          <div className="mt-5">
            <button
              onClick={() => navigate(`/projects/${projectId}`, { state: { openEdit: true } })}
              className="btn-secondary px-4 py-2 text-sm font-medium"
            >
              Editar Proyecto
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            {groupedCombinations.map(({ area, sedeId, shifts }, idx) => (
              <div key={`${claveFilaArea({ areaId: area._id, sedeId })}-${idx}`} className={idx > 0 ? "border-t-[8px] border-gray-100 dark:border-gray-900" : ""}>
                {/* Area Header Row */}
                <div className="bg-gray-50 dark:bg-gray-800/80 px-6 py-4 flex items-center gap-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <FontAwesomeIcon icon={faTable} className="text-xs" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">{area.name}</h3>
                    {/* La sede del bloque, siempre (también la principal sola): cada sede de un área tiene su supervisor. */}
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300">
                      <FontAwesomeIcon icon={faLocationDot} className="h-2.5 w-2.5" />
                      {sedeId ? nombreSede(sedeId) : sedePrincipal ? `${nombreSede(sedePrincipal)} · principal` : "Todas las sedes"}
                    </span>
                  </div>
                  {/* Sumar otra sede al área, en el primer bloque de esa área. */}
                  {groupedCombinations.findIndex((g) => g.area._id === area._id) === idx && sedesParaSumar(area._id).length > 0 && (
                    <select
                      value=""
                      disabled={isSaving}
                      onChange={(e) => {
                        if (e.target.value === "") return;
                        sumarSede(area._id, e.target.value === "principal" ? null : sedeDe(e.target.value));
                      }}
                      className="ml-auto text-[11px] font-semibold rounded-full border border-dashed border-orange-300 dark:border-orange-700 px-3 py-1 bg-transparent text-orange-600 dark:text-orange-400 cursor-pointer"
                      title="Sumar otra sede a esta área, con su propio supervisor"
                    >
                      <option value="">+ Sede</option>
                      {sedesParaSumar(area._id).map((sd) => (
                        <option key={sd ?? "principal"} value={sd ?? "principal"}>
                          {sd ? nombreSede(sd) : sedePrincipal ? `${nombreSede(sedePrincipal)} · principal` : "Todas las sedes"}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Table for Shifts under this Area */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700/50 text-xs text-gray-400 uppercase tracking-wider">
                        <th className="px-6 py-2.5 font-semibold w-[40%]">Turno</th>
                        <th className="px-6 py-2.5 font-semibold w-[60%] flex items-center gap-2">
                          Supervisor Asignado
                          <button
                            onClick={() => setShowInfoModal(true)}
                            className="text-gray-400 hover:text-blue-500 transition-colors"
                            title="Información sobre supervisores"
                          >
                            <FontAwesomeIcon icon={faInfoCircle} />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {shifts.map(shift => {
                        const key = claveAreaTurno({ areaId: area._id, shiftId: shift._id, sedeId });
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
                                    className={`input-field w-full text-sm font-medium ${!currentUserId ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950" : ""}`}
                                    value={currentUserId}
                                    onChange={(e) => handleAssignmentChange(key, e.target.value)}
                                  >
                                    <option value="">Sin supervisor</option>
                                    {eligibleCoordinators.map((u) => (
                                      <option key={u._id} value={u._id}>
                                        {u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}` : u.email}
                                      </option>
                                    ))}
                                  </select>
                                </div>
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
                Supervisores Disponibles
              </h3>
              <button 
                onClick={() => setShowInfoModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                &times;
              </button>
            </div>
            <div className="p-6 text-sm text-gray-600 dark:text-gray-300 space-y-3 leading-relaxed">
              {eligibleCoordinators.length === 0 ? (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-xl space-y-3">
                  <p className="text-amber-800 dark:text-amber-400 font-bold flex items-center gap-2">
                    <FontAwesomeIcon icon={faInfoCircle} />
                    Asignación requerida
                  </p>
                  <p className="text-amber-700 dark:text-amber-500 leading-normal">
                    Hay que sumar al equipo a alguien con rol <strong>Supervisor</strong> («Supervisa áreas y turnos») o <strong>Coordinador</strong> («Coordinador del Proyecto»): son quienes pueden tener un área a cargo.
                  </p>
                  <p className="text-[11px] text-amber-600 dark:text-amber-600 italic">
                    Volvé a la pestaña "Equipo" y agregá un miembro con un rol que lo incluya antes de configurar los supervisores acá.
                  </p>
                </div>
              ) : (
                <>
                  <p>
                    En esta lista desplegable únicamente aparecen los usuarios que cumplen con los siguientes requisitos:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 marker:text-blue-500">
                    <li>Son miembros activos del <strong>equipo del proyecto</strong>.</li>
                    <li>Alguno de sus roles incluye <strong>Proyectos → Supervisa áreas y turnos</strong> (rol Supervisor) o <strong>Coordinador del Proyecto</strong> (rol Coordinador).</li>
                  </ul>
                  <p>Al guardar, quien queda a cargo de un turno recibe el rol <strong>Supervisor</strong> si no lo tenía: un coordinador que se pone a supervisar queda con los dos roles.</p>
                </>
              )}

              
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2">Ejemplo de visualización:</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Nombre del Supervisor</span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold border border-amber-500/30 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 whitespace-nowrap">
                      Carga novedades
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold border border-blue-500/30 text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 whitespace-nowrap">
                      {project.name}
                    </span>
                  </div>
                </div>
              </div>

              <p className="pt-2 text-xs italic text-gray-400 dark:text-gray-500">
                Si no ves a la persona que buscas, verifica que haya sido agregada al proyecto desde la pestaña principal del equipo y que cuente con los permisos necesarios.
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50 flex justify-end">
              <button 
                onClick={() => {
                  setShowInfoModal(false);
                  if (eligibleCoordinators.length === 0 && onGoToTeam) {
                    onGoToTeam();
                  }
                }}
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
