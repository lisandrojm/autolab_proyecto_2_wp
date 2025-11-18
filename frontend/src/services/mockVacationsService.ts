import { VacationRequestAPI, VacationStats } from '../mocks/types';

let vacations: VacationRequestAPI[] = [
  {
    _id: 'vac_001',
    employeeId: 'user_current',
    startDate: '2025-12-15',
    endDate: '2025-12-19',
    days: 5,
    reason: 'Vacaciones de fin de año',
    status: 'approved',
    createdAt: '2025-11-01T10:00:00.000Z',
    approvedBy: 'Laura Pérez',
    approvedAt: '2025-11-02T14:30:00.000Z'
  },
  {
    _id: 'vac_002',
    employeeId: 'user_current',
    startDate: '2025-11-25',
    endDate: '2025-11-27',
    days: 3,
    reason: 'Asuntos personales',
    status: 'pending',
    createdAt: '2025-11-07T09:15:00.000Z'
  },
  {
    _id: 'vac_003',
    employeeId: 'user_current',
    startDate: '2025-08-10',
    endDate: '2025-08-16',
    days: 7,
    reason: 'Vacaciones de verano',
    status: 'approved',
    createdAt: '2025-07-15T11:20:00.000Z',
    approvedBy: 'Laura Pérez',
    approvedAt: '2025-07-16T10:00:00.000Z'
  },
  {
    _id: 'vac_004',
    employeeId: 'user_002',
    startDate: '2025-11-20',
    endDate: '2025-11-22',
    days: 3,
    reason: 'Vacaciones familiares',
    status: 'pending',
    createdAt: '2025-11-05T14:00:00.000Z'
  }
];

export const mockVacationsService = {
  getVacations: async (): Promise<VacationRequestAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return vacations.filter(v => v.employeeId === 'user_current');
  },

  getAllVacations: async (): Promise<VacationRequestAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [...vacations];
  },

  getVacation: async (id: string): Promise<VacationRequestAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return vacations.find(v => v._id === id) || null;
  },

  createVacation: async (data: Partial<VacationRequestAPI>): Promise<VacationRequestAPI> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const newVacation: VacationRequestAPI = {
      _id: `vac_${Date.now()}`,
      employeeId: 'user_current',
      startDate: data.startDate || '',
      endDate: data.endDate || '',
      days: data.days || 0,
      reason: data.reason,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    vacations.push(newVacation);
    return newVacation;
  },

  updateVacation: async (id: string, data: Partial<VacationRequestAPI>): Promise<VacationRequestAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const index = vacations.findIndex(v => v._id === id);
    if (index === -1) return null;
    vacations[index] = { ...vacations[index], ...data };
    return vacations[index];
  },

  deleteVacation: async (id: string): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 400));
    vacations = vacations.filter(v => v._id !== id);
  },

  getVacationAvailable: async (): Promise<{ available: number; used: number; total: number }> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return { available: 7, used: 8, total: 15 };
  },

  getVacationStats: async (): Promise<VacationStats> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    const userVacations = vacations.filter(v => v.employeeId === 'user_current');
    return {
      total: userVacations.length,
      approved: userVacations.filter(v => v.status === 'approved').length,
      pending: userVacations.filter(v => v.status === 'pending').length,
      rejected: userVacations.filter(v => v.status === 'rejected').length
    };
  },

  getPendingVacations: async (): Promise<VacationRequestAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return vacations.filter(v => v.status === 'pending');
  },

  approveVacation: async (id: string): Promise<VacationRequestAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const index = vacations.findIndex(v => v._id === id);
    if (index === -1) return null;
    vacations[index] = {
      ...vacations[index],
      status: 'approved',
      approvedBy: 'Laura Pérez',
      approvedAt: new Date().toISOString()
    };
    return vacations[index];
  },

  rejectVacation: async (id: string): Promise<VacationRequestAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const index = vacations.findIndex(v => v._id === id);
    if (index === -1) return null;
    vacations[index] = {
      ...vacations[index],
      status: 'rejected',
      approvedBy: 'Laura Pérez',
      approvedAt: new Date().toISOString()
    };
    return vacations[index];
  }
};
