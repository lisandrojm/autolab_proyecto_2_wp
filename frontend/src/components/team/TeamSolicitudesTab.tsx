import React, { useState, useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faUserPlus, faClock, faSearch } from "@fortawesome/free-solid-svg-icons";
import { usersAPI, User } from "../../api/users";
import { roleFrameAPI, RoleFrameItem } from "../../api/roleFrames";
import { categoriaSatAPI, CategoriaSatItem } from "../../api/categoriasSat";
import { Project } from "../../api/projects";
import { sweetAlert } from "../../utils/sweetAlert";

interface TeamSolicitudesTabProps {
  projectId: string;
  project: Project;
  /** Abre el wizard de Agregar Miembro precargado con la solicitud (la aprobación se hace ahí). */
  onApprove: (user: User) => void;
  /** Cambia para forzar recarga de la lista (p.ej. tras aprobar desde el wizard). */
  refreshSignal?: number;
}

export const TeamSolicitudesTab: React.FC<TeamSolicitudesTabProps> = ({ projectId, onApprove, refreshSignal }) => {
  const [solicitudes, setSolicitudes] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFrames, setRoleFrames] = useState<RoleFrameItem[]>([]);
  const [categoriasSat, setCategoriasSat] = useState<CategoriaSatItem[]>([]);

  const fetchSolicitudes = async () => {
    try {
      setLoading(true);
      const [allSolicitudes, frames, cats] = await Promise.all([usersAPI.listSolicitudes(), roleFrameAPI.list(), categoriaSatAPI.list()]);
      setRoleFrames(frames);
      setCategoriasSat(cats);
      setSolicitudes(allSolicitudes);
    } catch (error) {
      console.error("Error fetching solicitudes:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSolicitudes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshSignal]);

  // Filter solicitudes for this project
  const filteredSolicitudes = useMemo(() => {
    return solicitudes.filter((u) => {
      // Must have this project in metadata.projectIds
      const hasProject = u.metadata?.projectIds?.includes(projectId);
      if (!hasProject) return false;

      // Search filter
      if (searchTerm) {
        const name = (u.metadata?.fullName || `${u.firstName} ${u.lastName}`).toLowerCase();
        if (!name.includes(searchTerm.toLowerCase())) return false;
      }

      return true;
    });
  }, [solicitudes, projectId, searchTerm]);

  /**
   * El rol frame de una solicitud puede venir en 3 formas según quién la creó:
   * `metadata.roleFrameId` (singular), `metadata.rolesFrameIds[]` o `metadata.roles_frame[]`
   * (este último es el que usa el alta desde mobile). Resolvemos las tres.
   */
  const getRolFrameFromMeta = (meta?: any): string => {
    if (!meta) return "Sin rol";
    const raw = meta.roleFrameId || meta.rolesFrameIds?.[0] || meta.roles_frame?.[0];
    if (!raw) return "Sin rol";
    // Puede venir como id (string) o ya populado ({_id, name}).
    if (typeof raw === "object") return raw.name || roleFrames.find((rf) => rf._id === String(raw._id))?.name || "Sin rol";
    return roleFrames.find((rf) => rf._id === String(raw))?.name || "Sin rol";
  };

  const getCategoriaName = (id?: string) => {
    if (!id) return "Sin categoría";
    return categoriasSat.find((c) => c._id === id)?.name || "Sin categoría";
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const handleReject = async (user: User) => {
    const result = await sweetAlert.confirm("¿Rechazar solicitud?", `La solicitud de ${user.metadata?.fullName || "este usuario"} quedará registrada como rechazada.`, "Sí, rechazar");
    if (!result.isConfirmed) return;

    try {
      await usersAPI.setSolicitudStatus(user._id, "rechazada");
      sweetAlert.success("Solicitud Rechazada", "La solicitud quedó marcada como rechazada.");
      fetchSolicitudes();
    } catch (error: any) {
      sweetAlert.error("Error", error.response?.data?.error || "Error al rechazar la solicitud");
    }
  };

  /** Borrado definitivo: solo desde el admin, para depurar el listado. */
  const handleDelete = async (user: User) => {
    const result = await sweetAlert.confirm("¿Eliminar solicitud?", `Se eliminará definitivamente la solicitud de ${user.metadata?.fullName || "este usuario"}. Esta acción no se puede deshacer.`, "Sí, eliminar");
    if (!result.isConfirmed) return;

    try {
      await usersAPI.rejectSolicitud(user._id);
      sweetAlert.success("Solicitud Eliminada", "La solicitud fue eliminada.");
      fetchSolicitudes();
    } catch (error: any) {
      sweetAlert.error("Error", error.response?.data?.error || "Error al eliminar la solicitud");
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          <FontAwesomeIcon icon={faSearch} />
        </span>
        <input type="text" className="input-field pl-10 h-10 w-full" placeholder="Buscar solicitudes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      {/* List */}
      {filteredSolicitudes.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center h-48 text-gray-500">
          <FontAwesomeIcon icon={faUserPlus} className="h-10 w-10 mb-3 opacity-10" />
          <p className="text-sm font-medium">No hay solicitudes pendientes para este proyecto</p>
          <p className="text-xs mt-1 text-gray-400">Las solicitudes de alta desde mobile aparecerán aquí.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Rol/es Frame</th>
                  <th className="px-4 py-3 font-semibold">Categoría SAT</th>
                  <th className="px-4 py-3 font-semibold">Fechas</th>
                  <th className="px-4 py-3 font-semibold">Horario</th>
                  <th className="px-4 py-3 font-semibold">Valor Jornada</th>
                  <th className="px-4 py-3 font-semibold text-center">Estado</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSolicitudes.map((user) => {
                  const meta = user.metadata;
                  const displayName = meta?.fullName || `${user.firstName} ${user.lastName}`;

                  return (
                    <tr key={user._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold text-xs shrink-0">{displayName.charAt(0).toUpperCase()}</div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{displayName}</p>
                            <p className="text-xs text-gray-500 truncate">{formatDate(user.createdAt)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{getRolFrameFromMeta(meta)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{getCategoriaName(meta?.categoriaSatId)}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          <span>{formatDate(meta?.startDate)}</span>
                          <span className="mx-1 text-gray-300">→</span>
                          <span>{meta?.dueDate ? formatDate(meta.dueDate) : "Indef."}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{meta?.schedule || "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{meta?.dailyRate ? `$${meta.dailyRate.toLocaleString("es-AR")}` : "-"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <FontAwesomeIcon icon={faClock} className="text-[8px]" />
                          PENDIENTE
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => onApprove(user)} className="px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors flex items-center gap-1.5 shadow-sm" title="Aprobar y agregar al equipo">
                            <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
                            Aprobar
                          </button>
                          <button onClick={() => handleReject(user)} className="px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 rounded transition-colors flex items-center gap-1.5" title="Rechazar solicitud">
                            <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                            Rechazar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
