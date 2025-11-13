import React, { useState, useEffect } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Card } from '../components/ui/Card';
import { requestTypesAPI, RequestTypeData } from '../api/requestTypes';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faList, faPlus, faEdit, faTrash, faToggleOn, faToggleOff } from '@fortawesome/free-solid-svg-icons';

export const RequestTypesManagementPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [requestTypes, setRequestTypes] = useState<RequestTypeData[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<RequestTypeData | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    key: '',
    description: '',
  });

  useEffect(() => {
    fetchRequestTypes();
  }, []);

  const fetchRequestTypes = async () => {
    try {
      setLoading(true);
      const data = await requestTypesAPI.getRequestTypes(true);
      setRequestTypes(data);
    } catch (error) {
      console.error('Error fetching request types:', error);
      sweetAlert.error('Error', 'No se pudieron cargar los tipos de pedidos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingType) {
        await requestTypesAPI.updateRequestType(editingType._id, {
          name: formData.name,
          description: formData.description,
        });
        sweetAlert.success('Tipo actualizado', 'El tipo de pedido se actualizó correctamente');
      } else {
        await requestTypesAPI.createRequestType(formData);
        sweetAlert.success('Tipo creado', 'El tipo de pedido se creó correctamente');
      }
      setShowModal(false);
      setEditingType(null);
      setFormData({ name: '', key: '', description: '' });
      fetchRequestTypes();
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo procesar la solicitud');
    }
  };

  const handleToggleActive = async (requestType: RequestTypeData) => {
    try {
      await requestTypesAPI.updateRequestType(requestType._id, {
        isActive: !requestType.isActive,
      });
      sweetAlert.success(
        requestType.isActive ? 'Tipo desactivado' : 'Tipo activado',
        'El tipo de pedido se actualizó correctamente'
      );
      fetchRequestTypes();
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo actualizar el tipo');
    }
  };

  const handleDelete = async (requestType: RequestTypeData) => {
    if (!requestType.isDeletable) {
      sweetAlert.error('Error', 'Este tipo de pedido no se puede eliminar');
      return;
    }

    const result = await sweetAlert.confirm(
      '¿Eliminar tipo de pedido?',
      '¿Estás seguro de eliminar este tipo de pedido?'
    );
    if (!result.isConfirmed) return;

    try {
      await requestTypesAPI.deleteRequestType(requestType._id);
      sweetAlert.success('Tipo eliminado', 'El tipo de pedido se eliminó correctamente');
      fetchRequestTypes();
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo eliminar el tipo');
    }
  };

  const openEdit = (requestType: RequestTypeData) => {
    if (requestType.key === 'vacation') {
      sweetAlert.error('Error', 'El tipo de pedido Vacaciones no se puede editar completamente');
      return;
    }
    setEditingType(requestType);
    setFormData({
      name: requestType.name,
      key: requestType.key,
      description: requestType.description || '',
    });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingType(null);
    setFormData({ name: '', key: '', description: '' });
    setShowModal(true);
  };

  if (loading) {
    return <LoadingSpinner message="Cargando tipos de pedidos..." />;
  }

  return (
    <PageLayout
      title="Tipos de Pedidos"
      subtitle="Gestión de tipos de pedidos configurables"
      faIcon={{ icon: faList }}
      headerActions={
        <button onClick={openCreate} className="btn-primary">
          <FontAwesomeIcon icon={faPlus} className="mr-2" />
          Nuevo Tipo
        </button>
      }
      modal={{
        isOpen: showModal,
        onClose: () => {
          setShowModal(false);
          setEditingType(null);
        },
        title: editingType ? 'Editar Tipo de Pedido' : 'Nuevo Tipo de Pedido',
        subtitle: 'Completa los datos del tipo de pedido',
        size: 'md',
        actions: [
          {
            label: editingType ? 'Actualizar' : 'Crear',
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>('#request-type-form');
              form?.requestSubmit();
            },
            variant: 'primary',
          },
          { label: 'Cancelar', onClick: () => setShowModal(false), variant: 'ghost' },
        ],
        content: (
          <form id="request-type-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nombre *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-field"
                placeholder="Ej: Licencias médicas"
              />
            </div>
            {!editingType && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Clave *
                </label>
                <input
                  type="text"
                  required
                  value={formData.key}
                  onChange={(e) => setFormData({ ...formData, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  className="input-field"
                  placeholder="Ej: medical_leave"
                  pattern="[a-z0-9_]+"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Solo letras minúsculas, números y guiones bajos
                </p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Descripción
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="input-field"
                placeholder="Descripción del tipo de pedido..."
              />
            </div>
          </form>
        ),
      }}
    >
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            <strong>Nota:</strong> El tipo "Vacaciones" no se puede eliminar y es especial porque usa el calendario de vacaciones. Los demás tipos usan un formulario estándar de fechas.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {requestTypes.map((requestType) => (
            <Card
              key={requestType._id}
              header={{
                title: requestType.name,
                subtitle: requestType.key,
                icon: faList,
                badges: [
                  ...(requestType.isSystem ? [{ text: 'Sistema', variant: 'blue' as const }] : []),
                  {
                    text: requestType.isActive ? 'Activo' : 'Inactivo',
                    variant: (requestType.isActive ? 'success' : 'default') as const,
                  },
                ],
              }}
              footer={{
                leftContent: (
                  <span className="text-xs text-gray-500">
                    {requestType.isDeletable ? 'Eliminable' : 'No eliminable'}
                  </span>
                ),
                actions: [
                  ...(requestType.key !== 'vacation'
                    ? [
                        {
                          icon: faEdit,
                          onClick: () => openEdit(requestType),
                          title: 'Editar',
                          variant: 'default' as const,
                        },
                      ]
                    : []),
                  {
                    icon: requestType.isActive ? faToggleOff : faToggleOn,
                    onClick: () => handleToggleActive(requestType),
                    title: requestType.isActive ? 'Desactivar' : 'Activar',
                    variant: 'blue' as const,
                  },
                  ...(requestType.isDeletable && requestType.key !== 'vacation'
                    ? [
                        {
                          icon: faTrash,
                          onClick: () => handleDelete(requestType),
                          title: 'Eliminar',
                          variant: 'blue' as const,
                        },
                      ]
                    : []),
                ],
              }}
            >
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {requestType.description || 'Sin descripción'}
              </p>
            </Card>
          ))}
        </div>

        {requestTypes.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <FontAwesomeIcon icon={faList} className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">No hay tipos de pedidos</p>
            <button onClick={openCreate} className="btn-primary">
              Crear Primer Tipo
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
