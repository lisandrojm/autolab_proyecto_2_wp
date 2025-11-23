import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faUser, faCheck, faTimes, faClock, faBan } from "@fortawesome/free-solid-svg-icons";
import { RequestData } from "../../api/requests";

interface RequestCardProps {
  request: RequestData;
  onApprove?: (request: RequestData) => void;
  onReject?: (request: RequestData) => void;
  onView?: (request: RequestData) => void;
  showActions?: boolean;
}

export const RequestCard: React.FC<RequestCardProps> = ({ request, onApprove, onReject, onView, showActions = true }) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-300", label: "Aprobada" };
      case "rejected":
        return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-800 dark:text-red-300", label: "Rechazada" };
      case "cancelled":
        return { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-800 dark:text-gray-300", label: "Cancelada" };
      default:
        return { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-800 dark:text-yellow-300", label: "Pendiente" };
    }
  };

  const getTypeLabel = (typeKey: string) => {
    const labels: Record<string, string> = {
      vacation: "Vacaciones",
      compensatory: "Compensatorio",
      special_leave: "Permiso Especial",
      extra: "Extra",
    };
    return labels[typeKey] || typeKey;
  };

  const employee = typeof request.employeeId === "object" ? request.employeeId : null;
  const statusBadge = getStatusBadge(request.status);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 p-6 cursor-pointer" onClick={() => onView?.(request)}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
            <FontAwesomeIcon icon={faCalendar} className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{getTypeLabel(request.typeKey)}</h3>
            {employee && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <FontAwesomeIcon icon={faUser} className="mr-1" />
                {employee.firstName} {employee.lastName}
              </p>
            )}
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>{statusBadge.label}</span>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium mr-2">Fechas:</span>
          {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
        </div>
        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium mr-2">Días:</span>
          {request.daysCount || 0}
        </div>
        {request.reason && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium mr-2">Motivo:</span>
            <span className="line-clamp-2">{request.reason}</span>
          </div>
        )}
      </div>

      {showActions && request.status === "pending" && (
        <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
          {onApprove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onApprove(request);
              }}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors duration-200"
            >
              <FontAwesomeIcon icon={faCheck} className="mr-2" />
              Aprobar
            </button>
          )}
          {onReject && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReject(request);
              }}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors duration-200"
            >
              <FontAwesomeIcon icon={faTimes} className="mr-2" />
              Rechazar
            </button>
          )}
        </div>
      )}
    </div>
  );
};
