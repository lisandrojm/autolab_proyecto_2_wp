import React, { useEffect, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Card } from '../components/ui/Card';
import { mockVacationsService } from '../services';
import type { VacationRequestAPI as VacationRequest } from '../mocks';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendar, faCheck, faTimes } from '@fortawesome/free-solid-svg-icons';

export const PendingVacationsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);

  useEffect(() => {
    fetchPendingVacations();
  }, []);

  const fetchPendingVacations = async () => {
    try {
      setLoading(true);
      const data = await mockVacationsService.getPendingVacations();
      setVacations(data);
    } catch (error) {
      console.error('Error fetching pending vacations:', error);
      sweetAlert.error('Error', 'No se pudieron cargar las solicitudes pendientes');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (vacation: VacationRequest) => {
    const result = await sweetAlert.confirm(
      '¿Aprobar solicitud?',
      `¿Aprobar ${vacation.days} días de vacaciones?`
    );
    if (!result.isConfirmed) return;

    try {
      await mockVacationsService.approveVacation(vacation._id);
      sweetAlert.success('Solicitud aprobada', 'La solicitud de vacaciones fue aprobada');
      fetchPendingVacations();
    } catch (error) {
      sweetAlert.error('Error', 'No se pudo aprobar la solicitud');
    }
  };

  const handleReject = async (vacation: VacationRequest) => {
    const result = await sweetAlert.confirm(
      '¿Rechazar solicitud?',
      `¿Rechazar ${vacation.days} días de vacaciones?`,
      'Rechazar'
    );
    if (!result.isConfirmed) return;

    try {
      await mockVacationsService.rejectVacation(vacation._id);
      sweetAlert.success('Solicitud rechazada', 'La solicitud de vacaciones fue rechazada');
      fetchPendingVacations();
    } catch (error) {
      sweetAlert.error('Error', 'No se pudo rechazar la solicitud');
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando solicitudes pendientes..." />;
  }

  return (
    <PageLayout
      title="Vacaciones Pendientes"
      subtitle="Solicitudes de vacaciones por aprobar"
      faIcon={{ icon: faCalendar }}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vacations.map((vacation) => (
            <Card
              key={vacation._id}
              header={{
                title: `${vacation.days} días`,
                subtitle: `${new Date(vacation.startDate).toLocaleDateString()} - ${new Date(vacation.endDate).toLocaleDateString()}`,
                icon: faCalendar,
                badges: [{ text: 'Pendiente', variant: 'warning' }],
              }}
              footer={{
                leftContent: (
                  <span className="text-xs text-gray-500">{new Date(vacation.createdAt).toLocaleDateString()}</span>
                ),
              }}
            >
              <div className="space-y-3">
                {vacation.reason && <p className="text-sm text-gray-600 dark:text-gray-400">{vacation.reason}</p>}
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(vacation)} className="btn-primary text-sm flex-1">
                    <FontAwesomeIcon icon={faCheck} className="mr-1" />
                    Aprobar
                  </button>
                  <button onClick={() => handleReject(vacation)} className="btn-ghost text-sm flex-1">
                    <FontAwesomeIcon icon={faTimes} className="mr-1" />
                    Rechazar
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {vacations.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <FontAwesomeIcon icon={faCalendar} className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No hay solicitudes de vacaciones pendientes</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
