import React, { useState, useEffect } from "react";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faFilter, faSpinner, faSave, faCalendarAlt, faClipboardList } from "@fortawesome/free-solid-svg-icons";
import { orderConfigAPI, OrderConfig } from "../../api/orderConfig";
import { projectsAPI, Project } from "../../api/projects";
import { roleFrameAPI, RoleFrameItem } from "../../api/roleFrames";
import { sweetAlert } from "../../utils/sweetAlert";

interface UserOrderBalance {
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
  installmentsInfo?: {
    total: number;
    passed: number;
    remaining: number;
  };
}

export const UserOrderManagementTab: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  
  // Order Types (Date categories only)
  const [orderConfigs, setOrderConfigs] = useState<OrderConfig[]>([]);
  const [selectedOrderConfigId, setSelectedOrderConfigId] = useState<string>("");
  const [loadingConfigs, setLoadingConfigs] = useState(true);

  // Order Subtypes/Options
  const [subtypes, setSubtypes] = useState<any[]>([]);
  const [selectedSubtypeId, setSelectedSubtypeId] = useState<string>("");

  // Balance values
  const [balances, setBalances] = useState<UserOrderBalance[]>([]);
  const [filteredBalances, setFilteredBalances] = useState<UserOrderBalance[]>([]);
  const [loading, setLoading] = useState(false);

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

  const activeConfig = orderConfigs.find((c) => c._id === selectedOrderConfigId);
  const isDinero = activeConfig?.categoryType === "dinero";

  const getHeaderLabel = (column: "total" | "taken" | "pending" | "available") => {
    const categoryType = activeConfig?.categoryType || "fecha";
    if (categoryType === "dinero") {
      switch (column) {
        case "total": return "Límite";
        case "taken": return "Monto Tomado";
        case "pending": return "Monto Pendiente";
        case "available": return "Monto Disponible";
      }
    } else if (categoryType === "objeto" || categoryType === "otros") {
      switch (column) {
        case "total": return "Límite";
        case "taken": return "Pedidos Tomados";
        case "pending": return "Pedidos Pendientes";
        case "available": return "Pedidos Disponibles";
      }
    } else {
      switch (column) {
        case "total": return "Total Anual";
        case "taken": return "Tomados (Gozados)";
        case "pending": return "Pendientes";
        case "available": return "Disponibles";
      }
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const activeConfig = orderConfigs.find((c) => c._id === selectedOrderConfigId);
    const activeSubtypes = activeConfig?.config?.subtipos || [];
    setSubtypes(activeSubtypes);
    if (activeSubtypes.length > 0) {
      setSelectedSubtypeId(activeSubtypes[0].id);
    } else {
      setSelectedSubtypeId("");
    }
  }, [selectedOrderConfigId, orderConfigs]);

  useEffect(() => {
    if (selectedOrderConfigId) {
      const activeConfig = orderConfigs.find((c) => c._id === selectedOrderConfigId);
      const activeSubtypes = activeConfig?.config?.subtipos || [];
      if (activeSubtypes.length > 0) {
        const isValidSubtype = activeSubtypes.some((s) => s.id === selectedSubtypeId);
        if (!isValidSubtype) {
          // Wait for selectedSubtypeId to be updated to a valid subtype of the new category
          return;
        }
      }
      loadBalances();
    } else {
      setBalances([]);
    }
  }, [selectedYear, selectedOrderConfigId, selectedSubtypeId, orderConfigs]);

  useEffect(() => {
    filterBalances();
  }, [balances, searchTerm, selectedProject, selectedRoleFrame, selectedContract, selectedStatus]);

  const loadInitialData = async () => {
    setLoadingConfigs(true);
    try {
      const [configs, projectsData, roleFramesData] = await Promise.all([
        orderConfigAPI.getAll(true),
        projectsAPI.listAll(),
        roleFrameAPI.list(),
      ]);

      const dateConfigs = configs.filter((c) => ["fecha", "dinero", "objeto", "otros"].includes(c.categoryType));
      setOrderConfigs(dateConfigs);
      setProjects(projectsData);
      setRoleFrames(roleFramesData);

      if (dateConfigs.length > 0) {
        setSelectedOrderConfigId(dateConfigs[0]._id);
      }
    } catch (error) {
      console.error("Error loading initial data:", error);
      sweetAlert.error("Error", "No se pudieron cargar las configuraciones de filtros");
    } finally {
      setLoadingConfigs(false);
    }
  };

  const loadBalances = async () => {
    setLoading(true);
    try {
      const data = await orderConfigAPI.getUsersBalance(selectedYear, selectedOrderConfigId, selectedSubtypeId || undefined);
      setBalances(data);

      const contractsSet = new Set<string>();
      data.forEach((b) => {
        const cType = getActiveContractType(b);
        if (cType) contractsSet.add(cType);
      });
      setContractTypes(Array.from(contractsSet).sort());
      setEditedValues({}); // Clear edits on change
    } catch (error) {
      console.error("Error loading balances:", error);
      sweetAlert.error("Error", "No se pudieron cargar los balances de pedidos");
    } finally {
      setLoading(false);
    }
  };

  const getActiveContractType = (balance: UserOrderBalance): string | null => {
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

  const getActiveRoleFrame = (balance: UserOrderBalance): string => {
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
            mp.rol_frame_id == rf.externalId || 
            mp.rol_frame_id == rf.data?.rol?.id || 
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

    const balance = balances.find((b) => b.userId === userId);
    if (!balance) return;

    const t = balance.display.totalAnnual;

    if (field === "taken") {
      const p = editedValues[userId]?.pending ?? balance.display.pending;
      if (numValue + p > t) {
        sweetAlert.warning("Límite excedido", isDinero ? "La suma de Tomados y Pendientes no puede superar el límite anual." : "La suma de Tomados y Pendientes no puede superar el Total Anual.");
        return;
      }
    }

    if (field === "pending") {
      const tk = editedValues[userId]?.taken ?? balance.display.taken;
      if (numValue + tk > t) {
        sweetAlert.warning("Límite excedido", isDinero ? "La suma de Tomados y Pendientes no puede superar el límite anual." : "La suma de Tomados y Pendientes no puede superar el Total Anual.");
        return;
      }
    }

    setEditedValues((prev) => {
      const userEdits = { ...(prev[userId] || {}) };
      userEdits[field] = numValue;

      // Auto-calculate available if totalAnnual, taken, or pending changes
      const t = userEdits.totalAnnual ?? balance.display.totalAnnual;
      const tk = userEdits.taken ?? balance.display.taken;
      const p = userEdits.pending ?? balance.display.pending;
      userEdits.available = Math.max(0, t - tk - p);

      return { ...prev, [userId]: userEdits };
    });
  };

  const hasRowChanges = (balance: UserOrderBalance) => {
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
            orderConfigId: selectedOrderConfigId,
            subtypeId: selectedSubtypeId || undefined,
            year: selectedYear,
            totalAnnual: edits.totalAnnual ?? balance.display.totalAnnual,
            taken: edits.taken ?? balance.display.taken,
            pending: edits.pending ?? balance.display.pending,
            available: edits.available ?? balance.display.available,
          };
        })
        .filter(Boolean);

      await orderConfigAPI.saveUsersBalance(updates);
      sweetAlert.success("Cambios guardados correctamente");
      loadBalances();
    } catch (error) {
      console.error("Error saving user order balances:", error);
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

  if (loadingConfigs) {
    return <LoadingSpinner message="Cargando tipos de pedidos y filtros..." />;
  }

  const yearsOptions = [];
  for (let y = currentYear - 2; y <= currentYear + 4; y++) {
    yearsOptions.push(y);
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Gestión de Pedidos por Usuario ({filteredBalances.length})</h3>
          <p className="text-xs text-gray-500 mt-1">
            {isDinero
              ? "Configura y edita los montos correspondientes, tomados, pendientes y disponibles por tipo de pedido para cada año."
              : "Configura y edita los días/unidades correspondientes, tomados, pendientes y disponibles por tipo de pedido para cada año."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Order Config Dropdown */}
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 p-2 rounded border border-gray-200 dark:border-gray-700">
            <FontAwesomeIcon icon={faClipboardList} className="text-blue-500 dark:text-blue-400" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tipo de Pedido:</span>
            <select
              value={selectedOrderConfigId}
              onChange={(e) => setSelectedOrderConfigId(e.target.value)}
              className="bg-transparent border-none text-sm font-bold text-blue-600 dark:text-blue-400 focus:ring-0 focus:outline-none"
            >
              {orderConfigs.length > 0 ? (
                orderConfigs.map((c) => (
                  <option key={c._id} value={c._id} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    {c.name}
                  </option>
                ))
              ) : (
                <option value="" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                  Ningún tipo de pedido creado
                </option>
              )}
            </select>
          </div>

          {/* Subtype Option Config Dropdown */}
          {subtypes.length > 0 && (
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 p-2 rounded border border-gray-200 dark:border-gray-700">
              <FontAwesomeIcon icon={faClipboardList} className="text-blue-500 dark:text-blue-400" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Opción del Pedido:</span>
              <select
                value={selectedSubtypeId}
                onChange={(e) => setSelectedSubtypeId(e.target.value)}
                className="bg-transparent border-none text-sm font-bold text-blue-600 dark:text-blue-400 focus:ring-0 focus:outline-none"
              >
                {subtypes.map((sub) => (
                  <option key={sub.id} value={sub.id} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    {sub.label}
                  </option>
                ))}
              </select>
            </div>
          )}

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
      {loading ? (
        <div className="py-20">
          <LoadingSpinner message="Cargando balances de usuarios..." />
        </div>
      ) : selectedOrderConfigId ? (
        <>
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700 mb-6 max-h-[600px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 relative">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Usuario</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ingreso / Antigüedad</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rol Frame</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contrato</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">{getHeaderLabel("total")}</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">{getHeaderLabel("taken")}</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">{getHeaderLabel("pending")}</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">{getHeaderLabel("available")}</th>
                  {isDinero && (
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Cuotas</th>
                  )}
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
                        <td className="px-4 py-4 text-center text-sm font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {isDinero ? (
                            !activeConfig?.limitType ? "Sin límite" : `$ ${totalValue.toLocaleString("es-AR")}`
                          ) : totalValue}
                        </td>
                        {/* Tomados */}
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {isDinero && <span className="text-gray-500 text-sm">$</span>}
                            <input
                              type="number"
                              min="0"
                              value={takenValue}
                              onChange={(e) => handleFieldChange(balance.userId, "taken", e.target.value)}
                              className={`${isDinero ? "w-28" : "w-20"} px-2 py-1 text-center border rounded text-sm focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:text-white
                                ${edits.taken !== undefined && edits.taken !== balance.display.taken
                                  ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 font-bold"
                                  : "border-gray-300 dark:border-gray-600"
                                }
                              `}
                            />
                          </div>
                        </td>
                        {/* Pendientes */}
                        <td className="px-4 py-4 text-center text-sm font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {isDinero ? `$ ${pendingValue.toLocaleString("es-AR")}` : pendingValue}
                        </td>
                        {/* Disponibles */}
                        <td className="px-4 py-4 text-center text-sm font-semibold text-gray-750 dark:text-gray-300 whitespace-nowrap">
                          {isDinero ? (
                            !activeConfig?.limitType ? "Sin límite" : `$ ${availableValue.toLocaleString("es-AR")}`
                          ) : availableValue}
                        </td>
                        {/* Installments info (Dinero only) */}
                        {isDinero && (
                          <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-750 dark:text-gray-300 text-center">
                            {balance.installmentsInfo && balance.installmentsInfo.total > 0 ? (
                              <div className="inline-block text-left text-[11px] leading-relaxed">
                                <div>Totales: <span className="font-semibold text-gray-900 dark:text-white">{balance.installmentsInfo.total}</span></div>
                                <div className="text-[10px] text-green-600 dark:text-green-400 font-medium">Pasadas: {balance.installmentsInfo.passed}</div>
                                <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Restantes: {balance.installmentsInfo.remaining}</div>
                              </div>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-600">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={isDinero ? 9 : 8} className="px-6 py-8 text-center text-gray-500">
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
        </>
      ) : (
        <div className="text-center py-20 text-gray-500">
          No hay tipos de pedidos disponibles para gestionar.
        </div>
      )}
    </div>
  );
};
