import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faFilter, faSpinner, faSave } from "@fortawesome/free-solid-svg-icons";
import { usersAPI, User } from "../../api/users";
import { areasAPI, Area } from "../../api/areas";
import { positionsAPI, Position } from "../../api/positions";
import { levelsAPI, Level } from "../../api/levels";
import { sweetAlert } from "../../utils/sweetAlert";

export const UserVacationConfigTab: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [areas, setAreas] = useState<Area[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [selectedPosition, setSelectedPosition] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");

  // Editing state: userId -> new extra days value
  const [editedValues, setEditedValues] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, selectedArea, selectedPosition, selectedLevel]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, areasData, positionsData, levelsData] = await Promise.all([
        usersAPI.list({ limit: 1000 }), // Get all users
        areasAPI.list({ limit: 100 }),
        positionsAPI.list({ limit: 100 }),
        levelsAPI.list({ limit: 100 }),
      ]);
      setUsers(usersData.users);
      setAreas(areasData.areas);
      setPositions(positionsData.positions);
      setLevels(levelsData.levels);
    } catch (error) {
      console.error("Error loading data:", error);
      sweetAlert.error("Error", "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let result = users;

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter((u) => u.firstName?.toLowerCase().includes(lowerTerm) || u.lastName?.toLowerCase().includes(lowerTerm) || u.email.toLowerCase().includes(lowerTerm));
    }

    if (selectedArea) {
      result = result.filter((u) => {
        const areaId = typeof u.areaId === "object" ? u.areaId?._id : u.areaId;
        return areaId === selectedArea;
      });
    }

    if (selectedPosition) {
      result = result.filter((u) => {
        const posId = typeof u.positionId === "object" ? u.positionId?._id : u.positionId;
        return posId === selectedPosition;
      });
    }

    if (selectedLevel) {
      result = result.filter((u) => {
        const levelId = typeof u.levelId === "object" ? u.levelId?._id : u.levelId;
        return levelId === selectedLevel;
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
        {} as Record<string, number>
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <FontAwesomeIcon icon={faSpinner} className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Configuración Individual de Días Extra</h3>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar usuario..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
        </div>

        <div className="relative">
          <FontAwesomeIcon icon={faFilter} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <select value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none">
            <option value="">Todas las Areas</option>
            {areas.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <FontAwesomeIcon icon={faFilter} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <select value={selectedPosition} onChange={(e) => setSelectedPosition(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none">
            <option value="">Todos los Cargos</option>
            {positions.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <FontAwesomeIcon icon={faFilter} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <select value={selectedLevel} onChange={(e) => setSelectedLevel(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none">
            <option value="">Todos los Niveles</option>
            {levels.map((l) => (
              <option key={l._id} value={l._id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 mb-6 max-h-[600px] overflow-y-auto">
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
                        Area: <span className="font-medium text-gray-700 dark:text-gray-300">{(user.areaId as any)?.name || "N/A"}</span>
                      </div>
                      <div>
                        Cargo: <span className="font-medium text-gray-700 dark:text-gray-300">{(user.positionId as any)?.name || "N/A"}</span>
                      </div>
                      <div>
                        Nivel: <span className="font-medium text-gray-700 dark:text-gray-300">{(user.levelId as any)?.name || "N/A"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <input
                        type="number"
                        min="0"
                        value={currentValue}
                        onChange={(e) => handleValueChange(user._id, e.target.value)}
                        className={`w-24 px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white text-right
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
        <button onClick={handleSaveAll} disabled={submitting || !hasAnyChanges} className="px-6 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-sm">
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
