import React, { useState, useEffect } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { Modal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/forms/FormField';
import { EmptyState } from '../components/ui/EmptyState';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFile,
  faPlus,
  faEdit,
  faTrash,
  faCalendar,
  faFileText,
  faTag,
} from '@fortawesome/free-solid-svg-icons';

interface OtherRequest {
  id: string;
  type: string;
  startDate?: string;
  endDate?: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

const REQUEST_TYPES = [
  'Licencia Especial',
  'Cambio de Turno',
  'Compensatorio',
  'Permiso Personal',
  'Capacitación',
  'Otro',
];

export const OtherRequestsPage: React.FC = () => {
  const [requests, setRequests] = useState<OtherRequest[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<OtherRequest | null>(null);
  const [formData, setFormData] = useState({
    type: REQUEST_TYPES[0],
    startDate: '',
    endDate: '',
    description: '',
  });
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    const savedRequests = localStorage.getItem('otherRequests');
    if (savedRequests) {
      try {
        setRequests(JSON.parse(savedRequests));
      } catch (error) {
        console.error('Error loading requests:', error);
      }
    }
  }, []);

  const saveRequests = (updatedRequests: OtherRequest[]) => {
    setRequests(updatedRequests);
    localStorage.setItem('otherRequests', JSON.stringify(updatedRequests));
  };

  const handleCreate = async () => {
    if (!formData.type || !formData.description) {
      await sweetAlert.error('Error', 'Debes completar los campos requeridos');
      return;
    }

    const newRequest: OtherRequest = {
      id: Date.now().toString(),
      type: formData.type,
      startDate: formData.startDate || undefined,
      endDate: formData.endDate || undefined,
      description: formData.description,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    saveRequests([...requests, newRequest]);
    setIsCreateModalOpen(false);
    setFormData({ type: REQUEST_TYPES[0], startDate: '', endDate: '', description: '' });
    await sweetAlert.success('Éxito', 'Solicitud creada correctamente');
  };

  const handleEdit = async () => {
    if (!selectedRequest) return;

    const updatedRequests = requests.map((req) =>
      req.id === selectedRequest.id
        ? {
            ...req,
            type: formData.type,
            startDate: formData.startDate || undefined,
            endDate: formData.endDate || undefined,
            description: formData.description,
          }
        : req
    );

    saveRequests(updatedRequests);
    setIsEditModalOpen(false);
    setSelectedRequest(null);
    setFormData({ type: REQUEST_TYPES[0], startDate: '', endDate: '', description: '' });
    await sweetAlert.success('Éxito', 'Solicitud actualizada');
  };

  const handleDelete = async (id: string) => {
    const result = await sweetAlert.confirm(
      'Confirmar',
      '¿Estás seguro de que deseas eliminar esta solicitud?'
    );
    if (!result.isConfirmed) return;

    const updatedRequests = requests.filter((req) => req.id !== id);
    saveRequests(updatedRequests);
    await sweetAlert.success('Éxito', 'Solicitud eliminada');
  };

  const openEditModal = (request: OtherRequest) => {
    setSelectedRequest(request);
    setFormData({
      type: request.type,
      startDate: request.startDate || '',
      endDate: request.endDate || '',
      description: request.description,
    });
    setIsEditModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; text: string }> = {
      pending: { variant: 'warning', text: 'Pendiente' },
      approved: { variant: 'success', text: 'Aprobada' },
      rejected: { variant: 'blue', text: 'Rechazada' },
    };
    return variants[status] || variants.pending;
  };

  const filteredRequests =
    filterStatus === 'all'
      ? requests
      : requests.filter((req) => req.status === filterStatus);

  const stats = {
    total: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  };

  return (
    <PageLayout
      title="Otras Solicitudes"
      subtitle="Gestiona solicitudes especiales y permisos"
      faIcon={{ icon: faFile }}
      headerActions={
        <button onClick={() => setIsCreateModalOpen(true)} className="btn-primary">
          <FontAwesomeIcon icon={faPlus} className="mr-2" />
          Nueva Solicitud
        </button>
      }
    >
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats.total}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">Pendientes</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              {stats.pending}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">Aprobadas</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              {stats.approved}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">Rechazadas</p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
              {stats.rejected}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === 'pending'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Pendientes
            </button>
            <button
              onClick={() => setFilterStatus('approved')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === 'approved'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Aprobadas
            </button>
            <button
              onClick={() => setFilterStatus('rejected')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === 'rejected'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Rechazadas
            </button>
          </div>
        </div>

        {/* Requests List */}
        {filteredRequests.length === 0 ? (
          <EmptyState
            title="No hay solicitudes"
            description={
              filterStatus === 'all'
                ? 'Aún no has creado ninguna solicitud'
                : `No hay solicitudes con estado: ${filterStatus}`
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRequests.map((request) => {
              const statusBadge = getStatusBadge(request.status);
              const canEdit = request.status === 'pending';

              return (
                <Card
                  key={request.id}
                  header={{
                    title: request.type,
                    subtitle: new Date(request.createdAt).toLocaleDateString('es-ES'),
                    badges: [statusBadge],
                  }}
                  footer={{
                    actions: canEdit
                      ? [
                          {
                            icon: faEdit,
                            onClick: () => openEditModal(request),
                            title: 'Editar',
                            variant: 'default',
                          },
                          {
                            icon: faTrash,
                            onClick: () => handleDelete(request.id),
                            title: 'Eliminar',
                            variant: 'blue',
                          },
                        ]
                      : undefined,
                  }}
                >
                  <div className="space-y-2 text-sm">
                    {(request.startDate || request.endDate) && (
                      <div className="flex items-start gap-2">
                        <FontAwesomeIcon
                          icon={faCalendar}
                          className="h-4 w-4 text-gray-400 mt-0.5"
                        />
                        <div>
                          {request.startDate && (
                            <p className="text-gray-900 dark:text-white">
                              Desde: {new Date(request.startDate).toLocaleDateString('es-ES')}
                            </p>
                          )}
                          {request.endDate && (
                            <p className="text-gray-900 dark:text-white">
                              Hasta: {new Date(request.endDate).toLocaleDateString('es-ES')}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <FontAwesomeIcon
                        icon={faFileText}
                        className="h-4 w-4 text-gray-400 mt-0.5"
                      />
                      <p className="text-gray-600 dark:text-gray-400 line-clamp-3">
                        {request.description}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setFormData({ type: REQUEST_TYPES[0], startDate: '', endDate: '', description: '' });
        }}
        title="Nueva Solicitud"
        size="md"
      >
        <div className="space-y-4">
          <FormField label="Tipo de Solicitud" icon={faTag} required>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="input-field"
            >
              {REQUEST_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Fecha Inicio" icon={faCalendar}>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="input-field"
            />
          </FormField>

          <FormField label="Fecha Fin" icon={faCalendar}>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              className="input-field"
            />
          </FormField>

          <FormField label="Descripción / Motivo" icon={faFileText} required>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="input-field"
              placeholder="Describe tu solicitud..."
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setIsCreateModalOpen(false)} className="btn-ghost">
              Cancelar
            </button>
            <button onClick={handleCreate} className="btn-primary">
              Crear Solicitud
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedRequest(null);
          setFormData({ type: REQUEST_TYPES[0], startDate: '', endDate: '', description: '' });
        }}
        title="Editar Solicitud"
        size="md"
      >
        <div className="space-y-4">
          <FormField label="Tipo de Solicitud" icon={faTag} required>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="input-field"
            >
              {REQUEST_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Fecha Inicio" icon={faCalendar}>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="input-field"
            />
          </FormField>

          <FormField label="Fecha Fin" icon={faCalendar}>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              className="input-field"
            />
          </FormField>

          <FormField label="Descripción / Motivo" icon={faFileText} required>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="input-field"
              placeholder="Describe tu solicitud..."
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setIsEditModalOpen(false)} className="btn-ghost">
              Cancelar
            </button>
            <button onClick={handleEdit} className="btn-primary">
              Guardar Cambios
            </button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
};
