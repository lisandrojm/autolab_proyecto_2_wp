import React, { useEffect, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Card } from '../components/ui/Card';
import { personnelAPI } from '../api/personnel';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClipboardList, faCheck, faTimes, faTruck } from '@fortawesome/free-solid-svg-icons';

interface OrderRequest {
  _id: string;
  type: string;
  description: string;
  status: string;
  createdAt: string;
  requestedBy?: string;
}

export const PendingRequestsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRequest[]>([]);

  useEffect(() => {
    fetchPendingOrders();
  }, []);

  const fetchPendingOrders = async () => {
    try {
      setLoading(true);
      const data = await personnelAPI.getPendingOrders();
      setOrders(data);
    } catch (error) {
      console.error('Error fetching pending orders:', error);
      sweetAlert.error('Error', 'No se pudieron cargar las solicitudes pendientes');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (order: OrderRequest) => {
    const result = await sweetAlert.confirm('¿Aprobar solicitud?', '¿Aprobar esta solicitud?');
    if (!result.isConfirmed) return;

    try {
      await personnelAPI.approveOrder(order._id);
      sweetAlert.success('Solicitud aprobada', 'La solicitud fue aprobada');
      fetchPendingOrders();
    } catch (error) {
      sweetAlert.error('Error', 'No se pudo aprobar la solicitud');
    }
  };

  const handleReject = async (order: OrderRequest) => {
    const result = await sweetAlert.confirm('¿Rechazar solicitud?', '¿Rechazar esta solicitud?', 'Rechazar');
    if (!result.isConfirmed) return;

    try {
      await personnelAPI.rejectOrder(order._id);
      sweetAlert.success('Solicitud rechazada', 'La solicitud fue rechazada');
      fetchPendingOrders();
    } catch (error) {
      sweetAlert.error('Error', 'No se pudo rechazar la solicitud');
    }
  };

  const handleDeliver = async (order: OrderRequest) => {
    const result = await sweetAlert.confirm('¿Marcar como entregado?', '¿Marcar esta solicitud como entregada?');
    if (!result.isConfirmed) return;

    try {
      await personnelAPI.deliverOrder(order._id);
      sweetAlert.success('Pedido entregado', 'El pedido fue marcado como entregado');
      fetchPendingOrders();
    } catch (error) {
      sweetAlert.error('Error', 'No se pudo marcar como entregado');
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando solicitudes pendientes..." />;
  }

  return (
    <PageLayout
      title="Pedidos Pendientes"
      subtitle="Solicitudes por aprobar o entregar"
      faIcon={{ icon: faClipboardList }}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orders.map((order) => (
            <Card
              key={order._id}
              header={{
                title: order.type || 'Pedido',
                subtitle: order.requestedBy || 'Sin usuario',
                icon: faClipboardList,
                badges: [{ text: order.status || 'Pendiente', variant: 'warning' }],
              }}
              footer={{
                leftContent: (
                  <span className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</span>
                ),
              }}
            >
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">{order.description}</p>
                <div className="flex flex-col gap-2">
                  {order.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleApprove(order)} className="btn-primary text-sm flex-1">
                        <FontAwesomeIcon icon={faCheck} className="mr-1" />
                        Aprobar
                      </button>
                      <button onClick={() => handleReject(order)} className="btn-ghost text-sm flex-1">
                        <FontAwesomeIcon icon={faTimes} className="mr-1" />
                        Rechazar
                      </button>
                    </div>
                  )}
                  {order.status === 'approved' && (
                    <button onClick={() => handleDeliver(order)} className="btn-primary text-sm w-full">
                      <FontAwesomeIcon icon={faTruck} className="mr-1" />
                      Marcar como Entregado
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {orders.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <FontAwesomeIcon icon={faClipboardList} className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No hay pedidos pendientes</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
