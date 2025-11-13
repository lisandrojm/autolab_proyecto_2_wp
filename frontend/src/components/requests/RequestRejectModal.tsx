import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { RequestData } from '../../api/requests';

interface RequestRejectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { rejectionReason: string }) => void;
  request: RequestData | null;
}

export const RequestRejectModal: React.FC<RequestRejectModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  request,
}) => {
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      setRejectionReason('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rejectionReason.trim()) {
      onConfirm({ rejectionReason: rejectionReason.trim() });
    }
  };

  const employee = request && typeof request.employeeId === 'object' ? request.employeeId : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Rechazar Solicitud" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {request && (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 mb-4 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400 mb-1">Empleado</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {employee ? `${employee.firstName} ${employee.lastName}` : 'N/A'}
            </p>
            <div className="mt-2 flex gap-4 text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-400">Tipo:</span>{' '}
                <span className="font-medium text-gray-900 dark:text-white">
                  {request.typeKey === 'vacation'
                    ? 'Vacaciones'
                    : request.typeKey === 'compensatory'
                    ? 'Compensatorio'
                    : request.typeKey === 'special_leave'
                    ? 'Permiso Especial'
                    : request.typeKey === 'extra'
                    ? 'Extra'
                    : request.typeKey}
                </span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Días:</span>{' '}
                <span className="font-medium text-gray-900 dark:text-white">{request.daysCount || 0}</span>
              </div>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="rejectionReason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Motivo del Rechazo <span className="text-red-500">*</span>
          </label>
          <textarea
            id="rejectionReason"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={4}
            required
            className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-gray-900 dark:text-white resize-none"
            placeholder="Explica por qué se rechaza esta solicitud..."
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {rejectionReason.length} caracteres
          </p>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!rejectionReason.trim()}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Rechazar Solicitud
          </button>
        </div>
      </form>
    </Modal>
  );
};
