import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear, faSpinner, faSearch, faFilter, faCalendar, faClock, faCheckCircle, faTimesCircle, faBan, faChartSimple, faTrash, faFileArrowUp, faUser } from "@fortawesome/free-solid-svg-icons";
import { hrManagementAPI, VacationRequest } from "../api/hrManagement";
import { PageLayout } from "../components/ui/PageLayout";
import { Modal } from "../components/ui/Modal";
import { StatusBadge } from "../components/ui/StatusBadge";
import { StatusType } from "../config/statusConfig";
import { sweetAlert } from "../utils/sweetAlert";
import { getHelp, hasHelp } from "../data/help/helpContent";

const HELP_KEY = "vacations" as const;

interface VacationRequestMock {
  id: string;
  numeroPedido: string;
  reglas: string[];
  solicitante: {
    nombre: string;
    cargo: string;
  };
  estado: "pending" | "approved" | "rejected" | "cancelled";
  firmaEstado: "not_required" | "pending" | "sent" | "signed";
  fechaSolicitud: string;
  diasSolicitados: number;
}

const MOCK_VACATION_DATA: VacationRequestMock[] = [
  {
    id: "1",
    numeroPedido: "000031",
    reglas: ["Vacaciones anuales"],
    solicitante: { nombre: "Juan Colaborador", cargo: "Editor" },
    estado: "pending",
    firmaEstado: "not_required",
    fechaSolicitud: "2025-12-04T00:00:00Z",
    diasSolicitados: 3,
  },
  {
    id: "2",
    numeroPedido: "000030",
    reglas: ["Asuntos personales"],
    solicitante: { nombre: "María González", cargo: "Diseñadora" },
    estado: "approved",
    firmaEstado: "signed",
    fechaSolicitud: "2025-12-01T00:00:00Z",
    diasSolicitados: 5,
  },
  {
    id: "3",
    numeroPedido: "000029",
    reglas: ["Vacaciones anuales", "Día personal"],
    solicitante: { nombre: "Carlos Rodríguez", cargo: "Desarrollador" },
    estado: "approved",
    firmaEstado: "sent",
    fechaSolicitud: "2025-11-28T00:00:00Z",
    diasSolicitados: 7,
  },
  {
    id: "4",
    numeroPedido: "000028",
    reglas: ["Licencia médica"],
    solicitante: { nombre: "Ana Martínez", cargo: "Gerente" },
    estado: "rejected",
    firmaEstado: "pending",
    fechaSolicitud: "2025-11-25T00:00:00Z",
    diasSolicitados: 2,
  },
  {
    id: "5",
    numeroPedido: "000027",
    reglas: ["Vacaciones anuales"],
    solicitante: { nombre: "Pedro López", cargo: "Analista" },
    estado: "cancelled",
    firmaEstado: "not_required",
    fechaSolicitud: "2025-11-20T00:00:00Z",
    diasSolicitados: 4,
  },
  {
    id: "6",
    numeroPedido: "000026",
    reglas: ["Día personal", "Asuntos personales"],
    solicitante: { nombre: "Laura Fernández", cargo: "Coordinadora" },
    estado: "approved",
    firmaEstado: "signed",
    fechaSolicitud: "2025-11-15T00:00:00Z",
    diasSolicitados: 1,
  },
  {
    id: "7",
    numeroPedido: "000025",
    reglas: ["Vacaciones anuales"],
    solicitante: { nombre: "Diego Sánchez", cargo: "Supervisor" },
    estado: "pending",
    firmaEstado: "pending",
    fechaSolicitud: "2025-11-10T00:00:00Z",
    diasSolicitados: 10,
  },
];

export const ManageVacationRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const helpEntry = getHelp(HELP_KEY);

  const [openInfo, setOpenInfo] = useState(false);
  const [mockVacations, setMockVacations] = useState<VacationRequestMock[]>(MOCK_VACATION_DATA);
  const [selectedVacation, setSelectedVacation] = useState<VacationRequestMock | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, cancelled: 0 });

  const getFormattedVacationNumber = (orderNumber: string): string => {
    if (orderNumber.startsWith("#")) return orderNumber;
    return `#${orderNumber}`;
  };

  const getUserName = (solicitante: any): string => {
    if (!solicitante) return "Usuario desconocido";
    if (typeof solicitante === "string") return solicitante;
    return solicitante.nombre || "Usuario desconocido";
  };

  const getUserPosition = (solicitante: any): string => {
    if (!solicitante) return "-";
    if (typeof solicitante === "string") return "-";
    return solicitante.cargo || "-";
  };

  const mapVacationStatusToStatusType = (status: string): StatusType | null => {
    switch (status) {
      case "pending":
        return "vacaciones_pendiente";
      case "approved":
        return "vacaciones_aprobada";
      case "rejected":
        return "vacaciones_rechazada";
      case "cancelled":
        return "vacaciones_cancelada";
      default:
        return null;
    }
  };

  const mapSignatureStateToStatusType = (firmaEstado: string): StatusType | null => {
    switch (firmaEstado) {
      case "not_required":
        return null;
      case "pending":
        return "firma_pendiente";
      case "sent":
        return "firma_enviado_a_firmar";
      case "signed":
        return "firma_firmado";
      default:
        return null;
    }
  };

  const renderSignatureStatus = (vacation: VacationRequestMock): JSX.Element => {
    const statusType = mapSignatureStateToStatusType(vacation.firmaEstado);
    if (!statusType) {
      return <span className="text-gray-400 dark:text-gray-600 text-sm">-</span>;
    }
    return <StatusBadge type={statusType} size="sm" />;
  };

  const calculateStats = (vacations: VacationRequestMock[]) => {
    const newStats = vacations.reduce(
      (acc, vacation) => {
        acc[vacation.estado] = (acc[vacation.estado] || 0) + 1;
        return acc;
      },
      { pending: 0, approved: 0, rejected: 0, cancelled: 0 }
    );
    setStats(newStats);
  };

  const handleDelete = async (vacationId: string, numeroPedido: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    const result = await sweetAlert.confirm("¿Eliminar esta solicitud?", `La solicitud ${getFormattedVacationNumber(numeroPedido)} será eliminada permanentemente. Esta acción no se puede deshacer.`, "Sí, Eliminar", "Cancelar");

    if (!result.isConfirmed) return;

    try {
      setMockVacations((prev) => prev.filter((v) => v.id !== vacationId));

      if (selectedVacation && selectedVacation.id === vacationId) {
        setSelectedVacation(null);
        setShowDetailModal(false);
      }

      await sweetAlert.success("Eliminada", "La solicitud ha sido eliminada correctamente");
    } catch (error: any) {
      await sweetAlert.error("Error", "No se pudo eliminar la solicitud");
    }
  };

  const filteredVacations = mockVacations.filter((vacation) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || getUserName(vacation.solicitante).toLowerCase().includes(searchLower) || vacation.reglas.some((r) => r.toLowerCase().includes(searchLower)) || vacation.numeroPedido.includes(searchTerm);

    const matchesStatus = statusFilter === "all" || vacation.estado === statusFilter;

    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    calculateStats(filteredVacations);
  }, [filteredVacations]);

  return (
    <PageLayout
      title="Vacaciones"
      subtitle="Gestión de solicitudes de vacaciones del personal"
      faIcon={{ icon: faCalendar }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      headerActions={
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/hr/rules/vacations")} className="hidden lg:flex p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors items-center gap-2 text-sm h-full" title="Configurar reglas de vacaciones" aria-label="Configurar reglas de vacaciones">
            <FontAwesomeIcon icon={faGear} />
          </button>
          <button onClick={() => setShowStatsModal(true)} className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm" aria-label="Ver resumen de vacaciones" title="Ver resumen de vacaciones">
            <FontAwesomeIcon icon={faChartSimple} className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          <div className="mb-6 flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Buscar solicitudes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
            </div>

            <div className="relative">
              <FontAwesomeIcon icon={faFilter} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white">
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="approved">Aprobadas</option>
                <option value="rejected">Rechazadas</option>
                <option value="cancelled">Canceladas</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-blue-600" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded border dark:border-slate-800">
                <table className="w-full dark:bg-slate-800/80 table-auto">
                  <thead>
                    <tr>
                      <th className="text-left text-nowrap py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">N° Pedido</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Regla/s</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Solicitante</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Cargo</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Estado</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Firma</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 text-nowrap">Fecha Sol.</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300"></th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredVacations.map((vacation) => (
                      <tr
                        key={vacation.id}
                        className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                        onClick={() => {
                          setSelectedVacation(vacation);
                          setShowDetailModal(true);
                        }}
                      >
                        <td className="py-3 px-4">
                          <span className="bg-gray-50 dark:bg-gray-600/20 text-xs text-gray-600 dark:text-gray-400 px-2 rounded">{getFormattedVacationNumber(vacation.numeroPedido)}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-2">
                            {vacation.reglas.map((regla, index) => (
                              <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/50 dark:text-gray-300 text-nowrap w-fit">
                                {regla}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300 text-nowrap">{getUserName(vacation.solicitante)}</td>
                        <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{getUserPosition(vacation.solicitante)}</td>
                        <td className="py-3 px-4">
                          <StatusBadge type={mapVacationStatusToStatusType(vacation.estado)} size="sm" />
                        </td>
                        <td className="py-3 px-4">{renderSignatureStatus(vacation)}</td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{new Date(vacation.fechaSolicitud).toLocaleDateString()}</td>
                        <td className="py-3 px-4 text-center">
                          <button onClick={(e) => handleDelete(vacation.id, vacation.numeroPedido, e)} className="text-gray-400 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Eliminar solicitud" aria-label="Eliminar solicitud">
                            <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredVacations.length === 0 && (
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faCalendar} className="h-16 w-16 text-gray-400 mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">{searchTerm || statusFilter !== "all" ? "No se encontraron solicitudes con los filtros aplicados" : "No hay solicitudes de vacaciones registradas"}</p>
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-6">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    Anterior
                  </button>
                  <span className="text-gray-600 dark:text-gray-400">
                    Página {page} de {totalPages}
                  </span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal isOpen={showDetailModal && !!selectedVacation} onClose={() => setShowDetailModal(false)} title="Detalles de vacaciones" size="md">
        {selectedVacation && (
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">Contenido placeholder para los detalles de la solicitud de vacaciones.</p>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Solicitante</p>
                <p className="font-medium text-gray-800 dark:text-gray-100">{getUserName(selectedVacation.solicitante)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Cargo</p>
                <p className="font-medium text-gray-800 dark:text-gray-100">{getUserPosition(selectedVacation.solicitante)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Estado</p>
                <StatusBadge type={mapVacationStatusToStatusType(selectedVacation.estado)} size="sm" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Días solicitados</p>
                <p className="font-medium text-gray-800 dark:text-gray-100">{selectedVacation.diasSolicitados} días</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Reglas aplicadas</p>
                <div className="flex flex-wrap gap-2">
                  {selectedVacation.reglas.map((regla, index) => (
                    <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {regla}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showStatsModal} onClose={() => setShowStatsModal(false)} title="Resumen de vacaciones" size="md">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            {[
              { label: "Pendientes", value: stats.pending, icon: faClock, color: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400" },
              { label: "Aprobadas", value: stats.approved, icon: faCheckCircle, color: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" },
              { label: "Rechazadas", value: stats.rejected, icon: faTimesCircle, color: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" },
              { label: "Canceladas", value: stats.cancelled, icon: faBan, color: "bg-orange-50 dark:bg-orange-600/20 text-orange-600 dark:text-orange-400" },
            ].map((stat, index) => (
              <div key={index} className={`rounded-xl shadow-sm p-4 py-2 flex items-center gap-3 ${stat.color}`}>
                <FontAwesomeIcon icon={stat.icon} className="lg:h-5 w-5 opacity-80" />
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-medium opacity-80">{stat.label}</span>
                  <span className="lg:text-lg font-bold">{stat.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
};
