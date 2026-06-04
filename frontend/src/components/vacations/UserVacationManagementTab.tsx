import React, { useState, useEffect } from "react";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faFilter, faSpinner, faSave, faCalendarAlt } from "@fortawesome/free-solid-svg-icons";
import { vacationsAPI } from "../../api/vacations";
import { projectsAPI, Project } from "../../api/projects";
import { roleFrameAPI, RoleFrameItem } from "../../api/roleFrames";
import { sweetAlert } from "../../utils/sweetAlert";

interface UserVacationBalance {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  hireDate: string | null;
  seniority: string;
  calculated: {
    totalAnnual: number;
    taken: number;
    pending: number;
    available: number;
  };
  override?: {
    totalAnnual?: number;
    taken?: number;
    pending?: number;
    available?: number;
  };
  display: {
    totalAnnual: number;
    taken: number;
    pending: number;
    available: number;
  };
  projectIds: string[];
  metadata?: any;
}

export const UserVacationManagementTab: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [balances, setBalances] = useState<UserVacationBalance[]>([]);
  const [filteredBalances, setFilteredBalances] = useState<UserVacationBalance[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [projects, setProjects] = useState<Project[]>([]);
  const [roleFrames, setRoleFrames] = useState<RoleFrameItem[]>([]);
  const [contractTypes, setContractTypes] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedRoleFrame, setSelectedRoleFrame] = useState<string>("");
  const [selectedContract, setSelectedContract] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("active");

  // Editing state: userId -> edited fields
  const [editedValues, setEditedValues] = useState<Record<string, { totalAnnual?: number; taken?: number; pending?: number; available?: number }>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadFilters();
  }, []);

  useEffect(() => {
    loadBalances();
  }, [selectedYear]);

  useEffect(() => {
    filterBalances();
  }, [balances, searchTerm, selectedProject, selectedRoleFrame, selectedContract, selectedStatus]);

  const loadFilters = async () => {
    try {
      const [projectsData, roleFramesData] = await Promise.all([
        projectsAPI.listAll(),
        roleFrameAPI.list(),
      ]);
      setProjects(projectsData);
      setRoleFrames(roleFramesData);
    } catch (error) {
      console.error("Error loading filters:", error);
    }
  };

  const loadBalances = async () => {
    setLoading(true);
    try {
      const data = await vacationsAPI.getUsersBalance(selectedYear);
      setBalances(data);

      const contractsSet = new Set<string>();
      data.forEach((b) => {
        const cType = getActiveContractType(b);
        if (cType) contractsSet.add(cType);
      });
      setContractTypes(Array.from(contractsSet).sort());
      setEditedValues({}); // Clear edits on year change
    } catch (error) {
      console.error("Error loading balances:", error);
      sweetAlert.error("Error", "No se pudieron cargar los balances de vacaciones");
    } finally {
      setLoading(false);
    }
  };

  const getActiveContractType = (balance: UserVacationBalance): string | null => {
    let contractType: string | null = null;
    if (balance.metadata?.projects) {
      balance.metadata.projects.forEach((p: any) => {
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
    return contractType;
  };

  const getActiveRoleFrame = (balance: UserVacationBalance): string => {
    let roleFrame = "Sin rol frame";
    if (balance.metadata?.projects) {
      const now = new Date().getTime();
      balance.metadata.projects.forEach((p: any) => {
        if (p.contracts) {
          p.contracts.forEach((c: any) => {
            const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
            if (endDate) endDate.setHours(23, 59, 59, 999);
            const isActive = !endDate || endDate.getTime() >= now;
            if (isActive && c.nombre_rol_frame) {
              roleFrame = c.nombre_rol_frame;
            }
          });
        }
        if (roleFrame === "Sin rol frame" && p.nombre_rol_frame) {
          roleFrame = p.nombre_rol_frame;
        }
      });
    }
    return roleFrame;
  };

  const filterBalances = () => {
    let result = balances;

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter((b) => 
        b.firstName?.toLowerCase().includes(lowerTerm) || 
        b.lastName?.toLowerCase().includes(lowerTerm) || 
        b.email.toLowerCase().includes(lowerTerm)
      );
    }

    if (selectedProject) {
      result = result.filter((b) => {
        const userProjectIds = b.projectIds || [];
        return userProjectIds.includes(selectedProject);
      });
    }

    if (selectedRoleFrame) {
      result = result.filter((b) => {
        const userMetaProjects = b.metadata?.projects || [];
        const rf = roleFrames.find((r) => r._id === selectedRoleFrame);
        if (rf) {
          return userMetaProjects.some((mp: any) => 
            mp.rol_frame_id === rf.externalId || 
            mp.rol_frame_id === rf.data?.rol?.id || 
            mp.nombre_rol_frame === rf.name
          );
        }
        return false;
      });
    }

    if (selectedContract) {
      result = result.filter((b) => {
        return getActiveContractType(b) === selectedContract;
      });
    }

    if (selectedStatus) {
      result = result.filter((b) => {
        const isUserActive = b.metadata?.activo !== false;
        if (selectedStatus === "active") return isUserActive;
        if (selectedStatus === "inactive") return !isUserActive;
        return true; // "all"
      });
    }

    setFilteredBalances(result);
  };

  const handleFieldChange = (userId: string, field: "totalAnnual" | "taken" | "pending" | "available", value: string) => {
    const numValue = value === "" ? 0 : parseInt(value);
    if (isNaN(numValue) || numValue < 0) return;

    setEditedValues((prev) => {
      const userEdits = { ...(prev[userId] || {}) };
      userEdits[field] = numValue;

      // Auto-calculate available if totalAnnual, taken, or pending changes
      const balance = balances.find((b) => b.userId === userId);
      if (balance && field !== "available") {
        const t = userEdits.totalAnnual ?? balance.display.totalAnnual;
        const tk = userEdits.taken ?? balance.display.taken;
        const p = userEdits.pending ?? balance.display.pending;
        userEdits.available = Math.max(0, t - tk - p);
      }

      return { ...prev, [userId]: userEdits };
    });
  };

  const hasRowChanges = (balance: UserVacationBalance) => {
    const edits = editedValues[balance.userId];
    if (!edits) return false;

    return (
      (edits.totalAnnual !== undefined && edits.totalAnnual !== balance.display.totalAnnual) ||
      (edits.taken !== undefined && edits.taken !== balance.display.taken) ||
      (edits.pending !== undefined && edits.pending !== balance.display.pending) ||
      (edits.available !== undefined && edits.available !== balance.display.available)
    );
  };

  const hasAnyChanges = Object.keys(editedValues).some((userId) => {
    const balance = balances.find((b) => b.userId === userId);
    return balance && hasRowChanges(balance);
  });

  const handleSaveAll = async () => {
    if (!hasAnyChanges) return;

    setSubmitting(true);
    try {
      const updates = Object.entries(editedValues)
        .map(([userId, edits]) => {
          const balance = balances.find((b) => b.userId === userId);
          if (!balance || !hasRowChanges(balance)) return null;

          return {
            userId,
            year: selectedYear,
            totalAnnual: edits.totalAnnual ?? balance.display.totalAnnual,
            taken: edits.taken ?? balance.display.taken,
            pending: edits.pending ?? balance.display.pending,
            available: edits.available ?? balance.display.available,
          };
        })
        .filter(Boolean);

      await vacationsAPI.saveUsersBalance(updates);
      sweetAlert.success("Cambios guardados correctamente");
      loadBalances();
    } catch (error) {
      console.error("Error saving user vacation balances:", error);
      sweetAlert.error("Error", "No se pudieron guardar los cambios");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    try {
      const [y, m, d] = dateStr.split("-");
      return `${d}/${m}/${y}`;
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando balances de vacaciones..." />;
  }

  const yearsOptions = [];
  for (let y = currentYear - 2; y <= currentYear + 4; y++) {
    yearsOptions.push(y);
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Gestión de Vacaciones por Usuario ({filteredBalances.length})</h3>
          <p className="text-xs text-gray-500 mt-1">Configura y edita los días correspondientes, gozados, pendientes y disponibles para cada año.</p>
        </div>

        {/* Year Dropdown */}
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 p-2 rounded border border-gray-200 dark:border-gray-700">
          <FontAwesomeIcon icon={faCalendarAlt} className="text-blue-500 dark:text-blue-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Período Anual:</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="bg-transparent border-none text-sm font-bold text-blue-600 dark:text-blue-400 focus:ring-0 focus:outline-none"
          >
            {yearsOptions.map((y) => (
              <option key={y} value={y} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar usuario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div className="relative">
          <FontAwesomeIcon icon={faFilter} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none"
          >
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
          <select
            value={selectedRoleFrame}
            onChange={(e) => setSelectedRoleFrame(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none"
          >
            <option value="">Todos los Roles Frame</option>
            {roleFrames.map((rf) => (
              <option key={rf._id} value={rf._id}>
                {rf.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <FontAwesomeIcon icon={faFilter} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <select
            value={selectedContract}
            onChange={(e) => setSelectedContract(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none"
          >
            <option value="">Todos los Contratos</option>
            {contractTypes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <FontAwesomeIcon icon={faFilter} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none"
          >
            <option value="active">Solo Activos</option>
            <option value="inactive">Solo Inactivos</option>
            <option value="all">Todos (Activos e Inactivos)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700 mb-6 max-h-[600px] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 relative">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Usuario</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ingreso / Antigüedad</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rol Frame</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contrato</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Total Anual</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Tomados (Gozados)</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Pendientes</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Disponibles</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredBalances.length > 0 ? (
              filteredBalances.map((balance) => {
                const edits = editedValues[balance.userId] || {};
                const isModified = hasRowChanges(balance);

                const totalValue = edits.totalAnnual ?? balance.display.totalAnnual;
                const takenValue = edits.taken ?? balance.display.taken;
                const pendingValue = edits.pending ?? balance.display.pending;
                const availableValue = edits.available ?? balance.display.available;

                return (
                  <tr key={balance.userId} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${isModified ? "bg-amber-50/10 dark:bg-amber-900/5" : ""}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {balance.firstName} {balance.lastName}
                        </div>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${balance.metadata?.activo !== false ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                          {balance.metadata?.activo !== false ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">{balance.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                      <div>
                        Ingreso: <span className="font-semibold text-gray-750 dark:text-gray-300">{formatDate(balance.hireDate)}</span>
                      </div>
                      <div className="mt-0.5">
                        Antigüedad: <span className="font-semibold text-gray-750 dark:text-gray-300">{balance.seniority}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-700 dark:text-gray-300">
                      {getActiveRoleFrame(balance)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-700 dark:text-gray-300">
                      {getActiveContractType(balance) || "Sin contrato"}
                    </td>
                    {/* Total Annual */}
                    <td className="px-4 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        value={totalValue}
                        onChange={(e) => handleFieldChange(balance.userId, "totalAnnual", e.target.value)}
                        className={`w-20 px-2 py-1 text-center border rounded text-sm focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:text-white
                          ${edits.totalAnnual !== undefined && edits.totalAnnual !== balance.display.totalAnnual
                            ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 font-bold"
                            : "border-gray-300 dark:border-gray-600"
                          }
                        `}
                      />
                    </td>
                    {/* Tomados */}
                    <td className="px-4 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        value={takenValue}
                        onChange={(e) => handleFieldChange(balance.userId, "taken", e.target.value)}
                        className={`w-20 px-2 py-1 text-center border rounded text-sm focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:text-white
                          ${edits.taken !== undefined && edits.taken !== balance.display.taken
                            ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 font-bold"
                            : "border-gray-300 dark:border-gray-600"
                          }
                        `}
                      />
                    </td>
                    {/* Pendientes */}
                    <td className="px-4 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        value={pendingValue}
                        onChange={(e) => handleFieldChange(balance.userId, "pending", e.target.value)}
                        className={`w-20 px-2 py-1 text-center border rounded text-sm focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:text-white
                          ${edits.pending !== undefined && edits.pending !== balance.display.pending
                            ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 font-bold"
                            : "border-gray-300 dark:border-gray-600"
                          }
                        `}
                      />
                    </td>
                    {/* Disponibles */}
                    <td className="px-4 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        value={availableValue}
                        onChange={(e) => handleFieldChange(balance.userId, "available", e.target.value)}
                        className={`w-20 px-2 py-1 text-center border rounded text-sm focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:text-white
                          ${edits.available !== undefined && edits.available !== balance.display.available
                            ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 font-bold"
                            : "border-gray-300 dark:border-gray-600"
                          }
                        `}
                      />
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  No se encontraron usuarios con los filtros seleccionados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3 py-4 border-t border-gray-100 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
        <button
          onClick={handleSaveAll}
          disabled={submitting || !hasAnyChanges}
          className="px-6 py-2.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold shadow-sm"
        >
          {submitting ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin />
              Guardando...
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faSave} />
              Guardar Cambios
            </>
          )}
        </button>
      </div>
    </div>
  );
};
