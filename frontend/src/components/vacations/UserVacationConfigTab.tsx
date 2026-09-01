import React, { useState, useEffect } from "react";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faFilter, faSpinner, faSave } from "@fortawesome/free-solid-svg-icons";
import { usersAPI, User } from "../../api/users";
import { projectsAPI, Project } from "../../api/projects";
import { roleFrameAPI, RoleFrameItem } from "../../api/roleFrames";
import { sweetAlert } from "../../utils/sweetAlert";

export const UserVacationConfigTab: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [projects, setProjects] = useState<Project[]>([]);
  const [roleFrames, setRoleFrames] = useState<RoleFrameItem[]>([]);
  const [contractTypes, setContractTypes] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedRoleFrame, setSelectedRoleFrame] = useState<string>("");
  const [selectedContract, setSelectedContract] = useState<string>("");

  // Editing state: userId -> new extra days value
  const [editedValues, setEditedValues] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, selectedProject, selectedRoleFrame, selectedContract]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, projectsData, roleFramesData] = await Promise.all([
        usersAPI.list({ limit: 10000 }), // Get all users
        projectsAPI.listAll(),
        roleFrameAPI.list(),
      ]);
      setUsers(usersData.users);
      setProjects(projectsData);
      setRoleFrames(roleFramesData);

      const contractsSet = new Set<string>();
      usersData.users.forEach((u) => {
        const cType = getActiveContractType(u);
        if (cType) contractsSet.add(cType);
      });
      setContractTypes(Array.from(contractsSet).sort());
    } catch (error) {
      console.error("Error loading data:", error);
      sweetAlert.error("Error", "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const getActiveContractType = (user: User): string | null => {
    let contractType: string | null = null;
    if (user.metadata?.projects) {
      user.metadata.projects.forEach((p: any) => {
        if (p.contracts) {
          p.contracts.forEach((c: any) => {
            const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
            if (endDate) endDate.setHours(23, 59, 59, 999);
            const isActive = !endDate || endDate.getTime() >= new Date().getTime();
            const type = c.nombre_contrato || c.tipo_contrato;
            if (isActive && type) {
              contractType = type;
            }
          });
        }
      });
    }
    if (!contractType && user.externalInfo && (user.externalInfo as any).contracts && (user.externalInfo as any).contracts.length > 0) {
      contractType = (user.externalInfo as any).contracts[0];
    }
    return contractType;
  };

  const filterUsers = () => {
    let result = users;

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter((u) => u.firstName?.toLowerCase().includes(lowerTerm) || u.lastName?.toLowerCase().includes(lowerTerm) || u.email.toLowerCase().includes(lowerTerm));
    }

    if (selectedProject) {
      result = result.filter((u) => {
        const userProjectIds = u.projectIds?.map((p: any) => (typeof p === "string" ? p : p._id)) || [];
        return userProjectIds.includes(selectedProject);
      });
    }

    if (selectedRoleFrame) {
      result = result.filter((u) => {
        const userMetaProjects = (u as any).metadata?.projects || [];
        const rf = roleFrames.find((r) => r._id === selectedRoleFrame);
        if (rf) {
          return userMetaProjects.some((mp: any) => mp.rol_frame_id === rf.externalId || mp.rol_frame_id === rf.data?.rol?.id || mp.nombre_rol_frame === rf.name);
        }
        return false;
      });
    }

    if (selectedContract) {
      result = result.filter((u) => {
        return getActiveContractType(u) === selectedContract;
      });
    }

    setFilteredUsers(result);
  };

  const handleValueChange = (userId: string, value: string) => {
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue >= 0) {
      setEditedValues((prev) => ({ ...prev, [userId]: numValue }));
    } else if (value === "") {
      // Allow clearing to type
      setEditedValues((prev) => ({ ...prev, [userId]: 0 }));
    }
  };

  const hasChanges = (user: User) => {
    return editedValues[user._id] !== undefined && editedValues[user._id] !== (user.extraVacationDays || 0);
  };

  const hasAnyChanges = Object.keys(editedValues).some((userId) => {
    const user = users.find((u) => u._id === userId);
    return user && editedValues[userId] !== (user.extraVacationDays || 0);
  });

  const handleSaveAll = async () => {
    if (!hasAnyChanges) return;

    setSubmitting(true);
    try {
      const promises = Object.entries(editedValues).map(async ([userId, newValue]) => {
        const user = users.find((u) => u._id === userId);
        // Only update if value actually changed
        if (user && newValue !== (user.extraVacationDays || 0)) {
          await usersAPI.update(userId, { extraVacationDays: newValue });
          return { userId, newValue };
        }
        return null;
      });

      const results = await Promise.all(promises);

      // Update local state based on successful updates
      const updatedUsersMap = results.reduce(
        (acc, curr) => {
          if (curr) acc[curr.userId] = curr.newValue;
          return acc;
        },
        {} as Record<string, number>,
      );

      setUsers((prev) => prev.map((u) => (updatedUsersMap[u._id] !== undefined ? { ...u, extraVacationDays: updatedUsersMap[u._id] } : u)));

      setEditedValues({});
      sweetAlert.success("Cambios guardados correctamente");
    } catch (error) {
      console.error("Error updating users:", error);
      sweetAlert.error("Error al guardar cambios");
      // Optionally reload to sync
      loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const getUserProjects = (user: User) => {
    if (user.projectIds && user.projectIds.length > 0) {
      return (
        user.projectIds
          .map((p) => (typeof p === "object" && p.name ? p.name : ""))
          .filter(Boolean)
          .join(", ") || "N/A"
      );
    }
    return "N/A";
  };

  const getUserRolFrames = (user: User) => {
    if (user.externalInfo?.rolFrames && user.externalInfo.rolFrames.length > 0) {
      return user.externalInfo.rolFrames.join(", ");
    }
    return "N/A";
  };

  if (loading) {
    return <LoadingSpinner message="Cargando reglas..." />;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Configuración Individual de Días Extra ({filteredUsers.length})</h3>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar usuario..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
        </div>

        <div className="relative">
          <FontAwesomeIcon icon={faFilter} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none">
            <option value="">Todos los Proyectos</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <FontAwesomeIcon icon={faFilter} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <select value={selectedRoleFrame} onChange={(e) => setSelectedRoleFrame(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none">
            <option value="">Todos los Roles Empresa</option>
            {roleFrames.map((rf) => (
              <option key={rf._id} value={rf._id}>
                {rf.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <FontAwesomeIcon icon={faFilter} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <select value={selectedContract} onChange={(e) => setSelectedContract(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none">
            <option value="">Todos los Contratos</option>
            {contractTypes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700 mb-6 max-h-[600px] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 relative">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Usuario</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Detalles</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pr-12">Días Extra Asignados</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => {
                const isModified = hasChanges(user);
                const currentValue = editedValues[user._id] ?? user.extraVacationDays ?? 0;

                return (
                  <tr key={user._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {user.firstName} {user.lastName}
                      </div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <div>
                        Proyecto: <span className="font-medium text-gray-700 dark:text-gray-300">{getUserProjects(user)}</span>
                      </div>
                      <div>
                        Rol frame: <span className="font-medium text-gray-700 dark:text-gray-300">{getUserRolFrames(user)}</span>
                      </div>
                      <div>
                        Contrato: <span className="font-medium text-gray-700 dark:text-gray-300">{getActiveContractType(user) || "N/A"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <input
                        type="number"
                        min="0"
                        value={currentValue}
                        onChange={(e) => handleValueChange(user._id, e.target.value)}
                        className={`w-24 px-3 py-1.5 border rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white text-right
                                        ${isModified ? "border-amber-400 bg-amber-50 dark:bg-amber-900/10" : "border-gray-300 dark:border-gray-600"}
                                    `}
                      />
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                  No se encontraron usuarios con los filtros seleccionados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3 py-4 border-t border-gray-100 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
        <button onClick={handleSaveAll} disabled={submitting || !hasAnyChanges} className="px-6 py-2.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-sm">
          {submitting ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin />
              Guardando ...
            </>
          ) : (
            <>Guardar</>
          )}
        </button>
      </div>
    </div>
  );
};
