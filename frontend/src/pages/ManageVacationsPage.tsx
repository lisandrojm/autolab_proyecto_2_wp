import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear, faSpinner, faSearch, faFilter, faCalendar, faClock, faCheckCircle, faTimesCircle, faBan, faChartSimple, faTrash, faCheck, faTruck, faFilePdf, faDownload, faFileArrowUp } from "@fortawesome/free-solid-svg-icons";
import { vacationsAPI } from "../api/vacations";
import { PageLayout } from "../components/ui/PageLayout";
import { Modal } from "../components/ui/Modal";
import { StatusBadge } from "../components/ui/StatusBadge";
import { sweetAlert } from "../utils/sweetAlert";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { mapVacationStatusToStatusType, mapVacationSignatureStateToStatusType, isVacationInFinalState } from "../utils/statusHelpers";

const HELP_KEY = "vacations" as const;

interface VacationRequestMock {
  id: string;
  numeroPedido: string;
  reglas: string[];
  solicitante: {
    nombre: string;
    cargo: string;
  };
  estado: "pending" | "pre_approved" | "approved" | "rejected" | "cancelled" | "delivered";
  firmaEstado: "not_required" | "pending" | "sent" | "signed";
  fechaSolicitud: string;
  startDate: string;
  endDate: string;
  diasSolicitados: number;
  requiresSignature?: boolean;
  signatureNotifiedAt?: string;
  pdfPreAprobacionUrl?: string;
}

// Mock vacation data removed - now using API

export const ManageVacationsPage: React.FC = () => {
  const navigate = useNavigate();
  const helpEntry = getHelp(HELP_KEY);

  const [openInfo, setOpenInfo] = useState(false);
  const [mockVacations, setMockVacations] = useState<VacationRequestMock[]>([]);
  const [selectedVacation, setSelectedVacation] = useState<VacationRequestMock | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stats, setStats] = useState({ pending: 0, pre_approved: 0, approved: 0, rejected: 0, delivered: 0, cancelled: 0 });
  const [currentVacationIndex, setCurrentVacationIndex] = useState<number>(0);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (!hasLoadedOnce) {
      loadRecords();
    }
  }, [hasLoadedOnce]);

  const loadRecords = async () => {
    try {
      setLoading(true);
      setHasLoadedOnce(true);
      const data = await vacationsAPI.getAll();
      // Transform API data to match VacationRequestMock interface
      const transformedRecords: VacationRequestMock[] = data.map((item: any) => ({
        id: item._id,
        numeroPedido: item.vacationNumber || item._id,
        reglas: item.vacationRuleIds && Array.isArray(item.vacationRuleIds)
          ? item.vacationRuleIds.map((rule: any) =>
              typeof rule === 'object' && rule.name ? rule.name : ''
            ).filter((name: string) => name !== '')
          : [],
        solicitante: {
          nombre: item.userName || "Usuario",
          cargo: item.position || "-",
        },
        estado: item.status || "pending",
        firmaEstado: item.signatureStatus || "not_required",
        fechaSolicitud: item.createdAt,
        startDate: item.startDate,
        endDate: item.endDate,
        diasSolicitados: item.daysRequested || 0,
        requiresSignature: item.requiresSignature || false,
        signatureNotifiedAt: item.signatureNotifiedAt,
        pdfPreAprobacionUrl: item.pdfPreAprobacionUrl,
      }));
      setMockVacations(transformedRecords);
      calculateStats(transformedRecords);
    } catch (error) {
      console.error("Error loading vacation records:", error);
    } finally {
      setLoading(false);
    }
  };

  const getFormattedVacationNumber = (vacationNumber: string): string => {
    return vacationNumber || "";
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

  const renderSignatureStatus = (vacation: VacationRequestMock): JSX.Element => {
    const statusType = mapVacationSignatureStateToStatusType({
      status: vacation.estado,
      requiresSignature: vacation.requiresSignature || vacation.firmaEstado !== "not_required",
      signatureStatus: vacation.firmaEstado
    });

    const isInFinalState = isVacationInFinalState(vacation.estado);
    const isFinalStatus = ["delivered", "rejected", "cancelled"].includes(vacation.estado);

    if (!statusType) {
      return <span className="text-gray-400 dark:text-gray-600 text-sm">-</span>;
    }

    const isWaitingVerification = vacation.firmaEstado === "sent" && vacation.signatureNotifiedAt;

    return (
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <StatusBadge type={statusType} size="sm" overrideStyle={isInFinalState} />
        </div>
        <div className="flex gap-3">
          {isWaitingVerification && (
            <FontAwesomeIcon
              icon={faClock}
              className={`${isFinalStatus ? "text-gray-600 dark:text-gray-400" : "text-amber-500 dark:text-amber-400"} text-sm`}
              title="Usuario notificó que completó la firma - Esperando verificación"
            />
          )}
          {vacation.pdfPreAprobacionUrl && (
            <a
              href={`${import.meta.env.VITE_API_URL}${vacation.pdfPreAprobacionUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${isFinalStatus ? "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300" : "text-violet-600 hover:text-violet-800 dark:text-violet-600 dark:hover:text-violet-300"} transition-colors`}
              title="Descargar documento PDF"
              onClick={(e) => e.stopPropagation()}
            >
              <FontAwesomeIcon icon={faFilePdf} className="text-lg" />
            </a>
          )}
        </div>
      </div>
    );
  };

  const calculateStats = (vacations: VacationRequestMock[]) => {
    const newStats = vacations.reduce(
      (acc, vacation) => {
        acc[vacation.estado] = (acc[vacation.estado] || 0) + 1;
        return acc;
      },
      { pending: 0, pre_approved: 0, approved: 0, rejected: 0, delivered: 0, cancelled: 0 }
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

  const handlePreApprove = async () => {
    if (!selectedVacation || updating) return;

    const result = await sweetAlert.confirm("¿Pre-aprobar esta solicitud?", `La solicitud ${getFormattedVacationNumber(selectedVacation.numeroPedido)} será preaprobada.`, "Sí, Pre-Aprobar", "Cancelar");
    if (!result.isConfirmed) return;

    setUpdating(true);
    try {
      const updatedVacation = await vacationsAPI.preApprove(selectedVacation.id);
      await loadRecords();
      const refreshed = mockVacations.find((v) => v.id === selectedVacation.id);
      if (refreshed) {
        setSelectedVacation(refreshed);
      }
      await sweetAlert.success("Preaprobada", updatedVacation.pdfPreAprobacionUrl ? "La solicitud ha sido preaprobada y se ha generado el PDF" : "La solicitud ha sido preaprobada correctamente");
    } catch (error: any) {
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo pre-aprobar la solicitud");
    } finally {
      setUpdating(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedVacation || updating) return;

    const requiresSignature = selectedVacation.requiresSignature || selectedVacation.firmaEstado !== "not_required";
    const message = requiresSignature ? "El usuario recibirá una notificación para firmar el documento por email" : "El usuario será notificado";

    const result = await sweetAlert.confirm("¿Aprobar esta solicitud?", message, "Sí, Aprobar", "Cancelar");
    if (!result.isConfirmed) return;

    setUpdating(true);
    try {
      await vacationsAPI.approve(selectedVacation.id);
      await loadRecords();
      const refreshed = mockVacations.find((v) => v.id === selectedVacation.id);
      if (refreshed) {
        setSelectedVacation(refreshed);
      }
      const successMessage = requiresSignature ? "Se ha notificado al usuario que debe firmar el documento por email" : "La solicitud ha sido aprobada correctamente";
      await sweetAlert.success("Aprobada", successMessage);
    } catch (error: any) {
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo aprobar la solicitud");
    } finally {
      setUpdating(false);
    }
  };

  const handleReject = async () => {
    if (!selectedVacation || updating) return;

    const result = await sweetAlert.confirm("¿Rechazar esta solicitud?", "El usuario será notificado del rechazo", "Sí, Rechazar", "Cancelar");
    if (!result.isConfirmed) return;

    setUpdating(true);
    try {
      await vacationsAPI.reject(selectedVacation.id);
      await loadRecords();
      const refreshed = mockVacations.find((v) => v.id === selectedVacation.id);
      if (refreshed) {
        setSelectedVacation(refreshed);
      }
      await sweetAlert.success("Rechazada", "La solicitud ha sido rechazada");
    } catch (error: any) {
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo rechazar la solicitud");
    } finally {
      setUpdating(false);
    }
  };

  const handleDeliver = async () => {
    if (!selectedVacation || updating) return;

    const result = await sweetAlert.confirm("¿Marcar como Entregado?", "La solicitud será marcada como entregada", "Sí, Marcar Entregado", "Cancelar");
    if (!result.isConfirmed) return;

    setUpdating(true);
    try {
      await vacationsAPI.deliver(selectedVacation.id);
      await loadRecords();
      const refreshed = mockVacations.find((v) => v.id === selectedVacation.id);
      if (refreshed) {
        setSelectedVacation(refreshed);
      }
      await sweetAlert.success("Entregado", "La solicitud ha sido marcada como entregada");
    } catch (error: any) {
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo marcar como entregado");
    } finally {
      setUpdating(false);
    }
  };

  const handleSendSignature = async () => {
    if (!selectedVacation || updating) return;

    const result = await sweetAlert.confirm("¿Enviar para Firma?", "Se enviará una notificación al usuario para firmar el documento", "Sí, Enviar", "Cancelar");
    if (!result.isConfirmed) return;

    setUpdating(true);
    try {
      await vacationsAPI.sendSignature(selectedVacation.id);
      await loadRecords();
      const refreshed = mockVacations.find((v) => v.id === selectedVacation.id);
      if (refreshed) {
        setSelectedVacation(refreshed);
      }
      await sweetAlert.success("Enviado", "El documento ha sido enviado para firma");
    } catch (error: any) {
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo enviar para firma");
    } finally {
      setUpdating(false);
    }
  };

  const handleMarkSigned = async () => {
    if (!selectedVacation || updating) return;

    const result = await sweetAlert.confirm("¿Confirmar firma del documento?", "Esto marcará el documento como firmado. Asegúrate de haber verificado que la firma fue completada correctamente.", "Sí, confirmar firma", "Cancelar");
    if (!result.isConfirmed) return;

    setUpdating(true);
    try {
      await vacationsAPI.markSigned(selectedVacation.id);
      await loadRecords();
      const refreshed = mockVacations.find((v) => v.id === selectedVacation.id);
      if (refreshed) {
        setSelectedVacation(refreshed);
      }
      await sweetAlert.success("Firma confirmada", "El documento ha sido marcado como firmado. El usuario será notificado.");
    } catch (error: any) {
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo confirmar la firma");
    } finally {
      setUpdating(false);
    }
  };

  const handleNavigatePrevVacation = () => {
    if (currentVacationIndex > 0) {
      const newIndex = currentVacationIndex - 1;
      setCurrentVacationIndex(newIndex);
      setSelectedVacation(filteredVacations[newIndex]);
    }
  };

  const handleNavigateNextVacation = () => {
    if (currentVacationIndex < filteredVacations.length - 1) {
      const newIndex = currentVacationIndex + 1;
      setCurrentVacationIndex(newIndex);
      setSelectedVacation(filteredVacations[newIndex]);
    }
  };

  const handleOpenModal = (vacation: VacationRequestMock, index: number) => {
    setSelectedVacation(vacation);
    setCurrentVacationIndex(index);
    setShowDetailModal(true);
  };

  const getUserInitials = (name: string): string => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const filteredVacations = mockVacations.filter((vacation) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || getUserName(vacation.solicitante).toLowerCase().includes(searchLower) || vacation.reglas.some((r) => r.toLowerCase().includes(searchLower)) || vacation.numeroPedido.includes(searchTerm);

    const matchesStatus = statusFilter === "all" || vacation.estado === statusFilter;

    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    calculateStats(mockVacations);
  }, [mockVacations]);

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
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 text-nowrap">Período</th>
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
                          <span className="bg-gray-50 dark:bg-gray-600/20 text-xs text-nowrap text-gray-600 dark:text-gray-400 px-2 rounded">{getFormattedVacationNumber(vacation.numeroPedido)}</span>
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
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 text-nowrap">
                          {vacation.startDate && vacation.endDate ? (
                            <>
                              {new Date(vacation.startDate).toLocaleDateString()} - {new Date(vacation.endDate).toLocaleDateString()}
                            </>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">-</span>
                          )}
                        </td>
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

      <Modal
        isOpen={showDetailModal && !!selectedVacation}
        onClose={() => setShowDetailModal(false)}
        title={
          <div className="flex items-center justify-between w-full px-4">
            <div className="flex items-center gap-4">
              {/*             <button onClick={handleNavigatePrevVacation} disabled={currentVacationIndex === 0} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Solicitud anterior">
              <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4" />
            </button> */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Detalles de Vacaciones</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {currentVacationIndex + 1} de {filteredVacations.length}
                </p>
              </div>
              {/*               <button onClick={handleNavigateNextVacation} disabled={currentVacationIndex === filteredVacations.length - 1} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Siguiente solicitud">
                <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4" />
              </button> */}
            </div>
          </div>
        }
        size="2xl"
        hideDefaultCloseButton
      >
        {selectedVacation && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 dark:bg-gray-600/20 px-2">N° Solicitud: {getFormattedVacationNumber(selectedVacation.numeroPedido)}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <StatusBadge type={mapVacationStatusToStatusType(selectedVacation.estado)} />
                    {selectedVacation.firmaEstado !== "not_required" && (
                      <div className="flex items-center gap-1.5">
                        <StatusBadge type={mapVacationSignatureStateToStatusType({
                          status: selectedVacation.estado,
                          requiresSignature: selectedVacation.requiresSignature || selectedVacation.firmaEstado !== "not_required",
                          signatureStatus: selectedVacation.firmaEstado
                        })!} size="sm" overrideStyle={isVacationInFinalState(selectedVacation.estado)} />
                        {selectedVacation.firmaEstado === "sent" && selectedVacation.signatureNotifiedAt && (
                          <FontAwesomeIcon
                            icon={faClock}
                            className={`${["delivered", "rejected", "cancelled"].includes(selectedVacation.estado) ? "text-gray-600 dark:text-gray-400" : "text-amber-500 dark:text-amber-400"} text-sm`}
                            title="Esperando verificación de firma"
                          />
                        )}
                        {selectedVacation.pdfPreAprobacionUrl && (
                          <FontAwesomeIcon
                            icon={faFilePdf}
                            className={`${["delivered", "rejected", "cancelled"].includes(selectedVacation.estado) ? "text-gray-600 dark:text-gray-400" : "text-violet-600 dark:text-violet-600"} text-sm`}
                            title="PDF disponible"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {selectedVacation.pdfPreAprobacionUrl && (
                  <div className="flex justify-end">
                    <a
                      href={`${import.meta.env.VITE_API_URL}${selectedVacation.pdfPreAprobacionUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-6 py-2.5 rounded-lg bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors flex items-center gap-2"
                    >
                      <FontAwesomeIcon icon={faDownload} />
                      Descargar PDF
                    </a>
                  </div>
                )}

                <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                  <div className="flex-shrink-0">
                    <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 font-semibold">{getUserInitials(getUserName(selectedVacation.solicitante))}</div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">{getUserName(selectedVacation.solicitante)}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{getUserPosition(selectedVacation.solicitante)}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedVacation.reglas && selectedVacation.reglas.length > 0 && (
                    <div className="flex flex-col gap-1 p-3 bg-white dark:bg-gray-800">
                      {/*  */}
                      <span className="text-gray-600 dark:text-slate-500">Reglas aplicadas</span>
                      <div className="flex flex-wrap gap-2">
                        {selectedVacation.reglas.map((regla, index) => (
                          <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                            {regla}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedVacation.startDate && selectedVacation.endDate && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex flex-col p-3 bg-white dark:bg-gray-800">
                        <span className="text-gray-600 dark:text-slate-500">Desde</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {new Date(selectedVacation.startDate).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex flex-col p-3 bg-white dark:bg-gray-800">
                        <span className="text-gray-600 dark:text-slate-500">Hasta</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {new Date(selectedVacation.endDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col p-3 bg-white dark:bg-gray-800">
                    <span className="text-gray-600 dark:text-slate-500">Días Solicitados</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {selectedVacation.diasSolicitados} día{selectedVacation.diasSolicitados > 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex flex-col p-3 bg-white dark:bg-gray-800">
                      <span className="text-gray-600 dark:text-slate-500">Fecha de Solicitud</span>
                      <span className="text-sm text-gray-900 dark:text-white">{new Date(selectedVacation.fechaSolicitud).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {!isVacationInFinalState(selectedVacation.estado) && (
              <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-800/50">
                {(() => {
                  return (
                    selectedVacation.requiresSignature &&
                    selectedVacation.firmaEstado === "sent" &&
                    selectedVacation.signatureNotifiedAt && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-500/50 p-4 rounded-lg mb-4">
                        <div className="flex items-start gap-3">
                          <FontAwesomeIcon icon={faClock} className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="font-semibold text-amber-800 dark:text-amber-400 mb-1">Usuario notificó firma completada</h4>
                            <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                              El usuario {getUserName(selectedVacation.solicitante)} indica que completó la firma del documento. Por favor verificá antes de confirmar.
                            </p>
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              Notificado el: {new Date(selectedVacation.signatureNotifiedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  );
                })()}
                <div className="flex items-center justify-end gap-3 flex-wrap">
                  {updating ? (
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4" />
                      <span className="text-sm">Actualizando...</span>
                    </div>
                  ) : (
                    <>
                      {selectedVacation.estado === "pending" && (
                        <>
                          <button onClick={handleReject} disabled={updating} className="px-6 py-2.5 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex gap-1">
                            <FontAwesomeIcon icon={faBan} className="text-lg" />
                            Rechazar
                          </button>
                          <button onClick={handlePreApprove} disabled={updating} className="px-6 py-2.5 rounded-lg bg-cyan-500 text-white font-semibold text-sm hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex gap-1">
                            <FontAwesomeIcon icon={faCheck} className="text-lg" />
                            Pre-Aprobar
                          </button>
                        </>
                      )}

                      {selectedVacation.estado === "pre_approved" && (
                        <>
                          <button onClick={handleReject} disabled={updating} className="px-6 py-2.5 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex gap-1">
                            <FontAwesomeIcon icon={faBan} className="text-lg" />
                            Rechazar
                          </button>
                          <button onClick={handleApprove} disabled={updating} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex gap-1">
                            <FontAwesomeIcon icon={faCheck} className="text-lg" />
                            Aprobar
                          </button>
                        </>
                      )}

                      {selectedVacation.estado === "approved" && (
                        <>
                          <button onClick={handleReject} disabled={updating} className="px-6 py-2.5 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex gap-1">
                            <FontAwesomeIcon icon={faBan} className="text-lg" />
                            Rechazar
                          </button>
                          {selectedVacation.requiresSignature && selectedVacation.firmaEstado === "pending" && (
                            <button onClick={handleSendSignature} disabled={updating} className="px-6 py-2.5 rounded-lg bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                              <FontAwesomeIcon icon={faFileArrowUp} />
                              Enviar para Firma
                            </button>
                          )}
                          {selectedVacation.requiresSignature && selectedVacation.firmaEstado === "sent" && (
                            <button onClick={handleMarkSigned} disabled={updating} className="px-6 py-2.5 rounded-lg bg-green-600 text-white font-semibold text-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                              <FontAwesomeIcon icon={faCheckCircle} />
                              Marcar como Firmado
                            </button>
                          )}
                          <button onClick={handleDeliver} disabled={updating} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                            <FontAwesomeIcon icon={faTruck} />
                            Marcar como Entregado
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={showStatsModal} onClose={() => setShowStatsModal(false)} title="Resumen de vacaciones" size="md">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            {[
              { label: "Pendientes", value: stats.pending, icon: faClock, color: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400" },
              { label: "Preaprobadas", value: stats.pre_approved, icon: faCheck, color: "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400" },
              { label: "Aprobadas", value: stats.approved, icon: faCheckCircle, color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" },
              { label: "Entregadas", value: stats.delivered, icon: faCheckCircle, color: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" },
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
