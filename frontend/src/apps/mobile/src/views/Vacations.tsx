import { useState } from 'react';
import { ArrowLeft, Calendar, CheckCircle, Clock, XCircle } from 'lucide-react';
import { ViewType } from '../types';

interface VacationsProps {
  onNavigate: (view: ViewType) => void;
}

export default function Vacations({ onNavigate }: VacationsProps) {
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const vacationRequests = [
    {
      id: 1,
      startDate: '2024-02-15',
      endDate: '2024-02-22',
      status: 'approved' as const,
      reason: 'Vacaciones familiares',
      createdAt: '2024-01-10',
    },
    {
      id: 2,
      startDate: '2024-04-01',
      endDate: '2024-04-05',
      status: 'pending' as const,
      reason: 'Viaje personal',
      createdAt: '2024-03-15',
    },
    {
      id: 3,
      startDate: '2023-12-20',
      endDate: '2023-12-27',
      status: 'approved' as const,
      reason: 'Fiestas de fin de año',
      createdAt: '2023-11-20',
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Solicitud enviada correctamente');
    setShowForm(false);
    setStartDate('');
    setEndDate('');
    setReason('');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />;
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
      case 'approved':
        return 'Aprobada';
      case 'pending':
        return 'Pendiente';
      case 'rejected':
        return 'Rechazada';
      default:
        return status;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 dark:bg-green-900/50';
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Vacaciones</h1>
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Días disponibles</p>
              <p className="text-3xl font-bold text-primary">18</p>
            </div>
            <Calendar className="w-12 h-12 text-primary opacity-20" />
          </div>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full flex items-center justify-center gap-2 rounded-lg h-12 px-4 bg-primary text-white text-sm font-medium leading-normal shadow-sm hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none mb-6"
        >
          {showForm ? 'Cancelar' : 'Nueva Solicitud'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Fecha de inicio
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Fecha de fin
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Motivo
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none"
                  placeholder="Describe el motivo de tu solicitud..."
                />
              </div>
              <button
                type="submit"
                className="w-full flex items-center justify-center rounded-lg h-10 px-4 bg-primary text-white text-sm font-medium leading-normal shadow-sm hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none"
              >
                Enviar Solicitud
              </button>
            </div>
          </form>
        )}

        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Mis Solicitudes</h3>

        <div className="space-y-3">
          {vacationRequests.map((request) => (
            <div key={request.id} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{request.reason}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {new Date(request.startDate).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    -{' '}
                    {new Date(request.endDate).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div
                  className={`flex items-center gap-2 px-3 py-1 rounded-full ${getStatusBg(request.status)}`}
                >
                  {getStatusIcon(request.status)}
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {getStatusText(request.status)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Solicitado el{' '}
                {new Date(request.createdAt).toLocaleDateString('es-ES', {
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
