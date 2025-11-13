import { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, User, Clock, CheckCircle, XCircle, Ban, AlertCircle } from 'lucide-react';
import { requestsAPI, RequestData } from '../../../../../api/requests';

interface RequestMobileDetailPageProps {
  requestId: string;
  onBack: () => void;
}

export default function RequestMobileDetailPage({ requestId, onBack }: RequestMobileDetailPageProps) {
  const [request, setRequest] = useState<RequestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetchRequest();
  }, [requestId]);

  const fetchRequest = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await requestsAPI.getRequestById(requestId);
      setRequest(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cargar solicitud');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!request || request.status !== 'pending') return;

    if (!confirm('¿Estás seguro de cancelar esta solicitud?')) return;

    try {
      setCancelling(true);
      await requestsAPI.cancelRequest(request._id);
      fetchRequest();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al cancelar solicitud');
    } finally {
      setCancelling(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-800 dark:text-green-300', icon: CheckCircle, label: 'Aprobada' };
      case 'pending':
        return { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-800 dark:text-yellow-300', icon: Clock, label: 'Pendiente' };
      case 'rejected':
        return { bg: 'bg-red-100 dark:bg-red-900/50', text: 'text-red-800 dark:text-red-300', icon: XCircle, label: 'Rechazada' };
      case 'cancelled':
        return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-800 dark:text-gray-300', icon: Ban, label: 'Cancelada' };
      default:
        return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-800 dark:text-gray-300', icon: Clock, label: status };
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'vacation':
        return 'Vacaciones';
      case 'compensatory':
        return 'Compensatorio';
      case 'special_leave':
        return 'Permiso Especial';
      case 'extra':
        return 'Extra';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className="flex-1 pb-24 bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="flex-1 pb-24 bg-gray-50 dark:bg-gray-900">
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ArrowLeft className="w-6 h-6 text-gray-900 dark:text-gray-100" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Error</h1>
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{error || 'Solicitud no encontrada'}</p>
          </div>
        </div>
      </div>
    );
  }

  const statusBadge = getStatusBadge(request.status);
  const StatusIcon = statusBadge.icon;
  const approver = request.approverId && typeof request.approverId === 'object' ? request.approverId : null;
  const replacement = request.replacementEmployeeId && typeof request.replacementEmployeeId === 'object' ? request.replacementEmployeeId : null;

  return (
    <div className="flex-1 pb-24 bg-gray-50 dark:bg-gray-900">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ArrowLeft className="w-6 h-6 text-gray-900 dark:text-gray-100" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Detalle de Solicitud</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                {getTypeLabel(request.type)}
              </h2>
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${statusBadge.bg} ${statusBadge.text}`}>
                <StatusIcon className="w-4 h-4" />
                <span className="text-sm font-medium">{statusBadge.label}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Fechas</p>
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span>{new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}</span>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Días solicitados</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{request.daysCount || 0} días</p>
            </div>

            {request.reason && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Motivo</p>
                <p className="text-gray-900 dark:text-gray-100">{request.reason}</p>
              </div>
            )}

            {request.postponeCount > 0 && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Pospuestas</p>
                <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                  <Clock className="w-4 h-4" />
                  <span>{request.postponeCount}/3 veces</span>
                </div>
              </div>
            )}

            {approver && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                  {request.status === 'approved' ? 'Aprobado por' : 'Evaluado por'}
                </p>
                <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <User className="w-4 h-4 text-gray-400" />
                  <div>
                    <p>{approver.firstName} {approver.lastName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{approver.email}</p>
                  </div>
                </div>
                {request.approvedAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {new Date(request.approvedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {replacement && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Reemplazo asignado</p>
                <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <User className="w-4 h-4 text-gray-400" />
                  <div>
                    <p>{replacement.firstName} {replacement.lastName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{replacement.email}</p>
                  </div>
                </div>
              </div>
            )}

            {request.rejectionReason && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">Motivo del rechazo</p>
                <p className="text-sm text-red-700 dark:text-red-400">{request.rejectionReason}</p>
              </div>
            )}
          </div>

          {request.status === 'pending' && (
            <div className="pt-4">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelling ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Cancelando...
                  </>
                ) : (
                  <>
                    <Ban className="w-5 h-5" />
                    Cancelar Solicitud
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Timeline</h3>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 bg-primary-500 rounded-full"></div>
                <div className="w-0.5 flex-1 bg-gray-300 dark:bg-gray-600 mt-1"></div>
              </div>
              <div className="flex-1 pb-4">
                <p className="font-medium text-gray-900 dark:text-gray-100">Solicitud Creada</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(request.createdAt).toLocaleString()}</p>
              </div>
            </div>

            {request.status !== 'pending' && (
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${
                    request.status === 'approved' ? 'bg-green-500' :
                    request.status === 'rejected' ? 'bg-red-500' : 'bg-gray-500'
                  }`}></div>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {request.status === 'approved' ? 'Aprobada' :
                     request.status === 'rejected' ? 'Rechazada' : 'Cancelada'}
                  </p>
                  {(request.approvedAt || request.rejectedAt) && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(request.approvedAt || request.rejectedAt || '').toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
