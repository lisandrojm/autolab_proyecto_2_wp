import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "../../components/ui/PageLayout";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { RequestCard } from "../../components/requests/RequestCard";
import { RequestTable } from "../../components/requests/RequestTable";
import { RequestApproveModal } from "../../components/requests/RequestApproveModal";
import { RequestRejectModal } from "../../components/requests/RequestRejectModal";
import { requestsAPI, RequestData } from "../../api/requests";
import { useAuthStore } from "../../stores/authStore";
import { sweetAlert } from "../../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClipboardList } from "@fortawesome/free-solid-svg-icons";

export const RequestsListPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<RequestData[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RequestData | null>(null);

  const canManage = hasPermission("admin_requests:view");

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [requests, searchTerm, statusFilter, typeFilter]);

  useEffect(() => {
    const handleResize = () => {
      setViewMode(window.innerWidth >= 768 ? "table" : "cards");
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const response = await requestsAPI.getRequests({ page: 1, limit: 100 });
      setRequests(response.requests || []);
    } catch (error) {
      console.error("Error fetching requests:", error);
      sweetAlert.error("Error", "No se pudieron cargar las solicitudes");
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...requests];

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter((req) => {
        const employee = typeof req.employeeId === "object" ? req.employeeId : null;
        const fullName = employee ? `${employee.firstName} ${employee.lastName}`.toLowerCase() : "";
        return fullName.includes(searchLower) || req.typeKey.toLowerCase().includes(searchLower);
      });
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((req) => req.status === statusFilter);
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter((req) => req.typeKey === typeFilter);
    }

    setFilteredRequests(filtered);
  };

  const handleApprove = (request: RequestData) => {
    setSelectedRequest(request);
    setApproveModalOpen(true);
  };

  const handleReject = (request: RequestData) => {
    setSelectedRequest(request);
    setRejectModalOpen(true);
  };

  const handleView = (request: RequestData) => {
    navigate(`/admin/requests/${request._id}`);
  };

  const confirmApprove = async (data: { replacementEmployeeId?: string; notes?: string }) => {
    if (!selectedRequest) return;
    try {
      await requestsAPI.approveRequest(selectedRequest._id, data);
      sweetAlert.success("Solicitud aprobada", "La solicitud ha sido aprobada correctamente");
      setApproveModalOpen(false);
      setSelectedRequest(null);
      fetchRequests();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo aprobar la solicitud");
    }
  };

  const confirmReject = async (data: { rejectionReason: string }) => {
    if (!selectedRequest) return;
    try {
      await requestsAPI.rejectRequest(selectedRequest._id, data);
      sweetAlert.success("Solicitud rechazada", "La solicitud ha sido rechazada");
      setRejectModalOpen(false);
      setSelectedRequest(null);
      fetchRequests();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo rechazar la solicitud");
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando solicitudes..." />;
  }

  return (
    <PageLayout title="Pedidos de Ausencias" subtitle="Gestión de solicitudes de ausencias" faIcon={{ icon: faClipboardList }}>
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input type="text" placeholder="Buscar por empleado o tipo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
            </div>
            <div className="flex gap-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="approved">Aprobadas</option>
                <option value="rejected">Rechazadas</option>
                <option value="cancelled">Canceladas</option>
              </select>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                <option value="all">Todos los tipos</option>
                <option value="vacation">Vacaciones</option>
                <option value="compensatory">Compensatorio</option>
                <option value="special_leave">Permiso Especial</option>
                <option value="extra">Extra</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-2">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4 px-4 pt-4">
            Mostrando {filteredRequests.length} de {requests.length} solicitudes
          </div>

          {viewMode === "table" ? (
            <RequestTable requests={filteredRequests} onApprove={canManage ? handleApprove : undefined} onReject={canManage ? handleReject : undefined} onView={handleView} showActions={canManage} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
              {filteredRequests.map((request) => (
                <RequestCard key={request._id} request={request} onApprove={canManage ? handleApprove : undefined} onReject={canManage ? handleReject : undefined} onView={handleView} showActions={canManage} />
              ))}
            </div>
          )}

          {filteredRequests.length === 0 && (
            <div className="text-center py-12">
              <FontAwesomeIcon icon={faClipboardList} className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-400">No hay solicitudes que coincidan con los filtros</p>
            </div>
          )}
        </div>
      </div>

      <RequestApproveModal
        isOpen={approveModalOpen}
        onClose={() => {
          setApproveModalOpen(false);
          setSelectedRequest(null);
        }}
        onConfirm={confirmApprove}
        request={selectedRequest}
      />

      <RequestRejectModal
        isOpen={rejectModalOpen}
        onClose={() => {
          setRejectModalOpen(false);
          setSelectedRequest(null);
        }}
        onConfirm={confirmReject}
        request={selectedRequest}
      />
    </PageLayout>
  );
};
