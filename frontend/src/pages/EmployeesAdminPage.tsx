import React, { useEffect, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Card } from '../components/ui/Card';
import { personnelAPI } from '../api/personnel';
import type { EmployeeData } from '../api/personnel';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faEdit, faTrash, faUser } from '@fortawesome/free-solid-svg-icons';

export const EmployeesAdminPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<EmployeeData>>({});

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const data = await personnelAPI.getEmployees();
      setEmployees(data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      sweetAlert.error('Error', 'No se pudieron cargar los empleados');
    } finally {
      setLoading(false);
    }
  };

  const handleViewEmployee = async (employee: EmployeeData) => {
    try {
      const detailed = await personnelAPI.getEmployee(employee._id);
      setSelectedEmployee(detailed);
      setFormData(detailed);
      setIsEditing(false);
      setShowModal(true);
    } catch (error) {
      sweetAlert.error('Error', 'No se pudieron cargar los detalles');
    }
  };

  const handleSave = async () => {
    if (!selectedEmployee) return;

    try {
      await personnelAPI.updateEmployee(selectedEmployee._id, formData);
      sweetAlert.success('Empleado actualizado', 'Los cambios se guardaron correctamente');
      setIsEditing(false);
      fetchEmployees();
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo actualizar el empleado');
    }
  };

  const handleDelete = async (employee: EmployeeData) => {
    const result = await sweetAlert.confirm('¿Eliminar empleado?', `¿Estás seguro de eliminar a ${employee.firstName} ${employee.lastName}?`);
    if (!result.isConfirmed) return;

    try {
      await personnelAPI.deleteEmployee(employee._id);
      sweetAlert.success('Empleado eliminado', 'El empleado se eliminó correctamente');
      fetchEmployees();
    } catch (error) {
      sweetAlert.error('Error', 'No se pudo eliminar el empleado');
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const search = searchTerm.toLowerCase();
    return (
      emp.firstName?.toLowerCase().includes(search) ||
      emp.lastName?.toLowerCase().includes(search) ||
      emp.email?.toLowerCase().includes(search) ||
      emp.department?.toLowerCase().includes(search)
    );
  });

  if (loading) {
    return <LoadingSpinner message="Cargando empleados..." />;
  }

  return (
    <PageLayout
      title="Gestión de Empleados"
      subtitle="Administración de usuarios del sistema"
      faIcon={{ icon: faUsers }}
      modal={{
        isOpen: showModal,
        onClose: () => {
          setShowModal(false);
          setSelectedEmployee(null);
          setIsEditing(false);
        },
        title: `${selectedEmployee?.firstName} ${selectedEmployee?.lastName}`,
        subtitle: isEditing ? 'Editando información del empleado' : 'Detalles del empleado',
        size: 'md',
        actions: [
          ...(isEditing
            ? [
                {
                  label: 'Guardar',
                  onClick: handleSave,
                  variant: 'primary' as const,
                },
                {
                  label: 'Cancelar',
                  onClick: () => {
                    setIsEditing(false);
                    setFormData(selectedEmployee || {});
                  },
                  variant: 'ghost' as const,
                },
              ]
            : [
                {
                  label: 'Editar',
                  onClick: () => setIsEditing(true),
                  variant: 'primary' as const,
                },
                {
                  label: 'Cerrar',
                  onClick: () => setShowModal(false),
                  variant: 'ghost' as const,
                },
              ]),
        ],
        content: selectedEmployee ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center mb-4">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                {selectedEmployee.photoUrl ? (
                  <img src={selectedEmployee.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-gray-400">{selectedEmployee.firstName?.charAt(0) || '?'}</span>
                )}
              </div>
            </div>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={formData.firstName || ''}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Apellido</label>
                  <input
                    type="text"
                    value={formData.lastName || ''}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Posición</label>
                  <input
                    type="text"
                    value={formData.position || ''}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Departamento</label>
                  <input
                    type="text"
                    value={formData.department || ''}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                  <select
                    value={formData.status || 'active'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                    className="input-field"
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Email</label>
                  <p className="text-gray-900 dark:text-white">{selectedEmployee.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Posición</label>
                  <p className="text-gray-900 dark:text-white">{selectedEmployee.position || 'Sin posición'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Departamento</label>
                  <p className="text-gray-900 dark:text-white">{selectedEmployee.department || 'Sin departamento'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Estado</label>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      selectedEmployee.status === 'active'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    {selectedEmployee.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : null,
      }}
    >
      <div className="space-y-6">
        <div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar empleados..."
            className="input-field"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEmployees.map((employee) => (
            <Card
              key={employee._id}
              onClick={() => handleViewEmployee(employee)}
              header={{
                title: `${employee.firstName} ${employee.lastName}`,
                subtitle: employee.position || 'Sin posición',
                icon: faUser,
                badges: [
                  {
                    text: employee.status === 'active' ? 'Activo' : 'Inactivo',
                    variant: employee.status === 'active' ? 'success' : 'default',
                  },
                ],
              }}
              footer={{
                actions: [
                  {
                    icon: faEdit,
                    onClick: (e) => {
                      e.stopPropagation();
                      handleViewEmployee(employee);
                      setTimeout(() => setIsEditing(true), 100);
                    },
                    title: 'Editar',
                    variant: 'default',
                  },
                  {
                    icon: faTrash,
                    onClick: (e) => {
                      e.stopPropagation();
                      handleDelete(employee);
                    },
                    title: 'Eliminar',
                    variant: 'blue',
                  },
                ],
              }}
            >
              <div className="space-y-2 text-sm">
                <p className="text-gray-600 dark:text-gray-400">{employee.email}</p>
                {employee.department && <p className="text-gray-600 dark:text-gray-400">Depto: {employee.department}</p>}
              </div>
            </Card>
          ))}
        </div>

        {filteredEmployees.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <FontAwesomeIcon icon={faUsers} className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No se encontraron empleados</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
