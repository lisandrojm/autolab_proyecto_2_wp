import React, { useEffect, useState } from 'react';
import { adminAPI, Employee } from '../api/hr';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Modal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faSearch, faEnvelope, faPhone, faBuilding, faUserTie } from '@fortawesome/free-solid-svg-icons';

export const TeamPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = employees.filter(
        (emp) =>
          emp.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          emp.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          emp.position?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          emp.department?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredEmployees(filtered);
    } else {
      setFilteredEmployees(employees);
    }
  }, [searchTerm, employees]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.listUsers();
      setEmployees(data);
      setFilteredEmployees(data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (employeeId: string) => {
    try {
      const { data } = await adminAPI.getUser(employeeId);
      setSelectedEmployee(data);
      setIsDetailModalOpen(true);
    } catch (error) {
      console.error('Error fetching employee details:', error);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando equipo..." />;
  }

  return (
    <PageLayout
      title="Mi Equipo"
      subtitle="Directorio de empleados"
      faIcon={{ icon: faUsers }}
      searchAndFilters={
        <div className="relative">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Buscar por nombre, email, posición o departamento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10 w-full"
          />
        </div>
      }
    >
      {filteredEmployees.length === 0 ? (
        <EmptyState
          title="No hay empleados"
          description={
            searchTerm
              ? 'No se encontraron empleados con los criterios de búsqueda'
              : 'No hay empleados registrados'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEmployees.map((employee) => {
            const displayName =
              employee.firstName && employee.lastName
                ? `${employee.firstName} ${employee.lastName}`
                : employee.firstName || employee.lastName || employee.email;

            return (
              <Card
                key={employee._id}
                header={{
                  title: displayName,
                  subtitle: employee.position || 'Empleado',
                  avatar: {
                    fallback: displayName.charAt(0).toUpperCase(),
                  },
                  badges: [
                    {
                      text: employee.status === 'active' ? 'Activo' : 'Inactivo',
                      variant: employee.status === 'active' ? 'success' : 'default',
                    },
                  ],
                }}
                onClick={() => handleViewDetails(employee._id)}
              >
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4" />
                    <span className="truncate">{employee.email}</span>
                  </div>
                  {employee.phone && (
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <FontAwesomeIcon icon={faPhone} className="h-4 w-4" />
                      <span>{employee.phone}</span>
                    </div>
                  )}
                  {employee.department && (
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <FontAwesomeIcon icon={faBuilding} className="h-4 w-4" />
                      <span>{employee.department}</span>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedEmployee && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedEmployee(null);
          }}
          title="Detalles del Empleado"
          size="md"
        >
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div className="w-20 h-20 rounded-full bg-primary-600 flex items-center justify-center text-white text-2xl font-bold">
                {(selectedEmployee.firstName?.[0] || selectedEmployee.email[0]).toUpperCase()}
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {selectedEmployee.firstName && selectedEmployee.lastName
                    ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}`
                    : selectedEmployee.firstName ||
                      selectedEmployee.lastName ||
                      selectedEmployee.email}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {selectedEmployee.position || 'Empleado'}
                </p>
              </div>
            </div>

            {/* Details */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                  <FontAwesomeIcon icon={faEnvelope} className="mr-2" />
                  Email
                </label>
                <p className="text-gray-900 dark:text-white">{selectedEmployee.email}</p>
              </div>

              {selectedEmployee.phone && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    <FontAwesomeIcon icon={faPhone} className="mr-2" />
                    Teléfono
                  </label>
                  <p className="text-gray-900 dark:text-white">{selectedEmployee.phone}</p>
                </div>
              )}

              {selectedEmployee.department && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    <FontAwesomeIcon icon={faBuilding} className="mr-2" />
                    Departamento
                  </label>
                  <p className="text-gray-900 dark:text-white">{selectedEmployee.department}</p>
                </div>
              )}

              {selectedEmployee.position && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    <FontAwesomeIcon icon={faUserTie} className="mr-2" />
                    Posición
                  </label>
                  <p className="text-gray-900 dark:text-white">{selectedEmployee.position}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Estado
                </label>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    selectedEmployee.status === 'active'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {selectedEmployee.status === 'active' ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </PageLayout>
  );
};
