import React, { useEffect, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Card } from '../components/ui/Card';
import { personnelAPI, EmployeeData } from '../api/personnel';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faUser } from '@fortawesome/free-solid-svg-icons';

export const TeamPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeData | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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

  const handleEmployeeClick = async (employee: EmployeeData) => {
    try {
      const detailed = await personnelAPI.getEmployee(employee._id);
      setSelectedEmployee(detailed);
      setShowModal(true);
    } catch (error) {
      console.error('Error fetching employee details:', error);
      sweetAlert.error('Error', 'No se pudieron cargar los detalles del empleado');
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
    return <LoadingSpinner message="Cargando equipo..." />;
  }

  return (
    <PageLayout
      title="Mi Equipo"
      subtitle="Miembros del equipo y contactos"
      faIcon={{ icon: faUsers }}
      modal={{
        isOpen: showModal,
        onClose: () => setShowModal(false),
        title: `${selectedEmployee?.firstName} ${selectedEmployee?.lastName}`,
        subtitle: selectedEmployee?.position || 'Sin posición',
        size: 'md',
        content: selectedEmployee ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center mb-4">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                {selectedEmployee.photoUrl ? (
                  <img src={selectedEmployee.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-gray-400">
                    {selectedEmployee.firstName?.charAt(0) || '?'}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Email</label>
                <p className="text-gray-900 dark:text-white">{selectedEmployee.email}</p>
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
          </div>
        ) : null,
      }}
    >
      <div className="mb-6">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por nombre, email o departamento..."
          className="input-field"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEmployees.map((employee) => (
          <Card
            key={employee._id}
            onClick={() => handleEmployeeClick(employee)}
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
          >
            <div className="space-y-2 text-sm">
              <p className="text-gray-600 dark:text-gray-400">{employee.email}</p>
              {employee.department && (
                <p className="text-gray-600 dark:text-gray-400">Depto: {employee.department}</p>
              )}
            </div>
          </Card>
        ))}
      </div>

      {filteredEmployees.length === 0 && (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faUsers} className="h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-600 dark:text-gray-400">No se encontraron empleados</p>
        </div>
      )}
    </PageLayout>
  );
};
