import { ProfileData, ProfileStats } from '../api/personnel';

let mockProfile: ProfileData = {
  _id: 'user_current',
  email: 'usuario.actual@empresa.com',
  firstName: 'Juan',
  lastName: 'Pérez',
  phone: '+54 11 1234-5678',
  address: 'Av. Corrientes 1234, CABA',
  emergencyContact: 'María Pérez - +54 11 8765-4321',
  position: 'Desarrollador Full Stack',
  department: 'Tecnología',
  photoUrl: 'https://ui-avatars.com/api/?name=Juan+Perez&background=3b82f6&color=fff&size=200'
};

let mockStats: ProfileStats = {
  daysWorked: 245,
  vacationDaysAvailable: 7,
  vacationDaysUsed: 8,
  pendingRequests: 2
};

export const mockProfileService = {
  getProfile: async (): Promise<ProfileData> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { ...mockProfile };
  },

  updateProfile: async (data: Partial<ProfileData>): Promise<ProfileData> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    mockProfile = { ...mockProfile, ...data };
    return { ...mockProfile };
  },

  updateProfilePhoto: async (file: File): Promise<{ photoUrl: string }> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const photoUrl = URL.createObjectURL(file);
    mockProfile.photoUrl = photoUrl;
    return { photoUrl };
  },

  getProfileStats: async (): Promise<ProfileStats> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return { ...mockStats };
  }
};
