import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Calendar, Clock, CheckCircle, XCircle, Ban } from 'lucide-react';
import { requestsAPI, RequestData } from '../../../../../api/requests';

interface RequestsMobileListPageProps {
  onNavigate: (view: 'new' | 'detail', id?: string) => void;
  onBack: () => void;
}

export default function RequestsMobileListPage({ onNavigate, onBack }: RequestsMobileListPageProps) {
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await requestsAPI.getMyRequests();
      setRequests(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cargar solicitudes');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
      case 'cancelled':
        return <Ban className="w-5 h-5 text-gray-600 dark:text-gray-400" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Aprobada';
      case 'pending':
        return 'Pendiente';
      case 'rejected':
        return 'Rechazada';
      case 'cancelled':
        return 'Cancelada';
      default:
        return status;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 dark:bg-green-900/50';
      case 'pending':
        return 'bg-yellow-100 dark:bg-yellow-900/50';
      case 'rejected':
        return 'bg-red-100 dark:bg-red-900/50';
      case 'cancelled':
        return 'bg-gray-100 dark:bg-gray-800';
      default:
        return 'bg-gray-100 dark:bg-gray-800';
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

  return (
    <div className="flex-1 pb-24 bg-gray-50 dark:bg-gray-900">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ArrowLeft className="w-6 h-6 text-gray-900 dark:text-gray-100" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Mis Pedidos</h1>
          </div>
          <button
            onClick={() => onNavigate('new')}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nuevo
          </button>
        </div>
      </div>

      <div className="p-4">
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">No tienes solicitudes</p>
            <button
              onClick={() => onNavigate('new')}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              Crear Primera Solicitud
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div
                key={request._id}
                onClick={() => onNavigate('detail', request._id)}
                className={`${getStatusBg(
                  request.status
                )} rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      {getTypeLabel(request.type)}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {new Date(request.startDate).toLocaleDateString()} -{' '}
                        {new Date(request.endDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {getStatusIcon(request.status)}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {request.daysCount} días
                  </span>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {getStatusText(request.status)}
                  </span>
                </div>

                {request.postponeCount > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                    <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>Pospuesta {request.postponeCount}/3 veces</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
