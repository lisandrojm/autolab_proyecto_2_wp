import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { usersAPI, User } from '../../api/users';
import { RequestData } from '../../api/requests';

interface RequestApproveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { replacementEmployeeId?: string; notes?: string }) => void;
  request: RequestData | null;
}

export const RequestApproveModal: React.FC<RequestApproveModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  request,
}) => {
  const [replacementEmployeeId, setReplacementEmployeeId] = useState('');
  const [notes, setNotes] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      setReplacementEmployeeId('');
      setNotes('');
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await usersAPI.getUsers({ page: 1, limit: 100, isActive: 'active' });
      setUsers(response.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm({
      replacementEmployeeId: replacementEmployeeId || undefined,
      notes: notes || undefined,
    });
  };

  const employee = request && typeof request.employeeId === 'object' ? request.employeeId : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Aprobar Solicitud" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {request && (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Empleado</p>
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
          </div>
        )}

        <div>
          <label htmlFor="replacementEmployee" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Reemplazo (Opcional)
          </label>
          <select
            id="replacementEmployee"
            value={replacementEmployeeId}
            onChange={(e) => setReplacementEmployeeId(e.target.value)}
            className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 dark:text-white"
            disabled={loading}
          >
            <option value="">Seleccionar empleado...</option>
            {users.map((user) => (
              <option key={user._id} value={user._id}>
                {user.firstName} {user.lastName} - {user.email}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Notas Internas (Opcional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 dark:text-white resize-none"
            placeholder="Agregar notas sobre la aprobación..."
          />
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
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-200"
          >
            Aprobar Solicitud
          </button>
        </div>
      </form>
    </Modal>
  );
};
