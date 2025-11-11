import React, { useState, useEffect } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { Card } from '../components/ui/Card';
import { sweetAlert } from '../utils/sweetAlert';
import { personnelAPI } from '../api/personnel';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClipboardList, faPlus, faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';

interface OtherRequest {
  _id: string;
  title: string;
  description: string;
  category: string;
  amount?: number;
  status: 'pending' | 'approved' | 'rejected' | 'delivered' | 'cancelled';
  createdAt: string;
}

const REQUEST_TYPES = [
  { value: 'equipment', label: 'Equipamiento' },
  { value: 'supplies', label: 'Suministros' },
  { value: 'software', label: 'Software' },
  { value: 'other', label: 'Otro' },
];

export const OtherRequestsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<OtherRequest[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<OtherRequest | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    category: 'equipment',
    description: '',
    amount: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ordersData, statsData] = await Promise.allSettled([
        personnelAPI.getOrders(),
        personnelAPI.getOrderStats(),
      ]);
      if (ordersData.status === 'fulfilled') setRequests(ordersData.value);
      if (statsData.status === 'fulfilled') setStats(statsData.value);
    } catch (error) {
      console.error('Error fetching orders:', error);
      sweetAlert.error('Error', 'No se pudieron cargar los pedidos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRequest) {
        await personnelAPI.updateOrder(editingRequest._id, formData);
        sweetAlert.success('Pedido actualizado', 'El pedido se actualizó correctamente');
      } else {
        await personnelAPI.createOrder(formData);
        sweetAlert.success('Pedido creado', 'El pedido se creó correctamente');
      }
      setShowModal(false);
      setEditingRequest(null);
      setFormData({ title: '', category: 'equipment', description: '', amount: 0 });
      fetchData();
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo procesar el pedido');
    }
  };

  const handleDelete = async (request: OtherRequest) => {
    if (request.status !== 'pending') {
      sweetAlert.error('Error', 'Solo se pueden eliminar pedidos pendientes');
      return;
    }
    const result = await sweetAlert.confirm('¿Eliminar pedido?', '¿Estás seguro de eliminar este pedido?');
    if (!result.isConfirmed) return;

    try {
      await personnelAPI.deleteOrder(request._id);
      sweetAlert.success('Pedido eliminado', 'El pedido se eliminó correctamente');
      fetchData();
    } catch (error) {
      sweetAlert.error('Error', 'No se pudo eliminar el pedido');
    }
  };

  const openEdit = (request: OtherRequest) => {
    if (request.status !== 'pending') {
      sweetAlert.error('Error', 'Solo se pueden editar pedidos pendientes');
      return;
    }
    setEditingRequest(request);
    setFormData({
      title: request.title,
      category: request.category,
      description: request.description,
      amount: request.amount || 0,
    });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingRequest(null);
    setFormData({ title: '', category: 'equipment', description: '', amount: 0 });
    setShowModal(true);
  };

  if (loading) {
    return <LoadingSpinner message="Cargando pedidos..." />;
  }

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

  const getStatusBadgeForOrders = (status: string) => {
    switch (status) {
      case 'approved':
        return { variant: 'success' as const, text: 'Aprobado' };
      case 'rejected':
        return { variant: 'blue' as const, text: 'Rechazado' };
      case 'delivered':
        return { variant: 'info' as const, text: 'Entregado' };
      case 'cancelled':
        return { variant: 'secondary' as const, text: 'Cancelado' };
      default:
        return { variant: 'warning' as const, text: 'Pendiente' };
    }
  };

  return (
    <PageLayout
      title="Pedidos del Personal"
      subtitle="Equipamiento, suministros y software"
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Título *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="input-field"
                placeholder="Título del pedido"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Categoría *</label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
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
                Descripción *
              </label>
              <textarea
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="input-field"
                placeholder="Describe tu pedido..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Monto (opcional)
              </label>
              <input
                type="number"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className="input-field"
                placeholder="0"
              />
            </div>
          </form>
        ),
      }}
    >
      <div className="space-y-6">
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Pendientes</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.pending || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Aprobados</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.approved || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Rechazados</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.rejected || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Entregados</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.delivered || 0}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {requests.map((request) => {
            const badge = getStatusBadgeForOrders(request.status);
            return (
              <Card
                key={request._id}
                header={{
                  title: request.title,
                  subtitle: getTypeLabel(request.category),
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
                {request.amount && request.amount > 0 && (
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-2">
                    ${request.amount.toLocaleString()}
                  </p>
                )}
              </Card>
            );
          })}
        </div>

        {requests.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <FontAwesomeIcon icon={faClipboardList} className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">No hay pedidos</p>
            <button onClick={openCreate} className="btn-primary">
              Crear Primer Pedido
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
