import React, { useState, useEffect } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarCheck, faSave, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { sweetAlert } from '../utils/sweetAlert';
import { mockTeamMembers } from '../mocks';
import { mockDailyReportService } from '../services';

interface EmployeeRecord {
  id: string;
  name: string;
  present: boolean;
  absenceReason?: string;
  replacement?: string;
  overtimeIn?: string;
  overtimeOut?: string;
  overtimeHours?: number;
}

interface DailyReport {
  date: string;
  isHoliday: boolean;
  employees: EmployeeRecord[];
}

const ABSENCE_REASONS = [
  'Enfermedad',
  'Vacaciones',
  'Mudanza',
  'Sin aviso',
  'Licencia especial',
  'Compensatorio',
  'Otro',
];

const MOCK_EMPLOYEES = mockTeamMembers
  .filter(member => member.status === 'active')
  .map(member => ({
    id: member._id,
    name: `${member.firstName} ${member.lastName}`
  }));

export const DailyReportPage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [reports, setReports] = useState<Record<string, DailyReport>>({});
  const [currentReport, setCurrentReport] = useState<DailyReport>({
    date: selectedDate,
    isHoliday: false,
    employees: MOCK_EMPLOYEES.map((emp) => ({
      id: emp.id,
      name: emp.name,
      present: true,
      absenceReason: undefined,
      replacement: undefined,
      overtimeIn: undefined,
      overtimeOut: undefined,
      overtimeHours: undefined,
    })),
  });

  useEffect(() => {
    const stored = sessionStorage.getItem('dailyReports');
    if (stored) {
      try {
        setReports(JSON.parse(stored));
      } catch (error) {
        console.error('Error loading reports:', error);
      }
    }
  }, []);

  useEffect(() => {
    const existing = reports[selectedDate];
    if (existing) {
      setCurrentReport(existing);
    } else {
      setCurrentReport({
        date: selectedDate,
        isHoliday: false,
        employees: MOCK_EMPLOYEES.map((emp) => ({
          id: emp.id,
          name: emp.name,
          present: true,
          absenceReason: undefined,
          replacement: undefined,
          overtimeIn: undefined,
          overtimeOut: undefined,
          overtimeHours: undefined,
        })),
      });
    }
  }, [selectedDate, reports]);

  const handleSave = () => {
    const updated = { ...reports, [selectedDate]: currentReport };
    setReports(updated);
    sessionStorage.setItem('dailyReports', JSON.stringify(updated));
    sweetAlert.success('Reporte guardado', `Reporte del ${new Date(selectedDate).toLocaleDateString()} guardado correctamente`);
  };

  const updateEmployee = (id: string, field: string, value: any) => {
    setCurrentReport((prev) => ({
      ...prev,
      employees: prev.employees.map((emp) =>
        emp.id === id ? { ...emp, [field]: value } : emp
      ),
    }));
  };

  const calculateOvertimeHours = (id: string, timeIn?: string, timeOut?: string) => {
    if (timeIn && timeOut) {
      const [inH, inM] = timeIn.split(':').map(Number);
      const [outH, outM] = timeOut.split(':').map(Number);
      const minutes = (outH * 60 + outM) - (inH * 60 + inM);
      const hours = Math.round((minutes / 60) * 10) / 10;
      updateEmployee(id, 'overtimeHours', hours > 0 ? hours : 0);
    }
  };

  const changeDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  return (
    <PageLayout
      title="Reporte Diario"
      subtitle="Registro de asistencia y novedades del día"
      faIcon={{ icon: faCalendarCheck }}
      headerActions={
        <button onClick={handleSave} className="btn-primary">
          <FontAwesomeIcon icon={faSave} className="mr-2" />
          Guardar Reporte
        </button>
      }
    >
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => changeDate(-1)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <div className="flex flex-col items-center">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="input-field text-center"
              />
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={currentReport.isHoliday}
                  onChange={(e) => setCurrentReport({ ...currentReport, isHoliday: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Feriado</span>
              </label>
            </div>
            <button
              onClick={() => changeDate(1)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </div>

          <div className="space-y-4">
            {currentReport.employees.map((employee) => (
              <div
                key={employee.id}
                className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-2 flex items-center">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={employee.present}
                        onChange={(e) => updateEmployee(employee.id, 'present', e.target.checked)}
                        className="rounded"
                      />
                      <span className="font-medium text-gray-900 dark:text-white">{employee.name}</span>
                    </label>
                  </div>

                  {!employee.present && (
                    <>
                      <div className="lg:col-span-2">
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Motivo</label>
                        <select
                          value={employee.absenceReason || ''}
                          onChange={(e) => updateEmployee(employee.id, 'absenceReason', e.target.value)}
                          className="input-field text-sm"
                        >
                          <option value="">Seleccionar...</option>
                          {ABSENCE_REASONS.map((reason) => (
                            <option key={reason} value={reason}>
                              {reason}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="lg:col-span-2">
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Reemplazo</label>
                        <input
                          type="text"
                          value={employee.replacement || ''}
                          onChange={(e) => updateEmployee(employee.id, 'replacement', e.target.value)}
                          placeholder="Quien reemplaza"
                          className="input-field text-sm"
                        />
                      </div>
                    </>
                  )}

                  <div className="lg:col-span-2">
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Hora IN</label>
                    <input
                      type="time"
                      value={employee.overtimeIn || ''}
                      onChange={(e) => {
                        updateEmployee(employee.id, 'overtimeIn', e.target.value);
                        calculateOvertimeHours(employee.id, e.target.value, employee.overtimeOut);
                      }}
                      className="input-field text-sm"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Hora OUT</label>
                    <input
                      type="time"
                      value={employee.overtimeOut || ''}
                      onChange={(e) => {
                        updateEmployee(employee.id, 'overtimeOut', e.target.value);
                        calculateOvertimeHours(employee.id, employee.overtimeIn, e.target.value);
                      }}
                      className="input-field text-sm"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Horas Extras</label>
                    <input
                      type="number"
                      step="0.1"
                      value={employee.overtimeHours || ''}
                      onChange={(e) => updateEmployee(employee.id, 'overtimeHours', parseFloat(e.target.value) || 0)}
                      className="input-field text-sm"
                      placeholder="0.0"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Los reportes se guardan localmente en la sesión. Los datos se mantendrán mientras no cierres el navegador.
          </p>
        </div>
      </div>
    </PageLayout>
  );
};
