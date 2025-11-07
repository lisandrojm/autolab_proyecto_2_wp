import { UserProfile } from './types';

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
