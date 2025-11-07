import React, { useEffect, useState } from 'react';
import { vacationsAPI, Vacation, VacationStats, VacationAvailable } from '../api/hr';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Modal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/forms/FormField';
import { EmptyState } from '../components/ui/EmptyState';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendarDays,
  faPlus,
  faEdit,
  faTrash,
  faCalendar,
  faFileText,
} from '@fortawesome/free-solid-svg-icons';

export const VacationsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [stats, setStats] = useState<VacationStats | null>(null);
  const [available, setAvailable] = useState<VacationAvailable | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedVacation, setSelectedVacation] = useState<Vacation | null>(null);
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    reason: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [vacationsRes, statsRes, availableRes] = await Promise.all([
        vacationsAPI.list(),
        vacationsAPI.getStats(),
        vacationsAPI.getAvailable(),
      ]);
      setVacations(vacationsRes.data);
      setStats(statsRes.data);
      setAvailable(availableRes.data);
    } catch (error) {
      console.error('Error fetching vacation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.startDate || !formData.endDate) {
      await sweetAlert.error('Error', 'Debes seleccionar las fechas');
      return;
    }

    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    try {
      await vacationsAPI.create({
        startDate: formData.startDate,
        endDate: formData.endDate,
        days,
        reason: formData.reason,
        status: 'pending',
      });
      setIsCreateModalOpen(false);
      setFormData({ startDate: '', endDate: '', reason: '' });
      await sweetAlert.success('Éxito', 'Solicitud de vacaciones creada');
      fetchData();
    } catch (error) {
      console.error('Error creating vacation:', error);
      await sweetAlert.error('Error', 'No se pudo crear la solicitud');
    }
  };

  const handleEdit = async () => {
    if (!selectedVacation) return;

    try {
      await vacationsAPI.update(selectedVacation._id, formData);
      setIsEditModalOpen(false);
      setSelectedVacation(null);
      setFormData({ startDate: '', endDate: '', reason: '' });
      await sweetAlert.success('Éxito', 'Solicitud actualizada');
      fetchData();
    } catch (error) {
      console.error('Error updating vacation:', error);
      await sweetAlert.error('Error', 'No se pudo actualizar la solicitud');
    }
  };

  const handleDelete = async (id: string) => {
    const result = await sweetAlert.confirm(
      'Confirmar',
      '¿Estás seguro de que deseas eliminar esta solicitud?'
    );
    if (!result.isConfirmed) return;

    try {
      await vacationsAPI.delete(id);
      await sweetAlert.success('Éxito', 'Solicitud eliminada');
      fetchData();
    } catch (error) {
      console.error('Error deleting vacation:', error);
      await sweetAlert.error('Error', 'No se pudo eliminar la solicitud');
    }
  };

  const openEditModal = (vacation: Vacation) => {
    setSelectedVacation(vacation);
    setFormData({
      startDate: vacation.startDate.split('T')[0],
      endDate: vacation.endDate.split('T')[0],
      reason: vacation.reason || '',
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

  if (loading) {
    return <LoadingSpinner message="Cargando vacaciones..." />;
  }

  return (
    <PageLayout
      title="Mis Vacaciones"
      subtitle="Gestiona tus solicitudes de vacaciones"
      faIcon={{ icon: faCalendarDays }}
      headerActions={
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn-primary"
        >
          <FontAwesomeIcon icon={faPlus} className="mr-2" />
          Nueva Solicitud
        </button>
      }
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Disponible</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
              {available?.total || 0}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">Usados</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
              {available?.used || 0}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">Disponibles</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              {available?.available || 0}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">Pendientes</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              {stats?.pending || 0}
            </p>
          </div>
        </div>

        {/* Vacations List */}
        {vacations.length === 0 ? (
          <EmptyState
            title="No hay solicitudes"
            description="Aún no has creado ninguna solicitud de vacaciones"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vacations.map((vacation) => {
              const statusBadge = getStatusBadge(vacation.status);
              const canEdit = vacation.status === 'pending';

              return (
                <Card
                  key={vacation._id}
                  header={{
                    title: `${vacation.days} día${vacation.days !== 1 ? 's' : ''}`,
                    subtitle: new Date(vacation.startDate).toLocaleDateString('es-ES'),
                    badges: [statusBadge],
                  }}
                  footer={{
                    actions: canEdit
                      ? [
                          {
                            icon: faEdit,
                            onClick: () => openEditModal(vacation),
                            title: 'Editar',
                            variant: 'default',
                          },
                          {
                            icon: faTrash,
                            onClick: () => handleDelete(vacation._id),
                            title: 'Eliminar',
                            variant: 'blue',
                          },
                        ]
                      : undefined,
                  }}
                >
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <FontAwesomeIcon
                        icon={faCalendar}
                        className="h-4 w-4 text-gray-400 mt-0.5"
                      />
                      <div>
                        <p className="text-gray-900 dark:text-white font-medium">
                          Desde: {new Date(vacation.startDate).toLocaleDateString('es-ES')}
                        </p>
                        <p className="text-gray-900 dark:text-white font-medium">
                          Hasta: {new Date(vacation.endDate).toLocaleDateString('es-ES')}
                        </p>
                      </div>
                    </div>
                    {vacation.reason && (
                      <div className="flex items-start gap-2">
                        <FontAwesomeIcon
                          icon={faFileText}
                          className="h-4 w-4 text-gray-400 mt-0.5"
                        />
                        <p className="text-gray-600 dark:text-gray-400">{vacation.reason}</p>
                      </div>
                    )}
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
          setFormData({ startDate: '', endDate: '', reason: '' });
        }}
        title="Nueva Solicitud de Vacaciones"
        size="md"
      >
        <div className="space-y-4">
          <FormField label="Fecha Inicio" icon={faCalendar} required>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="input-field"
            />
          </FormField>

          <FormField label="Fecha Fin" icon={faCalendar} required>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              className="input-field"
            />
          </FormField>

          <FormField label="Motivo" icon={faFileText}>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              rows={3}
              className="input-field"
              placeholder="Opcional: describe el motivo de tu solicitud..."
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="btn-ghost"
            >
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
          setSelectedVacation(null);
          setFormData({ startDate: '', endDate: '', reason: '' });
        }}
        title="Editar Solicitud de Vacaciones"
        size="md"
      >
        <div className="space-y-4">
          <FormField label="Fecha Inicio" icon={faCalendar} required>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="input-field"
            />
          </FormField>

          <FormField label="Fecha Fin" icon={faCalendar} required>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              className="input-field"
            />
          </FormField>

          <FormField label="Motivo" icon={faFileText}>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              rows={3}
              className="input-field"
              placeholder="Opcional: describe el motivo de tu solicitud..."
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="btn-ghost"
            >
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
