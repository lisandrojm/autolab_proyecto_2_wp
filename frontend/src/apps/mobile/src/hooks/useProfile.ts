import { useState, useEffect } from 'react';
import { personnelAPI, ProfileData, ProfileStats } from '../../../../api/personnel';

export const useProfile = () => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const [profileData, statsData] = await Promise.all([
        personnelAPI.getProfile(),
        personnelAPI.getProfileStats(),
      ]);
      setProfile(profileData);
      setStats(statsData);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cargar perfil');
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (profileData: Partial<ProfileData>) => {
    try {
      setError(null);
      const updatedProfile = await personnelAPI.updateProfile(profileData);
      setProfile(updatedProfile);
      return updatedProfile;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al actualizar perfil');
      throw err;
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  return {
    profile,
    stats,
    loading,
    error,
    refetch: fetchProfile,
    updateProfile,
  };
};
