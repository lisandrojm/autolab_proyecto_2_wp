import React, { useState, useEffect, useRef } from "react";
import { usersAPI } from "../api/users";
import { projectsAPI } from "../api/projects";
import { contratoFrameAPI, ContratoFrameItem } from "../api/contratosFrame";
import { releasesAPI, Release } from "../api/release";
import { MemberContractsManagerModal } from "../components/team/MemberContractsManagerModal";
import { cachedFetch } from "../utils/refCache";
import { infoAPI } from "../api/info";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faBriefcase, faHourglassHalf, faTable, faGrip, faChevronLeft, faChevronRight, faSearch, faClock, faFilter } from "@fortawesome/free-solid-svg-icons";
import { sweetAlert } from "../utils/sweetAlert";

import { getHelp, hasHelp } from "../data/help/helpContent";

interface ContractRecord {
  id: string; // unique internal id for list rendering
  userId: string;
  userEmail: string;
  userName: string;
  projectName: string;
  nombre_contrato: string;
  nombre_sede: string;
  nombre_rol_frame: string;
  fecha_alta_contrato: string;
  fecha_baja_contrato?: string;
  days: number;
  sueldo_mano?: number;
  nombre_estado_empleado: string;
  cantidad_jornadas_laborales?: number;
  tipo_contrato_id?: number;
}

export const ContractsPage: React.FC = () => {
  // Data (paginado server-side POR EMPLEADO — usa endpoint existente en prod)
  const USERS_PER_PAGE = 25;
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [projectOptions, setProjectOptions] = useState<{ id: string; name: string }[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [openInfo, setOpenInfo] = useState(false);
  const [contractTypes, setContractTypes] = useState<Record<number, string>>({});

  // Modal de gestión de TODOS los contratos de una persona (cross-proyecto)
  const [managedUser, setManagedUser] = useState<{ id: string; name: string } | null>(null);
  const [contratoFrames, setContratoFrames] = useState<ContratoFrameItem[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  useEffect(() => {
    contratoFrameAPI.list().then(setContratoFrames).catch(() => setContratoFrames([]));
    releasesAPI.getAll().then(setReleases).catch(() => setReleases([]));
  }, []);

  // Filtering & Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState("all"); // projectId o "all"
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<"table" | "cards">(() => {
    return (localStorage.getItem("contractsViewMode") as "table" | "cards") || "table";
  });

  const HELP_KEY = "contracts";
  const helpEntry = getHelp(HELP_KEY);

  // Detect lg breakpoint (1024px)
  const [isLg, setIsLg] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => setIsLg(window.innerWidth >= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Effective view mode: force cards when screen is smaller than lg
  const effectiveViewMode = isLg ? viewMode : "cards";

  const requestIdRef = useRef(0);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setInitialLoading(true);
        await Promise.all([fetchContractTypes(), fetchProjectOptions(), fetchContracts(1)]);
      } finally {
        setInitialLoading(false);
      }
    };
    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Buscar / filtrar por proyecto → server-side, resetea a página 1 (debounced, como Usuarios).
  const filtersInitedRef = useRef(false);
  useEffect(() => {
    if (!filtersInitedRef.current) {
      filtersInitedRef.current = true;
      return;
    }
    const h = setTimeout(() => {
      setCurrentPage(1);
      fetchContracts(1);
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, projectFilter]);

  // Cambio de página → traer esa página del server.
  const pageInitedRef = useRef(false);
  useEffect(() => {
    if (!pageInitedRef.current) {
      pageInitedRef.current = true;
      return;
    }
    fetchContracts(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const fetchContractTypes = async () => {
    try {
      const types = await infoAPI.listByType("contrato");
      const map: Record<number, string> = {};
      types.forEach((t) => {
        if (t.data && t.data.id) {
          map[t.data.id] = t.data.nombre || t.name;
        }
      });
      setContractTypes(map);
    } catch (error) {
      console.error("Error fetching contract types:", error);
    }
  };

  const fetchProjectOptions = async () => {
    try {
      const projects = await cachedFetch("projects:all", () => projectsAPI.listAll({ limit: 500 }));
      setProjectOptions(
        projects
          .map((p: any) => ({ id: p._id as string, name: (p.name as string) || "" }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch (e) {
      console.error("Error fetching projects for filter:", e);
    }
  };

  const fetchContracts = async (page = currentPage) => {
    try {
      setIsFetching(true);
      const currentId = ++requestIdRef.current;

      // Paginación server-side POR EMPLEADO (usa endpoint existente en prod).
      // De cada empleado de la página se extraen sus contratos.
      const resp = await usersAPI.list({
        page,
        limit: USERS_PER_PAGE,
        projectId: projectFilter !== "all" ? projectFilter : undefined,
        email: searchTerm || undefined,
      });
      if (currentId !== requestIdRef.current) return;

      const rows: ContractRecord[] = [];
      resp.users.forEach((user: any) => {
        const userName = user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : (user.email || "").split("@")[0];
        (user.metadata?.projects || []).forEach((p: any) => {
          const pProjId = typeof p.projectId === "object" ? p.projectId?._id : p.projectId;
          // Si hay filtro de proyecto, solo los contratos de ese proyecto.
          if (projectFilter !== "all" && String(pProjId || "") !== String(projectFilter)) return;
          (p.contracts || []).forEach((c: any, cIdx: number) => {
            const start = c.fecha_alta_contrato ? new Date(c.fecha_alta_contrato) : null;
            const end = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : new Date();
            const days = start ? Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1) : 0;
            rows.push({
              id: `${user._id}-${p._id || pProjId || ""}-${cIdx}`,
              userId: user._id || "",
              userEmail: user.email,
              userName,
              projectName: p.nombre_proyecto || c.nombre_proyecto || "",
              nombre_contrato: c.nombre_contrato || "",
              nombre_sede: c.nombre_sede || "",
              nombre_rol_frame: c.nombre_rol_frame || "",
              fecha_alta_contrato: c.fecha_alta_contrato || "",
              fecha_baja_contrato: c.fecha_baja_contrato,
              days,
              sueldo_mano: c.sueldo_mano,
              nombre_estado_empleado: c.nombre_estado_empleado || "",
              cantidad_jornadas_laborales: c.cantidad_jornadas_laborales,
              tipo_contrato_id: c.tipo_contrato_id,
            });
          });
        });
      });

      // Orden por fecha de alta desc dentro de la página.
      rows.sort((a, b) => new Date(b.fecha_alta_contrato).getTime() - new Date(a.fecha_alta_contrato).getTime());

      setContracts(rows);
      setTotalEmployees(resp.pagination.total); // total de EMPLEADOS (la paginación es por empleado)
      setTotalPages(resp.pagination.pages);
      setHasLoaded(true);
    } catch (error) {
      console.error("Error fetching contracts:", error);
      sweetAlert.error("Error", "No se pudieron cargar los contratos");
      setHasLoaded(true);
    } finally {
      setIsFetching(false);
    }
  };

  const toggleViewMode = (mode: "table" | "cards") => {
    setViewMode(mode);
    localStorage.setItem("contractsViewMode", mode);
  };

  return (
    <PageLayout
      title="Contratos"
      subtitle="Visualiza y gestiona todos los registros de contratación de los usuarios."
      faIcon={{ icon: faFileContract }}
      itemCount={totalEmployees}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || "Ayuda",
        size: helpEntry?.size as any,
        content: helpEntry?.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      searchAndFilters={
        <div className="flex gap-4 items-center justify-between flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <FontAwesomeIcon icon={faSearch} />
            </span>
            <input type="text" className="input-field pl-10 pr-4 h-10 w-full border border-gray-300 dark:border-gray-600 rounded bg-transparent focus:ring-2 focus:ring-blue-500" placeholder="Buscar por usuario, proyecto o contrato..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>

          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
              <FontAwesomeIcon icon={faFilter} />
            </span>
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="input-field pl-10 pr-8 h-10 border border-gray-300 dark:border-gray-600 rounded bg-transparent appearance-none focus:ring-2 focus:ring-blue-500">
              <option value="all">Todos los Proyectos</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="items-center gap-2 shrink-0 hidden lg:flex">
            <button onClick={() => toggleViewMode("cards")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas">
              <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
            </button>
            <button onClick={() => toggleViewMode("table")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla">
              <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
            </button>
          </div>
        </div>
      }
    >
      {initialLoading || isFetching || !hasLoaded ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner message={initialLoading ? "Cargando historial de contratos..." : "Cargando contratos..."} />
        </div>
      ) : contracts.length === 0 ? (
        <EmptyState title="No se encontraron contratos" description={searchTerm ? "Intenta con otros términos de búsqueda." : "No hay registros de contratos en el sistema."} icon={faFileContract} />
      ) : effectiveViewMode === "table" ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar max-h-[700px]">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-sm">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Proyecto / Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Sede / Rol</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Periodo</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Días</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Monto / Jorn.</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {contracts.map((record) => (
                  <tr key={record.id} onClick={() => setManagedUser({ id: record.userId, name: record.userName })} title="Gestionar contratos de la persona" className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center shrink-0">
                          <FontAwesomeIcon icon={faFileContract} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{record.userName}</div>
                          <div className="text-xs text-gray-400 truncate">{record.userEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{record.projectName}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400">
                        <FontAwesomeIcon icon={faFileContract} className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        <span>{record.nombre_contrato}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{record.tipo_contrato_id && contractTypes[record.tipo_contrato_id] ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{contractTypes[record.tipo_contrato_id]}</span> : <span className="text-gray-400">-</span>}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      <div className="font-medium">{record.nombre_sede}</div>
                      <div className="text-xs opacity-70">{record.nombre_rol_frame}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-500">
                      <div>{new Date(record.fecha_alta_contrato).toLocaleDateString()}</div>
                      <div className="text-xs">{record.fecha_baja_contrato ? new Date(record.fecha_baja_contrato).toLocaleDateString() : "Presente"}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-bold px-2.5 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{record.days}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-primary-600 dark:text-primary-400">${record.sueldo_mano?.toLocaleString()}</div>
                      {record.cantidad_jornadas_laborales && <div className="text-xs text-gray-400">{record.cantidad_jornadas_laborales} jor.</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-tight ${record.nombre_estado_empleado === "DISPONIBLE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>{record.nombre_estado_empleado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {contracts.map((record) => (
            <Card key={record.id} onClick={() => setManagedUser({ id: record.userId, name: record.userName })} className="p-0 overflow-hidden group hover:border-primary-500 transition-all border-gray-200 dark:border-gray-700 cursor-pointer">
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700/50">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center shrink-0">
                      <FontAwesomeIcon icon={faFileContract} className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">{record.userName}</h3>
                      <p className="text-[10px] text-gray-500">{record.userEmail}</p>
                    </div>
                  </div>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter ${record.nombre_estado_empleado === "DISPONIBLE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>{record.nombre_estado_empleado}</span>
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Proyecto</label>
                    <div className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faBriefcase} className="text-gray-400 text-[10px]" />
                      <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{record.projectName}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Contrato</label>
                    <div className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faFileContract} className="text-blue-600 dark:text-blue-400 text-[10px]" />
                      <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{record.nombre_contrato}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Sede / Rol</label>
                    <div className="text-[10px] text-gray-600 dark:text-gray-400">
                      <p className="font-bold text-gray-800 dark:text-gray-200">{record.nombre_sede}</p>
                      <p>{record.nombre_rol_frame}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Antigüedad</label>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 font-bold text-primary-600 dark:text-primary-400 text-xs">
                        <FontAwesomeIcon icon={faHourglassHalf} className="text-[10px]" />
                        <span>{record.days} días</span>
                      </div>
                      <div className="text-[9px] text-gray-400">
                        {new Date(record.fecha_alta_contrato).toLocaleDateString()} - {record.fecha_baja_contrato ? new Date(record.fecha_baja_contrato).toLocaleDateString() : "Actual"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700/50">
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faClock} className="text-gray-400 text-[10px]" />
                    <span className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">{record.cantidad_jornadas_laborales || 0} jornadas</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] text-gray-400 uppercase font-bold tracking-widest leading-none">Monto</p>
                    <p className="text-lg font-black text-gray-900 dark:text-white leading-tight">${record.sueldo_mano?.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{contracts.length}</span> contratos · <span className="font-semibold text-gray-900 dark:text-gray-100">{totalEmployees}</span> empleados · pág. {currentPage}/{totalPages}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <div className="flex items-center px-4 text-sm font-medium dark:text-gray-100">
              Página {currentPage} de {totalPages}
            </div>
            <button onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </div>
        </div>
      )}

      <MemberContractsManagerModal
        isOpen={!!managedUser}
        onClose={() => setManagedUser(null)}
        userId={managedUser?.id || null}
        userName={managedUser?.name}
        contratoFrames={contratoFrames}
        releases={releases}
      />
    </PageLayout>
  );
};
