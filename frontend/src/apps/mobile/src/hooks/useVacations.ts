import { useState, useEffect } from "react";
import { personnelAPI } from "../../../../api/personnel";
import { vacationsAPI, VacationRequest } from "../../../../api/vacations";

export const useVacations = () => {
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [availableDays, setAvailableDays] = useState<{ total: number; used: number; available: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVacations = async () => {
    try {
      setLoading(true);
      setError(null);
      const [vacationsData, profileStats] = await Promise.all([vacationsAPI.getAll(), personnelAPI.getProfileStats()]);
      setVacations(vacationsData);
      setAvailableDays(profileStats.vacations);
    } catch (err: any) {
      setError(err.response?.data?.error || "Error al cargar vacaciones");
      console.error("Error fetching vacations:", err);
    } finally {
      setLoading(false);
    }
  };

  const createVacation = async (vacationData: { startDate: string; endDate: string; reason: string }) => {
    try {
      setError(null);
      const newVacation = await vacationsAPI.create(vacationData);
      await fetchVacations();
      return newVacation;
    } catch (err: any) {
      setError(err.response?.data?.error || "Error al crear solicitud de vacaciones");
      throw err;
    }
  };

  const deleteVacation = async (id: string) => {
    try {
      setError(null);
      await vacationsAPI.delete(id);
      await fetchVacations();
    } catch (err: any) {
      setError(err.response?.data?.error || "Error al eliminar solicitud");
      throw err;
    }
  };

  useEffect(() => {
    fetchVacations();
  }, []);

  return {
    vacations,
    availableDays,
    loading,
    error,
    refetch: fetchVacations,
    createVacation,
    deleteVacation,
  };
};
