import React, { useState, useEffect } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { FormField } from '../components/forms/FormField';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendar,
  faBuilding,
  faCheck,
  faTimes,
  faSave,
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';

interface EmployeeAttendance {
  id: string;
  name: string;
  present: boolean;
  absenceReason?: string;
  extraHours?: {
    start?: string;
    end?: string;
    total?: number;
  };
  observations?: string;
}

interface DailyReport {
  date: string;
  area: string;
  employees: EmployeeAttendance[];
}

const MOCK_AREAS = ['Desarrollo', 'Diseño', 'Marketing', 'Ventas', 'Soporte', 'Administración'];

const MOCK_EMPLOYEES: Record<string, { id: string; name: string }[]> = {
  Desarrollo: [
    { id: '1', name: 'Juan Pérez' },
    { id: '2', name: 'María García' },
    { id: '3', name: 'Carlos López' },
  ],
  Diseño: [
    { id: '4', name: 'Ana Martínez' },
    { id: '5', name: 'Luis Rodríguez' },
  ],
  Marketing: [
    { id: '6', name: 'Sofia Hernández' },
    { id: '7', name: 'Diego Fernández' },
  ],
  Ventas: [
    { id: '8', name: 'Laura González' },
    { id: '9', name: 'Pedro Sánchez' },
  ],
  Soporte: [
    { id: '10', name: 'Carmen Ruiz' },
    { id: '11', name: 'Miguel Torres' },
  ],
  Administración: [
    { id: '12', name: 'Elena Ramírez' },
    { id: '13', name: 'Pablo Morales' },
  ],
};

const ABSENCE_REASONS = [
  'Enfermedad',
  'Vacaciones',
  'Licencia médica',
  'Sin aviso',
  'Permiso personal',
  'Otro',
];

export const DailyReportPage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedArea, setSelectedArea] = useState(MOCK_AREAS[0]);
  const [employees, setEmployees] = useState<EmployeeAttendance[]>([]);
  const [savedReports, setSavedReports] = useState<Record<string, DailyReport>>({});

  useEffect(() => {
    loadReportForDate(selectedDate, selectedArea);
  }, [selectedDate, selectedArea]);

  const loadReportForDate = (date: string, area: string) => {
    const reportKey = `${date}_${area}`;
    const savedReport = savedReports[reportKey];

    if (savedReport) {
      setEmployees(savedReport.employees);
    } else {
      const areaEmployees = MOCK_EMPLOYEES[area] || [];
      setEmployees(
        areaEmployees.map((emp) => ({
          id: emp.id,
          name: emp.name,
          present: true,
          absenceReason: undefined,
          extraHours: {},
          observations: '',
        }))
      );
    }
  };

  const updateEmployee = (id: string, updates: Partial<EmployeeAttendance>) => {
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === id ? { ...emp, ...updates } : emp))
    );
  };

  const handleSave = async () => {
    const incomplete = employees.some(
      (emp) => !emp.present && !emp.absenceReason
    );

    if (incomplete) {
      await sweetAlert.error(
        'Error',
        'Debes especificar el motivo de ausencia para todos los empleados ausentes'
      );
      return;
    }

    const reportKey = `${selectedDate}_${selectedArea}`;
    const report: DailyReport = {
      date: selectedDate,
      area: selectedArea,
      employees,
    };

    setSavedReports((prev) => ({
      ...prev,
      [reportKey]: report,
    }));

    await sweetAlert.success('Éxito', 'Reporte guardado correctamente');
  };

  const changeDate = (days: number) => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + days);
    setSelectedDate(currentDate.toISOString().split('T')[0]);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <PageLayout
      title="Reporte Diario"
      subtitle="Registro de asistencia y novedades del personal"
      faIcon={{ icon: faCalendar }}
      headerActions={
        <button onClick={handleSave} className="btn-primary">
          <FontAwesomeIcon icon={faSave} className="mr-2" />
          Guardar Reporte
        </button>
      }
    >
      <div className="space-y-6">
        {/* Date and Area Selection */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Fecha del Reporte" icon={faCalendar}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => changeDate(-1)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Día anterior"
                >
                  <FontAwesomeIcon icon={faChevronLeft} />
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="input-field flex-1"
                />
                <button
                  onClick={() => changeDate(1)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Día siguiente"
                >
                  <FontAwesomeIcon icon={faChevronRight} />
                </button>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                {formatDate(selectedDate)}
              </p>
            </FormField>

            <FormField label="Área / Equipo" icon={faBuilding}>
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="input-field"
              >
                {MOCK_AREAS.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </div>

        {/* Employee List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Empleados de {selectedArea} ({employees.length})
          </h3>

          <div className="space-y-4">
            {employees.map((employee) => (
              <div
                key={employee.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Left Column */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                        {employee.name}
                      </h4>

                      {/* Attendance */}
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`attendance-${employee.id}`}
                            checked={employee.present}
                            onChange={() =>
                              updateEmployee(employee.id, {
                                present: true,
                                absenceReason: undefined,
                              })
                            }
                            className="w-4 h-4"
                          />
                          <FontAwesomeIcon
                            icon={faCheck}
                            className="text-blue-600 dark:text-blue-400"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Presente
                          </span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`attendance-${employee.id}`}
                            checked={!employee.present}
                            onChange={() =>
                              updateEmployee(employee.id, { present: false })
                            }
                            className="w-4 h-4"
                          />
                          <FontAwesomeIcon
                            icon={faTimes}
                            className="text-red-600 dark:text-red-400"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Ausente
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Absence Reason */}
                    {!employee.present && (
                      <FormField label="Motivo de Ausencia" required>
                        <select
                          value={employee.absenceReason || ''}
                          onChange={(e) =>
                            updateEmployee(employee.id, {
                              absenceReason: e.target.value,
                            })
                          }
                          className="input-field"
                        >
                          <option value="">Seleccionar motivo</option>
                          {ABSENCE_REASONS.map((reason) => (
                            <option key={reason} value={reason}>
                              {reason}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    )}
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    {/* Extra Hours */}
                    {employee.present && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Horas Extra
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="time"
                            placeholder="Inicio"
                            value={employee.extraHours?.start || ''}
                            onChange={(e) =>
                              updateEmployee(employee.id, {
                                extraHours: {
                                  ...employee.extraHours,
                                  start: e.target.value,
                                },
                              })
                            }
                            className="input-field"
                          />
                          <input
                            type="time"
                            placeholder="Fin"
                            value={employee.extraHours?.end || ''}
                            onChange={(e) =>
                              updateEmployee(employee.id, {
                                extraHours: {
                                  ...employee.extraHours,
                                  end: e.target.value,
                                },
                              })
                            }
                            className="input-field"
                          />
                        </div>
                      </div>
                    )}

                    {/* Observations */}
                    <FormField label="Observaciones">
                      <textarea
                        value={employee.observations || ''}
                        onChange={(e) =>
                          updateEmployee(employee.id, {
                            observations: e.target.value,
                          })
                        }
                        rows={2}
                        className="input-field"
                        placeholder="Notas adicionales..."
                      />
                    </FormField>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageLayout>
  );
};
