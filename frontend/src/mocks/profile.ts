import { UserProfile, ProfileData, ProfileStats } from './types';

export const mockUserProfile: UserProfile = {
  id: '1',
  nombre: 'María',
  apellido: 'González',
  email: 'maria.gonzalez@empresa.com',
  telefono: '+54 11 4567-8900',
  fechaIngreso: '2022-03-15',
  puesto: 'Desarrolladora Senior',
  departamento: 'Tecnología',
  jefe: 'Carlos Rodríguez',
  estadisticas: {
    diasVacacionesDisponibles: 12,
    diasVacacionesTomados: 8,
    compensatoriosDisponibles: 3,
    horasExtrasAcumuladas: 24
  }
};

export const mockProfileData: ProfileData = {
  _id: 'user_001',
  email: 'maria.gonzalez@empresa.com',
  firstName: 'María',
  lastName: 'González',
  phone: '+54 11 4567-8900',
  address: 'Av. Corrientes 1234, CABA',
  emergencyContact: '+54 11 9999-8888',
  position: 'Desarrolladora Senior',
  department: 'Tecnología',
  photoUrl: 'https://ui-avatars.com/api/?name=Maria+Gonzalez&background=3b82f6&color=fff'
};

export const mockProfileStats: ProfileStats = {
  daysWorked: 680,
  vacationDaysAvailable: 12,
  vacationDaysUsed: 8,
  pendingRequests: 2
};

export const mockVacationBalance = {
  available: 12,
  used: 8,
  total: 20
};

export const mockVacationStats = {
  total: 5,
  approved: 3,
  pending: 2,
  rejected: 0
};

export const mockNotificationCount = {
  count: 3
};
