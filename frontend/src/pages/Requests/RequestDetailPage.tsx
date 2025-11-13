import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/ui/PageLayout';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { RequestApproveModal } from '../../components/requests/RequestApproveModal';
import { RequestRejectModal } from '../../components/requests/RequestRejectModal';
import { requestsAPI, RequestData } from '../../api/requests';
import { useAuthStore } from '../../stores/authStore';
import { sweetAlert } from '../../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendar,
  faUser,
  faCheck,
  faTimes,
  faClock,
  faArrowLeft,
  faFileAlt,
  faBan,
} from '@fortawesome/free-solid-svg-icons';

export const RequestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<RequestData | null>(null);

  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  const canManage = hasPermission('users:manage');

  useEffect(() => {
    if (id) {
      fetchRequest();
    }
  }, [id]);

  const fetchRequest = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await requestsAPI.getRequestById(id);
      setRequest(data);
    } catch (error: any) {
      console.error('Error fetching request:', error);
      sweetAlert.error('Error', 'No se pudo cargar la solicitud');
      navigate('/admin/requests');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!request) return;
    const result = await sweetAlert.confirm(
      '¿Cancelar solicitud?',
      '¿Estás seguro de que deseas cancelar esta solicitud?'
    );
    if (!result.isConfirmed) return;

    try {
      await requestsAPI.cancelRequest(request._id);
      sweetAlert.success('Solicitud cancelada', 'La solicitud ha sido cancelada');
      fetchRequest();
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo cancelar la solicitud');
    }
  };

  const confirmApprove = async (data: { replacementEmployeeId?: string; notes?: string }) => {
    if (!request) return;
    try {
      await requestsAPI.approveRequest(request._id, data);
      sweetAlert.success('Solicitud aprobada', 'La solicitud ha sido aprobada correctamente');
      setApproveModalOpen(false);
      fetchRequest();
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo aprobar la solicitud');
    }
  };

  const confirmReject = async (data: { rejectionReason: string }) => {
    if (!request) return;
    try {
      await requestsAPI.rejectRequest(request._id, data);
      sweetAlert.success('Solicitud rechazada', 'La solicitud ha sido rechazada');
      setRejectModalOpen(false);
      fetchRequest();
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo rechazar la solicitud');
    }
  };


  if (loading) {
    return <LoadingSpinner message="Cargando solicitud..." />;
  }

  if (!request) {
    return null;
  }

  const employee = typeof request.employeeId === 'object' ? request.employeeId : null;
  const approver = request.approverId && typeof request.approverId === 'object' ? request.approverId : null;
  const replacement =
    request.replacementEmployeeId && typeof request.replacementEmployeeId === 'object'
      ? request.replacementEmployeeId
      : null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-300', label: 'Aprobada' };
      case 'rejected':
        return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-300', label: 'Rechazada' };
      case 'cancelled':
        return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-800 dark:text-gray-300', label: 'Cancelada' };
      default:
        return { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-300', label: 'Pendiente' };
    }
  };

  const getTypeLabel = (typeKey: string) => {
    const labels: Record<string, string> = {
      vacation: 'Vacaciones',
      compensatory: 'Compensatorio',
      special_leave: 'Permiso Especial',
      extra: 'Extra',
    };
    return labels[typeKey] || typeKey;
  };

  const statusBadge = getStatusBadge(request.status);
  const isOwnRequest = user?.userId === (typeof request.employeeId === 'string' ? request.employeeId : employee?._id);

  return (
    <PageLayout
      title="Detalle de Solicitud"
      subtitle="Información completa de la solicitud"
      faIcon={{ icon: faCalendar }}
      headerActions={
        <button onClick={() => navigate('/admin/requests')} className="btn-secondary">
          <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
          Volver
        </button>
      }
    >
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {getTypeLabel(request.typeKey)}
              </h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                {statusBadge.label}
              </span>
            </div>
            {request.status === 'pending' && (
              <div className="flex gap-2">
                {canManage && (
                  <>
                    <button onClick={() => setApproveModalOpen(true)} className="btn-primary">
                      <FontAwesomeIcon icon={faCheck} className="mr-2" />
                      Aprobar
                    </button>
                    <button
                      onClick={() => setRejectModalOpen(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      <FontAwesomeIcon icon={faTimes} className="mr-2" />
                      Rechazar
                    </button>
                  </>
                )}
                {isOwnRequest && !canManage && (
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    <FontAwesomeIcon icon={faBan} className="mr-2" />
                    Cancelar
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Empleado</h3>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                  <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {employee ? `${employee.firstName} ${employee.lastName}` : 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{employee?.email || ''}</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Fechas</h3>
              <p className="text-gray-900 dark:text-white">
                <FontAwesomeIcon icon={faCalendar} className="mr-2 text-gray-400" />
                {new Date(request.startDate).toLocaleDateString()} -{' '}
                {new Date(request.endDate).toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Total: {request.daysCount || 0} días
              </p>
            </div>

            {request.reason && (
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Motivo</h3>
                <p className="text-gray-900 dark:text-white">{request.reason}</p>
              </div>
            )}


            {approver && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  {request.status === 'approved' ? 'Aprobado por' : 'Evaluado por'}
                </h3>
                <p className="text-gray-900 dark:text-white">
                  {approver.firstName} {approver.lastName}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{approver.email}</p>
                {request.approvedAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {new Date(request.approvedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {replacement && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Reemplazo</h3>
                <p className="text-gray-900 dark:text-white">
                  {replacement.firstName} {replacement.lastName}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{replacement.email}</p>
              </div>
            )}

            {request.rejectionReason && (
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-red-500 dark:text-red-400 mb-2">Motivo del Rechazo</h3>
                <p className="text-gray-900 dark:text-white">{request.rejectionReason}</p>
              </div>
            )}

            {request.notes && (
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Notas Internas</h3>
                <p className="text-gray-900 dark:text-white">{request.notes}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Línea de Tiempo</h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 bg-primary-500 rounded-full"></div>
                <div className="w-0.5 h-full bg-gray-300 dark:bg-gray-600"></div>
              </div>
              <div className="flex-1 pb-4">
                <p className="font-medium text-gray-900 dark:text-white">Solicitud Creada</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {new Date(request.createdAt).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">Fuente: {request.source}</p>
              </div>
            </div>

            {request.status !== 'pending' && (
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      request.status === 'approved'
                        ? 'bg-green-500'
                        : request.status === 'rejected'
                        ? 'bg-red-500'
                        : 'bg-gray-500'
                    }`}
                  ></div>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {request.status === 'approved'
                      ? 'Aprobada'
                      : request.status === 'rejected'
                      ? 'Rechazada'
                      : 'Cancelada'}
                  </p>
                  {(request.approvedAt || request.rejectedAt) && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date(request.approvedAt || request.rejectedAt || '').toLocaleString()}
                    </p>
                  )}
                  {approver && (
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      Por: {approver.firstName} {approver.lastName}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <RequestApproveModal
        isOpen={approveModalOpen}
        onClose={() => setApproveModalOpen(false)}
        onConfirm={confirmApprove}
        request={request}
      />

      <RequestRejectModal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        onConfirm={confirmReject}
        request={request}
      />

    </PageLayout>
  );
};
