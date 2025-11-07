import React, { useState, useEffect } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { Card } from '../components/ui/Card';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClipboardList, faPlus, faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';

interface OtherRequest {
  id: string;
  type: 'compensatorio' | 'licencia_especial' | 'cambio_turno' | 'extraordinario';
  startDate: string;
  endDate?: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

const REQUEST_TYPES = [
  { value: 'compensatorio', label: 'Compensatorio' },
  { value: 'licencia_especial', label: 'Licencia Especial' },
  { value: 'cambio_turno', label: 'Cambio de Turno' },
  { value: 'extraordinario', label: 'Pedido Extraordinario' },
];

export const OtherRequestsPage: React.FC = () => {
  const [requests, setRequests] = useState<OtherRequest[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<OtherRequest | null>(null);
  const [formData, setFormData] = useState({
    type: 'compensatorio' as OtherRequest['type'],
    startDate: '',
    endDate: '',
    description: '',
  });

  useEffect(() => {
    const stored = localStorage.getItem('otherRequests');
    if (stored) {
      try {
        setRequests(JSON.parse(stored));
      } catch (error) {
        console.error('Error loading requests:', error);
      }
    }
  }, []);

  const saveToStorage = (data: OtherRequest[]) => {
    localStorage.setItem('otherRequests', JSON.stringify(data));
    setRequests(data);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRequest) {
      const updated = requests.map((req) =>
        req.id === editingRequest.id
          ? { ...req, ...formData }
          : req
      );
      saveToStorage(updated);
      sweetAlert.success('Solicitud actualizada', 'La solicitud se actualizó correctamente');
    } else {
      const newRequest: OtherRequest = {
        id: Date.now().toString(),
        ...formData,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      saveToStorage([newRequest, ...requests]);
      sweetAlert.success('Solicitud creada', 'La solicitud se creó correctamente');
    }
    setShowModal(false);
    setEditingRequest(null);
    setFormData({ type: 'compensatorio', startDate: '', endDate: '', description: '' });
  };

  const handleDelete = (request: OtherRequest) => {
    if (request.status !== 'pending') {
      sweetAlert.error('Error', 'Solo se pueden eliminar solicitudes pendientes');
      return;
    }
    sweetAlert.confirm('¿Eliminar solicitud?', '¿Estás seguro de eliminar esta solicitud?').then((result) => {
      if (result.isConfirmed) {
        saveToStorage(requests.filter((req) => req.id !== request.id));
        sweetAlert.success('Solicitud eliminada', 'La solicitud se eliminó correctamente');
      }
    });
  };

  const openEdit = (request: OtherRequest) => {
    if (request.status !== 'pending') {
      sweetAlert.error('Error', 'Solo se pueden editar solicitudes pendientes');
      return;
    }
    setEditingRequest(request);
    setFormData({
      type: request.type,
      startDate: request.startDate.split('T')[0],
      endDate: request.endDate?.split('T')[0] || '',
      description: request.description,
    });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingRequest(null);
    setFormData({ type: 'compensatorio', startDate: '', endDate: '', description: '' });
    setShowModal(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return { variant: 'success' as const, text: 'Aprobada' };
      case 'rejected':
        return { variant: 'blue' as const, text: 'Rechazada' };
      default:
        return { variant: 'warning' as const, text: 'Pendiente' };
    }
  };

  const getTypeLabel = (type: string) => {
    return REQUEST_TYPES.find((t) => t.value === type)?.label || type;
  };

  return (
    <PageLayout
      title="Otras Solicitudes"
      subtitle="Compensatorios, licencias especiales y más"
      faIcon={{ icon: faClipboardList }}
      headerActions={
        <button onClick={openCreate} className="btn-primary">
          <FontAwesomeIcon icon={faPlus} className="mr-2" />
          Nueva Solicitud
        </button>
      }
      modal={{
        isOpen: showModal,
        onClose: () => {
          setShowModal(false);
          setEditingRequest(null);
        },
        title: editingRequest ? 'Editar Solicitud' : 'Nueva Solicitud',
        subtitle: 'Completa los datos de tu solicitud',
        size: 'md',
        actions: [
          {
            label: editingRequest ? 'Actualizar' : 'Crear',
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>('#request-form');
              form?.requestSubmit();
            },
            variant: 'primary',
          },
          { label: 'Cancelar', onClick: () => setShowModal(false), variant: 'ghost' },
        ],
        content: (
          <form id="request-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo *</label>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as OtherRequest['type'] })}
                className="input-field"
              >
                {REQUEST_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Fecha de Inicio *
              </label>
              <input
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Fecha de Fin (opcional)
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Descripción *
              </label>
              <textarea
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="input-field"
                placeholder="Describe tu solicitud..."
              />
            </div>
          </form>
        ),
      }}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {requests.map((request) => {
            const badge = getStatusBadge(request.status);
            return (
              <Card
                key={request.id}
                header={{
                  title: getTypeLabel(request.type),
                  subtitle: new Date(request.startDate).toLocaleDateString(),
                  icon: faClipboardList,
                  badges: [{ text: badge.text, variant: badge.variant }],
                }}
                footer={{
                  leftContent: (
                    <span className="text-xs text-gray-500">{new Date(request.createdAt).toLocaleDateString()}</span>
                  ),
                  actions:
                    request.status === 'pending'
                      ? [
                          {
                            icon: faEdit,
                            onClick: () => openEdit(request),
                            title: 'Editar',
                            variant: 'default',
                          },
                          {
                            icon: faTrash,
                            onClick: () => handleDelete(request),
                            title: 'Eliminar',
                            variant: 'blue',
                          },
                        ]
                      : [],
                }}
              >
                <p className="text-sm text-gray-600 dark:text-gray-400">{request.description}</p>
              </Card>
            );
          })}
        </div>

        {requests.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <FontAwesomeIcon icon={faClipboardList} className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">No hay solicitudes</p>
            <button onClick={openCreate} className="btn-primary">
              Crear Primera Solicitud
            </button>
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Las solicitudes se guardan localmente. Preparado para conectar a una API en el futuro.
          </p>
        </div>
      </div>
    </PageLayout>
  );
};
