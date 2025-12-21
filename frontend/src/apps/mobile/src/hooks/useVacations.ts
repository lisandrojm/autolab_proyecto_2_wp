import { eachDayOfInterval, format, parseISO } from "date-fns";
import { useState, useEffect } from "react";
import { personnelAPI } from "../../../../api/personnel";
import { vacationsAPI, VacationRequest } from "../../../../api/vacations";

export const useVacations = () => {
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [availableDays, setAvailableDays] = useState<{ total: number; used: number; available: number; pending?: number } | null>(null);
  const [occupiedDates, setOccupiedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVacations = async () => {
    try {
      setLoading(true);
      setError(null);
      const [vacationsData, profileStats, availabilityData] = await Promise.all([vacationsAPI.getAll({ mine: true }), personnelAPI.getProfileStats(), vacationsAPI.getAvailability()]);
      setVacations(vacationsData);
      setAvailableDays(profileStats.vacations);

      // Process user's own vacations to add to occupied dates
      const myVacationDates: string[] = [];
      vacationsData.forEach((v) => {
        if (["pending", "pre_approved", "approved", "delivered"].includes(v.status) && v.startDate && v.endDate) {
          try {
            const start = parseISO(v.startDate);
            const end = parseISO(v.endDate);
            const days = eachDayOfInterval({ start, end });
            days.forEach((day) => {
              myVacationDates.push(format(day, "yyyy-MM-dd"));
            });
          } catch (e) {
            console.error("Error parsing vacation dates:", e);
          }
        }
      });

      // Merge unique dates
      const allOccupied = Array.from(new Set([...availabilityData, ...myVacationDates]));
      setOccupiedDates(allOccupied);

      console.log("Occupied Dates received (merged):", allOccupied);
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
    occupiedDates,
    loading,
    error,
    refetch: fetchVacations,
    createVacation,
    deleteVacation,
  };
};
