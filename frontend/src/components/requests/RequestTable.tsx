import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTimes, faClock, faEye } from '@fortawesome/free-solid-svg-icons';
import { RequestData } from '../../api/requests';

interface RequestTableProps {
  requests: RequestData[];
  onApprove?: (request: RequestData) => void;
  onReject?: (request: RequestData) => void;
  onView?: (request: RequestData) => void;
  showActions?: boolean;
}

export const RequestTable: React.FC<RequestTableProps> = ({
  requests,
  onApprove,
  onReject,
  onView,
  showActions = true,
}) => {
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

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white dark:bg-gray-800 rounded-xl overflow-hidden">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Empleado
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Tipo
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Fechas
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Días
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Estado
            </th>
            {showActions && (
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {requests.map((request) => {
            const employee = typeof request.employeeId === 'object' ? request.employeeId : null;
            const statusBadge = getStatusBadge(request.status);

            return (
              <tr
                key={request._id}
                className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition-colors duration-150"
                onClick={() => onView?.(request)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {employee ? `${employee.firstName} ${employee.lastName}` : 'N/A'}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{employee?.email || ''}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900 dark:text-white">{getTypeLabel(request.typeKey)}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900 dark:text-white">
                    {new Date(request.startDate).toLocaleDateString()}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(request.endDate).toLocaleDateString()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {request.daysCount || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                    {statusBadge.label}
                  </span>
                </td>
                {showActions && (
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      {onView && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onView(request);
                          }}
                          className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                          title="Ver detalles"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>
                      )}
                      {request.status === 'pending' && (
                        <>
                          {onApprove && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onApprove(request);
                              }}
                              className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 transition-colors"
                              title="Aprobar"
                            >
                              <FontAwesomeIcon icon={faCheck} />
                            </button>
                          )}
                          {onReject && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onReject(request);
                              }}
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                              title="Rechazar"
                            >
                              <FontAwesomeIcon icon={faTimes} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {requests.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">No hay solicitudes</div>
      )}
    </div>
  );
};
