import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { RequestData } from '../../api/requests';

interface RequestPostponeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { notes?: string }) => void;
  request: RequestData | null;
}

export const RequestPostponeModal: React.FC<RequestPostponeModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  request,
}) => {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNotes('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm({ notes: notes || undefined });
  };

  const employee = request && typeof request.employeeId === 'object' ? request.employeeId : null;
  const canPostpone = request && request.postponeCount < 3;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Posponer Solicitud" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {request && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 mb-4 border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-1">Empleado</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {employee ? `${employee.firstName} ${employee.lastName}` : 'N/A'}
            </p>
            <div className="mt-2 flex gap-4 text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-400">Tipo:</span>{' '}
                <span className="font-medium text-gray-900 dark:text-white">
                  {request.type === 'vacation'
                    ? 'Vacaciones'
                    : request.type === 'compensatory'
                    ? 'Compensatorio'
                    : request.type === 'special_leave'
                    ? 'Permiso Especial'
                    : 'Extra'}
                </span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Días:</span>{' '}
                <span className="font-medium text-gray-900 dark:text-white">{request.daysCount || 0}</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-yellow-200 dark:border-yellow-800">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Contador de Pospuestas: {request.postponeCount}/3
              </p>
              {!canPostpone && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  Esta solicitud ya alcanzó el límite máximo de pospuestas
                </p>
              )}
            </div>
          </div>
        )}

        {canPostpone && (
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notas (Opcional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-gray-900 dark:text-white resize-none"
              placeholder="Agregar notas sobre la postergación..."
            />
          </div>
        )}

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
            disabled={!canPostpone}
            className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Posponer Solicitud
          </button>
        </div>
      </form>
    </Modal>
  );
};
