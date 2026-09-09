import React, { useState, useEffect } from "react";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faSave, faCalendarAlt, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { vacationsAPI } from "../../api/vacations";
import { usersAPI } from "../../api/users";
import { InfoModal } from "../ui/InfoModal";
import { Paginador, POR_PAGINA } from "../ui/Paginador";
import { SearchAndFilters } from "../ui/SearchAndFilters";
import { getContratoActivo, esContratoVigente, fechaISO } from "../../utils/contratoVigencia";
import { projectsAPI, Project } from "../../api/projects";
import { roleFrameAPI, RoleFrameItem } from "../../api/roleFrames";
import { sweetAlert } from "../../utils/sweetAlert";

/**
 * Fecha de un contrato en DD/MM/YYYY. Pasa por `fechaISO` y no por el `formatDate` de más abajo porque
 * las fechas de contrato llegan en varias formas —"2026-09-01", "2026-09-01T00:00:00.000Z",
 * "01/09/2026" y hasta el string "null"—, y partirlas por "-" a mano devuelve cosas como
 * "01T00:00:00.000Z/09/2026". Sin fecha de baja no es un dato faltante: es tiempo indeterminado.
 */
const fechaContrato = (valor?: string | null): string => {
  const iso = fechaISO(valor);
  return iso ? iso.split("-").reverse().join("/") : "—";
};

interface UserVacationBalance {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  hireDate: string | null;
  seniority: string;
  /** Días extra: beneficio de la compañía, ya sumado dentro de `calculated.totalAnnual`. */
  extraVacationDays?: number;
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

/**
 * Un color por columna, para reconocer cada cifra por el color y no por la posición.
 * Las clases se escriben completas y literales: Tailwind las descarta del build si se arman
 * concatenando el nombre del color.
 */
const COLORES_COLUMNA = {
  extra: {
    encabezado: "text-blue-600 dark:text-blue-400",
    campo: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700/60 focus:ring-blue-500",
    editado: "border-blue-500 ring-1 ring-blue-500",
  },
  total: {
    encabezado: "text-violet-600 dark:text-violet-400",
    campo: "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700/60 focus:ring-violet-500",
    editado: "border-violet-500 ring-1 ring-violet-500",
  },
  tomados: {
    encabezado: "text-red-600 dark:text-red-400",
    campo: "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700/60 focus:ring-red-500",
    editado: "border-red-500 ring-1 ring-red-500",
  },
  pendientes: {
    encabezado: "text-amber-600 dark:text-amber-400",
    campo: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700/60 focus:ring-amber-500",
    editado: "border-amber-500 ring-1 ring-amber-500",
  },
  disponibles: {
    encabezado: "text-emerald-600 dark:text-emerald-400",
    campo: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700/60 focus:ring-emerald-500",
    editado: "border-emerald-500 ring-1 ring-emerald-500",
  },
} as const;

/** Clases del input de una columna. `editado` marca el valor todavía sin guardar. */
const claseCampo = (color: keyof typeof COLORES_COLUMNA, editado: boolean) =>
  `w-20 px-2 py-1 text-center border rounded text-sm font-semibold focus:ring-1 ${COLORES_COLUMNA[color].campo} ${editado ? `${COLORES_COLUMNA[color].editado} font-bold` : ""}`;

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
  // Los días extra viven en el usuario (no en el balance del año), así que se editan y se guardan aparte.
  const [editedExtras, setEditedExtras] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [openInfo, setOpenInfo] = useState(false);
  const [openInfoExtra, setOpenInfoExtra] = useState(false);
  /**
   * Página que se está viendo. Son 1573 personas: dibujarlas todas son 1573 filas con cinco inputs
   * cada una —casi ocho mil campos— y el navegador se arrastra al tipear en cualquiera de ellos.
   *
   * Los cambios sin guardar NO se pierden al cambiar de página: `editedValues` y `editedExtras` están
   * indexados por `userId` y `handleSaveAll` recorre esos mapas, no lo que está dibujado. Se puede
   * editar en la página 1, saltar a la 7, editar ahí y guardar las dos cosas de una.
   */
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    loadFilters();
  }, []);

  useEffect(() => {
    loadBalances();
  }, [selectedYear]);

  useEffect(() => {
    filterBalances();
    // Volver a la 1 al cambiar un filtro: quedarse en la página 7 de un resultado de 3 páginas es una
    // tabla vacía que parece "no hay nadie".
    setPagina(1);
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
      setEditedExtras({});
    } catch (error) {
      console.error("Error loading balances:", error);
      sweetAlert.error("Error", "No se pudieron cargar los balances de vacaciones");
    } finally {
      setLoading(false);
    }
  };

  /**
   * EL CONTRATO QUE RIGE HOY, con el mismo criterio que el resto de la plataforma.
   *
   * Antes esto recorría todos los contratos de todos los proyectos y se quedaba con el ÚLTIMO que
   * encontraba sin fecha de baja vencida — o sea, con el último del recorrido, que depende del orden en
   * que estén guardados y no de cuál manda. `getContratoActivo` es la regla única: entre los vigentes
   * gana el de tiempo indeterminado, después el más reciente, y si no hay ninguno vigente, el más
   * reciente de todos (para poder mostrarlo como NO VIGENTE en vez de esconderlo).
   *
   * Se juntan los contratos de TODOS los proyectos antes de elegir: una persona puede tener varias
   * filas de `UserProject` con parte de sus contratos en cada una, y elegir dentro de cada una por
   * separado devuelve un contrato que la vista de al lado ya descartó.
   */
  const contratoQueRige = (balance: UserVacationBalance): any | null => {
    const todos: any[] = [];
    for (const p of balance.metadata?.projects || []) {
      for (const c of (p as any)?.contracts || []) todos.push(c);
    }
    return getContratoActivo(todos);
  };

  const getActiveContractType = (balance: UserVacationBalance): string | null => {
    const c = contratoQueRige(balance);
    return c ? c.nombre_contrato || c.tipo_contrato || null : null;
  };

  const getActiveRoleFrame = (balance: UserVacationBalance): string => {
    let roleFrame = "Sin rol empresa";
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
        if (roleFrame === "Sin rol empresa" && p.nombre_rol_frame) {
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

  const handleExtraChange = (userId: string, value: string) => {
    const numValue = value === "" ? 0 : parseInt(value);
    if (isNaN(numValue) || numValue < 0) return;
    setEditedExtras((prev) => ({ ...prev, [userId]: numValue }));
  };

  const hasExtraChange = (balance: UserVacationBalance) => {
    const editado = editedExtras[balance.userId];
    return editado !== undefined && editado !== (balance.extraVacationDays || 0);
  };

  const hasAnyChanges =
    Object.keys(editedValues).some((userId) => {
      const balance = balances.find((b) => b.userId === userId);
      return balance && hasRowChanges(balance);
    }) ||
    Object.keys(editedExtras).some((userId) => {
      const balance = balances.find((b) => b.userId === userId);
      return balance && hasExtraChange(balance);
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

      // Los días extra se guardan en el usuario, no como override del año: si se guardaran como
      // override del Total Anual quedarían congelados y el beneficio dejaría de recalcularse.
      const extras = Object.entries(editedExtras).filter(([userId]) => {
        const balance = balances.find((b) => b.userId === userId);
        return balance && hasExtraChange(balance);
      });

      if (updates.length > 0) await vacationsAPI.saveUsersBalance(updates);
      await Promise.all(extras.map(([userId, dias]) => usersAPI.update(userId, { extraVacationDays: dias })));

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

  /*
    Los filtros y el buscador trabajan SIEMPRE sobre el total y recién después se corta la página. Al
    revés —filtrar dentro de la página— el buscador contestaría "no hay nadie" sobre gente que sí está.

    La página se acota acá y no en el `setPagina`: si un filtro deja menos páginas que la que se estaba
    mirando, esto la trae a la última que existe en vez de dibujar una tabla vacía.
  */
  const totalPaginas = Math.max(1, Math.ceil(filteredBalances.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const balancesDeLaPagina = filteredBalances.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Gestión de Vacaciones por Usuario ({filteredBalances.length})</h3>
          <button type="button" onClick={() => setOpenInfo(true)} title="Cómo se usa esta tabla" className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
            <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
          </button>
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

      {/* Los filtros van en el modal de «Filtros», el mismo control que en Usuarios y Pedidos: eran
          cinco selects ocupando una fila entera, y lo aplicado no se veía al scrollear la tabla.
          Ahora queda como badges con su X. */}
      <div className="mb-6">
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar usuario..."
          selectFilters={[
            {
              label: "Proyecto",
              value: selectedProject,
              onChange: setSelectedProject,
              placeholder: "Todos los Proyectos",
              options: projects.map((p) => ({ value: p._id, label: p.name })),
            },
            {
              label: "Rol Empresa",
              value: selectedRoleFrame,
              onChange: setSelectedRoleFrame,
              placeholder: "Todos los Roles Empresa",
              options: roleFrames.map((rf) => ({ value: rf._id, label: rf.name })),
            },
            {
              label: "Contrato",
              value: selectedContract,
              onChange: setSelectedContract,
              placeholder: "Todos los Contratos",
              options: contractTypes.map((c) => ({ value: c, label: c })),
            },
          ]}
          radioFilters={[
            {
              label: "Estado de usuarios",
              value: selectedStatus,
              onChange: setSelectedStatus,
              options: [
                { value: "active", label: "Solo Activos" },
                { value: "inactive", label: "Solo Inactivos" },
                { value: "all", label: "Todos (Activos e Inactivos)" },
              ],
            },
          ]}
        />
      </div>

      {/*
        UNA SOLA BARRA VERTICAL.

        El alto de la tabla es EL QUE QUEDA de pantalla: `100svh` menos lo fijo de arriba, que
        `PageLayout` publica medido en `--wp-sticky-top`, menos lo que hay DEBAJO de la tabla dentro de
        esta tarjeta. Ese segundo descuento es el que faltaba: el `mb-6` propio, el paginador y la barra
        de Guardar sumaban casi diez rem de página sobrante, así que aparecía una segunda barra y llegar
        al final de la tabla no era llegar al final de la página.

        Los 10.5rem son alto de chrome fijo (1.5 del `mb-6` + 1.5 del `p-6` de la tarjeta + ~2.75 del
        paginador + ~4.75 de la barra de Guardar), no un número atado a la pantalla. Cuando el paginador
        no se dibuja —una sola página— sobra ese pedacito abajo: preferible a que falte, porque faltar
        es justamente la segunda barra.

        NO cambiar `overflow-x` por `clip` para empujar el scroll vertical a la página: rompe el
        `<thead>` sticky, que se resuelve contra el scrollport más cercano y este div lo sigue siendo.
        El eje X hace falta igual: la tabla es más ancha que la ventana.

        `min-h` porque el cálculo puede dar muy poco en una pantalla baja, y una tabla de tres filas no
        se puede usar. Cuando el mínimo y el máximo se cruzan, gana el mínimo.
      */}
      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700 mb-6 min-h-[22rem] max-h-[calc(100svh-var(--wp-sticky-top,220px)-10.5rem)]">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 relative">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-900">Usuario</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-900">Ingreso / Antigüedad</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-900">Rol Empresa</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-900">Contrato</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider w-24 bg-gray-50 dark:bg-gray-900 text-violet-600 dark:text-violet-400">Total Anual</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider w-24 bg-gray-50 dark:bg-gray-900 text-red-600 dark:text-red-400">Tomados (Gozados)</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider w-24 bg-gray-50 dark:bg-gray-900 text-amber-600 dark:text-amber-400">Pendientes</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider w-24 bg-gray-50 dark:bg-gray-900 text-emerald-600 dark:text-emerald-400">Disponibles</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider w-24 bg-gray-50 dark:bg-gray-900">
                <span className="inline-flex items-center gap-1.5">
                  Días Extra
                  <button
                    type="button"
                    onClick={() => setOpenInfoExtra(true)}
                    title="Qué son los días extra"
                    className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
                  </button>
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredBalances.length > 0 ? (
              balancesDeLaPagina.map((balance) => {
                const edits = editedValues[balance.userId] || {};
                const isModified = hasRowChanges(balance) || hasExtraChange(balance);

                const totalValue = edits.totalAnnual ?? balance.display.totalAnnual;
                const takenValue = edits.taken ?? balance.display.taken;
                const pendingValue = edits.pending ?? balance.display.pending;
                const availableValue = edits.available ?? balance.display.available;
                const extraValue = editedExtras[balance.userId] ?? balance.extraVacationDays ?? 0;

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
                    {/* Contrato: el tipo, si está vigente y sus fechas — igual que en Contratos. */}
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-700 dark:text-gray-300">
                      {(() => {
                        const contrato = contratoQueRige(balance);
                        if (!contrato) return <span className="text-gray-400 dark:text-gray-500">Sin contrato</span>;
                        const vigente = esContratoVigente(contrato);
                        return (
                          <div className="flex flex-col gap-1">
                            <span>{contrato.nombre_contrato || contrato.tipo_contrato || "Sin tipo"}</span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit ${vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{vigente ? "VIGENTE" : "NO VIGENTE"}</span>
                            <div className="flex flex-col gap-0.5">
                              <span>
                                <span className="text-gray-400 dark:text-gray-500">Alta:</span> {fechaContrato(contrato.fecha_alta_contrato)}
                              </span>
                              <span>
                                {/* Sin baja = tiempo indeterminado, no un dato que falte. */}
                                <span className="text-gray-400 dark:text-gray-500">Baja:</span> {fechaContrato(contrato.fecha_baja_contrato)}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    {/* Total Annual */}
                    <td className="px-4 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        value={totalValue}
                        onChange={(e) => handleFieldChange(balance.userId, "totalAnnual", e.target.value)}
                        className={claseCampo("total", edits.totalAnnual !== undefined && edits.totalAnnual !== balance.display.totalAnnual)}
                      />
                    </td>
                    {/* Tomados */}
                    <td className="px-4 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        value={takenValue}
                        onChange={(e) => handleFieldChange(balance.userId, "taken", e.target.value)}
                        className={claseCampo("tomados", edits.taken !== undefined && edits.taken !== balance.display.taken)}
                      />
                    </td>
                    {/* Pendientes */}
                    <td className="px-4 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        value={pendingValue}
                        onChange={(e) => handleFieldChange(balance.userId, "pending", e.target.value)}
                        className={claseCampo("pendientes", edits.pending !== undefined && edits.pending !== balance.display.pending)}
                      />
                    </td>
                    {/* Disponibles */}
                    <td className="px-4 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        value={availableValue}
                        onChange={(e) => handleFieldChange(balance.userId, "available", e.target.value)}
                        className={claseCampo("disponibles", edits.available !== undefined && edits.available !== balance.display.available)}
                      />
                    </td>
                    {/* Días Extra (beneficio de la compañía): se guarda en el usuario, no en el balance del año */}
                    <td className="px-4 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        value={extraValue}
                        onChange={(e) => handleExtraChange(balance.userId, e.target.value)}
                        title="Beneficio de la compañía: días de vacaciones que la empresa suma a los que fija la ley."
                        className={claseCampo("extra", hasExtraChange(balance))}
                      />
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                  No se encontraron usuarios con los filtros seleccionados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Paginador total={filteredBalances.length} pagina={paginaActual} onCambiar={setPagina} entidadPlural="personas" />

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

      <InfoModal isOpen={openInfo} onClose={() => setOpenInfo(false)} title="Gestión de Vacaciones por Usuario" size="md">
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          <p>Configura y edita los días correspondientes, gozados, pendientes y disponibles para cada año.</p>
          <div>
            <p className="font-semibold mb-2">Las columnas</p>
            {/* En el mismo orden en que están en la tabla, para poder leerlas de corrido. */}
            <ul className="space-y-1">
              <li>
                <span className="font-semibold text-violet-600 dark:text-violet-400">Total Anual</span>: los días que le corresponden, ya con los Días Extra sumados.
              </li>
              <li>
                <span className="font-semibold text-red-600 dark:text-red-400">Tomados (Gozados)</span>: los que ya se usaron.
              </li>
              <li>
                <span className="font-semibold text-amber-600 dark:text-amber-400">Pendientes</span>: los pedidos que todavía no están cerrados.
              </li>
              <li>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Disponibles</span>: lo que queda por tomar.
              </li>
              <li>
                <span className="font-semibold text-blue-600 dark:text-blue-400">Días Extra</span>: el beneficio de la compañía. Se guarda en la persona, no en el año.
              </li>
            </ul>
          </div>
          <p className="text-xs text-gray-500">Un valor con el borde resaltado es un cambio sin guardar.</p>
        </div>
      </InfoModal>

      <InfoModal isOpen={openInfoExtra} onClose={() => setOpenInfoExtra(false)} title="Días Extra" size="sm">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-semibold text-blue-600 dark:text-blue-400">Días Extra</span> es un beneficio de la compañía: días que la empresa otorga por encima
          de los que fija la ley por antigüedad. Se suman al Total Anual y no dependen del año seleccionado.
        </p>
      </InfoModal>
    </div>
  );
};
