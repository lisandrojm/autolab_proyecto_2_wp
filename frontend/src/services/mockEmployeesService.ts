import { EmployeeDataAPI } from '../mocks/types';
import { mockTeamMembers } from '../mocks';

let employees: EmployeeDataAPI[] = [...mockTeamMembers];

export const mockEmployeesService = {
  getEmployees: async (): Promise<EmployeeDataAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [...employees];
  },

  getEmployee: async (id: string): Promise<EmployeeDataAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return employees.find(e => e._id === id) || null;
  },

  updateEmployee: async (id: string, data: Partial<EmployeeDataAPI>): Promise<EmployeeDataAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const index = employees.findIndex(e => e._id === id);
    if (index === -1) return null;
    employees[index] = { ...employees[index], ...data };
    return employees[index];
  },

  deleteEmployee: async (id: string): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 400));
    employees = employees.filter(e => e._id !== id);
  }
};
