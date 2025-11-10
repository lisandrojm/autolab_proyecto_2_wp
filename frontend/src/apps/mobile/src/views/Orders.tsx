import { useState } from 'react';
import { ArrowLeft, Package, CheckCircle, Clock, XCircle, Truck } from 'lucide-react';
import { ViewType } from '../types';

interface OrdersProps {
  onNavigate: (view: ViewType) => void;
}

export default function Orders({ onNavigate }: OrdersProps) {
  const [showForm, setShowForm] = useState(false);
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [description, setDescription] = useState('');

  const orders = [
    {
      id: 1,
      product: 'Laptop Dell XPS 15',
      quantity: 1,
      status: 'delivered' as const,
      date: '2024-01-15',
      description: 'Equipo de trabajo',
    },
    {
      id: 2,
      product: 'Mouse Logitech MX Master',
      quantity: 1,
      status: 'approved' as const,
      date: '2024-02-01',
      description: 'Accesorio ergonómico',
    },
    {
      id: 3,
      product: 'Material de oficina',
      quantity: 1,
      status: 'pending' as const,
      date: '2024-02-10',
      description: 'Cuadernos, bolígrafos, etc.',
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Pedido enviado correctamente');
    setShowForm(false);
    setProduct('');
    setQuantity('1');
    setDescription('');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <Truck className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'Entregado';
      case 'approved':
        return 'Aprobado';
      case 'pending':
        return 'Pendiente';
      case 'rejected':
        return 'Rechazado';
      default:
        return status;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 dark:bg-green-900/50';
      case 'approved':
        return 'bg-blue-100 dark:bg-blue-900/50';
      case 'pending':
        return 'bg-yellow-100 dark:bg-yellow-900/50';
      case 'rejected':
        return 'bg-red-100 dark:bg-red-900/50';
      default:
        return 'bg-slate-100 dark:bg-slate-800';
    }
  };

  return (
    <div className="flex-1 pb-24">
      <div className="sticky top-0 z-10 bg-background-light dark:bg-background-dark p-4 pb-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="w-6 h-6 text-slate-900 dark:text-slate-100" />
          </button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mis Pedidos</h1>
        </div>
      </div>

      <div className="px-4 pt-4">
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full flex items-center justify-center gap-2 rounded-lg h-12 px-4 bg-primary text-white text-sm font-medium leading-normal shadow-sm hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none mb-6"
        >
          <Package className="w-5 h-5" />
          {showForm ? 'Cancelar' : 'Nuevo Pedido'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Producto o artículo
                </label>
                <input
                  type="text"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none"
                  placeholder="Ej: Laptop, Mouse, Material de oficina..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Cantidad
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  min="1"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Descripción
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none"
                  placeholder="Especifica detalles del pedido..."
                />
              </div>
              <button
                type="submit"
                className="w-full flex items-center justify-center rounded-lg h-10 px-4 bg-primary text-white text-sm font-medium leading-normal shadow-sm hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none"
              >
                Enviar Pedido
              </button>
            </div>
          </form>
        )}

        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Historial de Pedidos</h3>

        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{order.product}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{order.description}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Cantidad: {order.quantity}</p>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${getStatusBg(order.status)}`}>
                  {getStatusIcon(order.status)}
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {getStatusText(order.status)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Solicitado el{' '}
                {new Date(order.date).toLocaleDateString('es-ES', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
